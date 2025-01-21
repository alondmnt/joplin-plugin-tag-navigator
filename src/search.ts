import joplin from 'api';
import { getTagSettings } from './settings';
import { NoteDatabase, ResultSet, intersectSets, unionSets } from './db';
import { parseDateTag } from './parser';
import { clearObjectReferences } from './utils';

/**
 * Represents a search query component
 */
export interface Query {
  tag?: string;          // Tag to search for
  title?: string;        // Title to search for
  externalId?: string;   // Note ID to search for
  negated: boolean;      // Whether to negate the search
  minValue?: string;     // Minimum value for range queries
  maxValue?: string;     // Maximum value for range queries
}

/**
 * Represents a grouped search result
 */
export interface GroupedResult {
  externalId: string;     // Note ID
  lineNumbers: number[];  // Line numbers where matches were found
  text: string[];        // Text content of matched lines
  html: string[];        // HTML content of matched lines
  title: string;         // Note title
  notebook?: string;     // Notebook name
  updatedTime?: number;  // Last update timestamp
  createdTime?: number;  // Creation timestamp
}

/**
 * Executes a search query and returns grouped results
 * @param db Note database to search in
 * @param query 2D array of queries representing DNF (Disjunctive Normal Form)
 * @returns Array of grouped search results
 */
export async function runSearch(
  db: NoteDatabase, 
  query: Query[][]
): Promise<GroupedResult[]> {
  let currentNote = (await joplin.workspace.selectedNote());
  const queryResults = await getQueryResults(db, query, currentNote);
  const groupedResults = await processQueryResults(queryResults);
  currentNote = clearObjectReferences(currentNote);
  return groupedResults;
}

/**
 * Processes query and returns matching note locations
 * @param db Note database to search in
 * @param query 2D array of queries in DNF form
 * @param currentNote Currently selected note
 * @returns Dictionary of note IDs to sets of line numbers
 */
async function getQueryResults(
  db: NoteDatabase, 
  query: Query[][], 
  currentNote: { id?: string }
): Promise<ResultSet> {
  let resultsSet: ResultSet = {};
  
  // Process each clause (OR)
  for (const clause of query) {
    let clauseResultsSet: ResultSet | null = null;

    // Process each part within clause (AND)
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
            partResults = unionResults(
              partResults, 
              db.searchBy('noteLinkTitle', queryPart.title, queryPart.negated)
            );
          }
        }

      } else if (queryPart.minValue || queryPart.maxValue) {
        const tagSettings = await getTagSettings();
        const minValue = queryPart.minValue ? 
          parseDateTag(queryPart.minValue.toLowerCase(), tagSettings) : null;
        const maxValue = queryPart.maxValue ? 
          parseDateTag(queryPart.maxValue.toLowerCase(), tagSettings) : null;

        for (const tag of db.getTags()) {
          if (minValue) {
            if (tag.localeCompare(minValue) < 0) { continue; }
          }
          if (maxValue) {
            if (maxValue.endsWith('*')) {
              // For wildcard, check if tag starts with the prefix (excluding the *)
              if (!tag.startsWith(maxValue.slice(0, -1)) && tag.localeCompare(maxValue) > 0) { 
                continue;
              }
            } else if (tag.localeCompare(maxValue) > 0) { 
              break; 
            }
          }
          partResults = unionResults(partResults, db.searchBy('tag', tag, false));
        }
      }

      // Intersect results within clause (AND)
      clauseResultsSet = clauseResultsSet === null ? 
        partResults : 
        intersectResults(clauseResultsSet, partResults);
    }

    // Union results between clauses (OR)
    resultsSet = unionResults(resultsSet, clauseResultsSet);
  }

  return resultsSet;
}

/**
 * Computes intersection of two result sets
 * @param noteDictA First result set
 * @param noteDictB Second result set
 * @returns Intersection of the two sets
 */
function intersectResults(
  noteDictA: ResultSet, 
  noteDictB: ResultSet
): ResultSet {
  const result: ResultSet = {};
  for (const noteId in noteDictA) {
    if (noteDictB[noteId]) {
      result[noteId] = intersectSets(noteDictA[noteId], noteDictB[noteId]);
    }
  }
  return result;
}

/**
 * Computes union of two result sets
 * @param noteDictA First result set
 * @param noteDictB Second result set
 * @returns Union of the two sets
 */
function unionResults(
  noteDictA: ResultSet, 
  noteDictB: ResultSet
): ResultSet {
  const result: ResultSet = { ...noteDictA };
  for (const noteId in noteDictB) {
    if (result[noteId]) {
      result[noteId] = unionSets(result[noteId], noteDictB[noteId]);
    } else {
      result[noteId] = noteDictB[noteId];
    }
  }
  return result;
}

/**
 * Processes raw query results into grouped results with note content
 * @param queryResults Raw query results
 * @returns Array of grouped results with note content
 */
async function processQueryResults(
  queryResults: ResultSet
): Promise<GroupedResult[]> {
  const fullPath = await joplin.settings.value('itags.tableNotebookPath');
  const groupedResults: GroupedResult[] = [];
  if (!queryResults) return groupedResults;

  for (const externalId in queryResults) {
    const result: GroupedResult = {
      externalId,
      lineNumbers: Array.from(queryResults[externalId]).sort((a, b) => a - b),
      text: [],
      html: [],
      title: '',
    };

    groupedResults.push(await getTextAndTitle(result, fullPath));
  }

  return groupedResults;
}

/**
 * Retrieves text content and title for a result
 * @param result Result to populate with content
 * @param fullPath Whether to include full notebook path
 * @returns Updated result with content
 */
async function getTextAndTitle(
  result: GroupedResult, 
  fullPath: boolean
): Promise<GroupedResult> {
  let note = await joplin.data.get(['notes', result.externalId],
    { fields: ['title', 'body', 'updated_time', 'created_time', 'parent_id'] });
  let folder: any;
  try {
    folder = await joplin.data.get(['folders', note.parent_id], { fields: ['title', 'parent_id'] });
  } catch (e) {
    folder = { title: 'Unknown notebook' };
  }
  let notebook = folder.title;
  if (fullPath) {
    while (folder.parent_id) {
      folder = await joplin.data.get(['folders', folder.parent_id], { fields: ['title', 'parent_id'] });
      notebook = folder.title + '/' + notebook;
    }
  }
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
  result.notebook = notebook;
  result.updatedTime = note.updated_time;
  result.createdTime = note.created_time;

  note = clearObjectReferences(note);

  return result
}
