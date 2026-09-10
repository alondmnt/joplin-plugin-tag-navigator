/**
 * Tests for the search panel's checkbox markup.
 *
 * The panel's six replacements now come from CHECKBOX_STATES rather than six
 * literals. What the panel emits is read back by its own script (a click on
 * .itags-search-checkbox, the state from .xitOpen and friends) and by whatever
 * CSS users have written against those names, so the markup is asserted whole,
 * not by substring.
 */
import { renderCheckboxes } from '../src/searchPanel';

/**
 * The markup each state must emit: the classes the panel has always used, plus
 * the shared ones. Written out in full rather than assembled from the same
 * helpers the code uses, so a change to either has to be made here too.
 */
const EXPECTED: Record<string, string> = {
  ' ': '- <span class="itags-checkbox itags-checkbox--open itags-search-checkbox itags-search-checkbox--open xitOpen" data-checked="false"></span><span class="itags-search-xitOpen">task</span>',
  '@': '- <span class="itags-checkbox itags-checkbox--ongoing itags-search-checkbox itags-search-checkbox--ongoing xitOngoing" data-checked="false"></span><span class="itags-search-xitOngoing">task</span>',
  '?': '- <span class="itags-checkbox itags-checkbox--in-question itags-search-checkbox itags-search-checkbox--in-question xitInQuestion" data-checked="false"></span><span class="itags-search-xitInQuestion">task</span>',
  '!': '- <span class="itags-checkbox itags-checkbox--blocked itags-search-checkbox itags-search-checkbox--blocked xitBlocked" data-checked="false"></span><span class="itags-search-xitBlocked">task</span>',
  'x': '- <span class="itags-checkbox itags-checkbox--done itags-search-checkbox itags-search-checkbox--done xitDone" data-checked="true"></span><span class="itags-search-xitDone">task</span>',
  'X': '- <span class="itags-checkbox itags-checkbox--done itags-search-checkbox itags-search-checkbox--done xitDone" data-checked="true"></span><span class="itags-search-xitDone">task</span>',
  '~': '- <span class="itags-checkbox itags-checkbox--obsolete itags-search-checkbox itags-search-checkbox--obsolete xitObsolete" data-checked="false"></span><span class="itags-search-xitObsolete">task</span>',
};

describe('renderCheckboxes', () => {
  test('emits the markup for every state, old classes included', () => {
    for (const [marker, expected] of Object.entries(EXPECTED)) {
      expect(renderCheckboxes(`- [${marker}] task`)).toBe(`${expected}\n`);
    }
  });

  test('keeps the indent and the text after the marker', () => {
    const rendered = renderCheckboxes('    - [~] drop this');
    expect(rendered.startsWith('    - <span')).toBe(true);
    expect(rendered).toContain('<span class="itags-search-xitObsolete">drop this</span>');
  });

  test('rewrites every task in a block, and nothing else', () => {
    const rendered = renderCheckboxes('# heading\n- [ ] one\ntext\n- [x] two\n- [y] not a state');
    expect(rendered).toContain('# heading');
    expect(rendered).toContain('text');
    expect(rendered).toContain('- [y] not a state');
    expect(rendered.match(/itags-search-checkbox /g)).toHaveLength(2);
  });

  test('leaves a marker without a trailing space alone, as the panel always has', () => {
    expect(renderCheckboxes('- [@]')).toBe('- [@]');
  });
});
