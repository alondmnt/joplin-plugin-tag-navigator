import type { ContentScriptContext, CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate,
} from '@codemirror/view';
import { defTagRegex, mapPrefixClass } from './utils';

const TAG_CLASS = 'itags-editor-tag';
const STYLE_ELEMENT_ID = 'itags-editor-tag-style';

/**
 * Default tag appearance, matching the search panel and the Markdown preview.
 *
 * Wrapped in a cascade layer so that any unlayered rule overrides it without
 * needing !important: the `Inline tags: Editor style` setting on every platform,
 * and userstyle.css on desktop. Deliberately omits `display: inline-block` and
 * `margin`, which disturb caret placement and line height in the editor.
 */
const DEFAULT_CSS = `@layer itagsEditorDefaults;
@layer itagsEditorDefaults {
  .${TAG_CLASS} {
    background-color: #7698b3;
    color: #ffffff;
    border-radius: 5px;
    padding: 0em 2px;
  }
}`;

type TagStyleSettings = {
  tagRegex: string;
  excludeRegex: string;
  css: string;
};

/**
 * Sample text a candidate pattern is probed against. Covers a line start, a
 * trailing space, whitespace boundaries, a mid-word hash and each documented
 * prefix, so a pattern whose zero-length match needs context is caught along
 * with one that matches the empty string outright.
 */
const PROBE_TEXT = ' #tag @a +b //c\nfoo#bar\nx ';

/**
 * Whether a pattern can produce a zero-length match, which is the condition that
 * freezes the editor. Testing against '' alone is not enough: a pattern led by a
 * zero-width assertion, such as \b\w* or (?<=\s)\S*, matches the empty string
 * only in context and would slip through.
 */
function canMatchEmpty(pattern: RegExp): boolean {
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = pattern.exec(PROBE_TEXT)) !== null) {
    if (match[0].length === 0) { return true; }
    // More matches than characters means exec is not advancing.
    if (++count > PROBE_TEXT.length) { return true; }
  }
  return false;
}

/**
 * Compiles a user-supplied tag pattern, falling back to the default when it does
 * not compile or can produce a zero-length match. MatchDecorator iterates exec()
 * without advancing lastIndex itself, so a single empty match spins its loop and
 * freezes the editor on every keystroke.
 * A fresh instance per call matters, because MatchDecorator mutates lastIndex.
 */
export function compileTagRegex(source: string): RegExp {
  if (source) {
    try {
      if (canMatchEmpty(new RegExp(source, 'g'))) {
        console.warn('Tag Navigator: tag regex can match an empty string, using the default.', source);
      } else {
        return new RegExp(source, 'g');
      }
    } catch (error) {
      console.warn('Tag Navigator: invalid tag regex, using the default.', error);
    }
  }
  return new RegExp(defTagRegex.source, 'g');
}

/**
 * Compiles the exclude pattern, or returns null when unset or invalid.
 * Only ever used with .test, so it needs no empty-match guard.
 */
export function compileExcludeRegex(source: string): RegExp | null {
  if (!source) { return null; }
  try {
    return new RegExp(source, 'g');
  } catch (error) {
    console.warn('Tag Navigator: invalid exclude regex, ignoring it.', error);
    return null;
  }
}

/**
 * Writes the default style plus the user's override into a single style element,
 * replacing whatever was there before. User CSS comes last and unlayered, so it
 * wins on both source order and layer precedence.
 */
function applyStyle(userCss: string): void {
  let element = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  element.textContent = userCss ? `${DEFAULT_CSS}\n${userCss}` : DEFAULT_CSS;
}

/**
 * Whether a position sits inside code, where tags are text rather than tags.
 * Matches the panel (replaceOutsideBackticks) and the preview
 * (markSkippableTextTokens), which both skip code.
 *
 * The Markdown parser names every code context with "Code" in it - InlineCode,
 * FencedCode, CodeBlock, CodeText, CodeMark, CodeInfo - and no other node does,
 * so substring matching survives parser version changes.
 */
function inCodeContext(view: EditorView, pos: number): boolean {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  while (node) {
    if (node.name.includes('Code')) { return true; }
    node = node.parent;
  }
  return false;
}

/**
 * Locates the tag within a raw match, as an offset and the tag text.
 *
 * A tag regex may capture the whitespace around the tag rather than use a
 * lookbehind - (^|\s)#... leads with a space, (^|\s)#(\S+)(\s|$) trails one -
 * so the decoration is anchored on the tag itself, or the whitespace gets
 * painted. This is also what the panel maps its prefix class from.
 */
export function tagBounds(matchText: string): { tag: string; lead: number } {
  const tag = matchText.trim();
  return { tag, lead: tag ? matchText.indexOf(tag) : 0 };
}

/**
 * Builds the decorator that marks up tags in the visible ranges.
 *
 * No `boundary` option: it is only an optimisation of MatchDecorator's patch
 * path, and it requires a character that can never occur inside a match, which
 * whitespace cannot guarantee once a user supplies the capture-group form.
 * Without it that path re-scans the whole changed line against the real line
 * text, which is correct for every pattern shape. It matters little either way,
 * since the view plugin below rebuilds the viewport on every doc change.
 */
function tagDecorator(tagRegex: RegExp, excludeRegex: RegExp | null): MatchDecorator {
  return new MatchDecorator({
    regexp: tagRegex,
    decorate: (add, from, _to, match, view) => {
      const { tag, lead } = tagBounds(match[0]);
      if (!tag) { return; }

      if (excludeRegex) {
        excludeRegex.lastIndex = 0;
        if (excludeRegex.test(tag)) { return; }
      }

      const start = from + lead;
      if (inCodeContext(view, start)) { return; }

      add(start, start + tag.length, Decoration.mark({
        class: `${TAG_CLASS} ${TAG_CLASS}--${mapPrefixClass(tag)}`,
      }));
    },
  });
}

/** View plugin that keeps tag decorations in step with edits, scrolling and parsing. */
function tagStylePlugin(settings: TagStyleSettings) {
  const decorator = tagDecorator(
    compileTagRegex(settings.tagRegex),
    compileExcludeRegex(settings.excludeRegex),
  );

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      // Rebuild rather than patch whenever the syntax tree may have moved, since
      // inCodeContext reads it and a code context can span lines: typing the
      // third backtick of a fence turns everything below into FencedCode, and
      // updateDeco only rescans the changed line, so those lines would keep
      // stale decorations until the viewport moved.
      //
      // The tree also takes a new identity on every doc change, so this is the
      // branch that runs while typing. updateDeco handles the rest, including
      // viewport moves, which it services with its own createDeco call.
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = decorator.createDeco(update.view);
      } else {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    }
  }, { decorations: value => value.decorations });
}

export default (context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
  plugin: (editorControl: CodeMirrorControl) => {
    if (!editorControl.cm6) { return; }

    // Settings arrive over postMessage, so the extension is added once they land.
    void (async () => {
      let settings: TagStyleSettings = { tagRegex: '', excludeRegex: '', css: '' };
      try {
        settings = await context.postMessage({ name: 'getTagStyleSettings' }) ?? settings;
      } catch (error) {
        console.warn('Tag Navigator: could not read tag style settings, using defaults.', error);
      }

      applyStyle(settings.css);
      editorControl.addExtension(tagStylePlugin(settings));
    })();
  },
});
