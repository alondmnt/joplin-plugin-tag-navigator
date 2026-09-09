/**
 * Tests for how the Markdown preview splits a match into prefix, tag and
 * remainder (issue #42).
 *
 * A tag regex may or may not capture the whitespace around the tag. The
 * preview used to strip it by locating '#' in the match, which only worked for
 * '#' tags: with a capture-group regex an @mention kept its leading space
 * inside the span and its prefix class came out as --char-20 instead of --at.
 * The tag is now located by trimming, as the editor does, so both regex forms
 * behave the same.
 *
 * Whatever the trim removes still has to be rendered, because the cursor
 * advances past the whole match - hence the "loses no text" cases.
 */
import * as MarkdownIt from 'markdown-it';
import tagPlugin from '../src/tagMarkdownItPlugin';
import { defTagRegex } from '../src/utils';

/** The multi-prefix example from the `Tag regex` setting description. */
const LOOKBEHIND_MULTI = "(?<=^|\\s)([#@+]|\\/\\/)([^\\s#@'\",.()\\[\\]:;\\?\\\\]+)";
/** The same intent written with a capture group, which includes the whitespace. */
const CAPTURE_MULTI = '(^|\\s)([#@+]|\\/\\/)(\\S+)';
/** A delimited form, whose match ends in whitespace. */
const CAPTURE_TRAILING = '(^|\\s)#(\\w+)(\\s)';

function render(src: string, tagRegex = '', excludeRegex = ''): string {
  const md = new (MarkdownIt as any)({ html: true });
  const mod = tagPlugin({} as any);
  mod.plugin(md, {
    settingValue: (key: string) =>
      key === 'itags.tagRegex' ? tagRegex : key === 'itags.excludeRegex' ? excludeRegex : '',
  });
  return md.render(src);
}

/** [prefix suffix of the class list, span text] for each tag in the output. */
function tags(html: string): [string, string][] {
  return [...html.matchAll(/<span class="[^"]*itags-tag--(\S+?) [^"]*">([^<]*)<\/span>/g)]
    .map(m => [m[1], m[2]] as [string, string]);
}

/**
 * Visible text with all markup removed, to check nothing was dropped.
 * Drops the injected style element first: its CSS is not markup, so tag
 * stripping alone would leave the stylesheet in the "text".
 */
function textOf(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '');
}

describe('prefix splitting', () => {
  it.each([
    ['lookbehind', LOOKBEHIND_MULTI],
    ['capture group', CAPTURE_MULTI],
  ])('maps every prefix to its own class with a %s regex', (_name, regex) => {
    expect(tags(render('a #tag @mention +proj //due end', regex))).toEqual([
      ['hash', '#tag'],
      ['at', '@mention'],
      ['plus', '+proj'],
      ['slash', '//due'],
    ]);
  });

  it('does not put the captured whitespace inside the span', () => {
    for (const [, text] of tags(render('a @mention here', CAPTURE_MULTI))) {
      expect(text).toBe(text.trim());
    }
  });

  it.each([
    ['default', ''],
    ['lookbehind', LOOKBEHIND_MULTI],
    ['capture group', CAPTURE_MULTI],
    ['capture group with trailing delimiter', CAPTURE_TRAILING],
  ])('loses no text with a %s regex', (_name, regex) => {
    const src = 'a #tag and @mention plus +proj end';
    expect(textOf(render(src, regex)).trim()).toBe(src);
  });

  it('keeps the trailing delimiter outside the span', () => {
    const html = render('a #tag end', CAPTURE_TRAILING);
    expect(tags(html)).toEqual([['hash', '#tag']]);
    expect(textOf(html).trim()).toBe('a #tag end');
  });

  it('still excludes tags matched by the exclude regex', () => {
    const html = render('a #a1b2c3 and #keep', '', '#[a-fA-F0-9]{6}$');
    expect(tags(html)).toEqual([['hash', '#keep']]);
    expect(textOf(html).trim()).toBe('a #a1b2c3 and #keep');
  });

  it('shares the canonical default regex rather than a local copy', () => {
    // foo#bar must not match, which both the old local copy and the canonical
    // regex agree on - this pins that unifying them did not change matching.
    expect(tags(render('foo#bar and #real', ''))).toEqual([['hash', '#real']]);
    expect(defTagRegex.source).toContain('(?<=^|\\s)');
  });
});
