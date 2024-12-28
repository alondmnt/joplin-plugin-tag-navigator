import joplin from 'api';
import { getTagSettings, TagSettings, resultsEnd, resultsStart } from './settings';
import { clearObjectReferences } from './utils';
import { formatFrontMatter, loadQuery, normalizeTextIndentation, QueryRecord } from './searchPanel';
import { GroupedResult, Query, runSearch } from './search';
import { TagLineInfo } from './parser';
import { NoteDatabase } from './db';

interface TableResult extends GroupedResult {
  tags: { [key: string]: string };
}

export async function displayInAllNotes(db: any) {
  // Display results in notes
  const tagSettings = await getTagSettings();
  const nColumns = await joplin.settings.value('itags.tableColumns');
  const noteIds = db.getResultNotes();
  for (const id of noteIds) {
    let note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    await displayResultsInNote(db, note, tagSettings, nColumns);
    note = clearObjectReferences(note);
  }
}

export async function displayResultsInNote(db: any, note: any, tagSettings: TagSettings, nColumns: number=10): Promise<{ tableColumns: string[], tableDefaultValues: { [key: string]: string } }> {
  if (!note.body) { return null; }
  const savedQuery = await loadQuery(db, note);
  if (!savedQuery) { return null; }
  if (savedQuery.displayInNote !== 'list' && savedQuery.displayInNote !== 'table') { return null; }

  const results = await runSearch(db, savedQuery.query);
  const filteredResults = await filterAndSortResults(results, savedQuery.filter, savedQuery.options);

  if (filteredResults.length === 0) {
    await removeResults(note);
    return null;
  }

  let resultsString = resultsStart + '\nDisplaying ' + filteredResults.length + ' notes\n';
  let tableColumns: string[] = [];
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
    resultsString += buildTable(tableResults, columnCount, savedQuery, tagSettings, nColumns);
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
    currentNote = clearObjectReferences(currentNote);
  }

  return { tableColumns, tableDefaultValues };
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
    currentNote = clearObjectReferences(currentNote);
  }
}

// Filter and sort results, like the search panel
async function filterAndSortResults(results: GroupedResult[], filter: string, options?: { sortBy?: string, sortOrder?: string }): Promise<GroupedResult[]> {
  // Sort results
  const sortBy = options?.sortBy || await joplin.settings.value('itags.resultSort');
  const sortOrder = options?.sortOrder || await joplin.settings.value('itags.resultOrder');
  let sortedResults = results.sort((a, b) => {
    if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
    } else if (sortBy === 'created') {
        return a.createdTime - b.createdTime;
    } else if (sortBy === 'notebook') {
        return a.notebook.localeCompare(b.notebook);
    } else {
      // Default: modified time
      return a.updatedTime - b.updatedTime;
    }
  });
  if (sortOrder.startsWith('desc')) {
      sortedResults = sortedResults.reverse();
  }
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

async function processResultsForTable(filteredResults: GroupedResult[], db: NoteDatabase, tagSettings: TagSettings, savedQuery: QueryRecord): Promise<[TableResult[], { [key: string]: number }, { [key: string]: string }]> {
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
  const sortBy = savedQuery?.options?.sortBy?.toLowerCase();
  tableResults = tableResults.sort((a, b) => {
    if (sortBy === 'created') {
        return a.createdTime - b.createdTime;
    } else if (sortBy === 'modified') {
        return a.updatedTime - b.updatedTime;
    } else if (sortBy === 'notebook') {
        return a.notebook.localeCompare(b.notebook);
    } else if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    } else if (sortBy) {
      const aValue = a.tags[sortBy]?.replace(sortBy + '/', '') || '';
      const bValue = b.tags[sortBy]?.replace(sortBy + '/', '') || '';
      // Handle numeric strings by converting to numbers if possible
      const aNum = Number(aValue);
      const bNum = Number(bValue);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return aValue.localeCompare(bValue);
    }
  });
  if (savedQuery?.options?.sortOrder?.toLowerCase().startsWith('desc')) {
    tableResults = tableResults.reverse();
  }

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

async function processResultForTable(result: GroupedResult, db: NoteDatabase, tagSettings: TagSettings): Promise<[TableResult, TagLineInfo[]]> {
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

function buildTable(tableResults: TableResult[], columnCount: { [key: string]: number }, savedQuery: QueryRecord, tagSettings: TagSettings, nColumns: number=0): string {
  // Select the top N tags
  let tableColumns = Object.keys(columnCount).sort((a, b) => columnCount[b] - columnCount[a] || a.localeCompare(b));
  const options = savedQuery?.options;
  if (options?.includeCols?.length > 0) {
    // Include columns (ignore missing), respect given order
    tableColumns = options.includeCols.filter(col => 
      tableColumns.includes(col) ||
      ['line', 'updated time', 'created time', 'notebook'].includes(col)
    );
  } else {
    // When includeCols is not specified, add default columns
    if (nColumns > 0) {
      // Select the top N tags
      tableColumns = tableColumns.slice(0, nColumns);
    }
    if (!options?.excludeCols?.includes('line')) {
      tableColumns.unshift('line');
    }
    if (!options?.excludeCols?.includes('notebook')) {
      tableColumns.unshift('notebook');
    }
  }
  tableColumns.unshift('title');
  if (options?.excludeCols?.length > 0) {
    // Exclude columns (ignore missing)
    tableColumns = tableColumns.filter(col => !savedQuery.options.excludeCols.includes(col));
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
  return resultsString;
}

function formatTag(tag: string, tagSettings: TagSettings) {
  if (tagSettings.tableCase === 'title') {
    return tag.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  return tag.toLowerCase();
}

export async function createTableEntryNote(currentTableColumns: string[], currentTableDefaultValues: { [key: string]: string }) {
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