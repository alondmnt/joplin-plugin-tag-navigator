/**
 * Tests for the editor tag styling helpers.
 *
 * compileTagRegex guards against an editor freeze: MatchDecorator iterates exec()
 * without advancing lastIndex itself, so a zero-length match spins its loop on
 * every keystroke. Two heuristics were tried and both let shapes through - a
 * test against '' missed \b\w*, and a fixed sample probe missed (?<=#)\w*,
 * which is empty only where "#" precedes a non-word character, i.e. on every
 * Markdown heading. The guard is now structural (NonEmptyRegExp), so these tests
 * assert termination on real text rather than membership of a reject list.
 *
 * compileTagRegex also applies isRegexSafe, shared with the indexer. The two
 * gates cover different hazards: isRegexSafe catches catastrophic backtracking
 * (measured at ~10s for a single exec on an 18-character line), canMatchEmpty
 * catches the zero-length match that spins MatchDecorator's loop. The editor
 * needs both, since it runs the pattern over the viewport on every keystroke.
 *
 * tagBounds is the arithmetic that decides which characters get painted.
 */
import { compileTagRegex, compileExcludeRegex, tagBounds, inCodeContext } from '../src/cm6tagStyle';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defTagRegex, mapPrefixClass, tagClasses, defaultTagCss, SHARED_TAG_CLASS } from '../src/utils';

/** The multi-prefix example from the `Tag regex` setting description. */
const MULTI_PREFIX = "(?<=^|\\s)([#@+]|\\/\\/)([^\\s#@'\",.()\\[\\]:;\\?\\\\]+)";
/** The capture-group form, which includes the preceding whitespace in the match. */
const CAPTURE_GROUP = '(^|\\s)#([^\\s]+)';

// Several cases below feed deliberately bad patterns in, each of which warns.
// Silencing keeps the run readable; the fallback assertions check the warning fires.
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

/** Runs a compiled pattern the way MatchDecorator does, and reports any stall. */
function execAll(pattern: RegExp, text: string): { matches: string[]; stalled: boolean } {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) { return { matches, stalled: true }; }
    matches.push(match[0]);
    if (matches.length > 500) { return { matches, stalled: true }; }
  }
  return { matches, stalled: false };
}

describe('compileTagRegex', () => {
  const sample = 'hello #tag and foo#bar @who +proj //due end ';

  it('falls back to the default when no pattern is set', () => {
    expect(compileTagRegex('').source).toBe(defTagRegex.source);
  });

  it('falls back to the default when the pattern does not compile', () => {
    expect(compileTagRegex('#[').source).toBe(defTagRegex.source);
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ['(?<=^|\\s)#(\\w+|\\w+)*$', 'overlapping alternation, (a|a)* shape'],
    ['(#\\w+)+', 'nested quantifier'],
    ['(.*)*', 'catastrophic classic'],
  ])('rejects %s (%s), which would hang the editor by backtracking', (source) => {
    expect(compileTagRegex(source).source).toBe(defTagRegex.source);
    expect(warn).toHaveBeenCalled();
  });

  // These are no longer rejected: NonEmptyRegExp makes a zero-length match
  // harmless rather than fatal, so the pattern is honoured and still highlights
  // whatever it does match. The property that matters is termination.
  it.each([
    ['\\w*', 'unanchored star'],
    ['[#@]*', 'character-class star'],
    ['#?', 'optional literal'],
    ['.*', 'match anything'],
    ['\\b\\w*', 'leading word boundary'],
    ['(?<=\\s)\\S*', 'leading lookbehind, star'],
    ['(?<=#)x*', 'empty match needing context'],
    ['(?<=#)\\w*', 'empty only where # precedes a non-word char'],
    ['(?<=[#@])\\w*', 'same, character class'],
    ['(?<=\\+)\\S*', 'same, plus prefix'],
  ])('honours %s (%s) and still terminates', (source) => {
    expect(compileTagRegex(source).source).toBe(source);
  });

  // A Markdown heading is "#" followed by a space, which is what defeated the
  // fixed-sample probe this guard replaced. Every note has headings.
  it.each([
    '# Heading\n\nsome #tag here\n',
    '## Deeper\n#tag\n',
    'a @ b + c // d\n',
    '#\n',
    '',
  ])('terminates on real note text: %j', (text) => {
    for (const source of ['(?<=#)\\w*', '(?<=[#@])\\w*', '(?<=\\+)\\S*', '\\w*',
                          '\\b\\w*', '(?<=\\s)\\S*', defTagRegex.source, MULTI_PREFIX]) {
      const result = execAll(compileTagRegex(source), text);
      expect(result.stalled).toBe(false);
      expect(result.matches.every(m => m.length > 0)).toBe(true);
    }
  });

  it('never returns a pattern that stalls MatchDecorator', () => {
    for (const source of ['', '#[', '\\w*', '\\b\\w*', '(?<=\\s)\\S*', '(?<=#)x*',
                          '(?<=#)\\w*', '(?<=[#@])\\w*', '(?<=\\+)\\S*', '(.*)*',
                          defTagRegex.source, MULTI_PREFIX, CAPTURE_GROUP]) {
      expect(execAll(compileTagRegex(source), sample).stalled).toBe(false);
    }
  });

  it('always sets the global flag, which MatchDecorator requires', () => {
    expect(compileTagRegex('').global).toBe(true);
    expect(compileTagRegex('#[a-z]+').global).toBe(true);
  });

  it('returns a fresh instance each call, since MatchDecorator mutates lastIndex', () => {
    expect(compileTagRegex('#[a-z]+')).not.toBe(compileTagRegex('#[a-z]+'));
  });
});

describe('compileExcludeRegex', () => {
  it('returns null when unset', () => {
    expect(compileExcludeRegex('')).toBeNull();
  });

  it('returns null when the pattern does not compile', () => {
    expect(compileExcludeRegex('#[')).toBeNull();
  });

  it('returns null for a pattern that can backtrack catastrophically', () => {
    expect(compileExcludeRegex('(#\\w+)+')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('compiles the hex-colour example from the setting description', () => {
    const pattern = compileExcludeRegex('#[a-fA-F0-9]{6}$');
    pattern.lastIndex = 0;
    expect(pattern.test('#a1b2c3')).toBe(true);
    pattern.lastIndex = 0;
    expect(pattern.test('#keep')).toBe(false);
  });
});

describe('tagBounds', () => {
  it('leaves a bare tag untouched', () => {
    expect(tagBounds('#tag')).toEqual({ tag: '#tag', lead: 0 });
  });

  it('skips whitespace the capture-group form puts in front of the tag', () => {
    expect(tagBounds(' #tag')).toEqual({ tag: '#tag', lead: 1 });
  });

  it('drops whitespace a delimited form puts after the tag', () => {
    expect(tagBounds('#tag ')).toEqual({ tag: '#tag', lead: 0 });
    expect(tagBounds(' #tag ')).toEqual({ tag: '#tag', lead: 1 });
  });

  it('reports an empty tag for an all-whitespace match, so it can be skipped', () => {
    expect(tagBounds('   ')).toEqual({ tag: '', lead: 0 });
  });
});

describe('decorated ranges', () => {
  /** Replicates the decorate callback: where the mark lands, and its prefix class. */
  function decorate(line: string, tagSource: string, excludeSource = ''): string[] {
    const pattern = compileTagRegex(tagSource);
    const exclude = compileExcludeRegex(excludeSource);
    const out: string[] = [];
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      const { tag, lead } = tagBounds(match[0]);
      if (!tag) { continue; }
      if (exclude) {
        exclude.lastIndex = 0;
        if (exclude.test(tag)) { continue; }
      }
      // Mirrors production exactly: the offset comes from the match, not from
      // searching the line for the matched text.
      const start = match.index + lead;
      out.push(`${start}-${start + tag.length}:${line.slice(start, start + tag.length)}:${mapPrefixClass(tag)}`);
    }
    return out;
  }

  it('marks a tag mid-line and at the start of a line', () => {
    expect(decorate('hello #tag world', '')).toEqual(['6-10:#tag:hash']);
    expect(decorate('#tag at start', '')).toEqual(['0-4:#tag:hash']);
  });

  it('does not mark a hash inside a word', () => {
    expect(decorate('foo#bar and #real', '')).toEqual(['12-17:#real:hash']);
  });

  it('maps each documented prefix to its own subclass', () => {
    expect(decorate('a #tag @mention +proj //due-date', MULTI_PREFIX)).toEqual([
      '2-6:#tag:hash',
      '7-15:@mention:at',
      '16-21:+proj:plus',
      '22-32://due-date:slash',
    ]);
  });

  it('does not paint the space the capture-group form captures', () => {
    expect(decorate('hello #tag world', CAPTURE_GROUP)).toEqual(['6-10:#tag:hash']);
  });

  it('skips tags matched by the exclude pattern', () => {
    expect(decorate('#a1b2c3 and #keep', '', '#[a-fA-F0-9]{6}$')).toEqual(['12-17:#keep:hash']);
  });

  // Regression: an earlier version of this helper located matches with
  // line.indexOf(matchText), which returns the first occurrence, so a repeated
  // tag was reported twice at the same offset while production placed it
  // correctly. Production uses the match's own index.
  it('locates a repeated tag at each of its own offsets', () => {
    expect(decorate('#tag and #tag', '')).toEqual(['0-4:#tag:hash', '9-13:#tag:hash']);
  });
});

describe('inCodeContext', () => {
  /** Real Markdown parse, so the node names come from the parser rather than a stub. */
  function state(doc: string) {
    return EditorState.create({ doc, extensions: [markdown()] });
  }
  /** Positions of every "#" in the doc, which is where a tag would start. */
  function hashes(doc: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < doc.length; i++) { if (doc[i] === '#') { out.push(i); } }
    return out;
  }

  it('reports plain prose as not code', () => {
    const doc = 'some #tag in prose\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(false);
  });

  it('reports an inline code span as code', () => {
    const doc = 'text `#tag` more\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(true);
  });

  it('reports a fenced block as code', () => {
    const doc = '```\n#tag\n```\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(true);
  });

  it('reports a fenced block with a language as code', () => {
    const doc = '```js\n// #tag\n```\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(true);
  });

  it('reports an indented block as code, which the panel does not skip', () => {
    const doc = 'para\n\n    #tag\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(true);
  });

  it('does not treat a heading hash as code', () => {
    const doc = '# Heading\n\n#tag\n';
    expect(inCodeContext(state(doc), doc.indexOf('#tag'))).toBe(false);
  });

  it('does not treat emphasis or a link as code', () => {
    const doc = '*a #tag* and [#tag](http://x)\n';
    for (const pos of hashes(doc)) {
      expect(inCodeContext(state(doc), pos)).toBe(false);
    }
  });

  it('separates code from prose on the same line', () => {
    const doc = 'before `#in` after #out\n';
    expect(inCodeContext(state(doc), doc.indexOf('#in'))).toBe(true);
    expect(inCodeContext(state(doc), doc.indexOf('#out'))).toBe(false);
  });

  it('classifies every line of a fence transition, the case the rebuild exists for', () => {
    const doc = '#before\n```\n#inside\n```\n#after\n';
    expect(inCodeContext(state(doc), doc.indexOf('#before'))).toBe(false);
    expect(inCodeContext(state(doc), doc.indexOf('#inside'))).toBe(true);
    expect(inCodeContext(state(doc), doc.indexOf('#after'))).toBe(false);
  });
});

describe('tagClasses', () => {
  it('carries the shared class so one rule styles all three surfaces', () => {
    for (const surface of ['itags-editor-tag', 'itags-search-renderedTag']) {
      expect(tagClasses('#tag', surface).split(' ')).toContain(SHARED_TAG_CLASS);
    }
  });

  it('gives the shared and surface classes matching prefix variants', () => {
    expect(tagClasses('@who', 'itags-editor-tag').split(' ')).toEqual([
      'itags-tag', 'itags-tag--at', 'itags-editor-tag', 'itags-editor-tag--at',
    ]);
  });

  it('keeps the surface class, so per-surface rules still work', () => {
    expect(tagClasses('#tag', 'itags-search-renderedTag')).toContain('itags-search-renderedTag--hash');
    expect(tagClasses('#tag', 'itags-editor-tag')).toContain('itags-editor-tag--hash');
  });

  it.each([['#a', 'hash'], ['@a', 'at'], ['+a', 'plus'], ['//a', 'slash']])(
    'maps %s to --%s on both the shared and surface class', (tag, suffix) => {
      const classes = tagClasses(tag, 'itags-editor-tag');
      expect(classes).toContain(`itags-tag--${suffix}`);
      expect(classes).toContain(`itags-editor-tag--${suffix}`);
    });
});

describe('defaultTagCss', () => {
  const editor = defaultTagCss('itags-editor-tag');
  const preview = defaultTagCss('itags-search-renderedTag', { block: true });
  const panel = defaultTagCss('itags-search-renderedTag', { block: true, hover: true });

  it('gives every surface the same colours, so they cannot drift apart', () => {
    for (const css of [editor, preview, panel]) {
      expect(css).toContain('background-color: #7698b3');
      expect(css).toContain('color: #ffffff');
      expect(css).toContain('border-radius: 5px');
      expect(css).toContain('padding: 0em 2px');
    }
  });

  it('layers every surface, so unlayered user CSS wins without !important', () => {
    for (const css of [editor, preview, panel]) {
      expect(css).toMatch(/^@layer itagsDefaults;/);
      expect(css).toContain('@layer itagsDefaults {');
    }
  });

  it('omits the block layout in the editor, where it disturbs the caret', () => {
    expect(editor).not.toContain('display: inline-block');
    expect(editor).not.toContain('margin');
  });

  it('keeps the block layout where the panel and preview had it', () => {
    for (const css of [preview, panel]) {
      expect(css).toContain('display: inline-block');
      expect(css).toContain('margin-top: 2px');
      expect(css).toContain('margin-bottom: 2px');
    }
  });

  it('adds hover only where tags are clickable', () => {
    expect(panel).toContain('.itags-search-renderedTag:hover');
    expect(panel).toContain('#7aaab8');
    expect(preview).not.toContain(':hover');
    expect(editor).not.toContain(':hover');
  });

  it('targets the class it is given', () => {
    expect(editor).toContain('.itags-editor-tag {');
    expect(preview).toContain('.itags-search-renderedTag {');
  });
});
