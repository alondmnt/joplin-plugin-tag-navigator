import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import * as markdownItTaskLists from 'markdown-it-task-lists';
import { TagSettings, getTagRegex, queryEnd, queryStart } from './settings';
import { GroupedResult, Query, clearNoteReferences, runSearch } from './search';
import { NoteDatabase, processNote } from './db';

const findQuery = new RegExp(`[\n]+${queryStart}\n([\\s\\S]*?)\n${queryEnd}`);

export interface QueryRecord {
  query: Query[][];
  filter: string;
  displayInNote: boolean;
}

export async function registerSearchPanel(panel: string) {
  await joplin.views.panels.setHtml(panel, `
    <style>${await joplin.settings.value('itags.searchPanelStyle')}</style>
    <div id="itags-search-inputTagArea">
      <input type="text" id="itags-search-tagFilter" placeholder="Filter tags..." />
      <button id="itags-search-tagClear" title="Clear query and results">Clear</button>
      <button id="itags-search-saveQuery" title="Save query to current note">Save</button>
      <button id="itags-search-tagSearch" title="Search for text blocks">Search</button>
    </div>
    <div id="itags-search-tagList"></div>
    <div id="itags-search-inputNoteArea">
      <input type="text" id="itags-search-noteFilter" placeholder="Filter notes..." />
      <select id="itags-search-noteList" title="Note mentions"></select>
    </div>
    <div id="itags-search-queryArea"></div>
    <div id="itags-search-inputResultArea">
      <input type="text" id="itags-search-resultFilter" placeholder="Filter results..." />
      <select id="itags-search-resultSort" title="Sort by">
        <option value="modified">Modified</option>
        <option value="created">Created</option>
        <option value="title">Title</option>
        <option value="notebook">Notebook</option>
        </select>
        <button id="itags-search-resultOrder" title="Ascend / descend"><b>↑</b></button>
      <button id="itags-search-resultToggle" title="Collapse / expand">v</button>
    </div>
    <div id='itags-search-resultsArea'></div>
  `);
  await joplin.views.panels.addScript(panel, 'searchPanelStyle.css');
  await joplin.views.panels.addScript(panel, 'searchPanelScript.js');
}

export async function processMessage(message: any, searchPanel: string, db: NoteDatabase,
    searchParams: QueryRecord,
    panelSettings: { resultSort?: string, resultOrder?: string, resultToggle?: boolean },
    tagSettings: TagSettings) {

  if (message.name === 'initPanel') {
    updatePanelTagData(searchPanel, db);
    updatePanelNoteData(searchPanel, db);
    await updateQuery(searchPanel, searchParams.query, searchParams.filter);
    updatePanelSettings(searchPanel, panelSettings);
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'searchQuery') {
    searchParams.query = JSON.parse(message.query);
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'saveQuery') {
    // Save the query into the current note
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    const currentQuery = await loadQuery(db, currentNote);
    clearNoteReferences(currentNote);

    saveQuery({query: JSON.parse(message.query), filter: message.filter, displayInNote: currentQuery.displayInNote});

  } else if (message.name === 'openNote') {
    let note = await joplin.workspace.selectedNote();

    if ((!note) || (note.id !== message.externalId)) {
      await joplin.commands.execute('openNote', message.externalId);
      // Wait for the note to be opened for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    note = clearNoteReferences(note);

    await joplin.commands.execute('editor.execCommand', {
      name: 'scrollToTagLine',
      args: [message.line]
    });

  } else if (message.name === 'setCheckBox') {
    await setCheckboxState(message, db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'removeTag') {
    await removeTagFromText(message, db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'replaceTag') {
    await replaceTagInText(
      message.externalId, [message.line], [message.text],
      message.oldTag, message.newTag,
      db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'addTag') {
    await addTagToText(message, db, tagSettings);

    // update the search panel
    const results = await runSearch(db, searchParams.query);
    updatePanelResults(searchPanel, results, searchParams.query);

  } else if (message.name === 'updateSetting') {

    if (message.field !== 'filter') {
      panelSettings[message.field] = message.value;
    } else {
      searchParams.filter = message.value;
    }
  }
}

export async function focusSearchPanel(panel: string) {
  if (joplin.views.panels.visible(panel)) {
    joplin.views.panels.postMessage(panel, {
      name: 'focusTagFilter',
    });
  }
}

export async function updatePanelTagData(panel: string, db: NoteDatabase) {
  joplin.views.panels.postMessage(panel, {
    name: 'updateTagData',
    tags: JSON.stringify(db.getTags()),
  });
}

export async function updatePanelNoteData(panel: string, db: NoteDatabase) {
  joplin.views.panels.postMessage(panel, {
    name: 'updateNoteData',
    notes: JSON.stringify(db.getNotes()),
  });
}

export async function updatePanelResults(panel: string, results: GroupedResult[], query: Query[][]) {
  const resultMarker = await joplin.settings.value('itags.resultMarker');
  const colorTodos = await joplin.settings.value('itags.colorTodos');
  const tagRegex = await getTagRegex();
  const intervalID = setInterval(
    () => {
      if(joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateResults',
          results: JSON.stringify(renderHTML(results, tagRegex, resultMarker, colorTodos)),
          query: JSON.stringify(query),
        });
      }
      clearInterval(intervalID);
    }
    , 200
  );
}

export async function updatePanelSettings(panel: string, override: { resultSort?: string, resultOrder?: string, resultToggle?: boolean }={}) {
  const settings = {
    resultSort: override.resultSort === undefined ? await joplin.settings.value('itags.resultSort') : override.resultSort,
    resultOrder: override.resultOrder === undefined ? await joplin.settings.value('itags.resultOrder') : override.resultOrder,
    resultToggle: override.resultToggle === undefined ? await joplin.settings.value('itags.resultToggle') : override.resultToggle,
    resultMarker: await joplin.settings.value('itags.resultMarker'),
    showNotes: await joplin.settings.value('itags.showNotes'),
    showResultFilter: await joplin.settings.value('itags.showResultFilter'),
  };
  const intervalID = setInterval(
    () => {
      if(joplin.views.panels.visible(panel)) {
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

function renderHTML(groupedResults: GroupedResult[], tagRegex: RegExp, resultMarker: boolean, colorTodos: boolean): GroupedResult[] {
  const md = new MarkdownIt({ html: true }).use(markdownItTaskLists, { enabled: true });
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const xitOpen = /(^[\s]*)- \[ \] (.*)$/gm;
  const xitDone = /(^[\s]*)- \[x\] (.*)$/gm;
  const xitOngoing = /(^[\s]*)- \[@\] (.*)$/gm;
  const xitObsolete = /(^[\s]*)- \[~\] (.*)$/gm;
  const xitInQuestion = /(^[\s]*)- \[\?\] (.*)$/gm;
  const xitBlocked = /(^[\s]*)- \[!\] (.*)$/gm;  // not officially a [x]it! checkbox

  for (const group of groupedResults) {
    group.html = []; // Ensure group.html is initialized as an empty array if not already done
    for (const section of group.text) {
      let processedSection = normalizeTextIndentation(section);
      processedSection = normalizeHeadingLevel(processedSection);
      if (resultMarker) {
        // Process each section by lines to track line numbers accurately
        const lines = processedSection.split('\n');
        processedSection = lines.map((line, lineNumber) => 
          replaceOutsideBackticks(line, tagRegex, `<span class="itags-search-renderedTag" data-line-number="${lineNumber}">$&</span>`)
        ).join('\n');
      }
      processedSection = processedSection
        .replace(wikiLinkRegex, '<a href="#$1">$1</a>');
      if (colorTodos) {
        processedSection = processedSection
          .replace(xitOpen, '$1- <span class="itags-search-checkbox xitOpen" data-checked="false"></span><span class="itags-search-xitOpen">$2</span>\n')
          .replace(xitDone, '$1- <span class="itags-search-checkbox xitDone" data-checked="true"></span><span class="itags-search-xitDone">$2</span>\n')
          .replace(xitOngoing, '$1- <span class="itags-search-checkbox xitOngoing" data-checked="false"></span><span class="itags-search-xitOngoing">$2</span>\n')
          .replace(xitObsolete, '$1- <span class="itags-search-checkbox xitObsolete" data-checked="false"></span><span class="itags-search-xitObsolete">$2</span>\n')
          .replace(xitInQuestion, '$1- <span class="itags-search-checkbox xitInQuestion" data-checked="false"></span><span class="itags-search-xitInQuestion">$2</span>\n')
          .replace(xitBlocked, '$1- <span class="itags-search-checkbox xitBlocked" data-checked="false"></span><span class="itags-search-xitBlocked">$2</span>\n');
      }
      group.html.push(md.render(processedSection));
    }
  }
  return groupedResults;
}

// Function to replace or process hashtags outside backticks without altering the original structure
function replaceOutsideBackticks(text: string, tagRegex: RegExp, replaceString: string) {
  // Split the input by capturing backticks and content within them
  const segments = text.split(/(`[^`]*`)/);
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

export function normalizeTextIndentation(text: string): string {
  const lines = text.split('\n');

  // Process each line to potentially update the current indentation level and remove it
  let currentIndentation = Infinity;
  const normalizedLines = lines.map(line => {
    if (line.trim().length === 0) {
      // For empty lines, we just return them as is
      return line;
    }

    // Track the current indentation level
    const lineIndentation = line.match(/^\s*/)[0].length;
    if (lineIndentation < currentIndentation) {
      currentIndentation = lineIndentation;
    }

    // Remove the current indentation level from the line
    return line.substring(currentIndentation);
  });

  return normalizedLines.join('\n');
}

function normalizeHeadingLevel(text: string): string {
  const minHeadingLevel = 3;
  const maxHeadingLevel = 3;

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      
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

/// Note editing functions ///

export async function setCheckboxState(message: any, db: NoteDatabase, tagSettings: TagSettings) {
  // This function modifies the checkbox state in a markdown task list item
  // line: The markdown string containing the task list item, possibly indented
  // text: The text of the task list item, in order to ensure that the line matches
  // checked: A boolean indicating the desired state of the checkbox (true for checked, false for unchecked)
  let note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Remove the leading checkbox from the text
  const text = message.text.replace(/^\s*- \[[x|\s|@|\?!|~]\]\s*/, '');
  // Check the line to see if it contains the text
  if (!line.includes(text)) {
    console.error('Error in setCheckboxState: The line does not contain the expected text.');
    lines[message.line] = line;
  }

  if (message.checked) {
    // If checked is true, ensure the checkbox is marked as checked (- [x])
    // \s* accounts for any leading whitespace
    lines[message.line] = line.replace(/^(\s*- \[)[\s|@|\?!](\])/g, '$1x$2');
  } else {
    // If checked is false, ensure the checkbox is marked as unchecked (- [ ])
    lines[message.line] = line.replace(/^(\s*- \[)x(\])/g, '$1 $2');
  }

  const newBody = lines.join('\n');
  updateNote(message, newBody, db, tagSettings);
  note = clearNoteReferences(note);
}

export async function removeTagFromText(message: any, db: NoteDatabase, tagSettings: TagSettings) {
  let note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.error('Error in removeTagFromText: The line does not contain the expected text.', '\nLine:', line, '\nText:', message.text);
    return line;
  }

  // Remove the tag and any leading space from the line
  const tagRegex = new RegExp(`\\s*${escapeRegex(message.tag)}`);
  lines[message.line] = line.replace(tagRegex, '');

  const newBody = lines.join('\n');
  await updateNote(message, newBody, db, tagSettings);
  note = clearNoteReferences(note);
}

export async function replaceTagInText(externalId: string, lineNumbers: number[], texts: string[], oldTag: string, newTag: string, db: NoteDatabase, tagSettings: TagSettings) {
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
  note = clearNoteReferences(note);
}

export async function addTagToText(message: any, db: NoteDatabase, tagSettings: TagSettings) {
  let note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.error('Error in addTagToText: The line does not contain the expected text.', '\nLine:', line, '\nText:', message.text);
    return line;
  }

  // Add the tag to the line
  lines[message.line] = `${line} ${message.tag}`;
  const newBody = lines.join('\n');
  await updateNote(message, newBody, db, tagSettings);
  note = clearNoteReferences(note);
}

export function escapeRegex(string: string): string {
  return string
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .trim();
}

async function updateNote(message: any, newBody: string, db: NoteDatabase, tagSettings: TagSettings) {
  let selectedNote = await joplin.workspace.selectedNote();
  let targetNote = await joplin.data.get(['notes', message.externalId], { fields: ['id', 'title', 'body'] });

  if (newBody !== targetNote.body) {
    await joplin.data.put(['notes', message.externalId], null, { body: newBody });

    if ((selectedNote) && (selectedNote.id === message.externalId)) {
      // Update note editor if it's the currently selected note
      await joplin.commands.execute('editor.setText', newBody);
      await joplin.commands.execute('editor.execCommand', {
        name: 'scrollToTagLine',
        args: [message.line]
      });
    }

    targetNote.body = newBody;
    await processNote(db, targetNote, tagSettings);
  }
  // Clear the reference to the note to avoid memory leaks
  targetNote = clearNoteReferences(targetNote);
  selectedNote = clearNoteReferences(selectedNote);
}

export async function saveQuery(query: QueryRecord, noteId: string=null): Promise<string> {
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
  if (findQuery.test(note.body)) {
    if (query.query.length === 0) {
      newBody = note.body.replace(findQuery, '');
    } else {
      newBody = note.body.replace(findQuery, `\n\n${queryStart}\n${JSON.stringify(query)}\n${queryEnd}`);
    }
  } else {
    newBody = `${note.body.replace(/\s+$/, '')}\n\n${queryStart}\n${JSON.stringify(query)}\n${queryEnd}`;
    // trimming trailing spaces in note body before insertion
  }

  await joplin.data.put(['notes', note.id], null, { body: newBody });
  let currentNote = await joplin.workspace.selectedNote();
  if ((currentNote) && (note.id === currentNote.id)) {
    await joplin.commands.execute('editor.setText', newBody);
  }

  note = clearNoteReferences(note);
  currentNote = clearNoteReferences(currentNote);
  return newBody;
}

export async function loadQuery(db: any, note: any): Promise<QueryRecord> {
  const upgradedText = await upgradeQuery(db, note);  // from ver1 to ver2
  const record = upgradedText.match(findQuery);
  let loadedQuery: QueryRecord = { query: [[]], filter: '', displayInNote: false };
  if (record) {
    try {
      const savedQuery = await testQuery(db, JSON.parse(record[1]));
      if (savedQuery.query && (savedQuery.filter !== null) && (savedQuery.displayInNote !== null)) {
        loadedQuery = savedQuery;
      }
    } catch (error) {
      console.error('Error loading query:', record[1], error);
    }
  }
  return loadedQuery;
}

export async function upgradeQuery(db: any, note: any): Promise<string> {
  // try to upgrade the saved query format
  const record = note.body.match(findQuery);
  if (!record) { return note.body; }

  const queryParts = record[1].split('\n');
  let savedQuery = {
    query: JSON.parse(queryParts[0]),
    filter: queryParts[1],
    displayInNote: parseInt(queryParts[2]) ? true : false,
  };
  try {
    savedQuery = await testQuery(db, savedQuery);
  } catch {
    return note.body;
  }

  if (savedQuery.query && (savedQuery.filter !== null) && (savedQuery.displayInNote !== null)) {
    // save the upgraded query and return the updated note body
    return saveQuery(savedQuery, note.id);
  } else {
    return note.body;
  }
}

async function testQuery(db: NoteDatabase, query: QueryRecord): Promise<QueryRecord> {
  // Test if the query is valid
  if (!query.query) {
    return query;
  }
  if (typeof query.filter !== 'string') {
    query.filter = null;
  }
  if (typeof query.displayInNote !== 'boolean') {
    query.displayInNote = null;
  }

  let queryGroups = query.query;
  for (let [ig, group] of queryGroups.entries()) {
    for (let [ic, condition] of group.entries()) {

      // Check if the format is correct
      const format = (typeof condition.negated == 'boolean') &&
        ((typeof condition.tag == 'string') ||
         ((typeof condition.title == 'string') && (typeof condition.externalId == 'string')));
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

export async function updateQuery(panel: string, query: Query[][], filter: string) {
  // Send the query to the search panel
  if (!query || query.length ===0 || query[0].length === 0) {
    return;
  }
  if (joplin.views.panels.visible(panel)) {
    joplin.views.panels.postMessage(panel, {
      name: 'updateQuery',
      query: JSON.stringify(query),
      filter: filter,
    });
  }
}