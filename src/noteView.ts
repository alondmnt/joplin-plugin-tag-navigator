import joplin from 'api';
import { getTagSettings, TagSettings, resultsEnd, resultsStart, NoteViewSettings, getNoteViewSettings, getResultSettings, ResultSettings } from './settings';
import { escapeRegex } from './utils';
import { formatFrontMatter, loadQuery, QueryRecord, REGEX as REGEX_SEARCH } from './searchPanel';
import { GroupedResult, runSearch, normalizeIndentation, sortResults } from './search';
import { NoteDatabase } from './db';
import { processResultsForKanban, buildKanban, sortKanbanItems } from './kanban';
import { clearObjectReferences, clearApiResponse } from './memory';

export const viewList = ['list', 'table', 'kanban'];

const REGEX = {
  query: REGEX_SEARCH.findQuery,
  results: new RegExp(`${resultsStart}.*${resultsEnd}`, 's'),
  resultsWithWhitespace: new RegExp(`[\n\s]*${resultsStart}.*${resultsEnd}`, 's'),
  quotedText: /"([^"]+)"/g,
  heading: /^(#{1,6})\s+(.*)$/gm,
};

/**
 * Represents a table result with associated tags
 */
interface TableResult extends GroupedResult {
  columns: { [key: string]: string };
}

interface TagViewInfo {
  tag: string;
  lines: number[];
  count: number;
  index: number;
  parent: boolean;  // first parent (column)
  child: boolean;   // last child (value)
}

/**
 * Type of tag separator relationship
 * - 'nested': parent/child path structure (e.g., #2026/01/15)
 * - 'keyvalue': key=value assignment (e.g., #status=active)
 */
export type TagSeparatorType = 'nested' | 'keyvalue';

/**
 * Displays search results in all matching notes
 * @param db The inline tags database
 * @returns Configuration for table columns and default values
 */
export async function displayInAllNotes(db: NoteDatabase): Promise<{
  tableColumns: string[],
  tableDefaultValues: { [key: string]: string },
  tableColumnSeparators: { [key: string]: TagSeparatorType }
}> {
  // Display results in notes
  const tagSettings = await getTagSettings();
  const viewSettings = await getNoteViewSettings();
  const resultSettings = await getResultSettings();
  const noteIds = db.getResultNotes();
  let tableColumns: string[] = [];
  let tableDefaultValues: { [key: string]: string } = {};
  let tableColumnSeparators: { [key: string]: TagSeparatorType } = {};
  for (const id of noteIds) {
    let note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    if (!note) { continue; }
    const result = await displayResultsInNote(db, note, tagSettings, viewSettings, resultSettings);
    if (result) {
      tableColumns = result.tableColumns;
      tableDefaultValues = result.tableDefaultValues;
      tableColumnSeparators = result.tableColumnSeparators;
    }
    note = clearObjectReferences(note);
  }
  return { tableColumns, tableDefaultValues, tableColumnSeparators };
}

/**
 * Displays search results within a single note
 * @param db The note database
 * @param note The note to display results in
 * @param tagSettings Configuration for tag formatting
 * @param viewSettings Configuration for note view
 * @param resultSettings Configuration for result settings including default grouping
 * @returns Configuration for table columns and default values, or null if no results
 */
export async function displayResultsInNote(
  db: NoteDatabase, 
  note: { id: string, body: string }, 
  tagSettings: TagSettings,
  viewSettings: NoteViewSettings,
  resultSettings: ResultSettings
): Promise<{ tableColumns: string[], tableDefaultValues: { [key: string]: string }, tableColumnSeparators: { [key: string]: TagSeparatorType } } | null> {
  if (!note.body) { return null; }
  const savedQuery = loadQuery(note);
  if (!savedQuery) { return null; }
  if (!viewList.includes(savedQuery.displayInNote)) { return null; }

  const displayColors = viewSettings.noteViewColorTitles;
  const groupingMode = savedQuery.options?.resultGrouping || resultSettings.resultGrouping;
  const noteViewLocation = viewSettings.noteViewLocation;

  // Run search with sorting options
  const results = await runSearch(db, savedQuery.query, groupingMode, savedQuery.options);

  // Apply filtering and limit
  let filteredResults = await filterResults(results, savedQuery.filter, viewSettings);
  if (savedQuery.options?.limit > 0) {
    filteredResults = filteredResults.slice(0, savedQuery.options.limit);
  }

  if (filteredResults.length === 0) {
    await removeResults(note);
    return null;
  }

  let resultsString = resultsStart;
  let tableColumns: string[] = [];
  let tableString = '';
  let tableDefaultValues: { [key: string]: string } = {};
  let tableColumnSeparators: { [key: string]: TagSeparatorType } = {};
  if (savedQuery.displayInNote === 'list') {
    // Create the results string as a list
    for (const result of filteredResults) {
      // Check if we should display colors in note view
      if (displayColors && result.color) {
        resultsString += `\n# <span style="color: ${result.color};">${result.title}</span> [>](:/${result.externalId})\n\n`;
      } else {
        resultsString += `\n# ${result.title} [>](:/${result.externalId})\n\n`;
      }

      for (let i = 0; i < result.text.length; i++) {
        // If a line is a heading, turn it line into a link
        result.text[i] = result.text[i].replace(REGEX.heading, (_, level, title) => {
          const slug = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
          return `${level} ${title} [>](:/${result.externalId}#${slug})`;
        });
        resultsString += `${formatFrontMatter(result.text[i])}\n\n---\n`;
      }
    }

  } else if (savedQuery.displayInNote === 'table') {
    // Parse tags from results and accumulate counts
    const [tableResults, columnCount, mostCommonValue, columnSeparator] = await processResultsForTable(filteredResults, db, tagSettings, savedQuery, resultSettings);
    tableDefaultValues = mostCommonValue;
    tableColumnSeparators = columnSeparator;
    [tableString, tableColumns] = await buildTable(tableResults, columnCount, savedQuery, tagSettings, viewSettings);
    resultsString += tableString;

  } else if (savedQuery.displayInNote === 'kanban') {
    // Process results for kanban view
    const kanbanResults = await processResultsForKanban(filteredResults, tagSettings, viewSettings);

    // Sort kanban items using the same sorting logic as search results
    const sortedKanbanResults = sortKanbanItems(
      kanbanResults, 
      savedQuery.options, 
      tagSettings, 
      resultSettings
    );

    resultsString += await buildKanban(sortedKanbanResults, tagSettings, viewSettings);
  }
  resultsString += resultsEnd;

  // Update the note
  let newBody = note.body;
  if (REGEX.results.test(note.body)) {
    newBody = newBody.replace(REGEX.results, resultsString);
  } else {
    const queryMatch = REGEX.query.exec(newBody);
    if (queryMatch) {
      const insertPosition = noteViewLocation === 'before' 
        ? queryMatch.index 
        : queryMatch.index + queryMatch[0].length;

      // Add newline before results if needed
      const needsNewlineBefore = insertPosition > 0 && newBody[insertPosition - 1] !== '\n';

      newBody = newBody.slice(0, insertPosition) + 
                (needsNewlineBefore ? '\n\n' : '') +
                resultsString +
                newBody.slice(insertPosition);
    } else {
      // Ensure there's a newline before appending if the note doesn't end with one
      if (newBody && !newBody.endsWith('\n')) {
        newBody += '\n';
      }
      newBody += resultsString + '\n';
    }
  }
  let currentNote = await joplin.workspace.selectedNote();
  if (newBody !== note.body) {
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    if (!currentNote) { return null; }
    if (currentNote.id === note.id) {
      try {
        await joplin.commands.execute('editor.setText', newBody);
      } catch (error) {
        console.debug('itags.displayResultsInNote: error', error);
      }
    }
  }
  if (!currentNote) { return null; }
  const updatedCurrentNote = currentNote.id === note.id;
  currentNote = clearObjectReferences(currentNote);

  if (updatedCurrentNote) {
    return { tableColumns, tableDefaultValues, tableColumnSeparators };
  } else {
    return null;
  }
}

/**
 * Removes search results section from a note
 * @param note The note to remove results from
 */
export async function removeResults(note: { id: string, body: string }): Promise<void> {
  if (REGEX.resultsWithWhitespace.test(note.body)) {
    const newBody = note.body.replace(REGEX.resultsWithWhitespace, '');
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    if (currentNote.id === note.id) {
      try {
        await joplin.commands.execute('editor.setText', newBody);
      } catch (error) {
        console.debug('itags.removeResults: error', error);
      }
    }
    currentNote = clearObjectReferences(currentNote);
  }
}

/**
 * Filters and sorts search results based on specified criteria
 * @param results Array of search results to process
 * @param filter Text string to filter results by
 * @param tagSettings Configuration for tag formatting
 * @param options Optional sorting configuration
 * @returns Filtered and sorted results array
 */
async function filterResults(
  results: GroupedResult[], 
  filter: string, 
  viewSettings: NoteViewSettings
): Promise<GroupedResult[]> {
  if (!filter) { return results; }

  const parsedFilter = parseFilter(filter, 2, !viewSettings.searchWithRegex);
  // Filter out exclusion patterns for highlighting
  const inclusionPatterns = parsedFilter.filter(pattern => !pattern.startsWith('!'));
  let filterRegExp: RegExp | null = null;
  if (inclusionPatterns.length > 0) {
    try {
      filterRegExp = new RegExp(`(${inclusionPatterns.join('|')})`, 'gi');
    } catch (error) {
      console.warn('Tag Navigator: Invalid regex for highlighting:', inclusionPatterns, error);
      filterRegExp = null;
    }
  }

  let filteredResults = [...results]; // Create a copy to avoid modifying the original

  for (const note of filteredResults) {
    // Filter out lines that don't contain the filter
    const filteredIndices = note.text.map((_, i) => i).filter(i => 
      containsFilter(note.text[i], filter, 2, viewSettings.searchWithRegex, '|' + note.title + '|' + note.notebook)
    );

    note.text = note.text.filter((_, i) => filteredIndices.includes(i));
    note.lineNumbers = note.lineNumbers.filter((_, i) => filteredIndices.includes(i));

    if ((inclusionPatterns.length > 0 && viewSettings.resultMarkerInNote && filterRegExp)) {
      note.text = note.text.map(text => text.replace(filterRegExp, '==$1=='));
      note.title = note.title.replace(filterRegExp, '==$1==');
    }
  }
  
  const result = filteredResults.filter(note => note.text.length > 0);
  
  // Clear temporary arrays to prevent memory leaks
  parsedFilter.length = 0;
  inclusionPatterns.length = 0;
  
  return result;
}

/**
 * Checks if a target string contains all words from a filter
 * @param target Primary text to search in
 * @param filter Filter string to check for
 * @param min_chars Minimum character length for filter words
 * @param otherTarget Optional additional text to search in
 * @returns True if all filter words are found
 */
function containsFilter(
  target: string, 
  filter: string, 
  min_chars: number = 1, 
  searchWithRegex: boolean = false,
  otherTarget: string = ''
): boolean {
  const lowerTarget = (target + otherTarget).toLowerCase();
  const words = parseFilter(filter, min_chars);

  if (searchWithRegex) {
    return words.every(word => {
      const isExclusion = word.startsWith('!');
      const pattern = isExclusion ? word.slice(1) : word;
      
      // Handle empty pattern after !
      if (!pattern) return !isExclusion;
      
      try {
        const matches = lowerTarget.match(new RegExp(`(${pattern})`, 'gi'));
        return isExclusion ? !matches : !!matches;
      } catch (error) {
        console.warn('Tag Navigator: Invalid regex pattern:', pattern, error);
        // Fall back to simple text search for invalid patterns
        const found = lowerTarget.includes(pattern.toLowerCase());
        return isExclusion ? !found : found;
      }
    });
  } else {
    return words.every(word => {
      const isExclusion = word.startsWith('!');
      const searchTerm = isExclusion ? word.slice(1) : word;
      
      // Handle empty search term after !
      if (!searchTerm) return !isExclusion;
      
      const found = lowerTarget.includes(searchTerm);
      
      return isExclusion ? !found : found;
    });
  }
}

/**
 * Splits a filter string into words and quoted phrases, like the search panel
 * @param filter The filter string to parse
 * @param min_chars Minimum character length for a word to be included
 * @param escape_regex Whether to escape regex characters in the filter
 * @returns Array of words and quoted phrases
 * @example
 * parseFilter('"hello world" test') // ['hello world', 'test']
 */
function parseFilter(filter: string, min_chars: number = 1, escape_regex: boolean = false): string[] {
  let match: RegExpExecArray;
  const quotes = [];
  while ((match = REGEX.quotedText.exec(filter)) !== null) {
    quotes.push(match[1]);
    filter = filter.replace(match[0], '');
  }
  let words = filter.replace('"', '').toLowerCase()
      .split(' ').filter((word: string) => word.length >= min_chars)
      .concat(quotes);
  if (escape_regex) {
    words = words.map(word => escapeRegex(word));
  }
  return words;
}

/**
 * Processes search results for table display
 * @param filteredResults Array of filtered search results
 * @param db The note database
 * @param tagSettings Configuration for tag formatting
 * @param savedQuery Saved query configuration
 * @param resultSettings Global result settings for sorting fallbacks
 * @returns Tuple containing:
 *   - Processed table results
 *   - Column count mapping
 *   - Most common values for each column
 */
async function processResultsForTable(
  filteredResults: GroupedResult[], 
  db: NoteDatabase, 
  tagSettings: TagSettings, 
  savedQuery: QueryRecord,
  resultSettings: ResultSettings
): Promise<[
  TableResult[],
  { [key: string]: number },
  { [key: string]: string },
  { [key: string]: TagSeparatorType }
]> {
  const columnCount: { [key: string]: number } = {};
  const valueCount: { [key: string]: { [key: string]: number } } = {};
  const separatorCount: { [key: string]: { nested: number, keyvalue: number } } = {};
  const mostCommonValue: { [key: string]: string } = {};

  // Process tags for each result
  let tableResults = await Promise.all(filteredResults.map(async result => {
    const [tableResult, tagInfo] = await processResultForTable(result, db, tagSettings);

    // Update tag counts
    tagInfo.forEach(info => {
      if (info.parent) {
        // Count the number of notes each parent tag appears in
        columnCount[info.tag] = (columnCount[info.tag] || 0) + 1;
      }
      if (info.child) {
        // Count the number of notes each child tag appears in
        const isHierarchical = tagInfo.find(
          parentInfo =>
            parentInfo.parent && info.tag.startsWith(parentInfo.tag + '/')
        );
        const isKeyValue = tagInfo.find(
          parentInfo =>
            parentInfo.parent && info.tag.startsWith(parentInfo.tag + tagSettings.valueDelim)
        );
        let parent = isHierarchical || isKeyValue;
        if (!parent) {
          parent = info;
        }
        if (!valueCount[parent.tag]) {
          valueCount[parent.tag] = {};
        }
        if (!separatorCount[parent.tag]) {
          separatorCount[parent.tag] = { nested: 0, keyvalue: 0 };
        }
        // Track which separator is used for this parent-child relationship
        if (isHierarchical) {
          separatorCount[parent.tag].nested += 1;
        } else if (isKeyValue) {
          separatorCount[parent.tag].keyvalue += 1;
        }
        const value = info.tag.replace(RegExp(escapeRegex(parent.tag) + '/|' + escapeRegex(parent.tag + tagSettings.valueDelim), 'g'), '');
        valueCount[parent.tag][value] = (valueCount[parent.tag][value] || 0) + 1;
      }
    });

    // Clear tagInfo array to prevent memory leaks
    clearObjectReferences(tagInfo);

    return tableResult;
  }));

  // Sort table results based on options
  tableResults = sortResults(tableResults, savedQuery?.options, tagSettings, resultSettings);

  // Find the most common value for each column
  for (const key in valueCount) {
    mostCommonValue[key] = Object.keys(valueCount[key]).reduce((a, b) =>
      valueCount[key][a] > valueCount[key][b] ? a :
      valueCount[key][a] < valueCount[key][b] ? b :
      a < b ? a : b  // If counts are equal, take alphabetically first
    );
  }

  // Determine the most common separator for each column
  const columnSeparator: { [key: string]: TagSeparatorType } = {};
  for (const key in separatorCount) {
    columnSeparator[key] = separatorCount[key].nested >= separatorCount[key].keyvalue ? 'nested' : 'keyvalue';
  }

  // Clear temporary count objects to prevent memory leaks
  clearObjectReferences(valueCount);
  clearObjectReferences(separatorCount);

  return [tableResults, columnCount, mostCommonValue, columnSeparator];
}

/**
 * Processes a single result for table display
 * @param result The search result to process
 * @param db The note database
 * @param tagSettings Settings for tag formatting
 * @returns Tuple of [processed result, tag information]
 */
async function processResultForTable(
  result: GroupedResult, 
  db: NoteDatabase, 
  tagSettings: TagSettings
): Promise<[TableResult, TagViewInfo[]]> {
  const tableResult = result as TableResult;
  const note = db.notes[result.externalId];

  // Get the tags for each line in the results from the database
  const tagInfo: TagViewInfo[] = [];
  result.lineNumbers.forEach((lines, i) => {
    // Process only the actual lines in this group, not all lines between start and end
    for (const line of lines) {
      const lineTags = note.getTagsAtLine(line);
      for (const tag of lineTags) {
        if (tag === tagSettings.tagPrefix + 'frontmatter') {
          continue;
        }
        let formattedTag = tag.replace(tagSettings.tagPrefix, '')
          .replace(RegExp(tagSettings.spaceReplace, 'g'), ' ')
          .toLowerCase();
        const existingTag = tagInfo.find(t => t.tag === formattedTag);
        if (existingTag) {
          existingTag.count += 1;
          existingTag.lines.push(line);
          existingTag.lines = [...new Set(existingTag.lines)];
        } else {
          tagInfo.push({
            tag: formattedTag,
            count: 1,
            lines: [line],
            index: 0,
            parent: !tag.includes('/') && !tag.includes(tagSettings.valueDelim),
            child: null
          });
        }
      }
    }
  });

  for (const info of tagInfo) {
    // A child tag is a tag that has no children of its own (is a leaf node)
    info.child = !tagInfo.some(other =>
      other.tag !== info.tag &&
      (other.tag.startsWith(info.tag + '/') ||
       other.tag.startsWith(info.tag + tagSettings.valueDelim))
    );
  }

  // Create a mapping from column (parent tag) to value (child tag)
  tableResult.columns = tagInfo
    .filter(info => info.child)
    .reduce((acc, info) => {
      let parent = tagInfo.find(
        parentInfo =>
          parentInfo.parent &&
          (info.tag.startsWith(parentInfo.tag + '/') ||
           info.tag.startsWith(parentInfo.tag + tagSettings.valueDelim))
      );
      if (!parent) {
        parent = info;
      }
      if (acc[parent.tag]) {
        acc[parent.tag] += `, ${info.tag}`;
      } else {
        acc[parent.tag] = info.tag;
      }
      return acc;
    }, {} as {[key: string]: string});

  return [tableResult, tagInfo];
}

/**
 * Builds a markdown table from the results
 * @param tableResults Results to display in the table
 * @param columnCount Count of occurrences for each column
 * @param savedQuery Saved query configuration
 * @param tagSettings Configuration for tag formatting
 * @param viewSettings Configuration for view settings
 * @returns Tuple of [table string, column names]
 */
async function buildTable(
  tableResults: TableResult[], 
  columnCount: { [key: string]: number }, 
  savedQuery: QueryRecord, 
  tagSettings: TagSettings, 
  viewSettings: NoteViewSettings
): Promise<[string, string[]]> {
  // Select the top N tags
  let tableColumns = Object.keys(columnCount).sort((a, b) => columnCount[b] - columnCount[a] || a.localeCompare(b));
  const metaCols = ['line', 'modified', 'created', 'notebook', 'title'];
  // Parse includeCols with optional rename syntax: "col:Display Name"
  const renameMap = new Map<string, string>();
  const includeCols = savedQuery?.options?.includeCols?.split(',').map(entry => {
    const sepIndex = entry.indexOf(':');
    if (sepIndex >= 0) {
      const internal = entry.slice(0, sepIndex).trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' ');
      const display = entry.slice(sepIndex + 1).trim();
      if (internal && display) { renameMap.set(internal, display.replace(/\|/g, '\\|')); }
      return internal;
    }
    return entry.trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' ');
  });
  const excludeCols = savedQuery?.options?.excludeCols?.split(',').map(col => col.trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' '));
  if (includeCols?.length > 0) {
    // Include columns (ignore missing), respect given order
    tableColumns = includeCols.filter(col => 
      tableColumns.includes(col) ||
      metaCols.includes(col)
    );
  } else {
    // When includeCols is not specified, add default columns
    if (viewSettings.tableColumns > 0) {
      // Select the top N tags
      tableColumns = tableColumns.slice(0, viewSettings.tableColumns);
    }
    if (!excludeCols?.includes('line')) {
      tableColumns.unshift('line');
    }
    if (!excludeCols?.includes('notebook')) {
      tableColumns.unshift('notebook');
    }
  }
  if (!tableColumns.includes('title')) {
    // Always include title column
    tableColumns.unshift('title');
  }
  if (excludeCols?.length > 0) {
    // Exclude columns (ignore missing)
    tableColumns = tableColumns.filter(col => !excludeCols.includes(col));
  }

  let resultsString = `\n| ${tableColumns.map(col => renameMap.get(col) ?? formatTag(col, viewSettings)).join(' | ')} |\n`;
  resultsString += `|${tableColumns.map((col) => col === 'title' ? '---' : ':---:').join('|')}|\n`;
  for (const result of tableResults) {
    if (Object.keys(result.columns).length === 0) { continue; }
    let row = '|';

    // Check if we should display colors in note view
    let titleStyle = '';
    if (viewSettings.noteViewColorTitles && result.color) {
      titleStyle = ` style="color: ${result.color};"`;
    }

    for (let column of tableColumns) {
      column = column.toLowerCase();
      if (column === 'title') {
        if (titleStyle) {
          row += ` [<span${titleStyle}>${result.title}</span>](:/${result.externalId}) |`;
        } else {
          row += ` [${result.title}](:/${result.externalId}) |`;
        }
      } else if (column === 'notebook') {
        row += ` ${result.notebook} |`;
      } else if (column === 'line') {
        row += ` ${result.lineNumbers.map(line => Math.min(...line) + 1).join(', ')} |`;
      } else if (column === 'modified') {
        row += ` ${new Date(result.updatedTime).toISOString().replace('T', ' ').slice(0, 19)} |`;
      } else if (column === 'created') {
        row += ` ${new Date(result.createdTime).toISOString().replace('T', ' ').slice(0, 19)} |`;
      } else {
        const tagValue = result.columns[column] || '';
        if (!tagValue) {
          row += ' |';
        } else if (tagValue === column) {
          row += ' + |';
        } else {
          row += ` ${formatTag(tagValue.replace(RegExp(escapeRegex(column) + '/|' + escapeRegex(column + tagSettings.valueDelim), 'g'), ''), viewSettings)} |`;
        }
      }
    }
    resultsString += row + '\n';
  }
  tableColumns = tableColumns.filter(col => !metaCols.includes(col));
  
  // Clear temporary collections to prevent memory leaks
  if (includeCols) includeCols.length = 0;
  if (excludeCols) excludeCols.length = 0;
  renameMap.clear();
  
  return [resultsString, tableColumns];
}

/**
 * Formats a tag according to the specified settings
 * @param tag Tag string to format
 * @param viewSettings Configuration for tag formatting
 * @returns Formatted tag string
 */
function formatTag(tag: string, viewSettings: NoteViewSettings): string {
  if (viewSettings.tableCase === 'title') {
    return tag.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  return tag.toLowerCase();
}

/**
 * Creates a new note with table entry template
 * @param currentTableColumns Array of current table columns
 * @param currentTableDefaultValues Default values for each column
 * @param currentTableColumnSeparators Separator type ('nested' or 'keyvalue') for each column
 * @throws Will show a dialog if no table columns are available
 */
export async function createTableEntryNote(
  currentTableColumns: string[],
  currentTableDefaultValues: Record<string, string>,
  currentTableColumnSeparators: Record<string, TagSeparatorType>
): Promise<void> {
  if (currentTableColumns.length === 0) {
    await joplin.views.dialogs.showMessageBox('No table columns available. Please ensure you have a table view active in your note.');
    return;
  }

  // Create frontmatter content
  const frontmatter = ['---'];
  let tagList = [];
  currentTableColumns.forEach(column => {
    if (currentTableDefaultValues[column] === column) {
      // Simple tag (value equals column name)
      tagList.push('  - ' + column);
    } else if (currentTableColumnSeparators[column] === 'nested') {
      // Nested tag - use full path in tags list
      tagList.push('  - ' + column + '/' + currentTableDefaultValues[column]);
    } else {
      // Key-value tag - use YAML key-value format
      frontmatter.push(`${column}: ${currentTableDefaultValues[column]}`);
    }
  });
  if (tagList.length > 0) {
    frontmatter.push('tags: \n' + tagList.join('\n'));
  }
  frontmatter.push('---\n');

  // Create new note with frontmatter
  const selectedNote = await joplin.workspace.selectedNote();
  if (!selectedNote) { return; }
  let note = await joplin.data.post(['notes'], null, {
    parent_id: selectedNote.parent_id,
    title: 'New table entry',
    body: frontmatter.join('\n'),
  });

  // Open the new note
  try {
    await joplin.commands.execute('openNote', note.id);
  } catch (error) {
    console.debug('itags.createTableEntryNote: error', error);
  }
  note = clearObjectReferences(note);
  
  // Clear temporary arrays to prevent memory leaks
  frontmatter.length = 0;
  tagList.length = 0;
}

/**
 * Adapter function to utilize the normalizeIndentation function from search.ts
 * @param lines Array of text lines to normalize
 * @returns Normalized text
 */
function normalizeGroupIndentation(lines: string[]): string {
  if (!lines || lines.length === 0) return '';
  // Create an array of indices for all lines
  const indices = Array.from({ length: lines.length }, (_, i) => i);
  return normalizeIndentation(lines, indices);
}