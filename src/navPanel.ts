import joplin from 'api';
import { parseTagsLines, parseTagsFromFrontMatter } from './parser';
import { getTagSettings } from './settings';
import { DatabaseManager } from './db';

interface TagNode {
  count: number;
  children: {
    [key: string]: TagNode;
  };
}

export interface TagCount {
  [tag: string]: number;
}

export interface TagLine {
  tag: string;
  lines: number[];
  count: number;
  index: number;
}

export async function getNavTagLines(body: string): Promise<[TagLine[], TagCount]> {
  const tagSettings = await getTagSettings();
  tagSettings.inheritTags = false;
  tagSettings.nestedTags = false;  // Get only child tags
  const tagLines = [...parseTagsFromFrontMatter(body, tagSettings), ...parseTagsLines(body, tagSettings)];
  // Get only unique tags
  const uniqueTagLines = tagLines.filter((tagLine, index, self) =>
    index === self.findIndex((t) => t.tag === tagLine.tag)
  );
  const tagCount = DatabaseManager.getDatabase().getAllTagCounts(tagSettings.valueDelim)
  return [uniqueTagLines, tagCount];
}

export async function updateNavPanel(panel: string, tagsLines: TagLine[], tagCount: TagCount) {
  const navSettings = await joplin.settings.values([
    'itags.navPanelScope',
    'itags.navPanelStyle',
    'itags.navPanelSort',
    'itags.navPanelHidePrefix',
    'itags.tagPrefix',
  ]);
  const selectedTab = navSettings['itags.navPanelScope'] as 'global' | 'note';
  const userStyle = navSettings['itags.navPanelStyle'] as string;
  const tagSort = navSettings['itags.navPanelSort'] as 'name' | 'count';
  const hidePrefix = navSettings['itags.navPanelHidePrefix'] as boolean;
  const tagPrefix = navSettings['itags.tagPrefix'] as string || '#';

  // Sort tagsLines by tag name
  if (tagSort === 'count') {
    tagsLines = tagsLines.sort((a, b) => b.count - a.count);
  } else {
    tagsLines = tagsLines.sort((a, b) => a.tag.localeCompare(b.tag));
  }
  // Build the list of current note tags
  const noteTagsHTML = tagsLines.map((tag) => {
    const displayTag = hidePrefix && tag.tag.startsWith(tagPrefix)
      ? tag.tag.slice(tagPrefix.length) : tag.tag;
    let indexText = '';
    if (tag.count > 1) {
      indexText = `<span>(${tag.index+1}/${tag.count})</span>`;
    }
    return `
      <a class="itags-nav-noteTag" href="#" data-tag="${tag.tag}" data-line="${tag.lines[tag.index]}">
      ${displayTag} ${indexText}
      </a><br/>
    `;
  }).join('');

  // Build the tree of all tags
  const tagTree = buildTagTree(tagCount);
  const tagTreeHTML = buildTreeHTML(tagTree.children, '', tagSort, hidePrefix, tagPrefix);
  
  // Clear tree to prevent memory leaks (import clearObjectReferences at top)
  const { clearObjectReferences } = await import('./memory');
  clearObjectReferences(tagTree);

  let strGlobalDisplay = 'block';
  let strNoteDisplay = 'none';
  let strGlobalSelected = 'selectedTab';
  let strNoteSelected = '';
  if (selectedTab === 'note') {
    strGlobalDisplay = 'none';
    strNoteDisplay = 'block';
    strGlobalSelected = '';
    strNoteSelected = 'selectedTab';
  }
  const html = `
    <style>${userStyle}</style>
    <div id="itags-nav-tabArea">
      <span class="${strGlobalSelected}" id="itags-nav-globalButton">All Tags</span>
      <span class="${strNoteSelected}" id="itags-nav-noteButton">Note Tags</span>
    </div>
    <div id="itags-nav-globalArea" style="display: ${strGlobalDisplay}">
      ${tagTreeHTML}
    </div>
    <div id="itags-nav-noteArea" style="display: ${strNoteDisplay}">
      ${noteTagsHTML}
    </div>
  `;

  await joplin.views.panels.setHtml(panel, html);
  await joplin.views.panels.addScript(panel, 'navPanelStyle.css');
  await joplin.views.panels.addScript(panel, 'navPanelScript.js');
}

function buildTagTree(tagCount: TagCount): TagNode {
  const root: TagNode = { count: 0, children: {} };

  for (const tag in tagCount) {
    if (tagCount[tag] === 0) continue; // Ignore tags with count 0

    const parts = tag.split('/');
    let current: TagNode = root;

    parts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = {
          count: 0,
          children: {}
        };
      }
      if (index === parts.length - 1) {
        current.children[part].count = tagCount[tag];
      }
      current = current.children[part];
    });
  }

  return root;
}


/** Build HTML for the tag tree, optionally stripping tagPrefix from display names. */
function buildTreeHTML(
  tagTree: TagNode['children'],
  parentTag: string = '',
  sortBy: 'name' | 'count' = 'name',
  hidePrefix = false,
  tagPrefix: string = '#',
  level: number = 0,
): string {
  let html = '';

  const entries = Object.entries(tagTree);

  // Sorting entries based on sortBy parameter
  entries.sort((a, b) => {
    if (sortBy === 'count') {
      return b[1].count - a[1].count; // Descending order by count
    } else {
      return a[0].localeCompare(b[0]); // Ascending order by name
    }
  });

  entries.forEach(([tag, { count, children }]) => {
    if (count === 0) { return; } // Ignore tags with count 0

    const fullTag = parentTag ? `${parentTag}/${tag}` : tag;
    const tagName = hidePrefix && fullTag.startsWith(tagPrefix)
      ? fullTag.slice(tagPrefix.length) : fullTag;
    const indentStyle = `style="padding-left: ${level > 0 ? 31 : 18}px;"`;
    const detailsStyle = `style="padding-left: ${level > 0 ? 18 : 5}px;"`;

    if (Object.keys(children).length > 0) {
      html += `<details ${detailsStyle}><summary><a href="#" class="itags-nav-globalTag" data-tag="${fullTag}" style="padding-left: 0px;">${tagName} <span>(${count})</span></a></summary>${buildTreeHTML(children, fullTag, sortBy, hidePrefix, tagPrefix, level + 1)}</details>`;
    } else {
      html += `<a href="#" class="itags-nav-globalTag" data-tag="${fullTag}" ${indentStyle}>${tagName} <span>(${count})</span></a><br/>`;
    }
  });

  return html;
}
