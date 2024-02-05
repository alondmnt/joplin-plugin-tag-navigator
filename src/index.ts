import joplin from 'api';
import { ContentScriptType, MenuItemLocation } from 'api/types';
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
    await joplin.views.panels.addScript(panel, 'webview.css');
    await joplin.views.panels.addScript(panel, 'webview.js');
    let tagLines = [];
    joplin.workspace.onNoteSelectionChange(async () => {
      const note = await joplin.workspace.selectedNote();
      tagLines = parseTagsLines(note.body);
      await updatePanel(panel, tagLines);
    });

    await joplin.commands.register({
      name: 'itags.togglePanel',
      label: 'Toggle inline tags panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        (await joplin.views.panels.visible(panel)) ? joplin.views.panels.hide(panel) : joplin.views.panels.show(panel);
      },
    })

    await joplin.views.menus.create('itags.menu', 'Inline tags', [
      {
        commandName: 'itags.togglePanel',
      },
      {
        commandName: 'itags.convertNoteToJoplinTags',
      },
      {
        commandName: 'itags.convertAllNotesToJoplinTags',
      },
    ], MenuItemLocation.Tools);

    await joplin.views.panels.onMessage(panel, async (message) => {
      if (message.name === 'jumpToLine') {
        // Increment the index of the tag
        for (const tag of tagLines) {
          if (tag.tag === message.tag) {
            tag.index = (tag.index + 1) % tag.count;
          }
        }
        // Navigate to the line
        if (message.line > 0) {
          await joplin.commands.execute('editor.execCommand', {
            name: 'scrollToTagLine',
            args: [message.line]
          });
        }
        // Update the panel
        await updatePanel(panel, tagLines);
      }
    });

  },
});
