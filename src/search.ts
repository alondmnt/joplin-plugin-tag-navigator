import joplin from 'api';
import { loadQuery } from './searchPanel';
import { getResultNotes } from './db';
import { resultsEnd, resultsStart } from './settings';

export interface Query {
  tag?: string;
  title?: string;
  externalId?: string;
  negated: boolean;
}

interface QueryResult {
  noteId: number;
  externalId: string;
  lineNumber: number;
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

export async function runSearch(db: any, query: Query[][]): Promise<GroupedResult[]> {
  const currentNote = (await joplin.workspace.selectedNote());
  const dbQuery = convertToDbQuery(query, currentNote);
  const queryResults = await getQueryResults(db, dbQuery);
  const groupedResults = await processQueryResults(queryResults);
  return groupedResults;
}

async function getQueryResults(db: any, query: string): Promise<QueryResult[]> {
  if (!query) return [];
  return new Promise((resolve, reject) => {
    db.all(query, [], async (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function convertToDbQuery(groups: Query[][], currentNote: any): string {
  if (groups.length === 0) return '';

  // Create a subquery that unifies NoteTags with Tags and NoteLinks
  let subQuery = `
    SELECT n.noteId, n.externalId, sub.lineNumber, sub.tag, sub.linkedNoteId
    FROM 
        (SELECT nt.noteId, nt.lineNumber, t.tag, NULL as linkedNoteId
        FROM NoteTags nt
        INNER JOIN Tags t ON nt.tagId = t.tagId
        UNION ALL
        SELECT nl.noteId, nl.lineNumber, NULL as tag, nl.linkedNoteId
        FROM NoteLinks nl) AS sub
    JOIN Notes n ON sub.noteId = n.noteId  
  `;

  // Process each group to create a part of the WHERE clause
  const groupConditions = groups.map(group => {
    // For each condition in the group, create a conditional aggregation check
    const conditions = group.map(condition => {
      if (condition.tag) {
        // Adjust for presence or absence of the tag
        return `${condition.negated ? 'SUM(CASE WHEN sub.tag = \'' + condition.tag + '\' THEN 1 ELSE 0 END) = 0' : 'SUM(CASE WHEN sub.tag = \'' + condition.tag + '\' THEN 1 ELSE 0 END) > 0'}`;

      } else if (condition.externalId) {
        let conditionId = condition.externalId;
        if (condition.externalId == 'current') {
          conditionId = currentNote.id;
        }
        // Adjust for presence or absence of the linked note
        return `${condition.negated ? 'SUM(CASE WHEN sub.linkedNoteId = \'' + conditionId + '\' THEN 1 ELSE 0 END) = 0' : 'SUM(CASE WHEN sub.linkedNoteId = \'' + conditionId + '\' THEN 1 ELSE 0 END) > 0'}`;
      }
    }).join(' AND '); // Intersect conditions within a group with AND

    // Return the conditional checks for this group, wrapped in HAVING for aggregation filtering
    return `${subQuery} GROUP BY sub.noteId, sub.lineNumber HAVING ${conditions}`;
  });

  // Union the groups with OR
  const finalQuery = groupConditions.length > 1 ? groupConditions.join(' UNION ') : groupConditions[0];

  return `SELECT sub.noteId, sub.lineNumber, n.externalId
    FROM (${finalQuery}) AS sub
    JOIN Notes n ON sub.noteId = n.noteId
    ORDER BY sub.noteId, sub.lineNumber;`
}

async function processQueryResults(queryResults: QueryResult[]): Promise<GroupedResult[]> {
  // pre-process the results to sort by noteId and lineNumber
  queryResults.sort((a, b) => {
    if (a.noteId === b.noteId) {
      return a.lineNumber - b.lineNumber;
    }
    return a.noteId - b.noteId;
  });

  // group the results by externalId and get the note content
  const groupedResults: GroupedResult[] = [];
  if (queryResults.length === 0) return groupedResults;
  let lastExternalId = '';
  let ind = 0;

  for (const row of queryResults) {
    const { noteId, lineNumber, externalId } = row;

    if (externalId !== lastExternalId) {
      if (lastExternalId !== '') {
        // If this is not the first externalId, fetch the text for the last noteId
        ind = groupedResults.length - 1;
        groupedResults[ind] = await getTextAndTitle(groupedResults[ind]);
      }

      // If this is the first time we've seen this externalId, initialize the object
      groupedResults.push({
        externalId: externalId,
        lineNumbers: [],
        text: [],
        html: [],
        title: '',
      });
    }

    groupedResults[groupedResults.length -1].lineNumbers.push(lineNumber);
    lastExternalId = externalId;
  }

  ind = groupedResults.length - 1;
  groupedResults[ind] = await getTextAndTitle(groupedResults[ind]);
  return groupedResults;
}

async function getTextAndTitle(result: GroupedResult): Promise<GroupedResult> {
  const note = await joplin.data.get(['notes', result.externalId],
    { fields: ['title', 'body', 'updated_time', 'created_time', 'parent_id'] });
  const notebook = await joplin.data.get(['folders', note.parent_id], ['title']);
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

  return result
}

export async function displayInAllNotes(db: any) {
  // Display results in notes
  const noteIds = (await getResultNotes(db));
  for (const id of noteIds) {
    const note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    await displayResults(db, note);
  }
}

export async function displayResults(db: any, note: any) {
  const savedQuery = await loadQuery(db, note.body);
  const results = await runSearch(db, JSON.parse(savedQuery.query));
  const filteredResults = filterResults(results, savedQuery.filter);

  // TODO: sort results according to default settings

  // Create the results string
  let resultsString = resultsStart;
  for (const result of filteredResults) {
    resultsString += `\n## ${result.title}\n`;
    for (let i = 0; i < result.text.length; i++) {
      resultsString += `${result.text[i]}\n\n---\n`;
    }
  }
  resultsString += resultsEnd;

  // Update the note
  const resultsRegExp = new RegExp(`${resultsStart}.*${resultsEnd}`, 's')
  if (resultsRegExp.test(note.body)) {
    note.body = note.body.replace(resultsRegExp, resultsString);
  } else {
    note.body += '\n' + resultsString;
  }
  await joplin.data.put(['notes', note.id], null, { body: note.body });
  const currentNote = await joplin.workspace.selectedNote();
  if (currentNote.id === note.id) {
    await joplin.commands.execute('editor.setText', note.body);
  }
}

// Filter results, like the search panel
function filterResults(results: GroupedResult[], filter: string): GroupedResult[] {
  if (!filter) { return results; }

  const parsedFilter = parseFilter(filter);
  const filterRegExp = new RegExp(`(${parsedFilter.join('|')})`, 'gi');
  for (const note of results) {
    note.text = note.text.filter(text => containsFilter(text, filter, 2, note.title));
    if ((parsedFilter.length > 0)) {
      // TODO: use settings to determine whether to highlight
      note.text = note.text.map(text => text.replace(filterRegExp, '==$1=='));
      note.title = note.title.replace(filterRegExp, '==$1==');
    }
  }
  return results.filter(note => note.text.length > 0);
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