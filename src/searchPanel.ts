import joplin from 'api';
import { getAllTags } from './db';

export async function updateSearchPanel(panel: string, db: any) {
  const allTags = (await getAllTags(db)).sort((a: any, b: any) => a.localeCompare(b));
  const tagsScript = `<script id="tagData" type="application/json">${JSON.stringify(allTags)}</script>`;

  await joplin.views.panels.setHtml(panel, `
    <div id="userInput">
      <input type="text" id="tagFilter" placeholder="Filter tags..." />
      <button id="clearButton">Clear</button>
      <button id="searchButton">Search</button>
    </div>
    <div id="tagList"></div>
    <div id="queryArea"></div>
    ${tagsScript}
  `);
}