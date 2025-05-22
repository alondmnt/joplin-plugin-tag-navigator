import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import * as markdownItTaskLists from 'markdown-it-task-lists';
import * as prism from './prism.js';
import { TagSettings, getTagSettings, queryEnd, queryStart } from './settings';
import { clearObjectReferences, escapeRegex } from './utils';
import { GroupedResult, Query, runSearch } from './search';
import { noteIdRegex } from './parser';
import { NoteDatabase, processNote } from './db';

// Cached markdown-it instance
const md = new MarkdownIt({ 
  html: true,
  breaks: true,
  highlight(code: string, lang?: string): string {
    // ---- core of the integration ----
    if (lang && prism.languages[lang]) {
      const html = prism.highlight(code, prism.languages[lang], lang);
      return `<pre class="language-${lang}"><code>${html}</code></pre>`;
    }
    // fallback – no language or unsupported
    const escaped = md.utils.escapeHtml(code);
    return `<pre class="language-text"><code>${escaped}</code></pre>`;
  },
}).use(markdownItTaskLists, { enabled: true })

/** Cached regex patterns */
export const REGEX = {
  findQuery: new RegExp(`[\n]*${queryStart}([\\s\\S]*?)${queryEnd}`),
  wikiLink: /\[\[([^\]]+)\]\]/g,
  xitOpen: /(^[\s]*)- \[ \] (.*)$/gm,
  xitDone: /(^[\s]*)- \[x\] (.*)$/gm,
  xitOngoing: /(^[\s]*)- \[@\] (.*)$/gm,
  xitObsolete: /(^[\s]*)- \[~\] (.*)$/gm,
  xitInQuestion: /(^[\s]*)- \[\?\] (.*)$/gm,
  xitBlocked: /(^[\s]*)- \[!\] (.*)$/gm,
  codeBlock: /(```[^`]*```)/g,
  backtickContent: /(`[^`]*`)/,
  heading: /^(#{1,6})\s+(.*)$/,
  leadingWhitespace: /^\s*/,
  checkboxPrefix: /^\s*- \[[x\s@\?!~]\]\s*/,
  checkboxState: /^(\s*- \[)[x\s@\?!~](\])/g
};

/**
 * Represents a search query configuration
 */
export interface QueryRecord {
  /** Array of query conditions grouped by AND/OR logic */
  query: Query[][];
  /** Text filter to apply to results */
  filter: string;
  /** How to display results in the note: 'false', 'list', 'table', or 'kanban' */
  displayInNote: string;
  /** Optional display settings */
  options?: {
    includeCols?: string;
    excludeCols?: string;
    sortBy?: string;
    sortOrder?: string;
  };
}

/**
 * Interface for messages received from the search panel UI
 */
interface PanelMessage {
  name: string;
  query?: string;
  filter?: string;
  tag?: string;
  line?: number;
  externalId?: string;
  text?: string;
  field?: string;
  value?: any;
  oldTag?: string;
  newTag?: string;
  source?: string;
  target?: string;
  noteState?: string;
}

/**
 * Interface for note update messages
 */
interface NoteUpdateMessage {
  externalId: string;
  line: number;
}

/**
 * Interface for panel settings
 */
interface PanelSettings {
  resultSort: string;
  resultOrder: string;
  resultToggle: boolean;
  resultMarker: boolean;
  showQuery: boolean;
  expandedTagList: boolean;
  showTagRange: boolean;
  showNotes: boolean;
  showResultFilter: boolean;
  selectMultiTags: boolean;
  searchWithRegex: boolean;
  spaceReplace: string;
  resultColorProperty: string;
}

// Get the version of Joplin
let versionInfo = {
  toggleEditorSupport: null,
};

async function initializeVersionInfo() {
  const version = await joplin.versionInfo();
  versionInfo.toggleEditorSupport = 
    version.platform === 'mobile' && 
    parseInt(version.version.split('.')[0]) >= 3 && 
    parseInt(version.version.split('.')[1]) >= 2;
}

/**
 * Registers and initializes the search panel view
 * @param panel - Panel ID to register
 */
export async function registerSearchPanel(panel: string): Promise<void> {
  await joplin.views.panels.setHtml(panel, `
    <style>${await joplin.settings.value('itags.searchPanelStyle')}</style>
    <div id="itags-search-inputTagArea" class="hidden">
      <input type="text" id="itags-search-tagFilter" class="hidden" placeholder="Filter tags..." />
      <button id="itags-search-tagClear" class="hidden" title="Clear query and results">Clear</button>
      <button id="itags-search-saveQuery" class="hidden" title="Save query to current note">Save</button>
      <button id="itags-search-tagSearch" class="hidden" title="Search for text blocks">Search</button>
    </div>
    <div id="itags-search-tagList" class="hidden"></div>
    <div id="itags-search-tagRangeArea" class="hidden">
      <input type="text" id="itags-search-tagRangeMin" class="hidden" placeholder="Range min" />
      <input type="text" id="itags-search-tagRangeMax" class="hidden" placeholder="Range max" />
      <button id="itags-search-tagRangeAdd" class="hidden" title="Add tag range to query">Add</button>
    </div>
    <div id="itags-search-inputNoteArea" class="hidden">
      <input type="text" id="itags-search-noteFilter" class="hidden" placeholder="Filter notes..." />
      <select id="itags-search-noteList" class="hidden" title="Note mentions"></select>
    </div>
    <div id="itags-search-queryArea" class="hidden"></div>
    <div id="itags-search-inputResultArea" class="hidden">
      <input type="text" id="itags-search-resultFilter" class="hidden" placeholder="Filter results..." />
      <select id="itags-search-resultSort" class="hidden" title="Sort by">
        <option value="modified">Modified</option>
        <option value="created">Created</option>
        <option value="title">Title</option>
        <option value="notebook">Notebook</option>
      </select>
      <button id="itags-search-resultOrder" class="hidden" title="Ascend / descend"><b>↑</b></button>
      <button id="itags-search-resultToggle" class="hidden" title="Collapse / expand">v</button>
    </div>
    <div id='itags-search-resultsArea' class="extended8X"></div>
  `);
  await joplin.views.panels.addScript(panel, 'searchPanelStyle.css');
  await joplin.views.panels.addScript(panel, 'searchPanelScript.js');
  await joplin.views.panels.addScript(panel, 'prism.js');
  await joplin.views.panels.addScript(panel, 'prism.css');
}

/**
 * Processes messages received from the search panel UI
 * @param message - Message object containing panel interaction details
 * @param searchPanel - Panel ID to update
 * @param db - Note database instance
 * @param searchParams - Current search parameters
 * @param tagSettings - Tag configuration settings
 */
export async function processMessage(
  message: PanelMessage,
  searchPanel: string,
  db: NoteDatabase,
  searchParams: QueryRecord,
  tagSettings: TagSettings,
  savedNoteState: { [key: string]: boolean }
): Promise<void> {
  if (versionInfo.toggleEditorSupport === null) {
    await initializeVersionInfo();
  }

  if (message.name === 'initPanel') {
    await updatePanelTagData(searchPanel, db);
    await updatePanelNoteData(searchPanel, db);
    await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
    await updatePanelSettings(searchPanel);
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);
    await updatePanelNoteState(searchPanel, savedNoteState);

  } else if (message.name === 'searchQuery') {
    searchParams.query = JSON.parse(message.query);
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'insertTag') {
    try {
      await joplin.commands.execute('dismissPluginPanels');
    } catch {
      // Ignore errors (not on mobile, or old version)
    }
    await joplin.commands.execute('insertText', message.tag);
    await joplin.commands.execute('editor.focus');

  } else if (message.name === 'focusEditor') {
    await joplin.commands.execute('editor.focus');

  } else if (message.name === 'saveQuery') {
    // Save the query into the current note
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    const currentQuery = await loadQuery(db, currentNote);
    clearObjectReferences(currentNote);

    await saveQuery({query: JSON.parse(message.query), filter: message.filter, displayInNote: currentQuery.displayInNote});
    await joplin.commands.execute('itags.refreshNoteView');

  } else if (message.name === 'openNote') {
    try {
      await joplin.commands.execute('dismissPluginPanels');
    } catch {
      // Ignore errors (not on mobile, or old version)
    }
    const dbNote = db.getNoteId(message.externalId);
    const currentNote = await joplin.workspace.selectedNote();
    const noteId = noteIdRegex.test(message.externalId) ? noteIdRegex.exec(message.externalId)[1] : dbNote;

    if ((!currentNote) || (currentNote.id !== noteId)) {
      // Skip if the note is already open
      // This will also happen if we try to open a heading in an already open note
      if (dbNote) {
        await joplin.commands.execute('openNote', dbNote);
      } else {
        await joplin.commands.execute('openItem', message.externalId);
      }
      if (versionInfo.toggleEditorSupport) {
        // Wait for the note to be opened for 100 ms
        await new Promise(resolve => setTimeout(resolve, 100));
        const toggleEditor = await joplin.settings.value('itags.toggleEditor');
        if (toggleEditor) {
          await joplin.commands.execute('toggleVisiblePanes');
        }
      }

      // Wait for the note to be opened for 1 second
      const waitForNote = await joplin.settings.value('itags.waitForNote');
      await new Promise(resolve => setTimeout(resolve, waitForNote));
    }

    // Do not scroll if the line is negative
    if (message.line < 0) {
      return;
    }

    try {
      await joplin.commands.execute('editor.execCommand', {
        name: 'scrollToTagLine',
        args: [message.line]
      });
    } catch (error) {
      // If the editor is not available, this will fail
    }

  } else if (message.name === 'setCheckBox') {
    await setCheckboxState(message, db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'removeTag') {
    const tagRegex = new RegExp(`\\s*${escapeRegex(message.tag)}`, 'ig');  // Case insensitive
    await replaceTagInText(
      message.externalId, [message.line], [message.text],
      tagRegex, '',
      db, tagSettings);

    // update the search panel
    await updatePanelTagData(searchPanel, db);
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'removeAll') {
    await removeTagAll(message, db, tagSettings, searchPanel, searchParams);

  } else if (message.name === 'replaceTag') {
    const tagRegex = new RegExp(`${escapeRegex(message.oldTag)}`, 'ig');  // Case insensitive
    await replaceTagInText(
      message.externalId, [message.line], [message.text],
      tagRegex, message.newTag,
      db, tagSettings);

    // update the search panel
    await updatePanelTagData(searchPanel, db);
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'replaceAll') {
    await replaceTagAll(message, db, tagSettings, searchPanel, searchParams);

  } else if (message.name === 'addTag') {
    await addTagToText(message, db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'updateSetting') {

    if (message.field.startsWith('result')) {
      await joplin.settings.setValue(`itags.${message.field}`, message.value);
    } else if (message.field.startsWith('show')) {
      await joplin.settings.setValue(`itags.${message.field}`, message.value);
    } else if (message.field === 'expandedTagList') {
      await joplin.settings.setValue(`itags.${message.field}`, message.value);
    } else if (message.field === 'filter') {
      searchParams.filter = message.value;
    } else {
      console.error('Error in updateSetting: Invalid setting field.');
    }

  } else if (message.name === 'updateNoteState') {
    // Update the note state from the panel
    try {
      // Parse the incoming note state
      const incomingState = JSON.parse(message.noteState);

      // Clear the current state (preserving the reference)
      Object.keys(savedNoteState).forEach(key => {
        delete savedNoteState[key];
      });

      // Copy all properties from incoming state to savedNoteState
      Object.keys(incomingState).forEach(key => {
        savedNoteState[key] = incomingState[key];
      });

    } catch (e) {
      console.error('Failed to parse note state:', message.noteState, e);
    }
  }
}

/**
 * Focuses the search panel if it's visible
 * @param panel - Panel ID to focus
 */
export async function focusSearchPanel(panel: string): Promise<void> {
  const visible = joplin.views.panels.visible(panel);
  if (!visible) { return; }
  joplin.views.panels.postMessage(panel, {
    name: 'focusTagFilter',
  });
}

/**
 * Updates the tag data displayed in the search panel
 * @param panel - Panel ID to update
 * @param db - Note database instance
 */
export async function updatePanelTagData(panel: string, db: NoteDatabase): Promise<void> {
  if (!await joplin.views.panels.visible(panel)) { return; }
  
  const tagSort = await joplin.settings.value('itags.tagSort');
  const valueDelim = await joplin.settings.value('itags.valueDelim') || '=';
  
  // Get and sort tags in one pass
  const allTags = db.getTags(valueDelim);
  if (tagSort === 'count') {
    const tagCounts = new Map(allTags.map(tag => [tag, db.getTagCount(tag)]));
    allTags.sort((a, b) => tagCounts.get(b) - tagCounts.get(a));
  }
  
  await joplin.views.panels.postMessage(panel, {
    name: 'updateTagData',
    tags: JSON.stringify(allTags),
  });
}

/**
 * Updates the note data displayed in the search panel
 * @param panel - Panel ID to update
 * @param db - Note database instance
 */
export async function updatePanelNoteData(panel: string, db: NoteDatabase): Promise<void> {
  if (!await joplin.views.panels.visible(panel)) { return; }
  
  await joplin.views.panels.postMessage(panel, {
    name: 'updateNoteData',
    notes: JSON.stringify(db.getNotes()),
  });
}

/**
 * Updates the search results displayed in the panel
 * @param panel - Panel ID to update
 * @param results - Search results to display
 * @param query - Current search query
 */
export async function updatePanelResults(
  panel: string, 
  results: GroupedResult[], 
  query: Query[][]
): Promise<void> {
  const resultMarker = await joplin.settings.value('itags.resultMarker');
  const colorTodos = await joplin.settings.value('itags.colorTodos');
  const tagSettings = await getTagSettings();
  const intervalID = setInterval(
    async () => {
      if (await joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateResults',
          results: JSON.stringify(renderHTML(results, tagSettings.tagRegex, resultMarker, colorTodos)),
          query: JSON.stringify(query),
        });
      }
      clearInterval(intervalID);
    }
    , 200
  );
}

/**
 * Updates the panel settings display
 * @param panel - Panel ID to update
 */
export async function updatePanelSettings(panel: string): Promise<void> {
  const joplinSettings = await joplin.settings.values([
    'itags.resultSort',
    'itags.resultOrder',
    'itags.resultToggle',
    'itags.resultMarker',
    'itags.showQuery',
    'itags.expandedTagList',
    'itags.showTagRange',
    'itags.showNotes',
    'itags.showResultFilter',
    'itags.selectMultiTags',
    'itags.searchWithRegex',
    'itags.spaceReplace',
    'itags.resultColorProperty',
  ]);
  const settings: PanelSettings = {
    resultSort: joplinSettings['itags.resultSort'] as string,
    resultOrder: joplinSettings['itags.resultOrder'] as string,
    resultToggle: joplinSettings['itags.resultToggle'] as boolean,
    resultMarker: joplinSettings['itags.resultMarker'] as boolean,
    showQuery: joplinSettings['itags.showQuery'] as boolean,
    expandedTagList: joplinSettings['itags.expandedTagList'] as boolean,
    showTagRange: joplinSettings['itags.showTagRange'] as boolean,
    showNotes: joplinSettings['itags.showNotes'] as boolean,
    showResultFilter: joplinSettings['itags.showResultFilter'] as boolean,
    selectMultiTags: joplinSettings['itags.selectMultiTags'] as boolean,
    searchWithRegex: joplinSettings['itags.searchWithRegex'] as boolean,
    spaceReplace: joplinSettings['itags.spaceReplace'] as string,
    resultColorProperty: joplinSettings['itags.resultColorProperty'] as string,
  };
  const intervalID = setInterval(
    async () => {
      if (await joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateSettings',
          settings: JSON.stringify(settings),
        });
      }
      clearInterval(intervalID);
    }
    , 200
  );
}

/**
 * Updates the note state displayed in the search panel
 * @param panel - Panel ID to update
 * @param savedNoteState - Note state to display (true = expanded/visible, false = collapsed/hidden)
 */
export async function updatePanelNoteState(panel: string, savedNoteState: { [key: string]: boolean }): Promise<void> {
  if (!await joplin.views.panels.visible(panel)) { return; }

  await joplin.views.panels.postMessage(panel, {
    name: 'updateNoteState',
    noteState: JSON.stringify(savedNoteState),
  });
}

/**
 * Renders markdown content to HTML with special handling for tags and checkboxes
 * @param groupedResults - Search results grouped by note
 * @param tagRegex - Regular expression for matching tags
 * @param resultMarker - Whether to highlight tags in results
 * @param colorTodos - Whether to apply colors to todo items
 * @returns Processed results with HTML content
 */
function renderHTML(groupedResults: GroupedResult[], tagRegex: RegExp, resultMarker: boolean, colorTodos: boolean): GroupedResult[] {
  for (const group of groupedResults) {
    group.html = [];
    for (const section of group.text) {
      let processedSection = normalizeHeadingLevel(section);
      processedSection = formatFrontMatter(processedSection);

      if (resultMarker) {
        const blocks = splitCodeBlocks(processedSection);
        processedSection = blocks.map((block, index) => {
          if (index % 2 === 1) return block;
          const lines = block.split('\n');
          return lines.map((line, lineNumber) => 
            replaceOutsideBackticks(line, tagRegex, `<span class="itags-search-renderedTag" data-line-number="${lineNumber}">$&</span>`)
          ).join('\n');
        }).join('\n');
      }

      processedSection = processedSection
        .replace(REGEX.wikiLink, '<a href="$1">$1</a>');
      if (colorTodos) {
        processedSection = processedSection
          .replace(REGEX.xitOpen, '$1- <span class="itags-search-checkbox xitOpen" data-checked="false"></span><span class="itags-search-xitOpen">$2</span>\n')
          .replace(REGEX.xitDone, '$1- <span class="itags-search-checkbox xitDone" data-checked="true"></span><span class="itags-search-xitDone">$2</span>\n')
          .replace(REGEX.xitOngoing, '$1- <span class="itags-search-checkbox xitOngoing" data-checked="false"></span><span class="itags-search-xitOngoing">$2</span>\n')
          .replace(REGEX.xitObsolete, '$1- <span class="itags-search-checkbox xitObsolete" data-checked="false"></span><span class="itags-search-xitObsolete">$2</span>\n')
          .replace(REGEX.xitInQuestion, '$1- <span class="itags-search-checkbox xitInQuestion" data-checked="false"></span><span class="itags-search-xitInQuestion">$2</span>\n')
          .replace(REGEX.xitBlocked, '$1- <span class="itags-search-checkbox xitBlocked" data-checked="false"></span><span class="itags-search-xitBlocked">$2</span>\n');
      }
      group.html.push(md.render(processedSection));
    }
  }
  return groupedResults;
}

/**
 * Splits text into code and non-code blocks
 * @param text - Text to split
 * @returns Array of text segments alternating between non-code and code blocks
 */
function splitCodeBlocks(text: string): string[] {
  // Split by triple backticks, preserving the delimiters
  return text.split(REGEX.codeBlock);
}

/**
 * Replaces or processes hashtags outside of backtick code blocks
 * @param text - Text to process
 * @param tagRegex - Regular expression for matching tags
 * @param replaceString - String to replace matches with
 * @returns Processed text with replacements
 */
function replaceOutsideBackticks(
  text: string, 
  tagRegex: RegExp, 
  replaceString: string
): string {
  // Split the input by capturing backticks and content within them
  const segments = text.split(REGEX.backtickContent);
  let processedString = '';

  segments.forEach((segment, index) => {
    // Even indices are outside backticks; odd indices are content within backticks
    if (index % 2 === 0) {
      // Replace or mark the matches in this segment
      const processedSegment = segment.replace(tagRegex, replaceString);
      processedString += processedSegment;
    } else {
      // Directly concatenate segments within backticks without alteration
      processedString += segment;
    }
  });

  return processedString;
}

/**
 * Normalizes heading levels to be within specified bounds
 * @param text - Text containing markdown headings
 * @returns Text with normalized heading levels
 */
function normalizeHeadingLevel(text: string): string {
  const minHeadingLevel = 3;
  const maxHeadingLevel = 3;

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
      const headingMatch = line.match(REGEX.heading);
      
      if (headingMatch) {
          const currentHeadingLevel = headingMatch[1].length;
          const newHeadingLevel = Math.max(currentHeadingLevel, minHeadingLevel);
          const adjustedHeadingLevel = Math.min(newHeadingLevel, maxHeadingLevel);

          // Reconstruct the heading with the new level
          return `${'#'.repeat(adjustedHeadingLevel)} ${headingMatch[2]}`;
      } else {
          // If it's not a heading, return the line unchanged
          return line;
      }
  });

  return processedLines.join('\n');
}

/**
 * Formats YAML frontmatter by converting delimiters to code blocks
 * @param text - Text containing frontmatter
 * @returns Text with formatted frontmatter
 */
export function formatFrontMatter(text: string): string {
  // Replace YAML frontmatter delimiters (--- or ...) with code block backticks
  const lines = text.split('\n');
  
  // Find frontmatter boundaries
  const firstLine = lines[0].trim();
  if (firstLine === '---' || firstLine === '...') {
    lines[0] = '```yaml';
    
    // Find the closing delimiter
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '---' || line === '...') {
        lines[i] = '```';
        break;
      }
    }
  }

  return lines.join('\n');
}

/// Note editing functions ///

/**
 * Updates checkbox state in a markdown task list item
 * @param message - Message containing checkbox update details
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 */
export async function setCheckboxState(
  message: PanelMessage, 
  db: NoteDatabase, 
  tagSettings: TagSettings
): Promise<void> {
  // This function modifies the checkbox state in a markdown task list item
  // line: The markdown string containing the task list item, possibly indented
  // text: The text of the task list item, in order to ensure that the line matches
  // checked: A boolean indicating the desired state of the checkbox (true for checked, false for unchecked)
  let note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Remove the leading checkbox from the text
  const text = message.text.replace(REGEX.checkboxPrefix, '');
  // Check the line to see if it contains the text
  if (!line.includes(text)) {
    console.error('Error in setCheckboxState: The line does not contain the expected text.');
    lines[message.line] = line;
  }

  // Edit the line
  const current = new RegExp(`^(\\s*- \\[)${message.source}(\\])`, 'g');
  lines[message.line] = line.replace(current, `$1${message.target}$2`);

  const newBody = lines.join('\n');
  updateNote({externalId: message.externalId, line: message.line}, newBody, db, tagSettings);
  note = clearObjectReferences(note);
}

/**
 * Replaces a tag with a new tag across all notes
 * @param message - Message containing tag replacement details
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 * @param searchPanel - Panel ID to update
 * @param searchParams - Current search parameters
 */
async function replaceTagAll(
  message: PanelMessage,
  db: NoteDatabase,
  tagSettings: TagSettings,
  searchPanel: string,
  searchParams: QueryRecord
): Promise<void> {
    const cancel = await joplin.views.dialogs.showMessageBox(
      `Are you sure you want to replace the tag ${message.oldTag} with ${message.newTag} in ALL of your notes?`);
    if (cancel) { return; }
    // update all notes with the old tag
    const notes = db.searchBy('tag', message.oldTag, false);
    for (const externalId in notes) {
      const tagRegex = new RegExp(`${escapeRegex(message.oldTag)}`, 'ig');  // Case insensitive
      const lineNumbers = Array.from(notes[externalId]);
      const texts = lineNumbers.map(() => '');  // skip text validation
      await replaceTagInText(
        externalId, lineNumbers, texts,
        tagRegex, message.newTag,
        db, tagSettings);
    }
    // update the current query
    replaceTagInQuery(searchParams, message.oldTag, message.newTag);
    // update all saved queries
    const queryNotes = db.getQueryNotes();
    for (const externalId of queryNotes) {
      let note = await joplin.data.get(['notes', externalId], { fields: ['id', 'body'] });
      const savedQuery = await loadQuery(db, note);
      if (replaceTagInQuery(savedQuery, message.oldTag, message.newTag)) {
        await saveQuery(savedQuery, externalId);
      };
      note = clearObjectReferences(note);
    }
    // update the search panel
    await updatePanelQuery(searchPanel, searchParams.query, searchParams.filter);
    await updatePanelTagData(searchPanel, db);
    const results = await runSearch(db, searchParams.query, undefined);
    await updatePanelResults(searchPanel, results, searchParams.query);
}

/**
 * Removes a tag from all notes
 * @param message - Message containing tag removal details
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 * @param searchPanel - Panel ID to update
 * @param searchParams - Current search parameters
 */
async function removeTagAll(
  message: PanelMessage,
  db: NoteDatabase,
  tagSettings: TagSettings,
  searchPanel: string,
  searchParams: QueryRecord
): Promise<void> {
  const cancel = await joplin.views.dialogs.showMessageBox(
    `Are you sure you want to remove the tag ${message.tag} from ALL of your notes?`);
  if (cancel) { return; }
  // update all notes with the old tag
  const notes = db.searchBy('tag', message.tag, false);
  for (const externalId in notes) {
    const tagRegex = new RegExp(`\\s*${escapeRegex(message.tag)}`, 'ig');  // Case insensitive
    const lineNumbers = Array.from(notes[externalId]);
    const texts = lineNumbers.map(() => '');  // skip text validation
    await replaceTagInText(
      externalId, lineNumbers, texts,
      tagRegex, '',
      db, tagSettings);
  }
  // update the search panel
  await updatePanelTagData(searchPanel, db);
  const results = await runSearch(db, searchParams.query, undefined);
  await updatePanelResults(searchPanel, results, searchParams.query);
}

/**
 * Replaces a tag in a query configuration
 * @param query - Query configuration to update
 * @param oldTag - Tag to replace
 * @param newTag - Replacement tag
 * @returns True if query was modified, false otherwise
 */
function replaceTagInQuery(
  query: QueryRecord, 
  oldTag: string, 
  newTag: string
): boolean {
  const oldTagLower = oldTag.toLowerCase();
  let changed = false;
  for (const group of query.query) {
    for (const condition of group) {
      if (condition.tag === oldTagLower) {
        condition.tag = newTag.toLowerCase();
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Replaces a tag in specified lines of text
 * @param externalId - Note ID
 * @param lineNumbers - Line numbers to modify
 * @param texts - Text content of lines
 * @param oldTag - Tag or regex to replace
 * @param newTag - Replacement tag
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 */
export async function replaceTagInText(
  externalId: string,
  lineNumbers: number[],
  texts: string[],
  oldTag: string | RegExp,
  newTag: string,
  db: NoteDatabase,
  tagSettings: TagSettings
): Promise<void> {
  // batch replace oldTag with newTag in the given line numbers
  if (lineNumbers.length !== texts.length) {
    console.error('Error in renameTagInText: The number of line numbers does not match the number of text strings.');
    return;
  }
  let note = await joplin.data.get(['notes', externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');

  for (let i = 0; i < lineNumbers.length; i++) {
    const line = lines[lineNumbers[i]];
    // Check the line to see if it contains the text
    if (!line.includes(texts[i])) {
      console.error('Error in renameTagInText: The line does not contain the expected text.', '\nLine:', line, '\nText:', texts[i]);
    }

    // Replace the old tag with the new tag
    lines[lineNumbers[i]] = line.replace(oldTag, newTag);
  }

  const newBody = lines.join('\n');
  await updateNote({externalId: externalId, line: lineNumbers[0]}, newBody, db, tagSettings);
  note = clearObjectReferences(note);
}

/**
 * Adds a tag to specified text
 * @param message - Message containing tag addition details
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 */
export async function addTagToText(
  message: PanelMessage,
  db: NoteDatabase,
  tagSettings: TagSettings
): Promise<void> {
  let note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.error('Error in addTagToText: The line does not contain the expected text.', '\nLine:', line, '\nText:', message.text);
    return;
  }

  // Add the tag to the line
  lines[message.line] = `${line} ${message.tag}`;
  const newBody = lines.join('\n');
  await updateNote({externalId: message.externalId, line: message.line}, newBody, db, tagSettings);
  note = clearObjectReferences(note);
}

/**
 * Updates a note's content and processes the changes
 * @param message - Message containing note update details
 * @param newBody - New content for the note
 * @param db - Note database instance
 * @param tagSettings - Tag configuration settings
 */
async function updateNote(
  message: NoteUpdateMessage,
  newBody: string,
  db: NoteDatabase,
  tagSettings: TagSettings
): Promise<void> {
  let selectedNote = await joplin.workspace.selectedNote();
  let targetNote = await joplin.data.get(['notes', message.externalId], { fields: ['id', 'title', 'body'] });

  if (newBody !== targetNote.body) {
    await joplin.data.put(['notes', message.externalId], null, { body: newBody });

    if ((selectedNote) && (selectedNote.id === message.externalId)) {
      // Update note editor if it's the currently selected note
      await joplin.commands.execute('editor.setText', newBody);
      try {
        await joplin.commands.execute('editor.execCommand', {
          name: 'scrollToTagLine',
          args: [message.line]
        });
      } catch (error) {
        // If the editor is not available, this will fail
      }
    }

    targetNote.body = newBody;
    await processNote(db, targetNote, tagSettings);
  }
  // Clear the reference to the note to avoid memory leaks
  targetNote = clearObjectReferences(targetNote);
  selectedNote = clearObjectReferences(selectedNote);
}

/**
 * Saves a query configuration to a note
 * @param query - Query configuration to save
 * @param noteId - Optional note ID to save to (uses current note if not specified)
 * @returns The updated note body content
 */
export async function saveQuery(
  query: QueryRecord,
  noteId: string | null = null
): Promise<string> {
  // Save the query into the current note, or to given noteId
  let note:any = null;
  if (noteId) {
    note = await joplin.data.get(['notes', noteId], { fields: ['title', 'body', 'id'] });
  } else {
    note = await joplin.workspace.selectedNote();
  }
  if (!note) {
    return;
  }

  let newBody = '';
  const decoration = [
    `${queryStart}<span style="display: none">`,
    `</span>${queryEnd}`
  ];
  if (REGEX.findQuery.test(note.body)) {
    if (query.query.length === 0) {
      newBody = note.body.replace(REGEX.findQuery, '');
    } else {
      newBody = note.body.replace(REGEX.findQuery, `\n\n${decoration[0]}\n\`\`\`json\n${JSON.stringify(query)}\n\`\`\`\n${decoration[1]}`);
    }
  } else {
    newBody = `${note.body.replace(/\s+$/, '')}\n\n${decoration[0]}\n\`\`\`json\n${JSON.stringify(query)}\n\`\`\`\n${decoration[1]}`;
    // trimming trailing spaces in note body before insertion
  }

  await joplin.data.put(['notes', note.id], null, { body: newBody });
  let currentNote = await joplin.workspace.selectedNote();
  if ((currentNote) && (note.id === currentNote.id)) {
    await joplin.commands.execute('editor.setText', newBody);
  }

  note = clearObjectReferences(note);
  currentNote = clearObjectReferences(currentNote);
  return newBody;
}

/**
 * Loads a query configuration from a note
 * @param db - Note database instance
 * @param note - Note containing query
 * @returns Loaded query configuration
 */
export async function loadQuery(
  db: NoteDatabase, 
  note: any
): Promise<QueryRecord> {
  const record = note.body.match(REGEX.findQuery);
  let loadedQuery: QueryRecord = { query: [[]], filter: '', displayInNote: 'false' };
  if (record) {
    try {
      // Strip the code block delimiters, and remove decorations
      const queryString = record[1]
        .split('\n').slice(1, -1).join('\n')
        .replace(/^```json\n/, '').replace(/\n```$/, '');
      const savedQuery = await testQuery(db, JSON.parse(queryString));
      if (savedQuery.query && (savedQuery.filter !== null) && (savedQuery.displayInNote !== null)) {
        loadedQuery = savedQuery;
      }
    } catch (error) {
      console.error('Error loading query:', record[1], error);
    }
  }
  return loadedQuery;
}

/**
 * Tests if a query configuration is valid
 * @param db - Note database instance
 * @param query - Query configuration to test
 * @returns Validated query configuration
 */
async function testQuery(
  db: NoteDatabase, 
  query: QueryRecord
): Promise<QueryRecord> {
  // Test if the query is valid
  if (!query.query) {
    return query;
  }
  if (typeof query.filter !== 'string') {
    query.filter = null;
  }
  if (typeof query.displayInNote !== 'string') {
    query.displayInNote = query.displayInNote ? 'list' : 'false';
  }

  let queryGroups = query.query;
  for (let [ig, group] of queryGroups.entries()) {
    for (let [ic, condition] of group.entries()) {

      // Check if the format is correct
      const format = ((typeof condition.negated == 'boolean') &&
        ((typeof condition.tag == 'string') ||
         ((typeof condition.title == 'string') && (typeof condition.externalId == 'string')))) ||
         ((typeof condition.minValue == 'string') || (typeof condition.maxValue == 'string'));
      if (!format) {
        group[ic] = null;
      }

      if (condition.tag) {
        // TODO: maybe check if the tag exists

      } else if (condition.externalId) {
        if (condition.externalId === 'current') { continue; }

        // Try to update externalId in case it changed
        const newExternalId = db.getNoteId(condition.title);
        if (newExternalId) {
          condition.externalId = newExternalId;
        } else {
          group[ic] = null;
        }
      }
    }
    // filter null conditions
    queryGroups[ig] = group.filter((condition: any) => (condition));
  }
  // filter null groups
  query.query = queryGroups.filter((group: any) => group.length > 0);

  return query;
}

/**
 * Updates the query display in the search panel
 * @param panel - Panel ID to update
 * @param query - Query configuration
 * @param filter - Query filter string
 */
export async function updatePanelQuery(
  panel: string,
  query: Query[][],
  filter: string
): Promise<void> {
  // Send the query to the search panel
  if (!query || query.length ===0 || query[0].length === 0) {
    return;
  }
  const visible = joplin.views.panels.visible(panel);
  if (!visible) { return; }
  joplin.views.panels.postMessage(panel, {
    name: 'updateQuery',
    query: JSON.stringify(query),
    filter: filter,
  });
}