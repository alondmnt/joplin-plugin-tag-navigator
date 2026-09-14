/**
 * Tests for the search panel's result cards.
 *
 * `searchPanelScript.js` is a webview script rather than a module, so it is loaded the
 * way Joplin loads it: inject the source into a DOM that carries the panel skeleton from
 * searchPanel.ts, then call initPanel(). Everything below drives the real script.
 *
 * What is worth testing here is the note row - the heading, the footer, or neither - and
 * the controls each location leaves on the card. Those controls are easy to strand: the
 * collapse click and the grouping menu live on whichever element carries the note, so a
 * location that renders no such element has to answer for both.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

/** The panel skeleton, matching the markup searchPanel.ts adds to the webview. */
const PANEL_HTML = `<!doctype html><html><body>
<div id="itags-search-inputTagArea"><input type="text" id="itags-search-tagFilter"/><button id="itags-search-tagClear"></button><button id="itags-search-saveQuery"></button><button id="itags-search-tagSearch"></button></div>
<div id="itags-search-tagList"></div>
<div id="itags-search-tagRangeArea"><input type="text" id="itags-search-tagRangeMin"/><input type="text" id="itags-search-tagRangeMax"/><button id="itags-search-tagRangeAdd"></button></div>
<div id="itags-search-inputNoteArea"><input type="text" id="itags-search-noteFilter"/><select id="itags-search-noteList"></select></div>
<div id="itags-search-queryContainer"><div id="itags-search-queryArea"></div><select id="itags-search-savedQueries"><option value="">x</option></select></div>
<div id="itags-search-inputResultArea"><input type="text" id="itags-search-resultFilter"/>
<select id="itags-search-resultSort"><option value="modified">M</option><option value="created">C</option><option value="title">T</option><option value="text">X</option><option value="notebook">N</option><option value="custom">U</option></select>
<button id="itags-search-resultOrder"></button><button id="itags-search-resultToggle">v</button></div>
<div id='itags-search-resultsArea'></div>
</body></html>`;

/** A result with a markdown heading in its content, as grouping by heading produces. */
function makeResult(overrides: Record<string, any> = {}) {
  return {
    externalId: 'a'.repeat(32),
    title: 'Weekly review',
    notebook: '/Projects/2026/',
    color: '',
    lineNumbers: [[12]],
    text: ['### A section heading\nsome text'],
    html: ['<h3>A section heading</h3>\n<p>some text</p>'],
    ...overrides,
  };
}

/** A loaded panel, with helpers for rendering results and reading back the DOM. */
type Panel = {
  window: any;
  render: (noteLocation: string, results: any[]) => any;
  card: () => any;
  rightClick: (target: any) => number;
};

/**
 * Boots a panel in jsdom. DOMPurify is deliberately absent: sanitizeHTML() passes the
 * content through unchanged when it is, so result HTML reaches the DOM without a stand-in
 * sanitiser that could differ from the real one.
 */
async function loadPanel(): Promise<Panel> {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'searchPanelScript.js'), 'utf8');
  const dom = new JSDOM(PANEL_HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
  const window = dom.window;
  window.webviewApi = { postMessage: () => Promise.resolve(), onMessage: () => {} };
  window.console = { ...console, warn: () => {} };  // silence the missing-DOMPurify notice

  await new Promise<void>(resolve => {
    if (window.document.readyState === 'complete') { return resolve(); }
    window.addEventListener('load', () => resolve());
  });
  const el = window.document.createElement('script');
  el.textContent = source;
  window.document.body.appendChild(el);
  window.eval('initPanel(true);');

  return {
    window,
    render(noteLocation: string, results: any[]) {
      window.eval(`resultNoteLocation = ${JSON.stringify(noteLocation)};`);
      window.eval(`results = ${JSON.stringify(results)};`);
      window.eval('updateResultsArea();');
      return window.document.getElementById('itags-search-resultsArea');
    },
    card() {
      return window.document.querySelector('.itags-search-resultNote');
    },
    rightClick(target: any) {
      window.document.querySelectorAll('.itags-search-contextMenu')
        .forEach((m: any) => m.remove());
      target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
      return window.document.querySelectorAll('.itags-search-contextMenu').length;
    },
  };
}

describe('result cards: note location', () => {
  test('heading puts the title above the content, with the open arrow first', async () => {
    const panel = await loadPanel();
    panel.render('heading', [makeResult()]);
    const card = panel.card();

    const heading = card.querySelector(':scope > h3');
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe('←Weekly review');
    expect(card.querySelector('.itags-search-resultNotebook')).toBeNull();
    // The title precedes the content, and the arrow precedes the title text
    expect([...card.children].map((e: any) => e.tagName))
      .toEqual(['H3', 'DIV']);
  });

  test('footer puts notebook and title below the content, outside the collapsing container',
    async () => {
      const panel = await loadPanel();
      panel.render('footer', [makeResult()]);
      const card = panel.card();

      expect(card.querySelector(':scope > h3')).toBeNull();
      const footer = card.querySelector('.itags-search-resultNotebook');
      expect(footer.textContent).toBe('←/Projects/2026/Weekly review');
      expect(footer.getAttribute('title')).toBe('/Projects/2026/Weekly review');

      // A sibling of the content, not a child: collapsing hides the content container
      expect([...card.children].map((e: any) => e.className))
        .toEqual(['itags-search-resultContent', 'itags-search-resultNotebook']);
    });

  test('footer omits the notebook cleanly when a result carries none', async () => {
    const panel = await loadPanel();
    panel.render('footer', [makeResult({ notebook: undefined, title: 'Orphan' })]);

    const footer = panel.card().querySelector('.itags-search-resultNotebook');
    expect(footer.textContent).toBe('←Orphan');
    expect(footer.textContent).not.toContain('undefined');
  });

  test('none renders no note row at all', async () => {
    const panel = await loadPanel();
    panel.render('none', [makeResult()]);
    const card = panel.card();

    expect(card.querySelector(':scope > h3')).toBeNull();
    expect(card.querySelector('.itags-search-resultNotebook')).toBeNull();
    expect([...card.children].map((e: any) => e.className))
      .toEqual(['itags-search-resultContent']);
  });
});

describe('result cards: collapsing', () => {
  test('the heading collapses and reopens the card', async () => {
    const panel = await loadPanel();
    panel.render('heading', [makeResult()]);
    const card = panel.card();
    const content = card.querySelector('.itags-search-resultContent');
    const heading = card.querySelector(':scope > h3');

    expect(content.style.display).toBe('block');
    heading.dispatchEvent(new panel.window.MouseEvent('click', { bubbles: true }));
    expect(content.style.display).toBe('none');
    heading.dispatchEvent(new panel.window.MouseEvent('click', { bubbles: true }));
    expect(content.style.display).toBe('block');
  });

  test('the footer does not collapse, since its halves filter instead', async () => {
    const panel = await loadPanel();
    panel.render('footer', [makeResult()]);
    const card = panel.card();
    const content = card.querySelector('.itags-search-resultContent');
    const footer = card.querySelector('.itags-search-resultNotebook');

    footer.dispatchEvent(new panel.window.MouseEvent('click', { bubbles: true }));
    expect(content.style.display).toBe('block');
  });

  test('cards with no note row stay expanded and hide the global toggle', async () => {
    const panel = await loadPanel();
    // Collapsed state left behind by the global toggle, or by another note location
    panel.window.eval('noteState = {};');
    panel.render('none', [makeResult()]);
    const key = Object.keys(JSON.parse(panel.window.eval('JSON.stringify(noteState)')));
    expect(key).toHaveLength(0);  // no per-card state is recorded without a toggle

    panel.window.eval('collapseResults();');
    panel.render('none', [makeResult()]);
    const content = panel.card().querySelector('.itags-search-resultContent');
    expect(content.style.display).toBe('block');

    // The toggle itself is hidden, so the unreachable state cannot be entered
    panel.window.eval(`hideElements({ showQuery: true, expandedTagList: true, showNotes: true,
      showResultFilter: true, showTagRange: true });`);
    const toggle = panel.window.document.getElementById('itags-search-resultToggle');
    expect(toggle.classList.contains('hidden')).toBe(true);
  });

  test('an unrecognised note location is treated as having no note row', async () => {
    // Both read paths fall back to 'heading' only on a falsy value, so a truthy unknown
    // reaches the render. It must fail safe rather than produce a card nothing can reopen.
    const panel = await loadPanel();
    panel.window.eval('noteState = {};');
    panel.render('footer', [makeResult()]);
    panel.window.eval('collapseResults();');

    panel.render('bogus', [makeResult()]);
    const card = panel.card();
    expect(card.querySelector('.itags-search-resultNotebook')).toBeNull();
    expect(card.querySelector(':scope > h3')).toBeNull();
    expect(card.querySelector('.itags-search-resultContent').style.display).toBe('block');
  });

  test('the global toggle comes back when the note row does', async () => {
    const panel = await loadPanel();
    const sections = `{ showQuery: true, expandedTagList: true, showNotes: true,
      showResultFilter: true, showTagRange: true }`;
    const toggle = panel.window.document.getElementById('itags-search-resultToggle');

    panel.render('footer', [makeResult()]);
    panel.window.eval(`hideElements(${sections});`);
    expect(toggle.classList.contains('hidden')).toBe(false);

    // Hiding it must not be one-way: the same panel switching locations has to recover
    panel.render('none', [makeResult()]);
    panel.window.eval(`hideElements(${sections});`);
    expect(toggle.classList.contains('hidden')).toBe(true);

    panel.render('heading', [makeResult()]);
    panel.window.eval(`hideElements(${sections});`);
    expect(toggle.classList.contains('hidden')).toBe(false);
  });
});

describe('result cards: filtering from the footer', () => {
  /** The result filter, and the results still on screen after the click. */
  function filterAfterClicking(panel: Panel, selector: string) {
    const target = panel.card().querySelector(selector);
    target.dispatchEvent(new panel.window.MouseEvent('click', { bubbles: true }));
    const filter = panel.window.document.getElementById('itags-search-resultFilter');
    return {
      value: filter.value,
      shown: panel.window.document
        .querySelectorAll('.itags-search-resultNote').length,
    };
  }

  test('clicking the path filters to that notebook', async () => {
    const panel = await loadPanel();
    panel.render('footer', [
      makeResult(),
      makeResult({ externalId: 'b'.repeat(32), title: 'Elsewhere', notebook: '/Other/' }),
    ]);

    const { value, shown } = filterAfterClicking(panel, '.itags-search-resultNotebookPath');
    expect(value).toBe('"/Projects/2026/"');
    expect(shown).toBe(1);
  });

  test('clicking the title filters to that note', async () => {
    const panel = await loadPanel();
    panel.render('footer', [
      makeResult(),
      makeResult({ externalId: 'b'.repeat(32), title: 'Elsewhere', notebook: '/Projects/2026/' }),
    ]);

    // Quoted, or "Weekly review" would filter as two independent words
    const { value, shown } = filterAfterClicking(panel, '.itags-search-resultNotebookTitle');
    expect(value).toBe('"Weekly review"');
    expect(shown).toBe(1);
  });

  test('a title containing a quote still matches the note it came from', async () => {
    const panel = await loadPanel();
    panel.render('footer', [makeResult({ title: 'Ann\'s "big" review' })]);

    // Not wrapped: there is no escape syntax for a quote inside a phrase, and
    // stripping it would leave a filter that no longer matches the title
    const { value, shown } = filterAfterClicking(panel, '.itags-search-resultNotebookTitle');
    expect(value).toBe('Ann\'s "big" review');
    expect(shown).toBe(1);
  });

  test('a result with no notebook has no path to click', async () => {
    const panel = await loadPanel();
    panel.render('footer', [makeResult({ notebook: undefined })]);

    const path = panel.card().querySelector('.itags-search-resultNotebookPath');
    expect(path.textContent).toBe('');
    expect(path.style.cursor).toBe('');
  });
});

describe('result cards: grouping menu', () => {
  /**
   * normalizeHeadingLevel() renders every heading inside result content as an h3, the same
   * tag as the card title. The document-level fallback must tell them apart, or the most
   * prominent line of a card becomes dead to right-clicks once the title moves or goes.
   */
  test('a markdown heading inside a result opens the menu in every note location',
    async () => {
      for (const location of ['heading', 'footer', 'none']) {
        const panel = await loadPanel();
        panel.render(location, [makeResult()]);
        const contentHeading = panel.card().querySelector('.itags-search-resultSection h3');
        expect(contentHeading.textContent).toBe('A section heading');
        expect(panel.rightClick(contentHeading)).toBe(1);
      }
    });

  test('plain content opens the menu in every note location', async () => {
    for (const location of ['heading', 'footer', 'none']) {
      const panel = await loadPanel();
      panel.render(location, [makeResult()]);
      const paragraph = panel.card().querySelector('.itags-search-resultSection p');
      expect(panel.rightClick(paragraph)).toBe(1);
    }
  });

  test('the card title keeps its own menu', async () => {
    const panel = await loadPanel();
    panel.render('heading', [makeResult()]);

    const title = panel.card().querySelector(':scope > h3');
    expect(panel.rightClick(title)).toBe(1);
  });
});
