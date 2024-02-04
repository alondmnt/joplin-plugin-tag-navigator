import joplin from 'api';
import { ContentScriptType } from 'api/types';
import { convertAllNotesToJoplinTags, convertNoteToJoplinTags } from './converter';
import { updatePanel } from './panel';
import { parseTagsLines } from './parser';

joplin.plugins.register({
  onStart: async function() {

    await joplin.contentScripts.register(
      ContentScriptType.CodeMirrorPlugin,
      'scroller',
      './scroller.js',
    );

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

    const panel = await joplin.views.panels.create('itags.panel');
    // await joplin.views.panels.addScript(panel, 'webview.css');
    await joplin.views.panels.addScript(panel, 'webview.js');
    joplin.workspace.onNoteSelectionChange(async () => {
      const note = await joplin.workspace.selectedNote();
      await updatePanel(panel, parseTagsLines(note.body));
    });

    await joplin.views.panels.onMessage(panel, async (message) => {
      if (message.name === 'jumpToLine') {
        // Navigate to the line
        if (message.line > 0) {
          await joplin.commands.execute('editor.execCommand', {
            name: 'scrollToTagLine',
            args: [message.line]
          });
        }
      }
    });

  },
});
