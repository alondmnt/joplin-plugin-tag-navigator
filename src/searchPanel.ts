import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import * as markdownItTaskLists from 'markdown-it-task-lists';
import { GroupedResult, Query } from './search';
import { getTagRegex } from './parser';

const queryStart = '<!-- itags-query-start -->';
const queryEnd = '<!-- itags-query-end -->';
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
  const modifiedTagRegex = new RegExp(`(?<!\`[^\\\`]*)${tagRegex.source}(?![^\\\`]*\`)`, 'g');
  for (const group of groupedResults) {
    for (const section of group.text) {
      let processedSection = section.trim();
      if (resultMarker) {
        processedSection = processedSection
          .replace(modifiedTagRegex, '<span class="itags-search-renderedTag">$&</span>')
      }
      group.html.push(md.render(processedSection));
    }
  }
  return groupedResults;
}

export function setCheckboxState(line: string, text: string, checked: boolean) {
  // This function modifies the checkbox state in a markdown task list item
  // line: The markdown string containing the task list item, possibly indented
  // text: The text of the task list item, in order to ensure that the line matches
  // checked: A boolean indicating the desired state of the checkbox (true for checked, false for unchecked)

  // Remove the leading checkbox from the text
  text = text.replace(/^\s*-\s*\[[x ]\]\s*/, '');
  // Check the line to see if it contains the text
  if (!line.includes(text)) {
    console.log('Error in setCheckboxState: The line does not contain the expected text.');
    return line;
  }

  if (checked) {
    // If checked is true, ensure the checkbox is marked as checked (- [x])
    // \s* accounts for any leading whitespace
    return line.replace(/^(\s*-\s*\[)\s(\])/g, '$1x$2');
  } else {
    // If checked is false, ensure the checkbox is marked as unchecked (- [ ])
    return line.replace(/^(\s*-\s*\[)x(\])/g, '$1 $2');
  }
}

export async function saveQuery(query: string, filter: string) {
  // Save the query into the current note
  const note = await joplin.workspace.selectedNote();
  if (!note) {
    return;
  }

  if (note.body.includes(queryStart) && note.body.includes(queryEnd)) {
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

export async function loadQuery(text: string): Promise<{ query: string, filter: string }> {
  const query = text.match(findQuery);
  if (query) {
    const queryParts = query[0].trim().split('\n').slice(1, -1);
    return {
      query: queryParts[0],
      filter: queryParts[1],
    };
  } else {
    return { query: '', filter: '' };
  }
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