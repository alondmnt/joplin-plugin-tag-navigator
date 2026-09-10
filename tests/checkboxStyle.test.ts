import {
  CHECKBOX_STATES,
  checkboxClasses,
  checkboxLineRegex,
  checkboxMarkerRegex,
  checkboxStateFor,
  defaultCheckboxCss,
} from '../src/utils';

/**
 * The panel's six regexes as they stood before CHECKBOX_STATES existed. The
 * generated ones must be identical to these, or the panel's rendered HTML
 * changes under it.
 */
const PANEL_REGEXES: Record<string, RegExp> = {
  'open': /(^[\s]*)- \[ \] (.*)$/gm,
  'done': /(^[\s]*)- \[[xX]\] (.*)$/gm,
  'ongoing': /(^[\s]*)- \[@\] (.*)$/gm,
  'obsolete': /(^[\s]*)- \[~\] (.*)$/gm,
  'in-question': /(^[\s]*)- \[\?\] (.*)$/gm,
  'blocked': /(^[\s]*)- \[!\] (.*)$/gm,
};

describe('checkbox state model', () => {
  test('covers the six states the kanban board lays out, in its order', () => {
    expect(CHECKBOX_STATES.map(state => state.key)).toEqual([
      'open', 'ongoing', 'in-question', 'blocked', 'done', 'obsolete',
    ]);
  });

  test('maps every bracket character to its state', () => {
    expect(checkboxStateFor(' ')?.key).toBe('open');
    expect(checkboxStateFor('@')?.key).toBe('ongoing');
    expect(checkboxStateFor('?')?.key).toBe('in-question');
    expect(checkboxStateFor('!')?.key).toBe('blocked');
    expect(checkboxStateFor('x')?.key).toBe('done');
    expect(checkboxStateFor('X')?.key).toBe('done');
    expect(checkboxStateFor('~')?.key).toBe('obsolete');
  });

  test('keeps the colours searchPanelStyle.css paints the same states with', () => {
    // Asserted as literals, not read from the map: the panel's stylesheet holds
    // its own copy, and the two are only in step while these values hold.
    expect(CHECKBOX_STATES.map(state => state.colour)).toEqual([
      '#4178be', '#cb55c2', '#cc913f', '#e22d2d', '#64a073', '#999999',
    ]);
  });

  test('maps an unknown character to no state', () => {
    expect(checkboxStateFor('y')).toBeNull();
    expect(checkboxStateFor('')).toBeNull();
  });
});

describe('checkboxClasses', () => {
  test('carries the shared and surface classes, bare and per state', () => {
    const done = CHECKBOX_STATES.find(state => state.key === 'done');
    expect(checkboxClasses(done, 'itags-editor-checkbox')).toBe(
      'itags-checkbox itags-checkbox--done itags-editor-checkbox itags-editor-checkbox--done');
  });

  test('names the same shared class on every surface', () => {
    const open = CHECKBOX_STATES.find(state => state.key === 'open');
    for (const surface of ['itags-editor-checkbox', 'itags-search-checkbox']) {
      expect(checkboxClasses(open, surface).split(' ')).toContain('itags-checkbox--open');
    }
  });
});

describe('checkboxLineRegex', () => {
  test('reproduces the panel regexes exactly', () => {
    for (const state of CHECKBOX_STATES) {
      const generated = checkboxLineRegex(state);
      expect(generated.source).toBe(PANEL_REGEXES[state.key].source);
      expect(generated.flags).toBe(PANEL_REGEXES[state.key].flags);
    }
  });

  test('captures the indent and the text after the marker', () => {
    const ongoing = CHECKBOX_STATES.find(state => state.key === 'ongoing');
    const match = checkboxLineRegex(ongoing).exec('  - [@] write the plan');
    expect(match[1]).toBe('  ');
    expect(match[2]).toBe('write the plan');
  });
});

describe('checkboxMarkerRegex', () => {
  const matchAll = (line: string) => Array.from(line.matchAll(checkboxMarkerRegex()));

  test('matches every state at the head of a list item', () => {
    for (const marker of [' ', '@', '?', '!', 'x', 'X', '~']) {
      const matches = matchAll(`- [${marker}] task`);
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe(`- [${marker}]`);
      expect(matches[0][1]).toBe(marker);
    }
  });

  test('matches under any list marker and any indent', () => {
    expect(matchAll('* [@] task')).toHaveLength(1);
    expect(matchAll('+ [@] task')).toHaveLength(1);
    expect(matchAll('    - [@] task')).toHaveLength(1);
    expect(matchAll('\t- [@] task')).toHaveLength(1);
  });

  test('matches a marker with nothing after it', () => {
    expect(matchAll('- [@]')).toHaveLength(1);
  });

  test('ignores brackets that are not a list marker', () => {
    expect(matchAll('see [x] below')).toHaveLength(0);
    expect(matchAll('-[x] no space')).toHaveLength(0);
    expect(matchAll('- [y] unknown state')).toHaveLength(0);
    expect(matchAll('- [xx] two characters')).toHaveLength(0);
    expect(matchAll('1. [x] ordered')).toHaveLength(0);
  });

  test('does not match a marker glued to the text', () => {
    expect(matchAll('- [x]task')).toHaveLength(0);
  });

  test('anchors on the brackets, not the list marker', () => {
    const [match] = matchAll('  - [x] done');
    expect(match.index + match[0].indexOf('[')).toBe(4);
  });

  test('returns a fresh instance, since MatchDecorator mutates lastIndex', () => {
    const first = checkboxMarkerRegex();
    first.lastIndex = 3;
    expect(checkboxMarkerRegex().lastIndex).toBe(0);
  });
});

/** Everything after the cascade layer, which is where the editor's rules go. */
const unlayered = (css: string) => css.slice(css.indexOf('\n}\n') + 3);

describe('defaultCheckboxCss', () => {
  const css = defaultCheckboxCss('itags-editor-checkbox');

  test('is layered, so unlayered user CSS overrides it', () => {
    expect(css).toContain('@layer itagsDefaults');
  });

  test('gives every state its colour', () => {
    for (const state of CHECKBOX_STATES) {
      expect(css).toContain(`.itags-editor-checkbox--${state.key} {`);
      expect(css).toContain(state.colour);
    }
  });

  test('sets the font outside the layer, and specifically enough for Joplin', () => {
    // Joplin's editor theme carries `.<theme> span { font-family: inherit }`,
    // which applies to the decoration itself and outranks a bare class, and
    // being unlayered it beats a layered rule at any specificity. Leading with
    // `span` ties on specificity, and our style element is appended after
    // CodeMirror's, so it wins on order. Verified in Chromium against Joplin's
    // own generated CSS: without the `span` the marker renders in the editor
    // font, with it in monospace.
    expect(unlayered(css)).toContain('span.itags-editor-checkbox {');
    expect(unlayered(css)).toContain('font-family: monospace;');
  });

  test('hands the colour and font of a nested token span back to the decoration', () => {
    // Joplin reads [@] as a link and its theme styles links and list content,
    // so the marker text sits in a span of its own inside the decoration. That
    // span keeps its colour and font unless a rule outside the layer says
    // otherwise. Making it inherit hands both back to the decoration, and so
    // to whoever styles it.
    expect(unlayered(css)).toContain('span.itags-editor-checkbox * {');
    expect(unlayered(css)).toContain('color: inherit;');
    expect(unlayered(css)).toContain('font-family: inherit;');
    expect(unlayered(css)).toContain('font-weight: inherit;');
  });

  test('keeps the colours in the layer, where a plain class overrides them', () => {
    const layered = css.slice(0, css.indexOf('\n}\n'));
    expect(layered).toContain('@layer itagsDefaults {');
    expect(layered).toContain('color: #cb55c2;');
    expect(unlayered(css)).not.toContain('#cb55c2');
  });

  test('names the surface it was asked for', () => {
    expect(defaultCheckboxCss('itags-search-checkbox')).toContain('.itags-search-checkbox--done');
  });
});
