import type { ContentScriptContext, CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import {
  Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate,
} from '@codemirror/view';
import { defaultTagCss, defTagRegex, isRegexSafe, tagBounds, tagClasses } from './utils';

const TAG_CLASS = 'itags-editor-tag';
const STYLE_ELEMENT_ID = 'itags-editor-tag-style';

/**
 * Default tag appearance for the editor, from the definition shared with the
 * panel and preview. Omits the block layout those two use, since inline-block
 * and vertical margins disturb caret placement and line height here.
 */
const DEFAULT_CSS = defaultTagCss(TAG_CLASS);

type TagStyleSettings = {
  tagRegex: string;
  excludeRegex: string;
  css: string;
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
      if (inCodeContext(view.state, start)) { return; }

      add(start, start + tag.length, Decoration.mark({
        class: tagClasses(tag, TAG_CLASS),
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
