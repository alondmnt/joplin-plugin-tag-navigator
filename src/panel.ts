import joplin from 'api';

export async function updatePanel(panel: string, tagsLines: { tag: string, lines: number[], count: number, index: number }[]) {
  const html = tagsLines.map((tag) => {
    return `
      <a class="itags-panel-section" href="#" data-tag="${tag.tag}" data-line="${tag.lines[tag.index]}">
      #${tag.tag} (${tag.count})
      </a>
    `;
  }).join('');

  await joplin.views.panels.setHtml(panel, html);
}
