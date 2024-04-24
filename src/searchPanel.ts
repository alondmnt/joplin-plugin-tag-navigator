import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import * as markdownItTaskLists from 'markdown-it-task-lists';
import { queryEnd, queryStart } from './settings';
import { GroupedResult, Query } from './search';
import { getTagRegex } from './parser';
import { getNoteId } from './db';

const findQuery = new RegExp(`[\n]+${queryStart}[\\s\\S]*?${queryEnd}`);

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
      <button id="itags-search-resultOrder" title="Reverse order"><i class="fas fa-sort-amount-up"></i></button>
      <button id="itags-search-resultToggle" title="Collapse / expand"><i class="fas fa-chevron-up"></i></button>
    </div>
    <div id='itags-search-resultsArea'></div>
  `);
  await joplin.views.panels.addScript(panel, 'searchPanelStyle.css');
  await joplin.views.panels.addScript(panel, 'searchPanelScript.js');
}

export async function focusSearchPanel(panel: string) {
  if (joplin.views.panels.visible(panel)) {
    joplin.views.panels.postMessage(panel, {
      name: 'focusTagFilter',
    });
  }
}

export async function updatePanelResults(panel: string, results: GroupedResult[], query: Query[][]) {
  const resultMarker = await joplin.settings.value('itags.resultMarker');
  const tagRegex = await getTagRegex();
  const intervalID = setInterval(
    () => {
      if(joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateResults',
          results: JSON.stringify(renderHTML(results, tagRegex, resultMarker)),
          query: JSON.stringify(query),
        });
      }
      clearInterval(intervalID);
    }
    , 200
  );
}

export async function updatePanelSettings(panel: string) {
  const settings = {
    resultSort: await joplin.settings.value('itags.resultSort'),
    resultOrder: await joplin.settings.value('itags.resultOrder'),
    resultToggle: await joplin.settings.value('itags.resultToggle'),
    resultMarker: await joplin.settings.value('itags.resultMarker'),
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

function renderHTML(groupedResults: GroupedResult[], tagRegex: RegExp, resultMarker: boolean): GroupedResult[] {
  const md = new MarkdownIt({ html: true }).use(markdownItTaskLists, { enabled: true });
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  
  for (const group of groupedResults) {
    group.html = []; // Ensure group.html is initialized as an empty array if not already done
    for (const section of group.text) {
      let processedSection = normalizeTextIndentation(section);
      if (resultMarker) {
        // Process each section by lines to track line numbers accurately
        const lines = processedSection.split('\n');
        processedSection = lines.map((line, lineNumber) => 
          replaceOutsideBackticks(line, tagRegex, `<span class="itags-search-renderedTag" data-line-number="${lineNumber}">$&</span>`)
        ).join('\n');
      }
      processedSection = processedSection
        .replace(wikiLinkRegex, '<a href="#$1">$1</a>');
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

function normalizeTextIndentation(text: string): string {
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

export async function setCheckboxState(message: any) {
  // This function modifies the checkbox state in a markdown task list item
  // line: The markdown string containing the task list item, possibly indented
  // text: The text of the task list item, in order to ensure that the line matches
  // checked: A boolean indicating the desired state of the checkbox (true for checked, false for unchecked)
  const note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Remove the leading checkbox from the text
  const text = message.text.replace(/^\s*-\s*\[[x ]\]\s*/, '');
  // Check the line to see if it contains the text
  if (!line.includes(text)) {
    console.log('Error in setCheckboxState: The line does not contain the expected text.');
    lines[message.line] = line;
  }

  if (message.checked) {
    // If checked is true, ensure the checkbox is marked as checked (- [x])
    // \s* accounts for any leading whitespace
    lines[message.line] = line.replace(/^(\s*-\s*\[)\s(\])/g, '$1x$2');
  } else {
    // If checked is false, ensure the checkbox is marked as unchecked (- [ ])
    lines[message.line] = line.replace(/^(\s*-\s*\[)x(\])/g, '$1 $2');
  }

  const newBody = lines.join('\n');
  updateNote(message, newBody);
}

export async function removeTagFromText(message: any) {
  const note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.log('Error in removeTagFromText: The line does not contain the expected text.');
    console.log('Line:', line);
    console.log('Text:', message.text);
    return line;
  }

  // Remove the tag and any leading space from the line
  const tagRegex = new RegExp(`\\s*${message.tag}`);
  lines[message.line] = line.replace(tagRegex, '');

  const newBody = lines.join('\n');
  await updateNote(message, newBody);
}

export async function renameTagInText(message: any) {
  const note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.log('Error in renameTagInText: The line does not contain the expected text.');
    console.log('Line:', line);
    console.log('Text:', message.text);
    return line;
  }

  // Replace the old tag with the new tag
  lines[message.line] = line.replace(message.oldTag, message.newTag);
  const newBody = lines.join('\n');
  await updateNote(message, newBody);
}

export async function addTagToText(message: any) {
  const note = await joplin.data.get(['notes', message.externalId], { fields: ['body'] });
  const lines: string[] = note.body.split('\n');
  const line = lines[message.line];

  // Check the line to see if it contains the text
  if (!line.includes(message.text)) {
    console.log('Error in addTagToText: The line does not contain the expected text.');
    console.log('Line:', line);
    console.log('Text:', message.text);
    return line;
  }

  // Add the tag to the line
  lines[message.line] = `${line} ${message.tag}`;
  const newBody = lines.join('\n');
  await updateNote(message, newBody);
}

async function updateNote(message: any, newBody: string) {
  const selectedNote = await joplin.workspace.selectedNote();
  if ((selectedNote.id === message.externalId) && (newBody !== selectedNote.body)) {
    // Update note editor if it's the currently selected note
    await joplin.commands.execute('editor.setText', newBody);
    await joplin.commands.execute('editor.execCommand', {
      name: 'scrollToTagLine',
      args: [message.line]
    });
  }
  await joplin.data.put(['notes', message.externalId], null, { body: newBody });
}

export async function saveQuery(query: string, filter: string) {
  // Save the query into the current note
  const note = await joplin.workspace.selectedNote();
  if (!note) {
    return;
  }

  if (findQuery.test(note.body)) {
    if (query === '[]') {
      note.body = note.body.replace(findQuery, '');
    } else {
      note.body = note.body.replace(findQuery, `\n\n${queryStart}\n${query}\n${filter}\n${queryEnd}`);
    }
  } else {
    note.body = `${note.body.replace(/\s+$/, '')}\n\n${queryStart}\n${query}\n${filter}\n${queryEnd}`;
    // trimming trailing spaces in note body before insertion
  }

  await joplin.data.put(['notes', note.id], null, { body: note.body });
  await joplin.commands.execute('editor.setText', note.body);
}

export async function loadQuery(db:any, text: string): Promise<{ query: string, filter: string, displayInNote: boolean }> {
  const query = text.match(findQuery);
  if (query) {
    const queryParts = query[0].trim().split('\n').slice(1, -1);
    return {
      query: await testQuery(db, queryParts[0]),
      filter: queryParts[1],
      displayInNote: parseInt(queryParts[2]) ? true : false,
    };
  } else {
    return { query: '', filter: '', displayInNote: false };
  }
}

async function testQuery(db: any, query: string) {
  let queryGroups = JSON.parse(query);
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
        const newExternalId = await getNoteId(db, condition.externalId, condition.title);
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
  queryGroups = queryGroups.filter((group: any) => group.length > 0);

  return JSON.stringify(queryGroups);
}

export async function updateQuery(panel: string, query: string, filter: string) {
  // Send the query to the search panel
  if (!query) {
    return;
  }
  if (joplin.views.panels.visible(panel)) {
    joplin.views.panels.postMessage(panel, {
      name: 'updateQuery',
      query: query,
      filter: filter,
    });
  }
}