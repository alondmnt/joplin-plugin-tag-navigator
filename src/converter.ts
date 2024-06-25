import joplin from 'api';
import { parseTagsLines } from './parser';
import { clearNoteReferences } from './search';
import { TagSettings, getTagSettings } from './settings';

export async function convertAllNotesToJoplinTags() {
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
        note = clearNoteReferences(note);
        continue;
      }
      try {
        await convertNoteToJoplinTags(note, tagSettings);
      } catch (error) {
        console.error(`Error converting note ${note.id} to tags: ${error}`);
      }
      note = clearNoteReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }
}

export async function convertAllNotesToInlineTags(listPrefix: string, tagPrefix: string, location: string) {
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
        note = clearNoteReferences(note);
        continue;
      }
      await convertNoteToInlineTags(note, listPrefix, tagPrefix, location);
      note = clearNoteReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }
}

export async function convertNoteToJoplinTags(note: any, tagSettings: TagSettings) {

  // Parse all inline tags from the note
  const tags = (await parseTagsLines(note.body, tagSettings))
    .map(tag => tag.tag.replace('#', ''));
  // TODO: Use tag prefix from settings

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

  noteTags = clearNoteReferences(noteTags);
  allTags = clearNoteReferences(allTags);
}

export async function convertNoteToInlineTags(note: any, listPrefix: string, tagPrefix: string, location: string) {
  let noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
  const tagList = listPrefix + noteTags.items
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(tag => tagPrefix + tag.title).join(' ');
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
  noteTags = clearNoteReferences(noteTags);
}