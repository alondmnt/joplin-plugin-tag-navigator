/**
 * Tests for the Markdown preview's tag style override (itags.renderTagStyle).
 *
 * The user's CSS is injected as a second chunk after the bundled default, into
 * the same <style> element. Two things have to hold for the override contract:
 * the user's rules must come last (so they win on source order as well as on
 * being unlayered against the default's @layer), and a chunk must not be able
 * to break out of the element, since chunks are interpolated into an html_block
 * rather than assigned to textContent.
 */
import * as MarkdownIt from 'markdown-it';
import { injectStyleChunk } from '../src/styleInjector';

const DEFAULT_CSS = '@layer itagsDefaults;\n@layer itagsDefaults {\n  .itags-search-renderedTag { color: #fff; }\n}';

/** Renders with the given chunks injected, the way tagMarkdownItPlugin does. */
function render(chunks: () => string[], src = 'a #tag here'): string {
  const md = new (MarkdownIt as any)({ html: true });
  md.core.ruler.push('itags_test_inject', (state: any) => {
    for (const chunk of chunks()) { injectStyleChunk(state, state.Token, chunk); }
    return true;
  });
  return md.render(src);
}

function styleBlock(html: string): string {
  const m = html.match(/<style>[\s\S]*?<\/style>/);
  return m ? m[0] : '';
}

describe('preview style injection', () => {
  it('puts the user CSS after the default, so it wins on source order', () => {
    const out = styleBlock(render(() => [DEFAULT_CSS, '.itags-search-renderedTag { color: red; }']));
    expect(out).toContain('color: red');
    expect(out.indexOf('itagsDefaults')).toBeLessThan(out.indexOf('color: red'));
  });

  it('injects nothing extra when the setting is empty', () => {
    const withEmpty = styleBlock(render(() => [DEFAULT_CSS, '']));
    const withoutAny = styleBlock(render(() => [DEFAULT_CSS]));
    expect(withEmpty).toBe(withoutAny);
  });

  it('emits one style element, not one per chunk', () => {
    const out = render(() => [DEFAULT_CSS, '.a{}', '.b{}']);
    expect(out.match(/<style>/g)).toHaveLength(1);
  });

  it('does not repeat an identical chunk', () => {
    const out = styleBlock(render(() => [DEFAULT_CSS, '.dup{}', '.dup{}']));
    expect(out.match(/\.dup\{\}/g)).toHaveLength(1);
  });

  it('keeps the user CSS from closing the element and injecting markup', () => {
    const out = render(() => [DEFAULT_CSS, '</style><b>ESCAPED</b>']);
    // The element closes exactly once, and the would-be markup stays inside it,
    // where it is inert stylesheet text rather than document content.
    expect(out.match(/<\/style>/g)).toHaveLength(1);
    expect(styleBlock(out)).toContain('<b>ESCAPED</b>');
    const outsideStyle = out.replace(styleBlock(out), '');
    expect(outsideStyle).not.toContain('<b>ESCAPED</b>');
    expect(outsideStyle).toContain('<p>a #tag here</p>');
  });

  it('seals a closing tag consistently, so it is still deduplicated', () => {
    const hostile = '</style>x';
    const out = styleBlock(render(() => [DEFAULT_CSS, hostile, hostile]));
    expect(out.match(/x/g)).toHaveLength(1);
  });

  it('leaves ordinary CSS untouched', () => {
    const css = '.itags-search-renderedTag--at { background-color: #6fae4a; }';
    expect(styleBlock(render(() => [DEFAULT_CSS, css]))).toContain(css);
  });
});
