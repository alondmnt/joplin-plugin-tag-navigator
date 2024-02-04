import joplin from 'api';

export async function updatePanel(panel: string, tagsLines: { tag: string, lines: number[], count: number }[]) {
  const html = tagsLines.map((tag) => {
    return `
      <details>
        <summary>#${tag.tag} (${tag.count})</summary>
        <div>
          ${tag.lines.map((line) => `
            <a class="itags-panel-section" href="#" data-line="${line}">
            L${String(line).padStart(4, '0')}
            </a><br>
          `).join('')}
        </div>
      </details>
    `;
  }).join('');

  await joplin.views.panels.setHtml(panel, html);
}
