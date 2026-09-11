/**
 * Tests that the settings cache cannot be poisoned by a caller.
 *
 * getTagSettings hands the same object to everyone, and the navigation panel
 * narrows its copy (inheritTags off, nestedTags off) to list a note's own
 * tags. Handing out the cache itself made that narrowing stick: every later
 * parse saw it, including the indexer's, so a note edited after the panel had
 * rendered was reindexed without inheritance and its sub-items vanished from
 * the search panel until the next full update.
 */
import joplin from 'api';
import {
  getConversionSettings, getNoteViewSettings, getResultSettings, getTagSettings,
  invalidateSettingsCache,
} from '../src/settings';

const SETTINGS = {
  'itags.inheritTags': true,
  'itags.nestedTags': true,
  'itags.ignoreCodeBlocks': true,
  'itags.valueDelim': '=',
  'itags.tagPrefix': '#',
  'itags.todayTag': '#today',
  'itags.monthTag': '#month',
  'itags.weekTag': '#week',
  'itags.includeNotebooks': '',
  'itags.excludeNotebooks': '',
};

describe('getTagSettings', () => {
  beforeEach(() => {
    invalidateSettingsCache();
    (joplin.settings.values as jest.Mock).mockResolvedValue(SETTINGS);
  });

  test('reads the settings it was given', async () => {
    const settings = await getTagSettings();
    expect(settings.inheritTags).toBe(true);
    expect(settings.nestedTags).toBe(true);
  });

  test('a caller that narrows the first copy does not narrow everyone else\'s', async () => {
    const forOnePanel = await getTagSettings();
    forOnePanel.inheritTags = false;
    forOnePanel.nestedTags = false;

    const forTheIndexer = await getTagSettings();
    expect(forTheIndexer.inheritTags).toBe(true);
    expect(forTheIndexer.nestedTags).toBe(true);
  });

  test('a caller that narrows a later copy does not narrow everyone else\'s', async () => {
    // The path the bug took: the indexer warms the cache, the navigation panel
    // renders and narrows what it was handed, and the next note edited is
    // reindexed without inheritance.
    await getTagSettings();
    const forOnePanel = await getTagSettings();
    forOnePanel.inheritTags = false;
    forOnePanel.nestedTags = false;

    const forTheIndexer = await getTagSettings();
    expect(forTheIndexer.inheritTags).toBe(true);
    expect(forTheIndexer.nestedTags).toBe(true);
  });

  test('never hands the same object to two callers', async () => {
    const cold = await getTagSettings();
    const warm = await getTagSettings();
    expect(cold).not.toBe(warm);
    expect(warm).not.toBe(await getTagSettings());
  });
});

/**
 * The other three getters carry the same one-line change with no caller that
 * forces the issue today, which is the usual precondition for it being tidied
 * away later.
 */
describe.each([
  ['getResultSettings', getResultSettings],
  ['getNoteViewSettings', getNoteViewSettings],
  ['getConversionSettings', getConversionSettings],
])('%s', (_name, getSettings) => {
  beforeEach(() => {
    invalidateSettingsCache();
    (joplin.settings.values as jest.Mock).mockResolvedValue(SETTINGS);
  });

  /** Marks an object the way a caller narrowing its own settings would. */
  const mark = (settings: object, key: string) => {
    (settings as Record<string, unknown>)[key] = true;
  };

  test('hands out a copy, cold and warm alike', async () => {
    const cold = await getSettings();
    mark(cold, 'markedCold');
    const warm = await getSettings();
    expect(warm).not.toHaveProperty('markedCold');
    expect(cold).not.toBe(warm);

    mark(warm, 'markedWarm');
    expect(await getSettings()).not.toHaveProperty('markedWarm');
  });
});
