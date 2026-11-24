/** Regression coverage for recognised prefixes in Joplin → inline conversion (#62). */
import joplin from 'api';
import { convertNoteToInlineTags } from '../src/converter';
import { parseTagsFromFrontMatter } from '../src/parser';
import { ConversionSettings, TagSettings } from '../src/settings';
import { TagConversionData, isTagListLine } from '../src/tracker';
import { defTagRegex, formatInlineTag } from '../src/utils';

/** The documented multi-prefix syntax, without a hardcoded prefix list in production. */
const MULTI_PREFIX = /(?<=^|\s)([#@+]|\/\/)([^\s#@'",.()\[\]:;?\\]+)/g;

/** Settings sufficient for the real parser and converter, with predictable date parsing. */
function tagSettings(tagRegex = new RegExp(MULTI_PREFIX.source, 'g')): TagSettings {
  return {
    tagRegex, excludeRegex: null, tagPrefix: '#', spaceReplace: '_', valueDelim: '=',
    todayTag: '#today', monthTag: '#month', weekTag: '#week',
    todayTagRegex: /(#today)([+-]?\d*)/g,
    monthTagRegex: /(#month)([+-]?\d*)/g,
    weekTagRegex: /(#week)([+-]?\d*)/g,
    dateFormat: '#yyyy-MM-dd', monthFormat: '#yyyy-MM', weekFormat: '#yyyy-MM-dd',
    nestedTags: false, ignoreFrontMatter: false, ignoreCodeBlocks: true,
  } as TagSettings;
}

/** An in-memory Joplin API boundary: actual conversion, parsing and tracking code run. */
function conversionFor(tags: string[], tracking: boolean, body = 'Body text.', settings = tagSettings()) {
  let noteBody = body;
  let currentTags = tags;
  let history: TagConversionData | null = null;
  const options: ConversionSettings = {
    tagPrefix: '#', spaceReplace: '_', listPrefix: 'tags: ', location: 'top', enableTagTracking: tracking,
    conversionExcludeRegex: '', conversionExpandTags: true,
  };
  (joplin.data.get as jest.Mock).mockImplementation(async () => ({
    items: currentTags.map((title, index) => ({ id: `tag${index}`, title })),
  }));
  (joplin.data.put as jest.Mock).mockImplementation(async (_path, _query, data) => {
    noteBody = data.body;
  });
  // Tracking clears API response objects, so hand out copies as the real API does.
  (joplin.data as any).userDataGet = jest.fn(async () => history ? JSON.parse(JSON.stringify(history)) : null);
  (joplin.data as any).userDataSet = jest.fn(async (_type, _id, _key, data) => {
    history = JSON.parse(JSON.stringify(data));
  });
  return {
    settings, options,
    body: () => noteBody,
    setTags: (value: string[]) => { currentTags = value; },
    convert: () => convertNoteToInlineTags({ id: 'note1', body: noteBody, markup_language: 1 }, options, settings),
  };
}

beforeEach(() => { jest.clearAllMocks(); });

describe.each([false, true])('reverse conversion with tracking=%s', tracking => {
  test.each(['@alice', '+project', '//2030-01-15', '#topic'])('preserves %s on repeated conversion', async tag => {
    const note = conversionFor([tag], tracking);
    await note.convert();
    expect(note.body()).toBe(`tags: ${tag}\nBody text.`);
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(note.body()).toBe(`tags: ${tag}\nBody text.`);
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('adds the configured prefix and replaces spaces on plain Joplin tags', async () => {
    const note = conversionFor(['alice', 'two words'], tracking);
    await note.convert();
    expect(note.body()).toBe('tags: #alice #two_words\nBody text.');
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('supports a custom configured prefix', async () => {
    const note = conversionFor(['alice', '+project'], tracking);
    note.settings.tagPrefix = '@';
    note.options.tagPrefix = '@';
    await note.convert();
    expect(note.body()).toBe('tags: +project @alice\nBody text.');
  });

  test('recognises a list beginning with an alternative prefix when adding another tag', async () => {
    const note = conversionFor(['@alice'], tracking);
    await note.convert();
    note.setTags(['@alice', '+project']);
    await note.convert();
    expect(note.body()).toBe('tags: @alice +project\nBody text.');
  });

  test('does not duplicate tags already written in the note body', async () => {
    const note = conversionFor(['@alice', '+project', '#topic'], tracking, 'Text with @alice +project #topic.');
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('keeps frontmatter intact and puts the generated list after it', async () => {
    const note = conversionFor(['@alice'], tracking, '---\ntags: ["+project"]\n---\nBody text.');
    await note.convert();
    expect(note.body()).toBe('---\ntags: ["+project"]\n---\ntags: @alice\nBody text.');
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('deduplicates Joplin names with the same inline representation', async () => {
    const note = conversionFor(['alice', '#alice'], tracking);
    await note.convert();
    expect(note.body()).toBe('tags: #alice\nBody text.');
    note.setTags(['#alice']);
    await note.convert();
    expect(note.body()).toBe('tags: #alice\nBody text.');
    note.setTags([]);
    await note.convert();
    expect(note.body()).toBe('Body text.');
  });

  test('supports bottom placement with an alternative-prefix list', async () => {
    const note = conversionFor(['@alice'], tracking);
    note.options.location = 'bottom';
    await note.convert();
    expect(note.body()).toBe('Body text.\ntags: @alice');
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('preserves an alternative prefix when replacing spaces in a Joplin name', async () => {
    const note = conversionFor(['@alice smith'], tracking);
    await note.convert();
    expect(note.body()).toBe('tags: @alice_smith\nBody text.');
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
  });
});

describe('tracked removal', () => {
  test.each(['@alice', '+project', '//2030-01-15', '#topic'])('removes a complete %s tag while retaining a longer tag', async tag => {
    const note = conversionFor([tag, tag + '2'], true);
    await note.convert();
    note.setTags([tag + '2']);
    await note.convert();
    expect(note.body()).toBe(`tags: ${tag}2\nBody text.`);
    note.setTags([]);
    await note.convert();
    expect(note.body()).toBe('Body text.');
  });

  test('handles a list prefix with no trailing space', async () => {
    const note = conversionFor(['@alice', '+project'], true);
    note.options.listPrefix = 'tags:';
    await note.convert();
    (joplin.data.put as jest.Mock).mockClear();
    await note.convert();
    expect(joplin.data.put).not.toHaveBeenCalled();
    note.setTags(['+project']);
    await note.convert();
    expect(note.body()).toBe('tags:+project\nBody text.');
  });

  test('leaves the same tag in ordinary body text untouched', async () => {
    const edited = conversionFor([], true, 'tags: @alice\nBody text with @alice.');
    (joplin.data as any).userDataGet.mockImplementation(async () => ({
      joplinTags: ['@alice'], inlineTags: ['@alice'], lastUpdated: 1,
    }));
    await edited.convert();
    expect(edited.body()).toBe('Body text with @alice.');
  });

  test.each(['#project', '+project'])('retains %s when its only inline occurrence was inferred from a removed child', async parent => {
    const settings = tagSettings();
    settings.nestedTags = true;
    const note = conversionFor([parent + '/child'], true, 'Body text.', settings);
    await note.convert();
    expect(note.body()).toBe(`tags: ${parent}/child\nBody text.`);
    note.setTags([parent]);
    await note.convert();
    expect(note.body()).toBe(`tags: ${parent}\nBody text.`);
  });
});

describe('shared detection', () => {
  test('uses the frontmatter rule repeatedly with a global regex whose position is stale', () => {
    const settings = tagSettings();
    settings.tagRegex.lastIndex = 50;
    const input = ['@alice', '+project', '//2030-01-15', '#topic', 'two words'];
    expect(input.map(tag => formatInlineTag(tag, settings))).toEqual([
      '@alice', '+project', '//2030-01-15', '#topic', '#two_words',
    ]);
    const tags = parseTagsFromFrontMatter(`---\ntags: ${JSON.stringify(input)}\n---`, settings).map(t => t.tag);
    expect(tags).toEqual(['@alice', '+project', '//2030-01-15', '#topic', '#two_words', '#frontmatter']);
  });

  test('retains frontmatter whitespace normalisation and plain-tag space replacement', () => {
    const settings = tagSettings();
    expect(formatInlineTag('two  words', settings)).toBe('#two__words');
    const tags = parseTagsFromFrontMatter('---\ntags: ["two  words"]\n---', settings).map(t => t.tag);
    expect(tags).toContain('#two_words');
  });

  test.each(['tags: [@alice]', 'tags: ["@alice"]', 'tags: text with @alice'])('does not treat %s as a managed list', line => {
    expect(isTagListLine(line, 'tags: ', tagSettings())).toBe(false);
  });

  test('recognises configured prefixes even when the regex does not recognise them', () => {
    expect(isTagListLine('tags: #topic', 'tags: ', tagSettings(/@\w+/g))).toBe(true);
  });

  test('preserves the single-prefix behaviour with the default regex', () => {
    const settings = tagSettings(defTagRegex);
    expect(formatInlineTag('alice', settings)).toBe('#alice');
    expect(formatInlineTag('@alice', settings)).toBe('#@alice');
    expect(formatInlineTag('#alice', settings)).toBe('#alice');
  });
});
