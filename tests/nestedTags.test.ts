/**
 * Tests for nested tag expansion and parent-tag search.
 *
 * Covers the default #-prefix regex and the extended regex from the
 * settings description (@mentions, +projects, //due-dates).
 * Includes repro for issue #38.
 */
import { parseTagsLines, defTagRegex } from '../src/parser';
import { TagSettings } from '../src/settings';
import { NoteDatabase, DatabaseManager, processNote } from '../src/db';

/** Minimal TagSettings for tests - mirrors plugin defaults. */
function makeTagSettings(overrides: Partial<TagSettings> = {}): TagSettings {
  return {
    tagRegex: defTagRegex,
    excludeRegex: null,
    minCount: 1,
    colorTag: '#color=',
    todayTag: '#today',
    monthTag: '#month',
    weekTag: '#week',
    todayTagRegex: /(#today)([+-]?\d*)/g,
    monthTagRegex: /(#month)([+-]?\d*)/g,
    weekTagRegex: /(#week)([+-]?\d*)/g,
    dateFormat: '#yyyy-MM-dd',
    monthFormat: '#yyyy-MM',
    weekFormat: '#yyyy-MM-dd',
    weekStartDay: 0,
    valueDelim: '=',
    spaceReplace: '_',
    tagPrefix: '#',
    ignoreHtmlNotes: false,
    ignoreCodeBlocks: true,
    ignoreFrontMatter: false,
    inheritTags: false,
    nestedTags: true,
    fullNotebookPath: false,
    middleMatter: false,
    includeNotebooks: [],
    excludeNotebooks: [],
    readBatchSize: 10,
    ...overrides,
  };
}

/** Build a minimal note object suitable for processNote. */
function makeNote(body: string, id = 'note1') {
  return {
    id,
    title: 'Test Note',
    body,
    markup_language: 1,
    is_conflict: 0,
    updated_time: Date.now(),
    parent_id: 'notebook1',
  };
}

/** Extended regex from settings description: #tags, @mentions, +projects, //dates.
 * Taken verbatim from the itags.tagRegex setting example. */
const extendedTagRegex = /(?<=^|\s)([#@+]|\/\/)([^\s#@'",.()\[\]:;\?\\]+)/g;

// ---------------------------------------------------------------------------
// Parser-level tests (default # regex)
// ---------------------------------------------------------------------------

describe('parseTagsLines - nested tag expansion', () => {
  const settings = makeTagSettings();

  test('expands #parent/child into both parent and child entries', () => {
    const text = '- [ ] line tagged #ab/child';
    const tags = parseTagsLines(text, settings);
    const tagNames = tags.map(t => t.tag);

    expect(tagNames).toContain('#ab');
    expect(tagNames).toContain('#ab/child');
  });

  test('parent entry contains the same line as the child', () => {
    const text = '- [ ] line tagged #ab/child';
    const tags = parseTagsLines(text, settings);
    const parent = tags.find(t => t.tag === '#ab');
    const child = tags.find(t => t.tag === '#ab/child');

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(parent.lines).toEqual(child.lines);
  });

  test('multiple nested children all contribute to parent', () => {
    const text = [
      '- [ ] line tagged #ab/tagged',
      '- [ ] line tagged #ab/child',
      '- [ ] line tagged #ab',
    ].join('\n');

    const tags = parseTagsLines(text, settings);
    const parent = tags.find(t => t.tag === '#ab');

    expect(parent).toBeDefined();
    // All three lines should be associated with #ab
    expect(parent.lines.sort()).toEqual([0, 1, 2]);
  });

  test('does not expand when nestedTags is false', () => {
    const off = makeTagSettings({ nestedTags: false });
    const text = '- [ ] line tagged #ab/child';
    const tags = parseTagsLines(text, off);
    const tagNames = tags.map(t => t.tag);

    expect(tagNames).toContain('#ab/child');
    expect(tagNames).not.toContain('#ab');
  });
});

// ---------------------------------------------------------------------------
// Issue #38 repro: full pipeline (parse -> index -> search)
// ---------------------------------------------------------------------------

describe('issue #38 repro: parent tag search returns nested children', () => {
  const settings = makeTagSettings();

  const noteBody = [
    '- [ ] line tagged #ab/tagged',
    '- [ ] line tagged #ab/child',
    '- [ ] line tagged #ab',
  ].join('\n');

  let db: NoteDatabase;

  beforeEach(async () => {
    DatabaseManager.clearDatabase();
    db = DatabaseManager.getDatabase();
    await processNote(db, makeNote(noteBody), settings);
  });

  test('searching for parent #ab returns all 3 lines', () => {
    const results = db.searchBy('tag', '#ab', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines.size).toBe(3);
    expect(lines).toEqual(new Set([0, 1, 2]));
  });

  test('searching for child #ab/child returns its specific line', () => {
    const results = db.searchBy('tag', '#ab/child', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines).toEqual(new Set([1]));
  });

  test('searching for child #ab/tagged returns its specific line', () => {
    const results = db.searchBy('tag', '#ab/tagged', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines).toEqual(new Set([0]));
  });

  test('re-indexing the same note preserves parent matches', async () => {
    // Simulate re-indexing (as processNoteTags does on note change)
    await processNote(db, makeNote(noteBody), settings);

    const results = db.searchBy('tag', '#ab', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines.size).toBe(3);
  });

  test('re-indexing with a modified body updates correctly', async () => {
    // Remove one child line
    const modified = [
      '- [ ] line tagged #ab/tagged',
      '- [ ] line tagged #ab',
    ].join('\n');

    await processNote(db, makeNote(modified), settings);

    const results = db.searchBy('tag', '#ab', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines.size).toBe(2);
    expect(lines).toEqual(new Set([0, 1]));

    // #ab/child should no longer match
    const childResults = db.searchBy('tag', '#ab/child', false);
    expect(childResults['note1']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Extended regex: +projects, @mentions, //dates
// ---------------------------------------------------------------------------

describe('parseTagsLines - extended regex prefixes', () => {
  const settings = makeTagSettings({ tagRegex: extendedTagRegex });

  test('matches +project tags', () => {
    const tags = parseTagsLines('task +project/sub', settings);
    const names = tags.map(t => t.tag);
    expect(names).toContain('+project');
    expect(names).toContain('+project/sub');
  });

  test('matches @mention tags', () => {
    const tags = parseTagsLines('assigned @team/alice', settings);
    const names = tags.map(t => t.tag);
    expect(names).toContain('@team');
    expect(names).toContain('@team/alice');
  });

  test('matches //date tags', () => {
    const tags = parseTagsLines('due //2026-04-07', settings);
    const names = tags.map(t => t.tag);
    expect(names).toContain('//2026-04-07');
  });

  test('expands //prefix/child into parent and child', () => {
    const tags = parseTagsLines('deadline //due/2026-04-07', settings);
    const names = tags.map(t => t.tag);
    expect(names).toContain('//due');
    expect(names).toContain('//due/2026-04-07');
  });

  test('mixed prefixes on the same line', () => {
    const text = 'task +ab/child @alice #topic';
    const tags = parseTagsLines(text, settings);
    const names = tags.map(t => t.tag);
    expect(names).toContain('+ab');
    expect(names).toContain('+ab/child');
    expect(names).toContain('@alice');
    expect(names).toContain('#topic');
  });
});

// ---------------------------------------------------------------------------
// Issue #38 exact repro with extended regex
// ---------------------------------------------------------------------------

describe('issue #38 repro: extended regex with + and // prefixes', () => {
  const settings = makeTagSettings({ tagRegex: extendedTagRegex });

  // Exact note body from the issue report (using + and // prefixes)
  const noteBody = [
    '- [ ] line tagged +ab/tagged',
    '- [ ] line tagged +ab/child',
    '- [ ] line tagged //⏰',
    '- [ ] line tagged //⏰/2026-04-07',
    '- [ ] line tagged +ab',
  ].join('\n');

  let db: NoteDatabase;

  beforeEach(async () => {
    DatabaseManager.clearDatabase();
    db = DatabaseManager.getDatabase();
    await processNote(db, makeNote(noteBody), settings);
  });

  test('searching for +ab returns all 3 lines with +ab or +ab/*', () => {
    const results = db.searchBy('tag', '+ab', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines).toEqual(new Set([0, 1, 4]));
  });

  test('searching for //⏰ returns both //⏰ lines', () => {
    const results = db.searchBy('tag', '//⏰', false);
    const lines = results['note1'];
    expect(lines).toBeDefined();
    expect(lines).toEqual(new Set([2, 3]));
  });

  test('union of +ab and //⏰ returns all 5 lines', () => {
    // Simulates the (OR) query from the issue
    const abResults = db.searchBy('tag', '+ab', false);
    const emojiResults = db.searchBy('tag', '//⏰', false);

    const abLines = abResults['note1'] || new Set<number>();
    const emojiLines = emojiResults['note1'] || new Set<number>();
    const union = new Set([...abLines, ...emojiLines]);

    expect(union).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  test('individual child searches still work', () => {
    expect(db.searchBy('tag', '+ab/tagged', false)['note1']).toEqual(new Set([0]));
    expect(db.searchBy('tag', '+ab/child', false)['note1']).toEqual(new Set([1]));
    expect(db.searchBy('tag', '//⏰/2026-04-07', false)['note1']).toEqual(new Set([3]));
  });
});
