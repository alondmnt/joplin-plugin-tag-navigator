import joplin from 'api';
import { convertNoteToJoplinTags } from './converter';

joplin.plugins.register({
  onStart: async function() {

    // Register the command
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
  },
});
