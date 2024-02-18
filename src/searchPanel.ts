import joplin from 'api';
import * as MarkdownIt from 'markdown-it';
import { GroupedResult } from './search';
import { getTagRegex } from './parser';

export async function registerSearchPanel(panel: string) {
  await joplin.views.panels.setHtml(panel, `
    <div id="userInput">
      <input type="text" id="tagFilter" placeholder="Filter tags..." />
      <button id="clearButton">Clear</button>
      <button id="searchButton">Search</button>
    </div>
    <div id="tagList"></div>
    <div id="queryArea"></div>
    <div id='resultsArea'></div>
  `);
  await joplin.views.panels.addScript(panel, 'searchPanelStyle.css');
  await joplin.views.panels.addScript(panel, 'searchPanelScript.js');
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
        .replace(tagRegex, '<span class="renderedTag">$&</span>')
        .trim()));
    }
  }
  return groupedResults;
}
