import joplin from 'api';
import { ContentScriptType, MenuItemLocation, SettingItemType } from 'api/types';
import { convertAllNotesToJoplinTags, convertNoteToJoplinTags } from './converter';
import { updateNotePanel } from './notePanel';
import { parseTagsLines } from './parser';
import { processAllNotes } from './db';
import { Query, convertToSQLiteQuery, getQueryResults } from './search';
import { focusSearchPanel, registerSearchPanel, setCheckboxState, updatePanelResults, updatePanelSettings } from './searchPanel';

let query: Query[][] = [];
let db = null;
async function getAllTags(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT tag FROM Tags`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const tags: string[] = rows.map(row => row.tag).sort();
        resolve(tags);
      }
    });
  });
}

async function updatePanelTagData(panel: string) {
  const intervalID = setInterval(
    async () => {
      if(joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateTagData',
          tags: JSON.stringify(await getAllTags()),
        });
      }
    }
    , 5000
  );
}

joplin.plugins.register({
  onStart: async function() {

    await joplin.settings.registerSection('itags', {
      label: 'Tag Navigator',
      iconName: 'fas fa-dharmachakra',
    });
    await joplin.settings.registerSettings({
      'itags.periodicConversion': {
        value: 0,
        type: SettingItemType.Int,
        minimum: 0,
        maximum: 1440,
        section: 'itags',
        public: true,
        label: 'Periodic tag conversion (minutes)',
        description: 'Periodically convert all notes to Joplin tags (requires restart). Set to 0 to disable periodic updates.',
      },
      'itags.periodicDBUpdate': {
        value: 5,
        type: SettingItemType.Int,
        minimum: 0,
        maximum: 1440,
        section: 'itags',
        public: true,
        label: 'Search: Periodic inline tags DB update (minutes)',
        description: 'Periodically update the inline tags database (requires restart). Set to 0 to disable periodic updates.',
      },
      'itags.resultSort': {
        value: 'modified',
        type: SettingItemType.String,
        section: 'itags',
        public: true,
        label: 'Search: Sort by',
        isEnum: true,
        options: {
          modified: 'Modified',
          created: 'Created',
          title: 'Title',
          notebook: 'Notebook',
        }
      },
      'itags.resultOrder': {
        value: 'desc',
        type: SettingItemType.String,
        section: 'itags',
        public: true,
        label: 'Search: Sort order',
        isEnum: true,
        options: {
          desc: 'Descending',
          asc: 'Ascending',
        }
      },
      'itags.resultToggle': {
        value: false,
        type: SettingItemType.Bool,
        section: 'itags',
        public: true,
        label: 'Search: Collapse results',
      },
      'itags.resultMarker': {
        value: true,
        type: SettingItemType.Bool,
        section: 'itags',
        public: true,
        label: 'Search: Highlight results',
      },
      'itags.tagRegex': {
        value: '',
        type: SettingItemType.String,
        section: 'itags',
        public: true,
        label: 'Tag regex',
        description: 'Custom regex to match tags. Leave empty to use the default regex.',
      },
      'itags.excludeRegex': {
        value: '',
        type: SettingItemType.String,
        section: 'itags',
        public: true,
        label: 'Exclude regex',
        description: 'Custom regex to exclude tags. Leave empty to not exclude any.',
      }
    });

    // Periodic conversion of tags
    const periodicConversion: number = await joplin.settings.value('itags.periodicConversion');
    if (periodicConversion > 0) {
      setInterval(async () => {
        console.log('Periodic inline tags update');
        await convertAllNotesToJoplinTags();
      }, periodicConversion * 60 * 1000);
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

    db = await processAllNotes();
    const searchPanel = await joplin.views.panels.create('itags.searchPanel');
    await registerSearchPanel(searchPanel);
    updatePanelTagData(searchPanel);
    updatePanelSettings(searchPanel);

    // Periodic database update
    const periodicDBUpdate: number = await joplin.settings.value('itags.periodicDBUpdate');
    if (periodicDBUpdate > 0) {
      setInterval(async () => {
        console.log('Periodic inline tags DB update');
        db = await processAllNotes(); // update DB

        // Update search results
        const sqlQuery = convertToSQLiteQuery(query);
        const results = await getQueryResults(db, sqlQuery);
        updatePanelResults(searchPanel, results);
      }, periodicDBUpdate * 60 * 1000);
    }

    // Navigation panel
    const notePanel = await joplin.views.panels.create('itags.notePanel');
    await joplin.views.panels.addScript(notePanel, 'notePanelStyle.css');
    await joplin.views.panels.addScript(notePanel, 'notePanelScript.js');
    let tagLines = [];
    joplin.workspace.onNoteSelectionChange(async () => {
      const note = await joplin.workspace.selectedNote();
      tagLines = await parseTagsLines(note.body);
      await updateNotePanel(notePanel, tagLines);
    });

    await joplin.commands.register({
      name: 'itags.refreshPanel',
      label: 'Refresh inline tags panel',
      iconName: 'fas fa-sync',
      execute: async () => {
        const note = await joplin.workspace.selectedNote();
        tagLines = await parseTagsLines(note.body);
        await updateNotePanel(notePanel, tagLines);
      },
    });

    await joplin.commands.register({
      name: 'itags.togglePanel',
      label: 'Toggle inline tags navigation panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        (await joplin.views.panels.visible(notePanel)) ? joplin.views.panels.hide(notePanel) : joplin.views.panels.show(notePanel);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleSearch',
      label: 'Toggle inline tags search panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        const panelState = await joplin.views.panels.visible(searchPanel);
        (panelState) ? joplin.views.panels.hide(searchPanel) : joplin.views.panels.show(searchPanel);
        if (!panelState) {
          focusSearchPanel(searchPanel);
          updatePanelSettings(searchPanel);
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.updateDB',
      label: 'Update inline tags database',
      iconName: 'fas fa-database',
      execute: async () => {
        console.log('User inline tags DB update');
        db = await processAllNotes();

        // Update search results
        const sqlQuery = convertToSQLiteQuery(query);
        const results = await getQueryResults(db, sqlQuery);
        updatePanelResults(searchPanel, results);
      },
    });

    await joplin.views.menus.create('itags.menu', 'Tag Navigator', [
      {
        commandName: 'itags.toggleSearch',
        accelerator: 'Ctrl+Shift+T',
      },
      {
        commandName: 'itags.updateDB',
        accelerator: 'Ctrl+Shift+D',
      },
      {
        commandName: 'itags.refreshPanel',
        accelerator: 'Ctrl+Shift+I',
      },
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
    await joplin.views.menuItems.create('itags.convertNoteToJoplinTags', 'itags.convertNoteToJoplinTags', MenuItemLocation.Note);

    await joplin.settings.onChange(async (event) => {
      if (event.keys.includes('itags.resultSort') || 
          event.keys.includes('itags.resultOrder') || 
          event.keys.includes('itags.resultToggle') || 
          event.keys.includes('itags.resultMarker')) {
        updatePanelSettings(searchPanel);
      }
    });

    await joplin.views.panels.onMessage(notePanel, async (message) => {
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
        await updateNotePanel(notePanel, tagLines);
      }
    });

    await joplin.views.panels.onMessage(searchPanel, async (message) => {
      if (message.name === 'searchQuery') {
        query = JSON.parse(message.query);
        const sqlQuery = convertToSQLiteQuery(query);
        const results = await getQueryResults(db, sqlQuery);
        updatePanelResults(searchPanel, results);

      } else if (message.name === 'openNote') {
        const note = await joplin.workspace.selectedNote();

        if (note.id !== message.externalId) {
          await joplin.commands.execute('openNote', message.externalId);
          // Wait for the note to be opened for 1 second
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await joplin.commands.execute('editor.execCommand', {
          name: 'scrollToTagLine',
          args: [message.line]
        });

      } else if (message.name === 'setCheckBox') {
        // update note content
        const note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
        const lines: string[] = note.body.split('\n');
        lines[message.line] = setCheckboxState(lines[message.line], message.text, message.checked);;
        const newBody = lines.join('\n');
        await joplin.data.put(['notes', message.externalId], null, { body: newBody });

        // update note editor
        const selectedNote = await joplin.workspace.selectedNote();
        if ((selectedNote.id === message.externalId) && (newBody !== note.body)) {
          // Update note editor if it's the currently selected note
          await joplin.commands.execute('editor.setText', newBody);
          await joplin.commands.execute('editor.execCommand', {
            name: 'scrollToTagLine',
            args: [message.line]
          });
        }
      }
    });
  },
});
