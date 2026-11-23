/** Regression coverage for #61 through the plugin command and real CodeMirror state. */
import joplin from 'api';
import { EditorState, Transaction } from '@codemirror/state';
import replaceText from '../src/replaceText';
import * as settings from '../src/settings';
import * as db from '../src/db';
import * as searchPanel from '../src/searchPanel';
import { defTagRegex } from '../src/utils';
import '../src/index';

let replaceDateTags: () => Promise<void>;
let tagSettings: settings.TagSettings;

beforeAll(async () => {
  jest.spyOn(settings, 'registerSettings').mockResolvedValue(undefined);
  jest.spyOn(settings, 'getTagSettings').mockImplementation(async () => tagSettings);
  jest.spyOn(db, 'processAllNotes').mockResolvedValue(undefined);
  jest.spyOn(db, 'processNote').mockResolvedValue(undefined);
  jest.spyOn(searchPanel, 'registerSearchPanel').mockResolvedValue(undefined);

  // Capture the real command without starting unrelated menus, timers or panels.
  const registered = new Error('Date replacement command registered');
  (joplin.commands.register as jest.Mock).mockImplementation(async command => {
    if (command.name === 'itags.replaceDateTags') {
      replaceDateTags = command.execute;
      throw registered;
    }
  });
  const plugin = (joplin.plugins.register as jest.Mock).mock.calls[0][0];
  await expect(plugin.onStart()).rejects.toBe(registered);
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 31, 12));
  tagSettings = {
    tagRegex: defTagRegex,
    todayTag: '#today', monthTag: '#month', weekTag: '#week',
    todayTagRegex: /(#today)([+-]?\d*)/g,
    monthTagRegex: /(#month)([+-]?\d*)/g,
    weekTagRegex: /(#week)([+-]?\d*)/g,
    dateFormat: "'#'yyyy-MM-dd", monthFormat: "'#'yyyy-MM-dd", weekFormat: "'#'yyyy-MM-dd",
    tagPrefix: '#', valueDelim: '=', nestedTags: true, weekStartDay: 1,
  } as settings.TagSettings;
});

afterEach(() => { jest.useRealTimers(); });
afterAll(() => { jest.restoreAllMocks(); });

/** Mounts the content script and routes editor.execCommand across a serialised API boundary. */
function editorFor(marked: string, anchor = marked.indexOf('|')) {
  const commands: Record<string, (...args: any[]) => any> = {};
  const editor = {
    state: EditorState.create({
      doc: marked.replace('|', ''),
      selection: { anchor, head: marked.indexOf('|') },
    }),
    dispatch: jest.fn((transaction: Transaction) => { editor.state = transaction.state; }),
    focus: jest.fn(),
  };
  replaceText({} as any).plugin({
    cm6: true, editor,
    registerCommand: (name: string, command: (...args: any[]) => any) => { commands[name] = command; },
  } as any);
  (joplin.commands.execute as jest.Mock).mockImplementation(async (name, command) => {
    expect(name).toBe('editor.execCommand');
    const result = commands[command.name](...JSON.parse(JSON.stringify(command.args || [])));
    return JSON.parse(JSON.stringify(result));
  });
  (joplin.workspace.selectedNote as jest.Mock).mockImplementation(async () => ({
    id: 'test-note', body: editor.state.doc.toString(),
  }));
  return editor;
}

/** Returns the document with its main cursor marked for readable assertions. */
function markedText(state: EditorState): string {
  const doc = state.doc.toString();
  const cursor = state.selection.main.head;
  return doc.slice(0, cursor) + '|' + doc.slice(cursor);
}

describe('Replace date tags in current lines', () => {
  test.each([
    ['#today|', '#2026-10-31|'],
    ['due |#today later', 'due |#2026-10-31 later'],
    ['due #to|day later', 'due #2026-10-31| later'],
    ['due #today lat|er', 'due #2026-10-31 lat|er'],
    ['#today| and #today+1', '#2026-10-31| and #2026-11-01'],
    ['#today and |text and #today+1', '#2026-10-31 and |text and #2026-11-01'],
    ['#today and #today|', '#2026-10-31 and #2026-10-31|'],
    ['first line\ndue #today| later\nlast line', 'first line\ndue #2026-10-31| later\nlast line'],
  ])('maps the cursor from %s to %s', async (before, expected) => {
    const editor = editorFor(before);
    await replaceDateTags();
    expect(markedText(editor.state)).toBe(expected);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(editor.focus).toHaveBeenCalledTimes(1);
    expect(joplin.views.dialogs.showMessageBox).not.toHaveBeenCalled();
    expect(db.processNote).toHaveBeenCalledTimes(1);
  });

  test('maps a cursor in the unchanged prefix of a nested tag to its end', async () => {
    tagSettings.tagRegex = /(?<=^|\s)#[^\s]+/g;
    const editor = editorFor('#pro|ject/#today');
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('#project/2026-10-31|');
  });

  test('supports custom slash prefixes and date formats', async () => {
    Object.assign(tagSettings, {
      tagRegex: /(?<=^|\s)\/\/[^\s]+/g,
      todayTag: '//today', todayTagRegex: /(\/\/today)([+-]?\d*)/g,
      dateFormat: '//yyyy/MM/dd',
    });
    const editor = editorFor('//today|');
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('//2026/10/31|');
  });

  test('supports a replacement shorter than the original tag', async () => {
    tagSettings.dateFormat = "'#'dd";
    const editor = editorFor('#today| later');
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('#31| later');
  });

  test('uses original match offsets even when replacement text contains a later tag', async () => {
    tagSettings.dateFormat = "'#today+1'";
    const editor = editorFor('#today+2 #today|');
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('#today+1 #today+1|');
  });

  test('resets the scan without changing the cached regex position', async () => {
    const regex = new RegExp(defTagRegex.source, 'g');
    regex.lastIndex = 8;
    tagSettings.tagRegex = regex;
    const editor = editorFor('#today|');
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('#2026-10-31|');
    expect(regex.lastIndex).toBe(8);
  });

  test('keeps the single-line selection collapse at its mapped head', async () => {
    const editor = editorFor('due #today| later', 4);
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('due #2026-10-31| later');
    expect(editor.state.selection.main.empty).toBe(true);
  });

  test('derives multi-line replacement text from the same edits', async () => {
    const editor = editorFor('before\n#today and #today+1\nunchanged\n#today|\nafter', 7);
    await replaceDateTags();
    expect(markedText(editor.state)).toBe('before\n#2026-10-31 and #2026-11-01\nunchanged\n#2026-10-31|\nafter');
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(joplin.views.dialogs.showMessageBox).not.toHaveBeenCalled();
  });

  test('leaves the editor untouched when no date tags need replacing', async () => {
    const editor = editorFor('plain #tag| text');
    const originalState = editor.state;
    await replaceDateTags();
    expect(editor.state).toBe(originalState);
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(db.processNote).not.toHaveBeenCalled();
    expect(joplin.views.dialogs.showMessageBox).toHaveBeenCalledWith(
      'No date tags found to replace in the current line(s).',
    );
  });
});
