import joplin from 'api';
import { getTagSettings, TagSettings, resultsEnd, resultsStart } from './settings';
import { clearNoteReferences } from './utils';
import { loadQuery, normalizeTextIndentation } from './searchPanel';
import { GroupedResult, TaggedResult, runSearch } from './search';
import { parseTagsLines, TagLineInfo } from './parser';

export async function displayInAllNotes(db: any) {
  // Display results in notes
  const tagSettings = await getTagSettings();
  const nColumns = await joplin.settings.value('itags.tableColumns');
  const noteIds = db.getResultNotes();
  for (const id of noteIds) {
    let note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'id'] });
    await displayResultsInNote(db, note, tagSettings, nColumns);
    note = clearNoteReferences(note);
  }
}

export async function displayResultsInNote(db: any, note: any, tagSettings: TagSettings, nColumns: number=10) {
  if (!note.body) { return; }
  const savedQuery = await loadQuery(db, note);
  if (!savedQuery) { return; }
  if (savedQuery.displayInNote !== 'list' && savedQuery.displayInNote !== 'table') { return; }

  const results = await runSearch(db, savedQuery.query);
  const filteredResults = await filterAndSortResults(results, (savedQuery.displayInNote === 'list') ? savedQuery.filter : '');

  if (filteredResults.length === 0) { return; }

  let resultsString = resultsStart;
  if (savedQuery.displayInNote === 'list') {
    // Create the results string
    for (const result of filteredResults) {
      resultsString += `\n## ${result.title} [>](:/${result.externalId})\n\n`;
      for (let i = 0; i < result.text.length; i++) {
        resultsString += `${normalizeTextIndentation(result.text[i])}\n\n---\n`;
      }
    }

  } else if (savedQuery.displayInNote === 'table') {
    // Parse tags from results and accumulate counts
    const [taggedResults, allTags] = await processTagsForResults(filteredResults, tagSettings);
    // Select the top N tags
    let columns = Object.keys(allTags).sort((a, b) => allTags[b] - allTags[a]);
    if (nColumns > 0) {
      columns = columns.slice(0, nColumns);
    }
    // Create the results string as a table
    resultsString += `\n| Note | Notebook | Line | ${columns.join(' | ')} |\n`;
    resultsString += `|------|----------|------|${columns.map(() => ':---:').join('|')}|\n`;
    for (const result of taggedResults) {
      let row = `| [${result.title}](:/${result.externalId}) | ${result.notebook} | ${result.lineNumbers.map(line => line + 1).join(', ')} |`;
      for (const column of columns) {
        const tagValue = result.tags[column] || '';
        if (!tagValue) {
          row += ' |';
        } else if (tagValue === column) {
          row += ' + |';
        } else {
          row += ` ${tagValue.substring(column.length + 1)} |`;
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

async function processTagsForResults(filteredResults: GroupedResult[], tagSettings: TagSettings): Promise<[TaggedResult[], { [key: string]: number }]> {
  const allTags: { [key: string]: number } = {};

  // Process tags for each result
  const taggedResults = await Promise.all(filteredResults.map(async result => {
    const [taggedResult, tagInfo] = await processTagsForResult(result, tagSettings);

    // Update global tag counts
    tagInfo.forEach(info => {
      if (info.parent) {
        allTags[info.tag] = (allTags[info.tag] || 0) + info.count;
      }
    });

    return taggedResult;
  }));

  return [taggedResults, allTags];
}

async function processTagsForResult(result: GroupedResult, tagSettings: TagSettings): Promise<[TaggedResult, TagLineInfo[]]> {
  const taggedResult = result as TaggedResult;
  const fullText = result.text.join('\n');
  tagSettings.nestedTags = true;
  const tagInfo = (await parseTagsLines(fullText, tagSettings))
    .map(info => ({...info, tag: info.tag.replace(RegExp(tagSettings.spaceReplace, 'g'), ' ')}));

  // Create a mapping from column (parent tag) to value (child tag)
  taggedResult.tags = tagInfo
    .filter(info => info.child)
    .reduce((acc, info) => {
      const parent = tagInfo.find(
        parentInfo =>
          parentInfo.parent &&
          info.tag.startsWith(parentInfo.tag)
      );
      acc[parent.tag] = info.tag;
      return acc;
    }, {} as {[key: string]: string});

  return [taggedResult, tagInfo];
}
