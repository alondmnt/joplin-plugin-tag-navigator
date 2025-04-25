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
  color: string;         // Color of matched lines
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
  const colorTag = await joplin.settings.value('itags.colorTag');
  const queryResults = await getQueryResults(db, query, currentNote);
  const groupedResults = await processQueryResults(db, queryResults, colorTag);
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
            if (minValue.startsWith('*')) {
              // Simple suffix check
              if (!tag.endsWith(minValue.slice(1))) { continue; }
            } else if (minValue.endsWith('*')) {
              // Combined prefix + range check
              if (!tag.startsWith(minValue.slice(0, -1))) { continue; }
            } else if (tag.localeCompare(minValue) < 0) {
              continue;
            }
          }
          if (maxValue) {
            if (maxValue.startsWith('*')) {
              // Simple suffix check
              if (!tag.endsWith(maxValue.slice(1))) { continue; }
            } else if (maxValue.endsWith('*')) {
              // Combined prefix + range check
              if (!tag.startsWith(maxValue.slice(0, -1))) { continue; }
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
  db: NoteDatabase,
  queryResults: ResultSet,
  colorTag: string
): Promise<GroupedResult[]> {
  const fullPath = await joplin.settings.value('itags.tableNotebookPath');
  const groupedResults: GroupedResult[] = [];
  if (!queryResults) return groupedResults;

  for (const externalId in queryResults) {
    const note = db.notes[externalId];
    const lineNumbers = Array.from(queryResults[externalId]).sort((a, b) => a - b);

    // Get the color for each line
    const colorMap: Map<string, number[]> = new Map();
    colorMap.set('', [...lineNumbers]);

    for (const lineNumber of lineNumbers) {
      const lineTags = note.getTagsAtLine(lineNumber);

      for (const tag of lineTags) {
        if (tag.startsWith(colorTag)) {
          // Add the color to the map
          const color = tag.replace(colorTag, '');

          const colorLines = colorMap.get(color) || [];
          colorLines.push(lineNumber);
          colorMap.set(color, colorLines);

          // Remove the line from the default color array safely
          const defaultLines = colorMap.get('');
          const index = defaultLines.indexOf(lineNumber);
          if (index !== -1) {
            defaultLines.splice(index, 1);
          }
        }
      }
    }

    // Create a separate result for each color
    for (const [color, lineNumbers] of colorMap.entries()) {
      if (lineNumbers.length === 0) {
        continue;
      }

      const colorResult: GroupedResult = {
        externalId,
        lineNumbers,
        text: [],
        html: [],
        color: color,
        title: '',
      };

      groupedResults.push(await getTextAndTitle(colorResult, fullPath));
    }
  }

  return groupedResults;
}

/**
 * Retrieves text content and title for a result, and groups the lines
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
  let notebook = folder.title + '/';
  if (fullPath) {
    while (folder.parent_id) {
      folder = await joplin.data.get(['folders', folder.parent_id], { fields: ['title', 'parent_id'] });
      notebook = folder.title + '/' + notebook;
    }
    notebook = '/' + notebook;
  }
  const lines: string[] = note.body.split('\n');
  const groupingMode = await joplin.settings.value('itags.resultGrouping');

  // Group line numbers based on the selected mode
  let groupedLines: number[][] = [];
  let groupTitleLine: number[] = [];  // Line number of the title for each group

  if (groupingMode === 'consecutive') {
    // Original consecutive grouping logic
    let currentGroup: number[] = [];
    let previousLineNum = -2;
    result.lineNumbers.forEach((lineNumber, index) => {
      if (lineNumber === previousLineNum + 1) {
        currentGroup.push(lineNumber);
      } else {
        if (currentGroup.length) {
          groupedLines.push(currentGroup);
        }
        currentGroup = [lineNumber];
      }
      previousLineNum = lineNumber;
      if (index === result.lineNumbers.length - 1 && currentGroup.length) {
        groupedLines.push(currentGroup);
      }
    });
  } else if (groupingMode === 'heading') {
    // Group by heading - find the nearest heading above each line
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    let currentHeadingLine = -1;
    let currentGroup: number[] = [];

    for (const lineNumber of result.lineNumbers) {
      // Find the nearest heading above this line
      let headingFound = false;
      for (let i = lineNumber; i >= 0; i--) {
        if (headingRegex.test(lines[i])) {
          if (i !== currentHeadingLine) {
            if (currentGroup.length) {
              groupedLines.push(currentGroup);
            }
            currentGroup = [];
            currentHeadingLine = i;
            groupTitleLine.push(i);
          }
          headingFound = true;
          break;
        }
      }

      if (!headingFound && currentGroup.length) {
        groupedLines.push(currentGroup);
        currentGroup = [];
        currentHeadingLine = -1;
        groupTitleLine.push(-1);
      }

      currentGroup.push(lineNumber);
    }

    if (currentGroup.length) {
      groupedLines.push(currentGroup);
      groupTitleLine.push(-1);
    }
  } else if (groupingMode === 'item') {
    // Group by indentation - group lines that are indented under the first line
    const indentRegex = /^(\s*)/;
    let currentGroup: number[] = [];
    let baseIndent = -1;
    let lastLine = -1;

    for (const lineNumber of result.lineNumbers) {
      const line = lines[lineNumber];
      const match = indentRegex.exec(line);
      const indent = match ? match[1].length : 0;

      // Start a new group if:
      // - This is the first line
      // - Current indent is less than or equal to base indent
      // - The line is not consecutive to the last line
      if (currentGroup.length === 0 || indent <= baseIndent || lineNumber > lastLine + 1) {
        if (currentGroup.length > 0) {
          groupedLines.push([...currentGroup]);
        }
        currentGroup = [lineNumber];
        baseIndent = indent;
      } else {
        // Add to current group if indented more than base
        currentGroup.push(lineNumber);
      }
      lastLine = lineNumber;
    }

    // Push final group
    if (currentGroup.length > 0) {
      groupedLines.push([...currentGroup]);
    }
  }

  // Transform grouped line numbers into text blocks
  result.text = groupedLines.map((group, index) => {
    if (groupTitleLine[index] > 0) {
      group.unshift(groupTitleLine[index]);
    }
    return group.map(lineNumber => lines[lineNumber]).join('\n');
  });

  // Update lineNumbers to only include the first line of each group
  result.lineNumbers = groupedLines.map(group => group[0]);

  result.title = note.title;
  result.notebook = notebook;
  result.updatedTime = note.updated_time;
  result.createdTime = note.created_time;

  note = clearObjectReferences(note);

  return result;
}
