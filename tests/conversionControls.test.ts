/** End-to-end conversion controls with a small, stateful Joplin API fixture (#59). */
import joplin from 'api';
import { convertNoteToJoplinTags, convertNoteToInlineTags, convertAllNotesToJoplinTags, convertAllNotesToInlineTags } from '../src/converter';
import { getTagSettings, getConversionSettings, invalidateSettingsCache } from '../src/settings';
import { TagConversionData } from '../src/tracker';
import { parseTagsLines } from '../src/parser';

const SETTINGS = {
  'itags.tagRegex': String.raw`(?<=^|\s)([#@+]|\/\/)([^\s#@'",.()\[\]:;?\\]+)`,
  'itags.todayTag': '#today', 'itags.monthTag': '#month', 'itags.weekTag': '#week',
  'itags.nestedTags': true, 'itags.ignoreCodeBlocks': true, 'itags.ignoreFrontMatter': false,
  'itags.tagPrefix': '#', 'itags.valueDelim': '=', 'itags.spaceReplace': '_',
};

beforeEach(() => {
  jest.clearAllMocks();
  (joplin.views.dialogs.showToast as jest.Mock).mockResolvedValue(undefined);
  invalidateSettingsCache();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 24, 12));
});
afterEach(() => { jest.useRealTimers(); });

/** Runs real conversion, tracking, settings and parsers; only Joplin persistence is simulated. */
async function fixture(body: string, native: string[] = [], overrides = {}, previous: string[] = []) {
  const note = { id: 'note1', body, markup_language: 1, parent_id: 'folder1' };
  const titles = new Map(native.map((title, index) => [`tag${index}`, title]));
  const associated = new Set(native);
  let history: TagConversionData | null = previous.length
    ? { joplinTags: previous.slice(), inlineTags: previous.slice(), lastUpdated: 1 } : null;
  (joplin.settings.values as jest.Mock).mockResolvedValue({ ...SETTINGS, ...overrides });
  (joplin.data.get as jest.Mock).mockImplementation(async path => {
    if (path[0] === 'tags') return { items: Array.from(titles, ([id, title]) => ({ id, title })), has_more: false };
    if (path.length === 1) return { items: [{ ...note }], has_more: false };
    return { items: Array.from(titles, ([id, title]) => ({ id, title })).filter(tag => associated.has(tag.title)) };
  });
  (joplin.data as any).post = jest.fn(async (path, _query, data) => {
    if (path.length === 1) {
      const id = `tag${titles.size}`;
      titles.set(id, data.title);
      return { id, title: data.title };
    }
    associated.add(titles.get(path[1]));
    return {};
  });
  (joplin.data as any).delete = jest.fn(async path => { associated.delete(titles.get(path[1])); });
  (joplin.data.put as jest.Mock).mockImplementation(async (_path, _query, data) => { note.body = data.body; });
  (joplin.data as any).userDataGet = jest.fn(async () => history && JSON.parse(JSON.stringify(history)));
  (joplin.data as any).userDataSet = jest.fn(async (_type, _id, _key, data) => { history = JSON.parse(JSON.stringify(data)); });
  const tagSettings = await getTagSettings();
  const conversionSettings = await getConversionSettings();
  return {
    note, tagSettings, conversionSettings, associated,
    names: () => Array.from(associated).sort(),
    toNative: () => convertNoteToJoplinTags(note, tagSettings, conversionSettings),
    toInline: () => convertNoteToInlineTags(note, conversionSettings, tagSettings),
  };
}

describe('conversion projection', () => {
  test('preserves current expansion by default', async () => {
    const f = await fixture('#project/client #color=green');
    await f.toNative();
    expect(f.names()).toEqual(['color', 'color=green', 'project', 'project/client']);
  });

  test('disables parent and bare-key expansion locally', async () => {
    const f = await fixture('#project #project/client #color=green', [], { 'itags.conversionExpandTags': false });
    await f.toNative();
    expect(f.names()).toEqual(['color=green', 'project', 'project/client']);
    expect(f.tagSettings.nestedTags).toBe(true);
    expect(parseTagsLines('#color=green', f.tagSettings).map(tag => tag.tag)).toEqual(expect.arrayContaining(['#color', '#color=green']));
  });

  test('does not enable expansion when globally disabled', async () => {
    const f = await fixture('#project/client #color=green', [], { 'itags.nestedTags': false });
    await f.toNative();
    expect(f.names()).toEqual(['color=green', 'project/client']);
  });

  test('applies the same controls to frontmatter', async () => {
    const f = await fixture('---\ntags: ["#project/client", "@alice"]\ncolor: green\n---\nBody.', [], {
      'itags.conversionExpandTags': false, 'itags.conversionExcludeRegex': '^@',
    });
    await f.toNative();
    expect(f.names()).toEqual(['color=green', 'frontmatter', 'project/client']);
  });

  test('excludes raw occurrences before dates, parents and keys are generated', async () => {
    const f = await fixture('#project/client #color=green #today @Alice +project', [], {
      'itags.conversionExcludeRegex': String.raw`^(?:#project/client$|#color=green$|#today$|@)`,
    });
    await f.toNative();
    expect(f.names()).toEqual(['+project']);
  });

  test('filters captured whitespace and does not change global tag exclusions', async () => {
    const f = await fixture('text @alice #topic', [], {
      'itags.tagRegex': String.raw`(^|\s)([#@])(\S+)`, 'itags.conversionExcludeRegex': '^@',
    });
    await f.toNative();
    expect(f.names().some(name => name.includes('alice'))).toBe(false);
    expect(f.tagSettings.excludeRegex).toBeNull();
  });

  test('generated parent tags also respect the exclusion rule', async () => {
    const f = await fixture('#project/client', [], { 'itags.conversionExcludeRegex': '^#project$' });
    await f.toNative();
    expect(f.names()).toEqual(['project/client']);
  });
});

describe.each([false, true])('exclusion with tracking=%s', tracking => {
  test('protects previously converted excluded native tags, including an empty managed set', async () => {
    const f = await fixture('@alice', ['@alice'], {
      'itags.enableTagTracking': tracking, 'itags.conversionExcludeRegex': '^@',
    }, ['@alice']);
    await f.toNative();
    expect(f.names()).toEqual(['@alice']);
    expect((joplin.data as any).delete).not.toHaveBeenCalled();
  });

  test('protects excluded inline tags when rebuilding or removing tracked tags', async () => {
    const f = await fixture('tags: @alice #keep\nBody.', ['keep'], {
      'itags.enableTagTracking': tracking, 'itags.conversionExcludeRegex': '^@',
    }, ['@alice', 'keep']);
    await f.toInline();
    expect(f.note.body).toBe('tags: @alice #keep\nBody.');
    f.associated.delete('keep');
    await f.toInline();
    expect(f.note.body).toBe('tags: @alice\nBody.');
  });

  test('tests Joplin tags against their generated inline form', async () => {
    const f = await fixture('Body.', ['@alice', 'note/daily', 'topic'], {
      'itags.enableTagTracking': tracking, 'itags.conversionExcludeRegex': String.raw`^(?:@|#note(?:/|$))`,
    });
    await f.toInline();
    expect(f.note.body).toBe('tags: #topic\nBody.');
    expect(f.names()).toEqual(['@alice', 'note/daily', 'topic']);
  });
});

test('protects ancestors previously generated by a now-excluded raw occurrence', async () => {
  const f = await fixture('#project/client', ['project', 'project/client'], {
    'itags.enableTagTracking': true, 'itags.conversionExcludeRegex': '^#project/client$',
  }, ['project', 'project/client']);
  await f.toNative();
  expect(f.names()).toEqual(['project', 'project/client']);
});

test('changing expansion retains existing tracking cleanup', async () => {
  const f = await fixture('#project/client #color=green', ['project', 'project/client', 'color', 'color=green'], {
    'itags.enableTagTracking': true, 'itags.conversionExpandTags': false,
  }, ['project', 'project/client', 'color', 'color=green']);
  await f.toNative();
  expect(f.names()).toEqual(['color=green', 'project/client']);
});

test('bulk inline → Joplin uses the same projection and exclusions', async () => {
  const f = await fixture('#project/client #color=green @alice', [], {
    'itags.conversionExpandTags': false, 'itags.conversionExcludeRegex': '^@',
  });
  await convertAllNotesToJoplinTags();
  expect(f.names()).toEqual(['color=green', 'project/client']);
});

test('bulk Joplin → inline preserves excluded list tags', async () => {
  const f = await fixture('tags: @alice #stale\nBody.', ['topic'], { 'itags.conversionExcludeRegex': '^@' });
  await convertAllNotesToInlineTags(f.conversionSettings);
  expect(f.note.body).toBe('tags: @alice #topic\nBody.');
});

test('a list containing only excluded tags is not rewritten', async () => {
  const f = await fixture('tags:  @Alice   //today\nBody.', [], { 'itags.conversionExcludeRegex': '^(?:@|//)' });
  await f.toInline();
  expect(joplin.data.put).not.toHaveBeenCalled();
});

test('excluded tags in frontmatter survive reverse conversion', async () => {
  const body = '---\ntags: ["@alice"]\n---\nBody.';
  const f = await fixture(body, ['topic'], { 'itags.conversionExcludeRegex': '^@' });
  await f.toInline();
  expect(f.note.body).toBe('---\ntags: ["@alice"]\n---\ntags: #topic\nBody.');
});

test('conversion controls refresh through the existing settings cache', async () => {
  const f = await fixture('#topic');
  expect(f.conversionSettings.conversionExpandTags).toBe(true);
  expect(f.conversionSettings.conversionExcludeRegex).toBe('');
  (joplin.settings.values as jest.Mock).mockResolvedValue({ ...SETTINGS,
    'itags.conversionExpandTags': false, 'itags.conversionExcludeRegex': '^@',
  });
  invalidateSettingsCache();
  const updated = await getConversionSettings();
  expect(updated.conversionExpandTags).toBe(false);
  expect(updated.conversionExcludeRegex).toBe('^@');
});

describe('conversion review regressions (#59)', () => {
  test('disabling expansion preserves the indexed spelling of a nested date tag', async () => {
    const f = await fixture('#deadline/#today', [], {
      'itags.tagRegex': String.raw`(?<=^|\s)#[^\s]+`,
      'itags.conversionExpandTags': false,
    });
    expect(parseTagsLines(f.note.body, f.tagSettings).map(tag => tag.tag)).toContain('#deadline/2026-11-24');
    await f.toNative();
    expect(f.names()).toEqual(['deadline/2026-11-24']);
  });

  test('preserves an excluded first tag when the regex requires preceding whitespace', async () => {
    const f = await fixture('tags: #secret #public\nBody.', [], {
      'itags.tagRegex': String.raw`(?<=\s)#\w+`,
      'itags.conversionExcludeRegex': '^#secret$',
    });
    await f.toInline();
    expect(f.note.body).toBe('tags: #secret\nBody.');
  });

  test('preserves an excluded uppercase tag recognised by the body parser', async () => {
    const f = await fixture('tags: #SECRET\nBody.', [], {
      'itags.tagRegex': String.raw`(?<=^|\s)#[a-z]+`,
      'itags.conversionExcludeRegex': '^#secret$',
    });
    expect(parseTagsLines(f.note.body, f.tagSettings).map(tag => tag.tag)).toContain('#secret');
    await f.toInline();
    expect(f.note.body).toBe('tags: #SECRET\nBody.');
  });

  test('retains default no-op conversion when a matching tag list is already in the note', async () => {
    const body = 'Intro.\ntags: #topic\nBody.';
    const f = await fixture(body, ['topic']);
    await f.toInline();
    expect(f.note.body).toBe(body);
    expect(joplin.data.put).not.toHaveBeenCalled();
  });

  test('rebuilds a list without trailing prefix whitespace while preserving excluded tags', async () => {
    const f = await fixture('tags:#stale #secret\nBody.', ['topic'], {
      'itags.listPrefix': 'tags:', 'itags.conversionExcludeRegex': '^#secret$',
    });
    await f.toInline();
    expect(f.note.body).toBe('tags:#secret #topic\nBody.');
  });

  test.each([String.raw`(?<=^|\s)#[^\s]+`, String.raw`(^|\s)#[^\s]+`])(
    'preserves raw spelling and offsets when lowercasing changes length (%s)', async tagRegex => {
      const f = await fixture('tags: #İ #SECRET #public\nBody.', [], {
        'itags.tagRegex': tagRegex, 'itags.conversionExcludeRegex': '^#secret$',
      });
      await f.toInline();
      expect(f.note.body).toBe('tags: #SECRET\nBody.');
    }
  );
});

test('older clients receive an error message when the toast API is unavailable', async () => {
  const f = await fixture('#topic', [], { 'itags.conversionExcludeRegex': '[' });
  (joplin.views.dialogs.showToast as jest.Mock).mockRejectedValue(new Error('Unsupported method'));
  await f.toNative();
  expect(joplin.views.dialogs.showMessageBox).toHaveBeenCalledWith('Invalid tag conversion exclusion regex. Conversion cancelled.');
  expect((joplin.data as any).post).not.toHaveBeenCalled();
});

describe.each(['[', '(.*)*'])('invalid or unsafe exclusion %s', pattern => {
  test.each(['toNative', 'toInline', 'allNative', 'allInline'])('aborts %s before data writes', async direction => {
    const f = await fixture('tags: #topic', ['topic'], { 'itags.conversionExcludeRegex': pattern });
    if (direction === 'toNative') await f.toNative();
    if (direction === 'toInline') await f.toInline();
    if (direction === 'allNative') await convertAllNotesToJoplinTags();
    if (direction === 'allInline') await convertAllNotesToInlineTags(f.conversionSettings);
    expect(joplin.views.dialogs.showToast).toHaveBeenCalledTimes(1);
    expect(joplin.data.put).not.toHaveBeenCalled();
    expect((joplin.data as any).post).not.toHaveBeenCalled();
    expect((joplin.data as any).delete).not.toHaveBeenCalled();
    expect((joplin.data as any).userDataSet).not.toHaveBeenCalled();
  });
});
