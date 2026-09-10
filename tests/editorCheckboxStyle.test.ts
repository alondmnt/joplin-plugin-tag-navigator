/**
 * Tests for the editor checkbox highlighting.
 *
 * checkboxMarker is the arithmetic that decides which characters get painted.
 * It must stop at the brackets: Joplin replaces the bullet of a list item with
 * a widget of its own whenever `Render markup in editor` is on, which is the
 * default, so a decoration spanning the bullet paints a range that is no
 * longer there.
 *
 * The code-context tests are the ones with history. Indented blocks reading as
 * code cost the indexer five junk tags from one pasted snippet (#51), and the
 * editor answers that question from the syntax tree rather than by counting
 * columns, so each form is asserted against a real parse.
 */
import { checkboxMarker, inCodeContext } from '../src/cm6tagStyle';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { checkboxMarkerRegex } from '../src/utils';

/** The first match of the editor's checkbox pattern in a line. */
const matchIn = (line: string): RegExpExecArray => checkboxMarkerRegex().exec(line);

/** A state parsed as Markdown, the way the editor parses it. */
const stateOf = (doc: string) => EditorState.create({ doc, extensions: [markdown()] });

describe('checkboxMarker', () => {
  test('paints the brackets and nothing before them', () => {
    const marker = checkboxMarker(matchIn('- [x] done'));
    expect(marker.start).toBe(2);
    expect(marker.end).toBe(5);
  });

  test('keeps the bullet out of the range at any indent', () => {
    for (const line of ['  - [@] task', '\t\t* [@] task', '   + [@] task']) {
      const marker = checkboxMarker(matchIn(line));
      expect(line.slice(marker.start, marker.end)).toBe('[@]');
    }
  });

  test('names the state on both the shared and the editor class', () => {
    const marker = checkboxMarker(matchIn('- [~] dropped'));
    expect(marker.className.split(' ')).toEqual([
      'itags-checkbox', 'itags-checkbox--obsolete',
      'itags-editor-checkbox', 'itags-editor-checkbox--obsolete',
    ]);
  });

  test('gives both cases of done the same class', () => {
    expect(checkboxMarker(matchIn('- [X] done')).className)
      .toBe(checkboxMarker(matchIn('- [x] done')).className);
  });

  test('paints nothing for a character that is not a state', () => {
    // Not reachable through the shared pattern, which only matches the six.
    const invented = Object.assign(['- [y]', 'y'], { index: 0, input: '- [y]' }) as unknown as RegExpExecArray;
    expect(checkboxMarker(invented)).toBeNull();
  });
});

describe('checkboxes in code', () => {
  /** Whether the marker of the given line would be painted. */
  const painted = (doc: string, line: string): boolean => {
    const lineStart = doc.indexOf(line);
    const marker = checkboxMarker(matchIn(line));
    return !inCodeContext(stateOf(doc), lineStart + marker.start);
  };

  test('paints a task in ordinary text', () => {
    expect(painted('notes\n\n- [@] task\n', '- [@] task')).toBe(true);
  });

  test('skips a task inside a fenced block', () => {
    expect(painted('```\n- [@] task\n```\n', '- [@] task')).toBe(false);
  });

  test('skips a task inside an indented block', () => {
    expect(painted('paste:\n\n    - [@] task\n', '    - [@] task')).toBe(false);
  });

  test('skips a task inside a tab-indented block', () => {
    expect(painted('paste:\n\n\t- [@] task\n', '\t- [@] task')).toBe(false);
  });

  test('paints a task nested in a list, which is not code', () => {
    expect(painted('- outer\n    - [@] task\n', '    - [@] task')).toBe(true);
  });

  test('skips a task inside an inline code span', () => {
    const doc = 'see `- [@] task` here';
    expect(inCodeContext(stateOf(doc), doc.indexOf('[@]'))).toBe(true);
  });
});
