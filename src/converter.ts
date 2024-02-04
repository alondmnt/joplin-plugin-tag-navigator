import joplin from 'api';

export async function convertNoteToJoplinTags(note: any) {

  // Prase all inline tags from the note
  const tags = note.body.match(/#(\w+)/g).map(tag => {
    return tag.replace('#', '');
  });

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