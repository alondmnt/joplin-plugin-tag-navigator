import joplin from 'api';
import { convertNoteToJoplinTags } from './converter';

joplin.plugins.register({
  onStart: async function() {

    await joplin.commands.register({
      name: 'itags.convertNoteToJoplinTags',
      label: "Convert note's inline tags to Joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        const note = await joplin.workspace.selectedNote();

        await convertNoteToJoplinTags(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertAllNotesToJoplinTags',
      label: "Convert all notes' inline tags to Joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
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
      },
    });

  },
});
