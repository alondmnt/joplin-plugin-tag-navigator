import joplin from 'api';
import { getTagSettings, TagSettings, resultsEnd, resultsStart } from './settings';
import { clearObjectReferences } from './utils';
import { formatFrontMatter, loadQuery, normalizeTextIndentation } from './searchPanel';
import { GroupedResult, runSearch } from './search';
import { parseTagsFromFrontMatter, parseTagsLines, TagLineInfo } from './parser';
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

export async function displayResultsInNote(db: any, note: any, tagSettings: TagSettings, nColumns: number=10) {
  if (!note.body) { return; }
  const savedQuery = await loadQuery(db, note);
  if (!savedQuery) { return; }
  if (savedQuery.displayInNote !== 'list' && savedQuery.displayInNote !== 'table') { return; }

  const results = await runSearch(db, savedQuery.query);
  const filteredResults = await filterAndSortResults(results, savedQuery.filter);

  if (filteredResults.length === 0) {
    await removeResults(note);
    return;
  }

  let resultsString = resultsStart;
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
    const [tableResults, allTags] = await processResultsForTable(filteredResults, db);
    // Select the top N tags
    let columns = Object.keys(allTags).sort((a, b) => allTags[b] - allTags[a] || a.localeCompare(b));
    if (nColumns > 0) {
      columns = columns.slice(0, nColumns);
    }
    // Create the results string as a table
    resultsString += `\n| Note | Notebook | Line | ${columns.join(' | ')} |\n`;
    resultsString += `|------|----------|------|${columns.map(() => ':---:').join('|')}|\n`;
    for (const result of tableResults) {
      if (Object.keys(result.tags).length === 0) { continue; }
      let row = `| [${result.title}](:/${result.externalId}) | ${result.notebook} | ${result.lineNumbers.map(line => line + 1).join(', ')} |`;
      for (const column of columns) {
        const tagValue = result.tags[column] || '';
        if (!tagValue) {
          row += ' |';
        } else if (tagValue === column) {
          row += ' + |';
        } else {
          row += ` ${tagValue.replace(RegExp(column + '/', 'g'), '')} |`;
        }
      }
      resultsString += row + '\n';
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
    currentNote = clearObjectReferences(currentNote);
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
    currentNote = clearObjectReferences(currentNote);
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

async function processResultsForTable(filteredResults: GroupedResult[], db: NoteDatabase): Promise<[TableResult[], { [key: string]: number }]> {
  const allTags: { [key: string]: number } = {};

  // Process tags for each result
  const tableResults = await Promise.all(filteredResults.map(async result => {
    const [tableResult, tagInfo] = await processResultForTable(result, db);

    // Update global tag counts
    tagInfo.forEach(info => {
      if (info.parent) {
        // Count the number of notes each tag appears in
        allTags[info.tag] = (allTags[info.tag] || 0) + 1;
      }
    });

    return tableResult;
  }));

  return [tableResults, allTags];
}

async function processResultForTable(result: GroupedResult, db: NoteDatabase): Promise<[TableResult, TagLineInfo[]]> {
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
        const existingTag = tagInfo.find(t => t.tag === tag);
        if (existingTag) {
          existingTag.count += 1;
          existingTag.lines.push(line);
          existingTag.lines = [...new Set(existingTag.lines)];
        } else {
          tagInfo.push({
            tag: tag,
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
