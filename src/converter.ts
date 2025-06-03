import joplin from 'api';
import { parseTagsFromFrontMatter, parseTagsLines } from './parser';
import { sortTags } from './utils';
import { ConversionSettings, TagSettings, getTagSettings } from './settings';
import { clearObjectReferences } from './memory';
import { 
  saveTagConversionData, 
  getTagConversionData, 
  computeTagDiff, 
  removeJoplinTags,
  getAllTags
} from './tagTracker';

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
        await convertNoteToJoplinTags(note, tagSettings, allTags);
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
 */
export async function convertNoteToJoplinTags(
  note: { id: string; body: string; markup_language: number }, 
  tagSettings: TagSettings,
  allTags?: { id: string; title: string }[]
): Promise<void> {

  // Check if tag tracking is enabled
  const enableTagTracking = await joplin.settings.value('itags.enableTagTracking') as boolean;
  
  // Parse all inline tags from the note
  const currentInlineTags = extractInlineTags(note.body, tagSettings);
  
  let tagsToAdd = currentInlineTags;
  let tagsToRemove: string[] = [];
  
  if (enableTagTracking) {
    // Get previous conversion data
    const previousData = await getTagConversionData(note.id);
    
    if (currentInlineTags.length === 0) {
      // If no inline tags, only clean up previously converted tags if any
      if (previousData && previousData.joplinTags.length > 0) {
        await removeJoplinTags(note.id, previousData.joplinTags);
        await saveTagConversionData(note.id, {
          joplinTags: [], // No more inline tags to track
          lastUpdated: Date.now()
        });
      }
      return;
    }

    // Get current Joplin tags
    let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
    const noteTagNames = noteTags.items.map(tag => tag.title);
    
    // Determine which tags to add and remove
    tagsToAdd = currentInlineTags.filter(tag => !noteTagNames.includes(tag));
    
    if (previousData) {
      // Compute diff based on previous conversion
      const diff = computeTagDiff(currentInlineTags, previousData.joplinTags);
      tagsToAdd = diff.toAdd.filter(tag => !noteTagNames.includes(tag));
      tagsToRemove = diff.toRemove;
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
  if (enableTagTracking) {
    await saveTagConversionData(note.id, {
      joplinTags: currentInlineTags, // Tags we just converted from inline to Joplin
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
      note.body = tagList + '\n' + filteredLines.join('\n');
    } else {
      note.body = filteredLines.join('\n') + '\n' + tagList;
    }
  } else {
    // No tags, just remove existing tag lists
    note.body = filteredLines.join('\n');
  }

  await joplin.data.put(['notes', note.id], null, { body: note.body });

  noteTags = clearObjectReferences(noteTags);
}
