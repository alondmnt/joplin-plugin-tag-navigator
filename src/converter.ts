import joplin from 'api';
import { parseTagsLines, getTagRegex } from './parser';

export async function convertAllNotesToJoplinTags() {
  const tagRegex = await getTagRegex();
  const excludeRegex = await joplin.settings.value('itags.excludeRegex');
  const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
  const ignoreHtmlNotes = await joplin.settings.value('itags.ignoreHtmlNotes');
  const inheritTags = await joplin.settings.value('itags.inheritTags');

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
    for (const note of notes.items) {
      if (ignoreHtmlNotes && (note.markup_language === 2)) {
        continue;
      }
      await convertNoteToJoplinTags(note, tagRegex, excludeRegex, ignoreCodeBlocks, inheritTags);
    }
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
    for (const note of notes.items) {
      if (ignoreHtmlNotes && (note.markup_language === 2)) {
        continue;
      }
      await convertNoteToInlineTags(note, listPrefix, tagPrefix, location);
    }
  }
}

export async function convertNoteToJoplinTags(note: any, tagRegex: RegExp, excludeRegex: RegExp, ignoreCodeBlocks: boolean, inheritTags: boolean) {

  // Prase all inline tags from the note
  const tags = (await parseTagsLines(note.body, tagRegex, excludeRegex, ignoreCodeBlocks, inheritTags))
    .map(tag => tag.tag.replace('#', ''));

  if (tags.length === 0) {
    return;
  }

  // Get note tags
  const noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
  const noteTagNames = noteTags.items.map(tag => tag.title);
  const tagsToAdd = tags.filter(tag => !noteTagNames.includes(tag));

  if (tagsToAdd.length === 0) {
    return;
  }

  // Get the existing tags
  const allTags = await joplin.data.get(['tags'], { fields: ['id', 'title'] });
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
}

export async function convertNoteToInlineTags(note: any, listPrefix: string, tagPrefix: string, location: string) {
  const noteTags = await joplin.data.get(['notes', note.id, 'tags'], { fields: ['id', 'title'] });
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
}