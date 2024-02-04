import joplin from 'api';
import { convertAllNotesToJoplinTags, convertNoteToJoplinTags } from './converter';

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
        await convertAllNotesToJoplinTags();
      },
    });

  },
});
