import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import * as debounce from 'lodash.debounce';
import { getTagSettings, registerSettings } from './settings';
import { convertAllNotesToInlineTags, convertAllNotesToJoplinTags, convertNoteToInlineTags, convertNoteToJoplinTags } from './converter';
import { updateNavPanel } from './navPanel';
import { parseTagsLines } from './parser';
import { DatabaseManager, processAllNotes, processNote } from './db';
import { clearNoteReferences, displayInAllNotes, displayResultsInNote, removeResults, runSearch } from './search';
import { QueryRecord, focusSearchPanel, registerSearchPanel, updatePanelResults, updatePanelSettings, saveQuery, loadQuery, updatePanelQuery, processMessage, updatePanelTagData, updatePanelNoteData } from './searchPanel';

let searchParams: QueryRecord = { query: [[]], filter: '', displayInNote: false };

joplin.plugins.register({
  onStart: async function() {
    await registerSettings()

    const processNoteTags = debounce(async () => {
      let note = await joplin.workspace.selectedNote();
      if (!note) { return; }
      const tagSettings = await getTagSettings();
      await processNote(DatabaseManager.getDatabase(), note, tagSettings);
      note = clearNoteReferences(note);

      // Update tags
      await updatePanelTagData(searchPanel, DatabaseManager.getDatabase());

      // Update search results
      const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query);
      await updatePanelResults(searchPanel, results, searchParams.query);
    }, 1000);

    // Periodic conversion of tags
    const periodicConversion: number = await joplin.settings.value('itags.periodicConversion');
    if (periodicConversion > 0) {
      setInterval(async () => {
        await convertAllNotesToJoplinTags();
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
    await processAllNotes();
    const searchPanel = await joplin.views.panels.create('itags.searchPanel');
    const tagSettings = await getTagSettings();
    await joplin.views.panels.onMessage(searchPanel, async (message: any) => {
      processMessage(message, searchPanel, DatabaseManager.getDatabase(), searchParams, tagSettings);
    });
    await registerSearchPanel(searchPanel);

    // Note navigation panel
    const navPanel = await joplin.views.panels.create('itags.navPanel');
    let tagLines = [];

    // Periodic database update
    const periodicDBUpdate: number = await joplin.settings.value('itags.periodicDBUpdate');
    const updateDB = async () => {
      await processAllNotes(); // update DB

      // Update tags & notes
      await updatePanelTagData(searchPanel, DatabaseManager.getDatabase());
      await updatePanelNoteData(searchPanel, DatabaseManager.getDatabase());

      // Update search results
      const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query);
      await updatePanelResults(searchPanel, results, searchParams.query);

      // Update note view
      if (await joplin.settings.value('itags.periodicNoteUpdate')) {
        displayInAllNotes(DatabaseManager.getDatabase());  
      }

      // Update navigation panel
      if (await joplin.views.panels.visible(navPanel)) {
        const tagSettings = await getTagSettings();
        let note = await joplin.workspace.selectedNote();
        if (note.body) {
          tagSettings.inheritTags = false;
          tagLines = await parseTagsLines(note.body, tagSettings);
        }
        await updateNavPanel(navPanel, tagLines, DatabaseManager.getDatabase().getAllTagCounts());
        note = clearNoteReferences(note);
      }
    }
    if (periodicDBUpdate > 0) {
      setInterval(updateDB, periodicDBUpdate * 60 * 1000);
    }

    joplin.workspace.onNoteSelectionChange(async () => {
      // Search panel update
      let note = await joplin.workspace.selectedNote();
      if (!note) { return; }
      const savedQuery = await loadQuery(DatabaseManager.getDatabase(), note);
      if (savedQuery.query && savedQuery.query.length > 0 && savedQuery.query[0].length > 0) {
        // Updating this variable will ensure it's sent to the panel on initPanel
        searchParams = savedQuery;
        await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
      }

      // Update results in note
      if (savedQuery.displayInNote) {
        await displayResultsInNote(DatabaseManager.getDatabase(), note);
      }

      // Navigation panel update
      if (await joplin.views.panels.visible(navPanel)) {
        const tagSettings = await getTagSettings();
        tagSettings.inheritTags = false;
        tagLines = await parseTagsLines(note.body, tagSettings);
        await updateNavPanel(navPanel, tagLines, DatabaseManager.getDatabase().getAllTagCounts());
      }

      note = clearNoteReferences(note);

      if (searchParams.query.flatMap(x => x).some(x => x.externalId == 'current')) {
        // Update search results
        const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query);
        await updatePanelResults(searchPanel, results, searchParams.query);
      }
    });

    await joplin.commands.register({
      name: 'itags.refreshPanel',
      label: 'Refresh inline tags navigation panel',
      iconName: 'fas fa-sync',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const tagSettings = await getTagSettings();
        tagSettings.inheritTags = false;
        tagLines = await parseTagsLines(note.body, tagSettings);
        await updateNavPanel(navPanel, tagLines, DatabaseManager.getDatabase().getAllTagCounts());
        note = clearNoteReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleNav',
      label: 'Toggle inline tags navigation panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        if (await joplin.views.panels.visible(navPanel)) {
          joplin.views.panels.hide(navPanel)
        } else {
          await joplin.views.panels.show(navPanel);
          await joplin.commands.execute('itags.refreshPanel');
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleSearch',
      label: 'Toggle inline tags search panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        const panelState = await joplin.views.panels.visible(searchPanel);
        (panelState) ? await joplin.views.panels.hide(searchPanel) : await joplin.views.panels.show(searchPanel);
        if (!panelState) {
          await registerSearchPanel(searchPanel);
          await focusSearchPanel(searchPanel);
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.focusSearch',
      label: 'Focus inline tags search panel',
      iconName: 'fas fa-tags',
      execute: async () => {
        await focusSearchPanel(searchPanel);
      },
    });

    await joplin.commands.register({
      name: 'itags.loadQuery',
      label: 'Load inline tags search query',
      iconName: 'fas fa-dharmachakra',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const savedQuery = await loadQuery(DatabaseManager.getDatabase(), note);
        if (savedQuery.query && savedQuery.query.length > 0 && savedQuery.query[0].length > 0) {
          // Updating this variable will ensure it's sent to the panel on initPanel
          searchParams = savedQuery;
          await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
        }
        note = clearNoteReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleNoteView',
      label: 'Toggle tag search view in note',
      iconName: 'fas fa-dharmachakra',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const query = await loadQuery(DatabaseManager.getDatabase(), note);
        // toggle display
        query.displayInNote = !query.displayInNote;

        note.body = await saveQuery(query);
        if (query.displayInNote) {
          await displayResultsInNote(DatabaseManager.getDatabase(), note);
        } else {
          await removeResults(note);
        }
        note = clearNoteReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.updateDB',
      label: 'Update inline tags database',
      iconName: 'fas fa-database',
      execute: updateDB,
    });

    await joplin.commands.register({
      name: 'itags.convertNoteToJoplinTags',
      label: "Convert note's inline tags to Joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }

        const tagSettings = await getTagSettings();
        await convertNoteToJoplinTags(note, tagSettings);
        note = clearNoteReferences(note);
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

    await joplin.commands.register({
      name: 'itags.convertNoteToInlineTags',
      label: "Convert note's Joplin tags to inline tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const listPrefix = await joplin.settings.value('itags.listPrefix');
        const tagPrefix = await joplin.settings.value('itags.tagPrefix');
        const location = await joplin.settings.value('itags.location');
        await convertNoteToInlineTags(note, listPrefix, tagPrefix, location);
        note = clearNoteReferences(note);
        note = await joplin.workspace.selectedNote();
        await joplin.commands.execute('editor.setText', note.body);
        note = clearNoteReferences(note);
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
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        await joplin.commands.execute('editor.setText', note.body);
        note = clearNoteReferences(note);
      },
    });

    await joplin.views.menus.create('itags.menu', 'Tag Navigator', [
      {
        commandName: 'itags.toggleSearch',
        accelerator: 'Ctrl+Shift+T',
      },
      {
        commandName: 'itags.focusSearch',
        accelerator: 'Ctrl+Shift+I',
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
      },
      {
        commandName: 'itags.toggleNav',
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
    await joplin.views.toolbarButtons.create('itags.toggleNoteView', 'itags.toggleNoteView', ToolbarButtonLocation.EditorToolbar);
    await joplin.views.toolbarButtons.create('itags.loadQuery', 'itags.loadQuery', ToolbarButtonLocation.NoteToolbar);

    await joplin.settings.onChange(async (event) => {
      if (event.keys.includes('itags.resultSort') || 
          event.keys.includes('itags.resultOrder') || 
          event.keys.includes('itags.resultToggle') || 
          event.keys.includes('itags.resultMarker') ||
          event.keys.includes('itags.showTagRange') ||
          event.keys.includes('itags.showNotes') ||
          event.keys.includes('itags.showResultFilter') ||
          event.keys.includes('itags.searchWithRegex') ||
          event.keys.includes('itags.selectMultiTags')) {
        await updatePanelSettings(searchPanel);
      }
      if (event.keys.includes('itags.navPanelScope') ||
          event.keys.includes('itags.navPanelStyle') ||
          event.keys.includes('itags.navPanelSort')) {
        if (await joplin.views.panels.visible(navPanel)) {
          await updateNavPanel(navPanel, tagLines, DatabaseManager.getDatabase().getAllTagCounts());
        }
      }
    });

    await joplin.workspace.onNoteChange(async () => {
      await processNoteTags();
    });

    await joplin.workspace.onSyncComplete(async () => {
      if (!await joplin.settings.value('itags.updateAfterSync')) { return; }
      await updateDB();
    });

    await joplin.views.panels.onMessage(navPanel, async (message) => {
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
        await updateNavPanel(navPanel, tagLines, DatabaseManager.getDatabase().getAllTagCounts());
      }
      if (message.name === 'updateSetting') {
        await joplin.settings.setValue(message.field, message.value);
      }
      if (message.name === 'searchTag') {
        searchParams = { query: [[{ tag: message.tag, negated: false }]], filter: '', displayInNote: false };
        await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
        const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query);
        await updatePanelResults(searchPanel, results, searchParams.query);
      }
    });
  },
});