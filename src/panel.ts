import joplin from 'api';

export async function updatePanel(panel: string, tagsLines: { tag: string, lines: number[], count: number, index: number }[]) {
  const html = tagsLines.map((tag) => {
    let indexText = '';
    if (tag.count > 1) {
      indexText = `(${tag.index+1}/${tag.count})`;
    }
    return `
      <a class="itags-panel-tag" href="#" data-tag="${tag.tag}" data-line="${tag.lines[tag.index]}">
      ${tag.tag} ${indexText}
      </a>
    `;
  }).join('');

  await joplin.views.panels.setHtml(panel, html);
}
