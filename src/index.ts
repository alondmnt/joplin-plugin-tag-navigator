import joplin from 'api';
import { ContentScriptType, MenuItemLocation, SettingItemType } from 'api/types';
import { convertAllNotesToJoplinTags, convertNoteToJoplinTags } from './converter';
import { updatePanel } from './panel';
import { parseTagsLines } from './parser';

joplin.plugins.register({
  onStart: async function() {

    await joplin.settings.registerSection('itags', {
      label: 'Tag Navigator',
      iconName: 'fas fa-dharmachakra',
    });
    await joplin.settings.registerSettings({
      'periodicUpdate': {
        value: 0,
        type: SettingItemType.Int,
        minimum: 0,
        maximum: 1440,
        section: 'itags',
        public: true,
        label: 'Periodic update (minutes)',
        description: 'Periodically convert all notes to Joplin tags (requires restart). Set to 0 to disable periodic updates.',
      },
    });
    const periodicUpdate: number = await joplin.settings.value('periodicUpdate');
    if (periodicUpdate > 0) {
      setInterval(async () => {
        console.log('Periodic inline tags update');
        await convertAllNotesToJoplinTags();
      }, periodicUpdate * 60 * 1000);
    }

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

    await joplin.views.menus.create('itags.menu', 'Tag Navigator', [
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
