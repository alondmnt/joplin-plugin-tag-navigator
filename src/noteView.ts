import joplin from 'api';
import { getTagSettings, TagSettings, resultsEnd, resultsStart } from './settings';
import { clearObjectReferences } from './utils';
import { formatFrontMatter, loadQuery, normalizeTextIndentation, QueryRecord } from './searchPanel';
import { GroupedResult, Query, runSearch } from './search';
import { TagLineInfo } from './parser';
import { NoteDatabase } from './db';

/**
 * Represents a table result with associated tags
 */
interface TableResult extends GroupedResult {
  tags: { [key: string]: string };
}

/**
 * Displays search results in all matching notes
 * @param db The inline tags database
 * @returns Configuration for table columns and default values
 */
export async function displayInAllNotes(db: NoteDatabase): Promise<{ 
  tableColumns: string[], 
  tableDefaultValues: { [key: string]: string } 
}> {
  // Display results in notes
  const tagSettings = await getTagSettings();
  const nColumns = await joplin.settings.value('itags.tableColumns');
  const noteIds = db.getResultNotes();
  let tableColumns: string[] = [];  
  let tableDefaultValues: { [key: string]: string } = {};
  for (const id of noteIds) {
    let note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    const result = await displayResultsInNote(db, note, tagSettings, nColumns);
    if (result) {
      tableColumns = result.tableColumns;
      tableDefaultValues = result.tableDefaultValues;
    }
    note = clearObjectReferences(note);
  }
  return { tableColumns, tableDefaultValues };
}

/**
 * Displays search results within a single note
 * @param db The note database
 * @param note The note to display results in
 * @param tagSettings Configuration for tag formatting
 * @param nColumns Maximum number of columns to display in table view
 * @returns Configuration for table columns and default values, or null if no results
 */
export async function displayResultsInNote(
  db: NoteDatabase, 
  note: { id: string, body: string }, 
  tagSettings: TagSettings, 
  nColumns: number = 10
): Promise<{ tableColumns: string[], tableDefaultValues: { [key: string]: string } } | null> {
  if (!note.body) { return null; }
  const savedQuery = await loadQuery(db, note);
  if (!savedQuery) { return null; }
  if (savedQuery.displayInNote !== 'list' && savedQuery.displayInNote !== 'table') { return null; }

  const results = await runSearch(db, savedQuery.query);
  const filteredResults = await filterAndSortResults(results, savedQuery.filter, tagSettings, savedQuery.options);

  if (filteredResults.length === 0) {
    await removeResults(note);
    return null;
  }

  let resultsString = resultsStart + '\nDisplaying ' + filteredResults.length + ' notes\n';
  let tableColumns: string[] = [];
  let tableString = '';
  let tableDefaultValues: { [key: string]: string } = {};

  if (savedQuery.displayInNote === 'list') {
    // Create the results string as a list
    for (const result of filteredResults) {
      resultsString += `\n## ${result.title} [>](:/${result.externalId})\n\n`;
      for (let i = 0; i < result.text.length; i++) {
        resultsString += `${formatFrontMatter(normalizeTextIndentation(result.text[i]))}\n\n---\n`;
      }
    }

  } else if (savedQuery.displayInNote === 'table') {
    // Parse tags from results and accumulate counts
    const [tableResults, columnCount, mostCommonValue] = await processResultsForTable(filteredResults, db, tagSettings, savedQuery);
    tableDefaultValues = mostCommonValue;
    [tableString, tableColumns] = buildTable(tableResults, columnCount, savedQuery, tagSettings, nColumns);
    resultsString += tableString;
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
  let currentNote = await joplin.workspace.selectedNote();
  if (newBody !== note.body) {
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    if (!currentNote) { return; }
    if (currentNote.id === note.id) {
      await joplin.commands.execute('editor.setText', newBody);
    }
  }
  const updatedCurrentNote = currentNote.id === note.id;
  currentNote = clearObjectReferences(currentNote);

  if (updatedCurrentNote) {
    return { tableColumns, tableDefaultValues };
  } else {
    return null;
  }
}

/**
 * Removes search results section from a note
 * @param note The note to remove results from
 */
export async function removeResults(note: { id: string, body: string }): Promise<void> {
  const resultsRegExp = new RegExp(`[\n\s]*${resultsStart}.*${resultsEnd}`, 's')
  if (resultsRegExp.test(note.body)) {
    const newBody = note.body.replace(resultsRegExp, '');
    await joplin.data.put(['notes', note.id], null, { body: newBody });
    let currentNote = await joplin.workspace.selectedNote();
    if (!currentNote) { return; }
    if (currentNote.id === note.id) {
      await joplin.commands.execute('editor.setText', newBody);
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
async function filterAndSortResults(
  results: GroupedResult[], 
  filter: string, 
  tagSettings: TagSettings, 
  options?: { 
    sortBy?: string, 
    sortOrder?: string 
  }
): Promise<GroupedResult[]> {
  // Sort results
  const sortBy = options?.sortBy || await joplin.settings.value('itags.resultSort');
  const sortOrder = options?.sortBy ? options?.sortOrder : await joplin.settings.value('itags.resultOrder');
  let sortedResults = sortResults(results, { sortBy, sortOrder }, tagSettings);
  sortedResults = sortedResults.filter(note => note.text.length > 0);

  if (!filter) { return sortedResults; }

  const highlight = await joplin.settings.value('itags.resultMarker');
  const parsedFilter = parseFilter(filter);
  const filterRegExp = new RegExp(`(${parsedFilter.join('|')})`, 'gi');
  for (const note of sortedResults) {
    // Filter out lines that don't contain the filter
    const filteredIndices = note.text.map((_, i) => i).filter(i => containsFilter(note.text[i], filter, 2, note.title));
    note.text = note.text.filter((_, i) => filteredIndices.includes(i));
    note.lineNumbers = note.lineNumbers.filter((_, i) => filteredIndices.includes(i));
    if ((parsedFilter.length > 0 && highlight)) {
      // TODO: use settings to determine whether to highlight
      note.text = note.text.map(text => text.replace(filterRegExp, '==$1=='));
      note.title = note.title.replace(filterRegExp, '==$1==');
    }
  }
  sortedResults = sortedResults.filter(note => note.text.length > 0);

  return sortedResults
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
  otherTarget: string = ''
): boolean {
  const lowerTarget = (target + otherTarget).toLowerCase();
  const words = parseFilter(filter, min_chars);

  return words.every((word: string) => lowerTarget.includes(word.toLowerCase()));
}

/**
 * Splits a filter string into words and quoted phrases, like the search panel
 * @param filter The filter string to parse
 * @param min_chars Minimum character length for a word to be included
 * @returns Array of words and quoted phrases
 * @example
 * parseFilter('"hello world" test') // ['hello world', 'test']
 */
function parseFilter(filter: string, min_chars: number = 1): string[] {
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

/**
 * Processes search results for table display
 * @param filteredResults Array of filtered search results
 * @param db The note database
 * @param tagSettings Configuration for tag formatting
 * @param savedQuery Saved query configuration
 * @returns Tuple containing:
 *   - Processed table results
 *   - Column count mapping
 *   - Most common values for each column
 */
async function processResultsForTable(
  filteredResults: GroupedResult[], 
  db: NoteDatabase, 
  tagSettings: TagSettings, 
  savedQuery: QueryRecord
): Promise<[
  TableResult[], 
  { [key: string]: number }, 
  { [key: string]: string }
]> {
  const columnCount: { [key: string]: number } = {};
  const valueCount: { [key: string]: { [key: string]: number } } = {};
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
        let parent = tagInfo.find(
          parentInfo =>
            parentInfo.parent &&
            info.tag.startsWith(parentInfo.tag)
        );
        if (!parent) {
          parent = info;
        }
        if (!valueCount[parent.tag]) {
          valueCount[parent.tag] = {};
        }
        const value = info.tag.replace(parent.tag + '/', '');
        valueCount[parent.tag][value] = (valueCount[parent.tag][value] || 0) + 1;
      }
    });

    return tableResult;
  }));

  // Sort table results based on options
  tableResults = sortResults(tableResults, savedQuery?.options, tagSettings);

  // Find the most common value for each column
  for (const key in valueCount) {
    mostCommonValue[key] = Object.keys(valueCount[key]).reduce((a, b) => 
      valueCount[key][a] > valueCount[key][b] ? a :
      valueCount[key][a] < valueCount[key][b] ? b :
      a < b ? a : b  // If counts are equal, take alphabetically first
    );
  }

  return [tableResults, columnCount, mostCommonValue];
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
): Promise<[TableResult, TagLineInfo[]]> {
  const tableResult = result as TableResult;
  const note = db.notes[result.externalId];

  // Get the tags for each line in the results from the database
  const tagInfo: TagLineInfo[] = [];
  result.lineNumbers.forEach((startLine, i) => {
    // All lines in each result section are consecutive
    const endLine = startLine + result.text[i].split('\n').length - 1;
    for (let line = startLine; line <= endLine; line++) {
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
            parent: !tag.includes('/'),
            child: null
          });
        }
      }
    }
  });

  for (const info of tagInfo) {
    // A child tag is a tag that isn't a prefix of any other tag
    info.child = !tagInfo.some(other => 
      other.tag !== info.tag && other.tag.startsWith(info.tag)
    );
  }

  // Create a mapping from column (parent tag) to value (child tag)
  tableResult.tags = tagInfo
    .filter(info => info.child)
    .reduce((acc, info) => {
      let parent = tagInfo.find(
        parentInfo =>
          parentInfo.parent &&
          info.tag.startsWith(parentInfo.tag)
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
 * Type guard to check if a result is a TableResult
 */
function isTableResult(result: TableResult | GroupedResult): result is TableResult {
  return 'tags' in result;
}

/**
 * Sorts results based on specified criteria
 * @param results Array of results to sort
 * @param options Sorting configuration
 * @param tagSettings Configuration for tag formatting
 * @returns Sorted array of results
 * @template T Type of results (TableResult or GroupedResult)
 */
function sortResults<T extends TableResult | GroupedResult>(
  results: T[], 
  options: { 
    sortBy?: string, 
    sortOrder?: string 
  },
  tagSettings: TagSettings
): T[] {
  const sortByArray = options?.sortBy?.toLowerCase()
    .split(',')
    .map(s => s.trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' '))
    .filter(s => s);

  const sortOrderArray = options?.sortOrder?.toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(s => s);

  if (!sortByArray?.length) return results;

  return results.sort((a, b) => {
    for (let i = 0; i < sortByArray.length; i++) {
      const sortBy = sortByArray[i];
      // Get corresponding sort order or default to 'asc'
      const sortOrder = sortOrderArray?.[i]?.startsWith('desc') ? -1 : 1;

      let comparison = 0;

      if (sortBy === 'created') {
        comparison = (a.createdTime - b.createdTime) * sortOrder;
      } else if (sortBy === 'modified') {
        comparison = (a.updatedTime - b.updatedTime) * sortOrder;
      } else if (sortBy === 'notebook') {
        comparison = a.notebook.localeCompare(b.notebook) * sortOrder;
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title) * sortOrder;
      } else if (isTableResult(a) && isTableResult(b)) {
        const aValue = a.tags[sortBy]?.replace(sortBy + '/', '') || '';
        const bValue = b.tags[sortBy]?.replace(sortBy + '/', '') || '';
        const aNum = Number(aValue);
        const bNum = Number(bValue);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          comparison = (aNum - bNum) * sortOrder;
        } else {
          comparison = aValue.localeCompare(bValue) * sortOrder;
        }
      } else {
        // Default to modified time for GroupedResults
        comparison = (a.updatedTime - b.updatedTime) * sortOrder;
      }

      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

/**
 * Builds a markdown table from the results
 * @param tableResults Results to display in the table
 * @param columnCount Count of occurrences for each column
 * @param savedQuery Saved query configuration
 * @param tagSettings Configuration for tag formatting
 * @param nColumns Maximum number of columns to display
 * @returns Tuple of [table string, column names]
 */
function buildTable(
  tableResults: TableResult[], 
  columnCount: { [key: string]: number }, 
  savedQuery: QueryRecord, 
  tagSettings: TagSettings, 
  nColumns: number = 0
): [string, string[]] {
  // Select the top N tags
  let tableColumns = Object.keys(columnCount).sort((a, b) => columnCount[b] - columnCount[a] || a.localeCompare(b));
  const metaCols = ['line', 'modified', 'created', 'notebook', 'title'];
  const includeCols = savedQuery?.options?.includeCols?.split(',').map(col => col.trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' '));
  const excludeCols = savedQuery?.options?.excludeCols?.split(',').map(col => col.trim().replace(RegExp(tagSettings.spaceReplace, 'g'), ' '));
  if (includeCols?.length > 0) {
    // Include columns (ignore missing), respect given order
    tableColumns = includeCols.filter(col => 
      tableColumns.includes(col) ||
      metaCols.includes(col)
    );
  } else {
    // When includeCols is not specified, add default columns
    if (nColumns > 0) {
      // Select the top N tags
      tableColumns = tableColumns.slice(0, nColumns);
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

  let resultsString = `\n| ${tableColumns.map(col => formatTag(col, tagSettings)).join(' | ')} |\n`;
  resultsString += `|${tableColumns.map((col) => col === 'title' ? '---' : ':---:').join('|')}|\n`;
  for (const result of tableResults) {
    if (Object.keys(result.tags).length === 0) { continue; }
    let row = '|';
    for (let column of tableColumns) {
      column = column.toLowerCase();
      if (column === 'title') {
        row += ` [${result.title}](:/${result.externalId}) |`;
      } else if (column === 'notebook') {
        row += ` ${result.notebook} |`;
      } else if (column === 'line') {
        row += ` ${result.lineNumbers.map(line => line + 1).join(', ')} |`;
      } else if (column === 'modified') {
        row += ` ${new Date(result.updatedTime).toISOString().replace('T', ' ').slice(0, 19)} |`;
      } else if (column === 'created') {
        row += ` ${new Date(result.createdTime).toISOString().replace('T', ' ').slice(0, 19)} |`;
      } else {
        const tagValue = result.tags[column] || '';
        if (!tagValue) {
          row += ' |';
        } else if (tagValue === column) {
          row += ' + |';
        } else {
          row += ` ${formatTag(tagValue.replace(RegExp(column + '/', 'g'), ''), tagSettings)} |`;
        }
      }
    }
    resultsString += row + '\n';
  }
  tableColumns = tableColumns.filter(col => !metaCols.includes(col));
  return [resultsString, tableColumns];
}

/**
 * Formats a tag according to the specified settings
 * @param tag Tag string to format
 * @param tagSettings Configuration for tag formatting
 * @returns Formatted tag string
 */
function formatTag(tag: string, tagSettings: TagSettings): string {
  if (tagSettings.tableCase === 'title') {
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
 * @throws Will show a dialog if no table columns are available
 */
export async function createTableEntryNote(
  currentTableColumns: string[], 
  currentTableDefaultValues: Record<string, string>
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
      tagList.push('  - ' + column);
    } else {
      frontmatter.push(`${column}: ${currentTableDefaultValues[column]}`);
    }
  });
  if (tagList.length > 0) {
    frontmatter.push('tags: \n' + tagList.join('\n'));
  }
  frontmatter.push('---\n');

  // Create new note with frontmatter
  let note = await joplin.data.post(['notes'], null, {
    parent_id: (await joplin.workspace.selectedNote()).parent_id,
    title: 'New table entry',
    body: frontmatter.join('\n'),
  });

  // Open the new note
  await joplin.commands.execute('openNote', note.id);
  note = clearObjectReferences(note);
}