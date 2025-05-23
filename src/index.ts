import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import * as debounce from 'lodash.debounce';
import { getTagSettings, registerSettings } from './settings';
import { clearObjectReferences } from './utils';
import { convertAllNotesToInlineTags, convertAllNotesToJoplinTags, convertNoteToInlineTags, convertNoteToJoplinTags } from './converter';
import { getNavTagLines, TagCount, TagLine, updateNavPanel } from './navPanel';
import { DatabaseManager, processAllNotes, processNote } from './db';
import { createTableEntryNote, displayInAllNotes, displayResultsInNote, removeResults, viewList } from './noteView';
import { runSearch, GroupedResult } from './search';
import { QueryRecord, focusSearchPanel, registerSearchPanel, updatePanelResults, updatePanelSettings, saveQuery, loadQuery, updatePanelQuery, processMessage, updatePanelTagData, updatePanelNoteData } from './searchPanel';
import { RELEASE_NOTES } from './release';

let searchParams: QueryRecord = { query: [[]], filter: '', displayInNote: 'false' };
let currentTableColumns: string[] = [];
let currentTableDefaultValues: { [key: string]: string } = {};
let lastSearchResults: GroupedResult[] = []; // Cache for search results

// Store for collapsed/expanded state of note cards in the search panel
let savedNoteState: { [key: string]: boolean } = {};

/**
 * Main plugin registration and initialization
 */
joplin.plugins.register({
  onStart: async function() {
    await registerSettings();

    let releaseNotes = await joplin.settings.value('itags.releaseNotes');

    /**
     * Processes tags for the currently selected note with debouncing
     * Updates the search panel with new tag data and search results
     */
    const processNoteTags = debounce(async () => {
      let note = await joplin.workspace.selectedNote();
      if (!note) { return; }
      const tagSettings = await getTagSettings();
      await processNote(DatabaseManager.getDatabase(), note, tagSettings);
      note = clearObjectReferences(note);

      // Update tags
      await updatePanelTagData(searchPanel, DatabaseManager.getDatabase());

      // Update search results
      const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query, undefined, searchParams.options);
      lastSearchResults = results; // Cache the results
      await updatePanelResults(searchPanel, results, searchParams.query, searchParams.options);
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
      lastSearchResults = await processMessage(message, searchPanel, DatabaseManager.getDatabase(), searchParams, tagSettings, savedNoteState, lastSearchResults);
      clearObjectReferences(message);
    });
    await registerSearchPanel(searchPanel);

    // Note navigation panel
    const navPanel = await joplin.views.panels.create('itags.navPanel');
    let tagLines: TagLine[] = [];
    let tagCount: TagCount = {};

    /**
     * Updates the database and all UI components:
     * - Updates tag and note data in search panel
     * - Updates search results
     * - Updates note view if enabled
     * - Updates navigation panel if visible
     */
    const periodicDBUpdate: number = await joplin.settings.value('itags.periodicDBUpdate');
    const updateDB = async () => {
      await processAllNotes(); // update DB

      // Update tags & notes
      await updatePanelTagData(searchPanel, DatabaseManager.getDatabase());
      await updatePanelNoteData(searchPanel, DatabaseManager.getDatabase());

      // Update search results
      const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query, undefined, searchParams.options);
      lastSearchResults = results; // Cache the results
      await updatePanelResults(searchPanel, results, searchParams.query, searchParams.options);

      // Update note view
      if (await joplin.settings.value('itags.periodicNoteUpdate')) {
        const result = await displayInAllNotes(DatabaseManager.getDatabase());
        if (result) {
          currentTableColumns = result.tableColumns;
          currentTableDefaultValues = result.tableDefaultValues;
        }
      }

      // Update navigation panel
      if (await joplin.views.panels.visible(navPanel)) {
        let note = await joplin.workspace.selectedNote();
        if (note.body) {
          [tagLines, tagCount] = await getNavTagLines(note.body);
        }
        await updateNavPanel(navPanel, tagLines, tagCount);
        note = clearObjectReferences(note);
      }
    }
    if (periodicDBUpdate > 0) {
      setInterval(updateDB, periodicDBUpdate * 60 * 1000);
    }

    joplin.workspace.onNoteSelectionChange(async () => {
      if (releaseNotes !== RELEASE_NOTES.version) {
        releaseNotes = RELEASE_NOTES.version;
        await joplin.settings.setValue('itags.releaseNotes', RELEASE_NOTES.version);
        await joplin.views.dialogs.showMessageBox(RELEASE_NOTES.notes);
      }
      // Reset table columns and default values
      currentTableColumns = [];
      currentTableDefaultValues = {};
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
      const updateViewOnOpen = await joplin.settings.value('itags.updateViewOnOpen');
      if (updateViewOnOpen) {
        if (viewList.includes(savedQuery.displayInNote)) {
          const tagSettings = await getTagSettings();
          const nColumns = await joplin.settings.value('itags.tableColumns');
          const noteViewLocation = await joplin.settings.value('itags.noteViewLocation');
          const result = await displayResultsInNote(DatabaseManager.getDatabase(), note, tagSettings, noteViewLocation, nColumns);
          if (result) {
            currentTableColumns = result.tableColumns;
            currentTableDefaultValues = result.tableDefaultValues;
          }
        } else {
          await removeResults(note);
        }
      }

      // Navigation panel update
      if (await joplin.views.panels.visible(navPanel)) {
        [tagLines, tagCount] = await getNavTagLines(note.body);
        await updateNavPanel(navPanel, tagLines, tagCount);
      }

      note = clearObjectReferences(note);

      if (searchParams.query.flatMap(x => x).some(x => x.externalId == 'current')) {
        // Update search results
        const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query, undefined, searchParams.options);
        lastSearchResults = results; // Cache the results
        await updatePanelResults(searchPanel, results, searchParams.query, searchParams.options);
      }
    });

    await joplin.commands.register({
      name: 'itags.refreshPanel',
      label: 'Navigation panel: Refresh',
      iconName: 'fas fa-sync',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        [tagLines, tagCount] = await getNavTagLines(note.body);
        await updateNavPanel(navPanel, tagLines, tagCount);
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleNav',
      label: 'Navigation panel: Toggle',
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
      label: 'Search panel: Toggle',
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
      label: 'Search panel: Focus',
      iconName: 'fas fa-tags',
      execute: async () => {
        await focusSearchPanel(searchPanel);
      },
    });

    await joplin.commands.register({
      name: 'itags.loadQuery',
      label: 'Search panel: Load query from note',
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
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.toggleNoteView',
      label: 'Note view: Toggle',
      iconName: 'fas fa-dharmachakra',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const query = await loadQuery(DatabaseManager.getDatabase(), note);
        // toggle display
        const i = viewList.findIndex(x => x === query.displayInNote);
        if (i === -1) {
          query.displayInNote = 'list';
        } else {
          query.displayInNote = viewList[(i + 1) % viewList.length];
        }

        note.body = await saveQuery(query);
        if (viewList.includes(query.displayInNote)) {
          const tagSettings = await getTagSettings();
          const nColumns = await joplin.settings.value('itags.tableColumns');
          const noteViewLocation = await joplin.settings.value('itags.noteViewLocation');
          const result = await displayResultsInNote(DatabaseManager.getDatabase(), note, tagSettings, noteViewLocation, nColumns);
          if (result) {
            currentTableColumns = result.tableColumns;
            currentTableDefaultValues = result.tableDefaultValues;
          }
        } else {
          await removeResults(note);
          currentTableColumns = [];
          currentTableDefaultValues = {};
        }
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.refreshNoteView',
      label: 'Note view: Refresh',
      iconName: 'fas fa-sync',
      execute: async () => {
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const tagSettings = await getTagSettings();
        const nColumns = await joplin.settings.value('itags.tableColumns');
        const noteViewLocation = await joplin.settings.value('itags.noteViewLocation');
        const result = await displayResultsInNote(DatabaseManager.getDatabase(), note, tagSettings, noteViewLocation, nColumns);
        if (result) {
          currentTableColumns = result.tableColumns;
          currentTableDefaultValues = result.tableDefaultValues;
        }
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.updateDB',
      label: 'Inline-tags: Update database',
      iconName: 'fas fa-database',
      execute: updateDB,
    });

    await joplin.commands.register({
      name: 'itags.convertNoteToJoplinTags',
      label: "Convert note: INLINE-TAGS → joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }

        const tagSettings = await getTagSettings();
        await convertNoteToJoplinTags(note, tagSettings);
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertAllNotesToJoplinTags',
      label: "Convert all notes: INLINE-TAGS → joplin tags",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Confirmation dialog
        const confirm = await joplin.views.dialogs.showMessageBox('Are you sure you want to convert all notes to Joplin tags?');
        if (confirm === 0) {
          await convertAllNotesToJoplinTags();
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.convertNoteToInlineTags',
      label: "Convert note: joplin tags → INLINE-TAGS",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Get the selected note
        let note = await joplin.workspace.selectedNote();
        if (!note) { return; }
        const listPrefix = await joplin.settings.value('itags.listPrefix');
        const tagPrefix = await joplin.settings.value('itags.tagPrefix');
        const spaceReplace = await joplin.settings.value('itags.spaceReplace');
        const location = await joplin.settings.value('itags.location');
        await convertNoteToInlineTags(note, listPrefix, tagPrefix, spaceReplace, location);
        note = clearObjectReferences(note);
        note = await joplin.workspace.selectedNote();
        await joplin.commands.execute('editor.setText', note.body);
        note = clearObjectReferences(note);
      },
    });

    await joplin.commands.register({
      name: 'itags.convertAllNotesToInlineTags',
      label: "Convert all notes: joplin tags → INLINE-TAGS",
      iconName: 'fas fa-tags',
      execute: async () => {
        // Confirmation dialog
        const confirm = await joplin.views.dialogs.showMessageBox('Are you sure you want to convert all notes to inline tags?');
        if (confirm === 0) {
          const listPrefix = await joplin.settings.value('itags.listPrefix');
          const tagPrefix = await joplin.settings.value('itags.tagPrefix');
          const spaceReplace = await joplin.settings.value('itags.spaceReplace');
          const location = await joplin.settings.value('itags.location');
          await convertAllNotesToInlineTags(listPrefix, tagPrefix, spaceReplace, location);
          let note = await joplin.workspace.selectedNote();
          if (!note) { return; }
          await joplin.commands.execute('editor.setText', note.body);
          note = clearObjectReferences(note);
        }
      },
    });

    await joplin.commands.register({
      name: 'itags.createTableEntryNote',
      label: 'Note view: New table entry',
      iconName: 'fas fa-table',
      execute: async () => {
        await createTableEntryNote(currentTableColumns, currentTableDefaultValues);
      },
    });

    await joplin.workspace.filterEditorContextMenu(async (object: any) => {
      if (currentTableColumns.length > 0) {
        object.items.push({
          type: 'separator',
        })
        object.items.push({
          label: 'New table entry note',
          commandName: 'itags.createTableEntryNote',
        });
      }
      return object;
    });

    await joplin.views.menus.create('itags.menu', 'Tag Navigator', [
      {
        commandName: 'itags.toggleNav',
      },
      {
        commandName: 'itags.refreshPanel',
      },
      {
        commandName: 'itags.toggleSearch',
        accelerator: 'Ctrl+Shift+T',
      },
      {
        commandName: 'itags.focusSearch',
        accelerator: 'Ctrl+Shift+I',
      },
      {
        commandName: 'itags.loadQuery',
        accelerator: 'Ctrl+Shift+L',
      },
      {
        commandName: 'itags.toggleNoteView',
      },
      {
        commandName: 'itags.refreshNoteView',
        accelerator: 'Ctrl+Shift+R',
      },
      {
        commandName: 'itags.createTableEntryNote',
      },
      {
        commandName: 'itags.updateDB',
        accelerator: 'Ctrl+Shift+D',
      }
    ], MenuItemLocation.Tools);

    await joplin.views.menus.create('itags.menuConvertNote', 'Convert current note', [
      {
        commandName: 'itags.convertNoteToInlineTags',
      },
      {
        commandName: 'itags.convertNoteToJoplinTags',
      }
    ], MenuItemLocation.Note);

    await joplin.views.menus.create('itags.menuConvertAllNotes', 'Convert all notes', [
      {
        commandName: 'itags.convertAllNotesToInlineTags',
      },
      {
        commandName: 'itags.convertAllNotesToJoplinTags',
      }
    ], MenuItemLocation.Note);

    await joplin.views.toolbarButtons.create('itags.toggleNoteView', 'itags.toggleNoteView', ToolbarButtonLocation.EditorToolbar);
    await joplin.views.toolbarButtons.create('itags.refreshNoteView', 'itags.refreshNoteView', ToolbarButtonLocation.EditorToolbar);
    await joplin.views.toolbarButtons.create('itags.loadQuery', 'itags.loadQuery', ToolbarButtonLocation.NoteToolbar);
    await joplin.views.toolbarButtons.create('itags.createTableEntryNote', 'itags.createTableEntryNote', ToolbarButtonLocation.EditorToolbar);

    await joplin.settings.onChange(async (event) => {
      if (event.keys.includes('itags.resultSort') || 
          event.keys.includes('itags.resultOrder') || 
          event.keys.includes('itags.resultToggle') || 
          event.keys.includes('itags.resultMarker') ||
          event.keys.includes('itags.showQuery') ||
          event.keys.includes('itags.expandedTagList') ||
          event.keys.includes('itags.showTagRange') ||
          event.keys.includes('itags.showNotes') ||
          event.keys.includes('itags.showResultFilter') ||
          event.keys.includes('itags.searchWithRegex') ||
          event.keys.includes('itags.selectMultiTags') ||
          event.keys.includes('itags.resultColorProperty')) {
        await updatePanelSettings(searchPanel);
      }
      // Changes that require a database clear
      if (event.keys.includes('itags.tagRegex') ||
          event.keys.includes('itags.excludeRegex') ||
          event.keys.includes('itags.todayTag') ||
          event.keys.includes('itags.dateFormat') ||
          event.keys.includes('itags.minCount') ||
          event.keys.includes('itags.valueDelim') ||
          event.keys.includes('itags.tagPrefix') ||
          event.keys.includes('itags.spaceReplace') ||
          event.keys.includes('itags.ignoreHtmlNotes') ||
          event.keys.includes('itags.ignoreCodeBlocks') ||
          event.keys.includes('itags.ignoreFrontMatter') ||
          event.keys.includes('itags.inheritTags') ||
          event.keys.includes('itags.nestedTags')) {
        DatabaseManager.clearDatabase();
        await updateDB();
      }
      if (event.keys.includes('itags.navPanelScope') ||
          event.keys.includes('itags.navPanelStyle') ||
          event.keys.includes('itags.navPanelSort')) {
        if (await joplin.views.panels.visible(navPanel)) {
          await updateNavPanel(navPanel, tagLines, tagCount);
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

    await joplin.views.panels.onMessage(navPanel, async (message: any) => {
      if (message.name === 'jumpToLine') {
        // Increment the index of the tag
        for (const tag of tagLines) {
          if (tag.tag === message.tag) {
            tag.index = (tag.index + 1) % tag.count;
          }
        }
        // Navigate to the line
        const lineIndex = parseInt(message.line);
        if (lineIndex >= 0) {
          try {
            await joplin.commands.execute('dismissPluginPanels');
          } catch {
            // Ignore errors (not on mobile, or old version)
          }
          try {
            await joplin.commands.execute('editor.execCommand', {
              name: 'scrollToTagLine',
              args: [lineIndex]
            });
          } catch (error) {
            // If the editor is not available, this will fail
          }
        }
        // Update the panel
        await updateNavPanel(navPanel, tagLines, tagCount);
      }
      if (message.name === 'updateSetting') {
        await joplin.settings.setValue(message.field, message.value);
      }
      if (message.name === 'searchTag') {
        searchParams = { query: [[{ tag: message.tag, negated: false }]], filter: '', displayInNote: 'false' };
        await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
        const results = await runSearch(DatabaseManager.getDatabase(), searchParams.query, undefined, searchParams.options);
        lastSearchResults = results; // Cache the results
        await updatePanelResults(searchPanel, results, searchParams.query, searchParams.options);
      }
      clearObjectReferences(message);
    });
  },
});