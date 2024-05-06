import joplin from 'api';
import { ContentScriptType, MenuItemLocation } from 'api/types';
import * as debounce from 'lodash.debounce';
import { registerSettings } from './settings';
import { convertAllNotesToInlineTags, convertAllNotesToJoplinTags, convertNoteToInlineTags, convertNoteToJoplinTags } from './converter';
import { updateNotePanel } from './notePanel';
import { getTagRegex, parseTagsLines } from './parser';
import { NoteDatabase, processAllNotes, processNote } from './db';
import { Query, displayInAllNotes, displayResultsInNote, removeResults, runSearch } from './search';
import { focusSearchPanel, registerSearchPanel, setCheckboxState, updatePanelResults, updatePanelSettings, saveQuery, loadQuery, updateQuery, removeTagFromText, renameTagInText, addTagToText } from './searchPanel';

let query: Query[][] = [];
let db: NoteDatabase;
let panelSettings: { resultSort?: string, resultOrder?: string, resultToggle?: boolean } = {};

async function updatePanelTagData(panel: string) {
  if (!joplin.views.panels.visible(panel)) { return; }
  joplin.views.panels.postMessage(panel, {
    name: 'updateTagData',
    tags: JSON.stringify(db.getTags()),
  });
}

async function updatePanelNoteData(panel: string) {
  if (!joplin.views.panels.visible(panel)) { return; }
  joplin.views.panels.postMessage(panel, {
    name: 'updateNoteData',
    notes: JSON.stringify(db.getNotes()),
  });
}

joplin.plugins.register({
  onStart: async function() {
    await registerSettings()

    const processNoteTags = debounce(async () => {
      const note = await joplin.workspace.selectedNote();
      const tagRegex = await getTagRegex();
      const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
      const inheritTags = await joplin.settings.value('itags.inheritTags');
      await processNote(db, note, tagRegex, ignoreCodeBlocks, inheritTags);

      // Update search results
      const results = await runSearch(db, query);
      updatePanelResults(searchPanel, results, query);
    }, 1000);

    // Periodic conversion of tags
    const periodicConversion: number = await joplin.settings.value('itags.periodicConversion');
    if (periodicConversion > 0) {
      setInterval(async () => {
        console.log('Periodic inline tags update');
        const tagRegex = await getTagRegex();
        const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
        const inheritTags = await joplin.settings.value('itags.inheritTags');
        await convertAllNotesToJoplinTags(tagRegex, ignoreCodeBlocks, inheritTags);
      }, periodicConversion * 60 * 1000);
    }

    await joplin.contentScripts.register(
      ContentScriptType.CodeMirrorPlugin,
      'cm5scroller',
      './cm5scroller.js',
    );
    await joplin.contentScripts.register(
      ContentScriptType.CodeMirrorPlugin,
      'cm6scroller',
      './cm6scroller.js',
    );

    // Search panel
    db = await processAllNotes();
    const searchPanel = await joplin.views.panels.create('itags.searchPanel');
    await registerSearchPanel(searchPanel);

    await joplin.views.panels.onMessage(searchPanel, async (message) => {
      if (message.name === 'initPanel') {
        updatePanelTagData(searchPanel);
        updatePanelNoteData(searchPanel);
        await updateQuery(searchPanel, query, '');
        updatePanelSettings(searchPanel, panelSettings);
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'searchQuery') {
        query = JSON.parse(message.query);
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'saveQuery') {
        // Save the query into the current note
        const currentQuery = await loadQuery(db, await joplin.workspace.selectedNote());
        saveQuery({query: JSON.parse(message.query), filter: message.filter, displayInNote: currentQuery.displayInNote});

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
        await setCheckboxState(message);

        // update the search panel
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'removeTag') {
        await removeTagFromText(message);

        // update the search panel
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'renameTag') {
        await renameTagInText(message);

        // update the search panel
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'addTag') {
        await addTagToText(message);

        // update the search panel
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);

      } else if (message.name === 'updateSetting') {

        panelSettings[message.field] = message.value;
      }
    });

    // Periodic database update
    const periodicDBUpdate: number = await joplin.settings.value('itags.periodicDBUpdate');
    if (periodicDBUpdate > 0) {
      setInterval(async () => {
        console.log('Periodic inline tags DB update');
        db = await processAllNotes(); // update DB

        // Update search results
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);
        displayInAllNotes(db);
      }, periodicDBUpdate * 60 * 1000);
    }

    // Note navigation panel
    const notePanel = await joplin.views.panels.create('itags.notePanel');
    await joplin.views.panels.addScript(notePanel, 'notePanelStyle.css');
    await joplin.views.panels.addScript(notePanel, 'notePanelScript.js');
    let tagLines = [];
    joplin.workspace.onNoteSelectionChange(async () => {
      // Search panel update
      const note = await joplin.workspace.selectedNote();
      const savedQuery = await loadQuery(db, note);
      if (savedQuery.query && savedQuery.query.length > 0 && savedQuery.query[0].length > 0) {
        // Updating this variable will ensure it's sent to the panel on initPanel
        query = savedQuery.query;
      }
      await updateQuery(searchPanel, savedQuery.query, savedQuery.filter);

      // Update results in note
      if (savedQuery.displayInNote) {
        await displayResultsInNote(db, note);
      }

      // Note panel update
      const tagRegex = await getTagRegex();
      const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
      tagLines = await parseTagsLines(note.body, tagRegex, ignoreCodeBlocks, false);
      await updateNotePanel(notePanel, tagLines);

      if (query.flatMap(x => x).some(x => x.externalId == 'current')) {
        // Update search results
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);
      }
    });

    await joplin.commands.register({
      name: 'itags.refreshPanel',
      label: 'Refresh inline tags navigation panel',
      iconName: 'fas fa-sync',
      execute: async () => {
        const note = await joplin.workspace.selectedNote();
        const tagRegex = await getTagRegex();
        const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
        tagLines = await parseTagsLines(note.body, tagRegex, ignoreCodeBlocks, false);
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
          await registerSearchPanel(searchPanel);
          await focusSearchPanel(searchPanel);
          await updatePanelSettings(searchPanel, panelSettings);
          const note = await joplin.workspace.selectedNote();
          const query = await loadQuery(db, note);
          await updateQuery(searchPanel, query.query, query.filter);
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.loadQuery',
      label: 'Load inline tags search query',
      iconName: 'fas fa-tags',
      execute: async () => {
        const note = await joplin.workspace.selectedNote();
        const query = await loadQuery(db, note);
        await updateQuery(searchPanel, query.query, query.filter);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleNoteView',
      label: 'Toggle search results display in note',
      iconName: 'fas fa-tags',
      execute: async () => {
        const note = await joplin.workspace.selectedNote();
        const query = await loadQuery(db, note);
        // toggle display
        query.displayInNote = !query.displayInNote;

        note.body = await saveQuery(query);
        if (query.displayInNote) {
          await displayResultsInNote(db, note);
        } else {
          await removeResults(note);
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
        const results = await runSearch(db, query);
        updatePanelResults(searchPanel, results, query);
        displayInAllNotes(db);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertNoteToJoplinTags',
      label: "Convert note's inline tags to Joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        const note = await joplin.workspace.selectedNote();

        const tagRegex = await getTagRegex();
        const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
        const inheritTags = await joplin.settings.value('itags.inheritTags');
        await convertNoteToJoplinTags(note, tagRegex, ignoreCodeBlocks, inheritTags);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertAllNotesToJoplinTags',
      label: "Convert all notes' inline tags to Joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        const tagRegex = await getTagRegex();
        const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
        const inheritTags = await joplin.settings.value('itags.inheritTags');
        await convertAllNotesToJoplinTags(tagRegex, ignoreCodeBlocks, inheritTags);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertNoteToInlineTags',
      label: "Convert note's Joplin tags to inline tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        let note = await joplin.workspace.selectedNote();
        const listPrefix = await joplin.settings.value('itags.listPrefix');
        const tagPrefix = await joplin.settings.value('itags.tagPrefix');
        const location = await joplin.settings.value('itags.location');
        await convertNoteToInlineTags(note, listPrefix, tagPrefix, location);
        note = await joplin.workspace.selectedNote();
        await joplin.commands.execute('editor.setText', note.body);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertAllNotesToInlineTags',
      label: "Convert all notes' Joplin tags to inline tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        const listPrefix = await joplin.settings.value('itags.listPrefix');
        const tagPrefix = await joplin.settings.value('itags.tagPrefix');
        const location = await joplin.settings.value('itags.location');
        await convertAllNotesToInlineTags(listPrefix, tagPrefix, location);
        const note = await joplin.workspace.selectedNote();
        await joplin.commands.execute('editor.setText', note.body);
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
        commandName: 'itags.loadQuery',
        accelerator: 'Ctrl+Shift+L',
      },
      {
        commandName: 'itags.toggleNoteView',
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
      {
        commandName: 'itags.convertNoteToInlineTags',
      },
      {
        commandName: 'itags.convertAllNotesToInlineTags',
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

    await joplin.workspace.onNoteChange(async () => {
      await processNoteTags();
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
        const lineIndex = parseInt(message.line);
        if (lineIndex > 0) {
          await joplin.commands.execute('editor.execCommand', {
            name: 'scrollToTagLine',
            args: [lineIndex]
          });
        }
        // Update the panel
        await updateNotePanel(notePanel, tagLines);
      }
    });
  },
});