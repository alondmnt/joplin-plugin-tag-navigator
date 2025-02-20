import joplin from 'api';
import { parseTagsLines } from './parser';
import { clearObjectReferences } from './utils';
import { TagSettings, getTagSettings } from './settings';

/**
 * Converts all inline tags in notes to Joplin tags
 * Processes notes in batches to avoid memory issues
 */
export async function convertAllNotesToJoplinTags(): Promise<void> {
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
      if (tagSettings.ignoreHtmlNotes && (note.markup_language === 2)) {
        note = clearObjectReferences(note);
        continue;
      }
      try {
        await convertNoteToJoplinTags(note, tagSettings);
      } catch (error) {
        console.error(`Error converting note ${note.id} to tags: ${error}`);
      }
      note = clearObjectReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }
}

/**
 * Converts all Joplin tags to inline tags in notes
 * @param listPrefix - The prefix to use for the tag list (e.g. "Tags: ")
 * @param tagPrefix - The prefix for each tag (e.g. "#")
 * @param spaceReplace - The character to replace spaces in tags
 * @param location - Where to place the tag list ('top' or 'bottom')
 */
export async function convertAllNotesToInlineTags(
  listPrefix: string, 
  tagPrefix: string, 
  spaceReplace: string, 
  location: 'top' | 'bottom'
): Promise<void> {
  const ignoreHtmlNotes = true;
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
      await convertNoteToInlineTags(note, listPrefix, tagPrefix, spaceReplace, location);
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
  tagSettings: TagSettings
): Promise<void> {

  // Parse all inline tags from the note
  const tags = (await parseTagsLines(note.body, tagSettings))
    .map(tag => tag.tag.replace(tagSettings.tagPrefix, '').replace(RegExp(tagSettings.spaceReplace, 'g'), ' '))
    .filter(tag => tag.length > 0);

  if (tags.length === 0) {
    return;
  }

  // Get note tags
  let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
  const noteTagNames = noteTags.items.map(tag => tag.title);
  const tagsToAdd = tags.filter(tag => !noteTagNames.includes(tag));

  if (tagsToAdd.length === 0) {
    return;
  }

  // Get the existing tags
  let allTags = await joplin.data.get(['tags'], { fields: ['id', 'title'] });
  const allTagNames = allTags.items.map(tag => tag.title);

  // Create the tags that don't exist
  const curTags = allTags.items.filter(tag => tagsToAdd.includes(tag.title));
  const newTags = tagsToAdd.filter(tag => !allTagNames.includes(tag));

  for (const tag of newTags) {
    const newTag = await joplin.data.post(['tags'], null, { title: tag });
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

  noteTags = clearObjectReferences(noteTags);
  allTags = clearObjectReferences(allTags);
}

/**
 * Converts Joplin tags to inline tags for a single note
 * @param note - The note to process
 * @param listPrefix - The prefix to use for the tag list
 * @param tagPrefix - The prefix for each tag
 * @param spaceReplace - The character to replace spaces in tags
 * @param location - Where to place the tag list
 */
export async function convertNoteToInlineTags(
  note: { id: string; body: string; markup_language: number },
  listPrefix: string,
  tagPrefix: string,
  spaceReplace: string,
  location: 'top' | 'bottom'
): Promise<void> {
  let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
  const tagList = listPrefix + noteTags.items
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(tag => tagPrefix + tag.title.replace(/\s/g, spaceReplace)).join(' ');
  if (note.body.includes(tagList + '\n')) { return; }

  // need to remove previous lists
  const lines = note.body.split('\n');
  let filteredLines = lines;
  if (listPrefix.length > 2) {
    filteredLines = lines.filter(line => !line.startsWith(listPrefix));
  }
  if (location === 'top') {
    note.body = tagList + '\n' + filteredLines.join('\n');
  } else {
    note.body = filteredLines.join('\n') + '\n' + tagList;
  }

  await joplin.data.put(['notes', note.id], null, { body: note.body });
  noteTags = clearObjectReferences(noteTags);
}