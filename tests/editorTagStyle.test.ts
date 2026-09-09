/**
 * Tests for the editor tag styling helpers.
 *
 * compileTagRegex is the guard against an editor freeze: MatchDecorator iterates
 * exec() without advancing lastIndex itself, so a pattern able to produce a
 * zero-length match spins its loop on every keystroke. The accept/reject table
 * below is the regression net for that, and the reason the table exists is that
 * an earlier guard which only tested against '' let three shapes through.
 *
 * compileTagRegex also applies isRegexSafe, shared with the indexer. The two
 * gates cover different hazards: isRegexSafe catches catastrophic backtracking
 * (measured at ~10s for a single exec on an 18-character line), canMatchEmpty
 * catches the zero-length match that spins MatchDecorator's loop. The editor
 * needs both, since it runs the pattern over the viewport on every keystroke.
 *
 * tagBounds is the arithmetic that decides which characters get painted.
 */
import { compileTagRegex, compileExcludeRegex, tagBounds } from '../src/cm6tagStyle';
import { defTagRegex, mapPrefixClass } from '../src/utils';

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

  it.each([
    ['\\w*', 'unanchored star'],
    ['[#@]*', 'character-class star'],
    ['#?', 'optional literal'],
    ['.*', 'match anything'],
    ['\\b\\w*', 'leading word boundary'],
    ['(?<=\\s)\\S*', 'leading lookbehind, star'],
    ['(?<=#)x*', 'contextual empty match'],
  ])('rejects %s (%s), which would freeze the editor', (source) => {
    expect(compileTagRegex(source).source).toBe(defTagRegex.source);
  });

  it.each([
    [defTagRegex.source, 'the default'],
    [MULTI_PREFIX, 'the documented multi-prefix example'],
    [CAPTURE_GROUP, 'the capture-group form'],
    ['#[a-z]+', 'a plain literal pattern'],
    ['(?<=^|\\s)@\\w+', 'a single-prefix lookbehind pattern'],
  ])('accepts %s (%s)', (source) => {
    expect(compileTagRegex(source).source).toBe(source);
  });

  it('never returns a pattern that stalls MatchDecorator', () => {
    for (const source of ['', '#[', '\\w*', '\\b\\w*', '(?<=\\s)\\S*', '(?<=#)x*',
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
    for (const raw of execAll(pattern, line).matches) {
      const { tag, lead } = tagBounds(raw);
      if (!tag) { continue; }
      if (exclude) {
        exclude.lastIndex = 0;
        if (exclude.test(tag)) { continue; }
      }
      const start = line.indexOf(raw) + lead;
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
});
