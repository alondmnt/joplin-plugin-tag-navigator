import joplin from 'api';
import { GroupedResult } from './search';

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
    , 1000
  );
}
