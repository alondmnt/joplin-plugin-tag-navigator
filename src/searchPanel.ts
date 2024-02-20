import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import { GroupedResult } from './search';
import { getTagRegex } from './parser';

export async function registerSearchPanel(panel: string) {
  await joplin.views.panels.setHtml(panel, `
    <div id="itags-search-inputTagArea">
      <input type="text" id="itags-search-tagFilter" placeholder="Filter tags..." />
      <button id="itags-search-tagClear">Clear</button>
      <button id="itags-search-tagSearch">Search</button>
    </div>
    <div id="itags-search-tagList"></div>
    <div id="itags-search-queryArea"></div>
    <div id="itags-search-inputResultArea">
      <input type="text" id="itags-search-resultFilter" placeholder="Filter results..." />
      <select id="itags-search-resultSort">
        <option value="modified">Modified</option>
        <option value="created">Created</option>
        <option value="title">Title</option>
        <option value="path">Notebook</option>
      </select>
      <button id="itags-search-resultToggle"><i class="fas fa-chevron-up"></i></button>
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

export async function updatePanelTagData(panel: string, tags: string[]) {
  const intervalID = setInterval(
    () => {
      if(joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateTagData',
          tags: JSON.stringify(tags),
        });
      }
    }
    , 5000
  );
}

export async function updatePanelResults(panel: string, results: GroupedResult[]) {
  const tagRegex = await getTagRegex();
  const intervalID = setInterval(
    () => {
      if(joplin.views.panels.visible(panel)) {
        joplin.views.panels.postMessage(panel, {
          name: 'updateResults',
          results: JSON.stringify(renderHTML(results, tagRegex)),
        });
      }
      clearInterval(intervalID);
    }
    , 200
  );
}

function renderHTML(groupedResults: GroupedResult[], tagRegex: RegExp): GroupedResult[] {
  const md = new MarkdownIt({ html: true });
  for (const group of groupedResults) {
    for (const section of group.text) {
      group.html.push(md.render(section
        .replace(tagRegex, '<span class="itags-search-renderedTag">$&</span>')
        .trim()));
    }
  }
  return groupedResults;
}
