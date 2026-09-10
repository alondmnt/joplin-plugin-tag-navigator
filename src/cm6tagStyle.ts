import type { ContentScriptContext, CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import {
  Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate,
} from '@codemirror/view';
import {
  checkboxClasses, checkboxMarkerRegex, checkboxStateFor, defaultCheckboxCss, defaultTagCss,
  defTagRegex, isRegexSafe, tagBounds, tagClasses,
} from './utils';

const TAG_CLASS = 'itags-editor-tag';
const CHECKBOX_CLASS = 'itags-editor-checkbox';
const STYLE_ELEMENT_ID = 'itags-editor-tag-style';

/**
 * Default appearance for the editor, from the definitions shared with the panel
 * and preview. Tags omit the block layout those two use, since inline-block and
 * vertical margins disturb caret placement and line height here. Both are
 * injected whichever highlighter is on, since a class nothing carries costs
 * nothing.
 */
const DEFAULT_CSS = `${defaultTagCss(TAG_CLASS)}\n${defaultCheckboxCss(CHECKBOX_CLASS)}`;

/** What the plugin's settings say the editor should paint, and how. */
type EditorStyleSettings = {
  tagRegex: string;
  excludeRegex: string;
  css: string;
  tags: boolean;
  checkboxes: boolean;
};

/**
 * A RegExp whose exec() never returns a zero-length match at a stalled position.
 *
 * MatchDecorator iterates `while (m = re.exec(text))` without advancing lastIndex
 * itself (iterMatches, updateRange in @codemirror/view), so a single empty match
 * spins that loop and freezes the editor on every keystroke. Advancing lastIndex
 * here makes the loop provably terminate for any pattern.
 *
 * This replaced two heuristics that both looked adequate and were not. Testing
 * the pattern against '' misses one whose emptiness needs context, such as
 * \b\w* or (?<=\s)\S*. Probing it against fixed sample text misses one whose
 * emptiness needs a character the sample happens to lack in that position: the
 * sample had no "#" followed by a non-word character, so (?<=#)\w* passed and
 * then looped on any note containing a Markdown heading. No fixed sample can be
 * sound, because the pattern chooses which context makes it empty. Guaranteeing
 * termination at the loop is the only check that does not depend on the input.
 */
class NonEmptyRegExp extends RegExp {
  exec(text: string): RegExpExecArray | null {
    let match = super.exec(text);
    while (match && match[0].length === 0) {
      if (match.index >= text.length) { return null; }
      this.lastIndex = match.index + 1;
      match = super.exec(text);
    }
    return match;
  }
}

/**
 * Compiles a user-supplied tag pattern, falling back to the default when it does
 * not compile or can backtrack catastrophically. Zero-length matches need no
 * rejection: NonEmptyRegExp makes them harmless rather than fatal, so a pattern
 * that only sometimes matches empty still highlights the tags it does match.
 * A fresh instance per call matters, because MatchDecorator mutates lastIndex.
 */
export function compileTagRegex(source: string): RegExp {
  if (source) {
    try {
      if (!isRegexSafe(source)) {
        console.warn('Tag Navigator: tag regex can backtrack catastrophically, using the default.', source);
      } else {
        return new NonEmptyRegExp(source, 'g');
      }
    } catch (error) {
      console.warn('Tag Navigator: invalid tag regex, using the default.', error);
    }
  }
  return new NonEmptyRegExp(defTagRegex.source, 'g');
}

/**
 * Compiles the exclude pattern, or returns null when unset, invalid, or able to
 * backtrack catastrophically. Only ever used with .test, so it needs no
 * empty-match guard, but it does run once per matched tag.
 */
export function compileExcludeRegex(source: string): RegExp | null {
  if (!source) { return null; }
  try {
    if (!isRegexSafe(source)) {
      console.warn('Tag Navigator: exclude regex can backtrack catastrophically, ignoring it.', source);
      return null;
    }
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
 * Every code node in Joplin's Markdown parser has "Code" in its name, and no
 * other node does, so substring matching survives parser version changes.
 * Checked against Joplin's own tree: @lezer/markdown emits CodeBlock (the
 * indented form), FencedCode, CodeInfo, CodeMark, CodeText and InlineCode, while
 * Joplin's extensions add only FrontMatter*, InlineMath*, BlockMath*, Highlight*
 * and Insert* - none of which contain "Code".
 */
export function inCodeContext(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (node.name.includes('Code')) { return true; }
    node = node.parent;
  }
  return false;
}

/** Where a match should be painted, as offsets within the matched text. */
export type Marker = { start: number; end: number; className: string };

/**
 * A view plugin that paints one class per regex match in the visible ranges.
 *
 * Callers say what to match and what to call it; this owns the rest, so a
 * second kind of match costs a regex and a locate function. Matches inside
 * code are skipped, since a marker there is text rather than a marker, the way
 * the panel (replaceOutsideBackticks) and the preview (markSkippableTextTokens)
 * skip code too.
 *
 * No `boundary` option on the decorator: it is only an optimisation of
 * MatchDecorator's patch path, and it requires a character that can never
 * occur inside a match, which whitespace cannot guarantee once a user supplies
 * the capture-group form of the tag regex. Without it that path re-scans the
 * whole changed line against the real line text, which is correct for every
 * pattern shape. It matters little either way, since the plugin rebuilds the
 * viewport on every doc change.
 *
 * @param regexp What to look for. Must be global, and a fresh instance, since
 *   MatchDecorator mutates lastIndex.
 * @param locate Where within a match to paint, and with which classes, or null
 *   to paint nothing.
 */
function markerPlugin(regexp: RegExp, locate: (match: RegExpExecArray) => Marker | null) {
  const decorator = new MatchDecorator({
    regexp,
    decorate: (add, from, _to, match, view) => {
      const marker = locate(match);
      if (!marker) { return; }

      const start = from + marker.start;
      if (inCodeContext(view.state, start)) { return; }

      add(start, from + marker.end, Decoration.mark({ class: marker.className }));
    },
  });

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

/** Paints inline tags, minus any the exclude pattern rejects. */
function tagPlugin(settings: EditorStyleSettings) {
  const excludeRegex = compileExcludeRegex(settings.excludeRegex);

  return markerPlugin(compileTagRegex(settings.tagRegex), match => {
    const { tag, lead } = tagBounds(match[0]);
    if (!tag) { return null; }

    if (excludeRegex) {
      excludeRegex.lastIndex = 0;
      if (excludeRegex.test(tag)) { return null; }
    }

    return { start: lead, end: lead + tag.length, className: tagClasses(tag, TAG_CLASS) };
  });
}

/**
 * Paints the marker of a task in one of the six states, and only the marker.
 *
 * Joplin replaces the bullet of a list item, and the [ ] or [x] of a task, with
 * widgets of its own while its `Render markup in editor` setting is on, which
 * is the default. A decoration on those two states is then inert, and one
 * spanning the bullet would paint a range that is no longer there, so the
 * decoration stops at the brackets. The other four states are invisible to
 * Joplin's Markdown parser, which is why they are the ones this shows.
 */
export function checkboxMarker(match: RegExpExecArray): Marker | null {
  const state = checkboxStateFor(match[1]);
  if (!state) { return null; }

  return {
    start: match[0].indexOf('['),
    end: match[0].length,
    className: checkboxClasses(state, CHECKBOX_CLASS),
  };
}

function checkboxPlugin() {
  return markerPlugin(checkboxMarkerRegex(), checkboxMarker);
}

export default (context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
  plugin: (editorControl: CodeMirrorControl) => {
    if (!editorControl.cm6) { return; }

    // Settings arrive over postMessage, so the extension is added once they land.
    void (async () => {
      let settings: EditorStyleSettings = {
        tagRegex: '', excludeRegex: '', css: '', tags: true, checkboxes: true,
      };
      try {
        settings = await context.postMessage({ name: 'getTagStyleSettings' }) ?? settings;
      } catch (error) {
        console.warn('Tag Navigator: could not read tag style settings, using defaults.', error);
      }

      applyStyle(settings.css);
      if (settings.tags) { editorControl.addExtension(tagPlugin(settings)); }
      if (settings.checkboxes) { editorControl.addExtension(checkboxPlugin()); }
    })();
  },
});
