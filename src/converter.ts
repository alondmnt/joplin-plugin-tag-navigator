import joplin from 'api';
import { parseUniqueTags } from './parser';

export async function convertAllNotesToJoplinTags() {
  // Get all notes
  let hasMore = true;
  let page = 0;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'body'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    // Process the notes asynchronously
    await Promise.all(notes.items.map(async (note) => {
      await convertNoteToJoplinTags(note);
    }));
  }
}

export async function convertNoteToJoplinTags(note: any) {

  // Prase all inline tags from the note
  const tags = (await parseUniqueTags(note.body)).map(tag => tag.replace('#', ''));

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