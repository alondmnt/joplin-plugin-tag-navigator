import joplin from 'api';
import { parseTagsFromFrontMatter, parseTagsLines } from './parser';
import { sortTags } from './utils';
import { ConversionSettings, TagSettings, getConversionSettings, getTagSettings } from './settings';
import { clearObjectReferences } from './memory';
import { 
  saveTagConversionData, 
  getTagConversionData, 
  computeTagDiff, 
  removeJoplinTags,
  getAllTags,
  removeInlineTags,
  addInlineTags,
  hasExistingTagLines
} from './tracker';

/**
 * Extracts inline tags from a note's content
 * @param noteBody - The note content
 * @param tagSettings - Tag settings for parsing
 * @returns Array of inline tag names (without prefix)
 */
export function extractInlineTags(noteBody: string, tagSettings: TagSettings): string[] {
  const frontMatterTags = parseTagsFromFrontMatter(noteBody, tagSettings);
  const bodyTags = parseTagsLines(noteBody, tagSettings);
  
  const allTags = [...frontMatterTags, ...bodyTags]
    .map(tag => tag.tag.replace(tagSettings.tagPrefix, '').replace(RegExp(tagSettings.spaceReplace, 'g'), ' '))
    .filter(tag => tag.length > 0);
  
  // Remove duplicates
  return allTags.filter((tag, index, self) => self.indexOf(tag) === index);
}

/**
 * Converts all inline tags in notes to Joplin tags
 * Processes notes in batches to avoid memory issues
 */
export async function convertAllNotesToJoplinTags(): Promise<void> {
  const tagSettings = await getTagSettings();
  const conversionSettings = await getConversionSettings();

  let allTags = await getAllTags();

  // Get all notes
  let hasMore = true;
  let page = 0;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'body', 'markup_language'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    // Process the notes synchronously to avoid issues
    for (let note of notes.items) {
      if (tagSettings.ignoreHtmlNotes && (note.markup_language === 2)) {
        note = clearObjectReferences(note);
        continue;
      }
      try {
        await convertNoteToJoplinTags(note, tagSettings, conversionSettings, allTags);
      } catch (error) {
        console.error(`Error converting note ${note.id} to tags: ${error}`);
      }
      note = clearObjectReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }
  allTags = clearObjectReferences(allTags);
}

/**
 * Converts all Joplin tags to inline tags in notes
 * @param conversionSettings - The settings for the conversion
 */
export async function convertAllNotesToInlineTags(
  conversionSettings: ConversionSettings
): Promise<void> {
  const ignoreHtmlNotes = true;
  const tagSettings = await getTagSettings();
  
  // Get all notes
  let hasMore = true;
  let page = 0;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'body', 'markup_language'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    // Process the notes synchronously to avoid issues
    for (let note of notes.items) {
      if (ignoreHtmlNotes && (note.markup_language === 2)) {
        note = clearObjectReferences(note);
        continue;
      }
      await convertNoteToInlineTags(note, conversionSettings, tagSettings);
      note = clearObjectReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }
}

/**
 * Converts inline tags in a single note to Joplin tags
 * @param note - The note to process
 * @param tagSettings - Settings for tag processing
 * @param conversionSettings - Settings for conversion
 * @param allTags - All tags in the database
 */
export async function convertNoteToJoplinTags(
  note: { id: string; body: string; markup_language: number }, 
  tagSettings: TagSettings,
  conversionSettings: ConversionSettings,
  allTags?: { id: string; title: string }[]
): Promise<void> {

  // Parse all inline tags from the note
  const currentInlineTags = extractInlineTags(note.body, tagSettings);

  let tagsToAdd = currentInlineTags;
  let tagsToRemove: string[] = [];

  if (conversionSettings.enableTagTracking) {
    // Get previous conversion data
    const previousData = await getTagConversionData(note.id);

    if (currentInlineTags.length === 0) {
      // If no inline tags, only clean up previously converted tags if any
      if (previousData && previousData.joplinTags.length > 0) {
        await removeJoplinTags(note.id, previousData.joplinTags);
        await saveTagConversionData(note.id, {
          joplinTags: [], // No more inline tags to track
          inlineTags: [], // Initialize inline tags tracking
          lastUpdated: Date.now()
        });
      }
      return;
    }

    // Get current Joplin tags
    let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
    const noteTagNames = noteTags.items.map(tag => tag.title);

    if (previousData) {
      // Compute diff based on previous conversion
      const diff = computeTagDiff(currentInlineTags, previousData.joplinTags);
      tagsToAdd = diff.toAdd.filter(tag => !noteTagNames.includes(tag));
      tagsToRemove = diff.toRemove;

    } else {
      // No previous data - add all current inline tags (except those already in Joplin)
      tagsToAdd = currentInlineTags.filter(tag => !noteTagNames.includes(tag));
      tagsToRemove = [];
    }

    // Remove old Joplin tags that are no longer in inline tags
    if (tagsToRemove.length > 0) {
      await removeJoplinTags(note.id, tagsToRemove);
    }

    noteTags = clearObjectReferences(noteTags);
  } else {
    // Simple mode: just get current Joplin tags and filter out existing ones
    let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
    const noteTagNames = noteTags.items.map(tag => tag.title);
    tagsToAdd = currentInlineTags.filter(tag => !noteTagNames.includes(tag));
    noteTags = clearObjectReferences(noteTags);
  }

  // Add new Joplin tags
  if (tagsToAdd.length > 0) {
    // Get the existing tags
    if (!allTags) {
      allTags = await getAllTags();
    }
    const allTagNamesSet = new Set(allTags.map(tag => tag.title));

    // Create the tags that don't exist
    const tagsToAddSet = new Set(tagsToAdd);
    const curTags = allTags.filter(tag => tagsToAddSet.has(tag.title));
    const newTags = tagsToAdd.filter(tag => !allTagNamesSet.has(tag));

    for (const tag of newTags) {
      const newTag = await joplin.data.post(['tags'], null, { title: tag });
      // Add the tag to allTags
      allTags.push({ id: newTag.id, title: tag });
      // Update the note tags
      await joplin.data.post(['tags', newTag.id, 'notes'], null, {
        id: note.id
      });
    }

    for (const tag of curTags) {
      // Update the note tags
      await joplin.data.post(['tags', tag.id, 'notes'], null, {
        id: note.id
      });
    }
  }

  // Save conversion data
  if (conversionSettings.enableTagTracking) {
    // Get existing data to preserve inlineTags if they exist
    const existingData = await getTagConversionData(note.id);
    await saveTagConversionData(note.id, {
      joplinTags: currentInlineTags, // Tags we just converted from inline to Joplin
      inlineTags: existingData?.inlineTags || [], // Preserve existing inline tags tracking
      lastUpdated: Date.now()
    });
  }
}

/**
 * Converts Joplin tags to inline tags for a single note
 * @param note - The note to process
 * @param conversionSettings - The settings for the conversion
 * @param tagSettings - Tag settings (unused but kept for backward compatibility)
 */
export async function convertNoteToInlineTags(
  note: { id: string; body: string; markup_language: number },
  conversionSettings: ConversionSettings,
  tagSettings?: TagSettings
): Promise<void> {

  let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
  const currentJoplinTags = noteTags.items.map((tag: any) => tag.title);

  // Get tag settings if not provided
  if (!tagSettings) {
    tagSettings = await getTagSettings();
  }

  let tagsToAdd = currentJoplinTags;
  let tagsToRemove: string[] = [];
  let updatedBody = note.body;

    // Check if tag tracking is enabled
  if (conversionSettings.enableTagTracking) {
    // Get previous conversion data
    const previousData = await getTagConversionData(note.id);
    const hasTagLines = hasExistingTagLines(note.body, conversionSettings.listPrefix);

    if (!hasTagLines && currentJoplinTags.length > 0) {
      // No tag lines exist but we have Joplin tags - create from scratch
      // This handles both first-time conversion and accidental tag line deletion
      tagsToAdd = currentJoplinTags;
      tagsToRemove = [];

    } else if (previousData) {
      // Tag lines exist - use diff-based approach to modify incrementally
      const diff = computeTagDiff(currentJoplinTags, previousData.inlineTags);
      tagsToAdd = diff.toAdd;
      tagsToRemove = diff.toRemove;

    } else {
      // First time with existing tag lines - add all current Joplin tags
      tagsToAdd = currentJoplinTags;
      tagsToRemove = [];
    }

    // Remove old inline tags that are no longer in Joplin tags
    if (tagsToRemove.length > 0) {
      updatedBody = removeInlineTags(
        updatedBody,
        tagsToRemove,
        conversionSettings.listPrefix,
        conversionSettings.tagPrefix,
        conversionSettings.spaceReplace
      );
    }

    // Add new inline tags
    if (tagsToAdd.length > 0) {
      updatedBody = addInlineTags(
        updatedBody,
        tagsToAdd,
        conversionSettings.listPrefix,
        conversionSettings.tagPrefix,
        conversionSettings.spaceReplace,
        conversionSettings.location as 'top' | 'bottom',
        tagSettings.valueDelim
      );
    }

    // Only update the note if the body changed
    if (updatedBody !== note.body) {
      await joplin.data.put(['notes', note.id], null, { body: updatedBody });
    }

    // Save conversion data
    // Get existing data to preserve joplinTags if they exist
    const existingData = await getTagConversionData(note.id);
    await saveTagConversionData(note.id, {
      joplinTags: existingData?.joplinTags || [], // Preserve existing Joplin tags tracking
      inlineTags: currentJoplinTags, // Tags we just converted from Joplin to inline
      lastUpdated: Date.now()
    });

  } else {
    // Simple mode: replace all tag lines with current Joplin tags
    const sortedTags = sortTags(currentJoplinTags, tagSettings.valueDelim);
    const tagList = conversionSettings.listPrefix + sortedTags
      .map(tag => conversionSettings.tagPrefix + tag.replace(/\s/g, conversionSettings.spaceReplace)).join(' ');
    
    if (note.body.includes(tagList + '\n')) { 
      // No change needed
      return; 
    }

    // Remove all existing tag list lines and create new ones
    const lines = note.body.split('\n');
    let filteredLines = lines;
    if (conversionSettings.listPrefix.length > 2) {
      filteredLines = lines.filter(line => !line.startsWith(conversionSettings.listPrefix));
    }

    if (currentJoplinTags.length > 0) {
      // Add the new tag list
      if (conversionSettings.location === 'top') {
        updatedBody = tagList + '\n' + filteredLines.join('\n');
      } else {
        updatedBody = filteredLines.join('\n') + '\n' + tagList;
      }
    } else {
      // No tags, just remove existing tag lists
      updatedBody = filteredLines.join('\n');
    }

    await joplin.data.put(['notes', note.id], null, { body: updatedBody });
  }

  noteTags = clearObjectReferences(noteTags);
}
