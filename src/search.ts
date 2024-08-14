import joplin from 'api';
import { loadQuery, normalizeTextIndentation } from './searchPanel';
import { getTagSettings, resultsEnd, resultsStart } from './settings';
import { NoteDatabase, ResultSet, intersectSets, unionSets } from './db';
import { parseDateTag } from './parser';

export interface Query {
  tag?: string;
  title?: string;
  externalId?: string;
  negated: boolean;
  minValue?: string;
  maxValue?: string;
}

export interface GroupedResult {
  externalId: string;
  lineNumbers: number[];
  text: string[];
  html: string[];
  title: string;
  notebook?: string;
  updatedTime?: number;
  createdTime?: number;
}

export async function runSearch(db: NoteDatabase, query: Query[][]): Promise<GroupedResult[]> {
  let currentNote = (await joplin.workspace.selectedNote());
  const queryResults = await getQueryResults(db, query, currentNote);
  const groupedResults = await processQueryResults(queryResults);
  currentNote = clearNoteReferences(currentNote);
  return groupedResults;
}

async function getQueryResults(db: NoteDatabase, query: Query[][], currentNote: any): Promise<ResultSet> {
  // Get the note locations that matches the DNF query
  let resultsSet: ResultSet = {};
  for (const clause of query) {
    let clauseResultsSet: ResultSet = null;

    for (const queryPart of clause) {
      let partResults: ResultSet = {};
      if (queryPart.tag) {
        partResults = db.searchBy('tag', queryPart.tag, queryPart.negated);

      } else if (queryPart.externalId) {
        if ((queryPart.externalId === 'current') && (currentNote.id)) {
          partResults = db.searchBy('noteLinkId', currentNote.id, queryPart.negated);

        } else {
          partResults = db.searchBy('noteLinkId', queryPart.externalId, queryPart.negated);

          if (queryPart.title) {
            // Search also by title
            partResults = unionResults(partResults, db.searchBy('noteLinkTitle', queryPart.title, queryPart.negated));
          }
        }

      } else if (queryPart.minValue || queryPart.maxValue) {
        const tagSettings = await getTagSettings();
        const minValue = queryPart.minValue ? parseDateTag(queryPart.minValue.toLowerCase(), tagSettings) : null;
        const maxValue = queryPart.maxValue ? parseDateTag(queryPart.maxValue.toLowerCase(), tagSettings) : null;

        for (const tag of db.getTags()) {
          if (minValue && tag.localeCompare(minValue) < 0) { continue; }
          if (maxValue && tag.localeCompare(maxValue) > 0) { break; }
          partResults = unionResults(partResults, db.searchBy('tag', tag, false));
        }
      }
      // Intersect the results of each part of the clause
      if (!clauseResultsSet) {
        clauseResultsSet = partResults;
      } else {
        clauseResultsSet = intersectResults(clauseResultsSet, partResults);
      }
    }
    // Union the results of each clause
    resultsSet = unionResults(resultsSet, clauseResultsSet);
  }

  return resultsSet;
}

function intersectResults(noteDictA: ResultSet, noteDictB: ResultSet): ResultSet {
  // Return the intersection of two note dictionaries
  const result: ResultSet = {};
  for (const noteId in noteDictA) {
    if (noteDictB[noteId]) {
      result[noteId] = intersectSets(noteDictA[noteId], noteDictB[noteId]);
    }
  }
  return result;
}

function unionResults(noteDictA: ResultSet, noteDictB: ResultSet): ResultSet {
  // Return the union of two note dictionaries
  const result: ResultSet = {};
  for (const noteId in noteDictA) {
    result[noteId] = noteDictA[noteId];
  }
  for (const noteId in noteDictB) {
    if (result[noteId]) {
      result[noteId] = unionSets(result[noteId], noteDictB[noteId]);
    } else {
      result[noteId] = noteDictB[noteId];
    }
  }
  return result;
}

async function processQueryResults(queryResults: ResultSet): Promise<GroupedResult[]> {
  // group the results by externalId and get the note content
  // (currently, ResultSet is already grouped)
  const groupedResults: GroupedResult[] = [];
  if (!queryResults) return groupedResults;

  for (const externalId in queryResults) {
    groupedResults.push({
      externalId: externalId,
      lineNumbers: Array.from(queryResults[externalId]).sort((a, b) => a - b),
      text: [],
      html: [],
      title: '',
    });

    const ind = groupedResults.length - 1;
    groupedResults[ind] = await getTextAndTitle(groupedResults[ind]);
  }

  return groupedResults;
}

async function getTextAndTitle(result: GroupedResult): Promise<GroupedResult> {
  let note = await joplin.data.get(['notes', result.externalId],
    { fields: ['title', 'body', 'updated_time', 'created_time', 'parent_id'] });
  let notebook = await joplin.data.get(['folders', note.parent_id], ['title']);
  const lines: string[] = note.body.split('\n');

  // Group consecutive line numbers
  let currentGroup = [];
  const groupedLines = [];
  let previousLineNum = -2;
  result.lineNumbers.forEach((lineNumber, index) => {
    if (lineNumber === previousLineNum + 1) {
      // This line is consecutive; add it to the current group
      currentGroup.push(lineNumber);
    } else {
      // Not consecutive, start a new group, but first push the current group if it's not empty
      if (currentGroup.length) {
        groupedLines.push(currentGroup);
      }
      currentGroup = [lineNumber];
    }
    previousLineNum = lineNumber;
  
    // Ensure the last group is added
    if (index === result.lineNumbers.length - 1 && currentGroup.length) {
      groupedLines.push(currentGroup);
    }
  });
  // Now, transform grouped line numbers into text blocks
  result.text = groupedLines.map(group =>
    group.map(lineNumber => lines[lineNumber]).join('\n') // Assuming lineNumbers are 1-indexed
  );
  // Update lineNumbers to only include the first line of each group
  result.lineNumbers = groupedLines.map(group => group[0]);

  result.title = note.title;
  result.notebook = notebook.title;
  result.updatedTime = note.updated_time;
  result.createdTime = note.created_time;

  note = clearNoteReferences(note);

  return result
}

export async function displayInAllNotes(db: any) {
  // Display results in notes
  const noteIds = db.getResultNotes();
  for (const id of noteIds) {
    let note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    await displayResultsInNote(db, note);
    note = clearNoteReferences(note);
  }
}

export async function displayResultsInNote(db: any, note: any) {
  const savedQuery = await loadQuery(db, note);
  const results = await runSearch(db, savedQuery.query);
  const filteredResults = await filterAndSortResults(results, savedQuery.filter);

  // Create the results string
  let resultsString = resultsStart;
  for (const result of filteredResults) {
    resultsString += `\n## ${result.title} [>](:/${result.externalId})\n\n`;
    for (let i = 0; i < result.text.length; i++) {
      resultsString += `${normalizeTextIndentation(result.text[i])}\n\n---\n`;
    }
  }
  resultsString += resultsEnd;

  // Update the note
  const resultsRegExp = new RegExp(`${resultsStart}.*${resultsEnd}`, 's');
  let newBody = note.body;
  if (resultsRegExp.test(note.body)) {
    newBody = newBody.replace(resultsRegExp, resultsString);
  } else {
    newBody += '\n' + resultsString;
  }
  if (newBody !== note.body) {
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    if (currentNote.id === note.id) {
      await joplin.commands.execute('editor.setText', newBody);
    }
    currentNote = clearNoteReferences(currentNote);
  }
}

export async function removeResults(note: any) {
  const resultsRegExp = new RegExp(`[\n\s]*${resultsStart}.*${resultsEnd}`, 's')
  if (resultsRegExp.test(note.body)) {
    const newBody = note.body.replace(resultsRegExp, '');
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    if (currentNote.id === note.id) {
      await joplin.commands.execute('editor.setText', newBody);
    }
    currentNote = clearNoteReferences(currentNote);
  }
}

// Filter and sort results, like the search panel
async function filterAndSortResults(results: GroupedResult[], filter: string): Promise<GroupedResult[]> {
  // Sort results
  const sortBy = await joplin.settings.value('itags.resultSort');
  const sortOrder = await joplin.settings.value('itags.resultOrder');
  let sortedResults = results.sort((a, b) => {
    if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
    } else if (sortBy === 'modified') {
        return a.updatedTime - b.updatedTime;
    } else if (sortBy === 'created') {
        return a.createdTime - b.createdTime;
    } else if (sortBy === 'notebook') {
        return a.notebook.localeCompare(b.notebook);
    }
  });
  if (sortOrder === 'desc') {
      sortedResults = sortedResults.reverse();
  }
  sortedResults = sortedResults.filter(note => note.text.length > 0);

  if (!filter) { return sortedResults; }

  const highlight = await joplin.settings.value('itags.resultMarker');
  const parsedFilter = parseFilter(filter);
  const filterRegExp = new RegExp(`(${parsedFilter.join('|')})`, 'gi');
  for (const note of sortedResults) {
    note.text = note.text.filter(text => containsFilter(text, filter, 2, note.title));
    if ((parsedFilter.length > 0 && highlight)) {
      // TODO: use settings to determine whether to highlight
      note.text = note.text.map(text => text.replace(filterRegExp, '==$1=='));
      note.title = note.title.replace(filterRegExp, '==$1==');
    }
  }
  return sortedResults
}

// Check that all words are in the target, like the search panel
function containsFilter(target: string, filter: string, min_chars: number=1, otherTarget: string=''): boolean {
  const lowerTarget = (target + otherTarget).toLowerCase();
  const words = parseFilter(filter, min_chars);

  return words.every((word: string) => lowerTarget.includes(word.toLowerCase()));
}

// Split filter into words and quoted phrases, like the search panel
function parseFilter(filter, min_chars=1) {
  const regex = /"([^"]+)"/g;
  let match: RegExpExecArray;
  const quotes = [];
  while ((match = regex.exec(filter)) !== null) {
      quotes.push(match[1]);
      filter = filter.replace(match[0], '');
  }
  const words = filter.replace('"', '').toLowerCase()
      .split(' ').filter((word: string) => word.length >= min_chars)
      .concat(quotes);
  return words;
}

export function clearNoteReferences(note: any): null {
  if (!note) { return null; }

  // Remove references to the note
  note.body = null;
  note.title = null;
  note.id = null;
  note.parent_id = null;
  note.updated_time = null;
  note.created_time = null;
  note = null;

  return null;
}