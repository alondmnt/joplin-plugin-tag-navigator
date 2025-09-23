// src/cm6frontmatter.ts (only the relevant parts shown)
import type { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import joplin from 'api';

// bundle only this:
import { yamlFrontmatter } from '@codemirror/lang-yaml';

// shared with Joplin:
import { language, Language, syntaxTree, LanguageSupport } from '@codemirror/language';
import { Compartment, Prec, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view';

  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags as t } from '@lezer/highlight';

/* ---------- Dark/light detection (no .cm-dark required) ---------- */
function parseRGB(input: string) {
  const m = input?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  const hex = input?.trim() ?? '';
  if (/^#([0-9a-f]{3})$/i.test(hex)) {
    const h = RegExp.$1;
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    const h = RegExp.$1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  return null;
}
function isDarkBg(view: EditorView) {
  const el = (view.dom.querySelector('.cm-content') as HTMLElement) || view.dom;
  const bg = getComputedStyle(el).backgroundColor || '';
  const rgb = parseRGB(bg);
  if (!rgb) return false;
  const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b; // 0..255
  return lum < 135;
}
function blockColors(view: EditorView) {
  return isDarkBg(view)
    ? { bg: 'rgba(155, 155, 155, 0.1)', border: '#999999' }
    : { bg: 'rgba(0,0,0,0.06)',        border: 'rgba(0,0,0,0.10)' };
}

/* ---------- Find frontmatter range via syntax tree (with fallback) ---------- */
function frontmatterLines(view: EditorView): { first: number; last: number } | null {
  // try the tree first (works once yamlFrontmatter is active)
  let from = -1, to = -1;
  syntaxTree(view.state).iterate({
    enter(n) {
      if (n.name === 'Frontmatter' || n.name === 'FrontmatterContent') {
        from = n.from;
        to = n.to;
        return false;
      }
    },
  });

  if (from >= 0) {
    const doc = view.state.doc;
    const first = doc.lineAt(from).number;
    // 👇 ensure we map to the closing fence line, not the next line
    const endPos = Math.max(from, to - 1);
    const last = doc.lineAt(endPos).number;
    return { first, last };
  }

  // …fallback fence scan (unchanged)
  const doc = view.state.doc;
  if (!/^---\s*$/.test(doc.line(1).text)) return null;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) {
    const t = doc.line(i).text;
    if (/^(---|\.\.\.)\s*$/.test(t)) return { first: 1, last: i };
    if (/^\s*$/.test(t))             return { first: 1, last: i - 1 };
  }
  return { first: 1, last: Math.min(doc.lines, 200) };
}

/* ---------- Inline, unmissable "code block" visuals ---------- */
const frontmatterAsCode = ViewPlugin.fromClass(class {
  decorations; isDark: boolean;
  constructor(view: EditorView) {
    this.isDark = isDarkBg(view);
    this.decorations = this.build(view);
  }
  update(u: ViewUpdate) {
    const nowDark = isDarkBg(u.view);
    // rebuild on doc edits, viewport shifts, or any transaction (incl. reconfigure/theme flips)
    if (u.docChanged || u.viewportChanged || u.transactions.length || nowDark !== this.isDark) {
      this.isDark = nowDark;
      this.decorations = this.build(u.view);
    }
  }
  build(view: EditorView) {
    const fm = frontmatterLines(view);
    if (!fm) return Decoration.none;

    const { bg, border } = blockColors(view);
    const b = new RangeSetBuilder<Decoration>();

    for (let ln = fm.first; ln <= fm.last; ln++) {
      const line = view.state.doc.line(ln);
      const top = ln === fm.first, bottom = ln === fm.last;
      const style = [
        `background-color:${bg}`,
        `font-family:ui-monospace,SFMono-Regular,Menlo,monospace`,
        `font-size:inherit;line-height:inherit`,
        `font-weight: normal`,
        `padding-left:8px;padding-right:8px`,
        `border-left:1px solid ${border}`,
        `border-right:1px solid ${border}`,
        top    ? `border-top:1px solid ${border}`    : '',
        bottom ? `border-bottom:1px solid ${border}` : '',
        top    ? `border-top-left-radius:6px;border-top-right-radius:6px` : '',
        bottom ? `border-bottom-left-radius:6px;border-bottom-right-radius:6px;margin-bottom:4px` : '',
      ].filter(Boolean).join(';');
      b.add(line.from, line.from, Decoration.line({ attributes: { style } }));
    }
    return b.finish();
  }
}, { decorations: v => v.decorations });

/* ---------- Plugin entry ---------- */
// compartments (language wrapper + style toggle)
const fmLang = new Compartment();
const fmStyle = new Compartment();

export default (_ctx: ContentScriptContext): MarkdownEditorContentScriptModule => ({
  plugin: (cm: any) => {
    if (!cm?.cm6) return;

    cm.addExtension(fmLang.of([]));  // language placeholder
    cm.addExtension(fmStyle.of([frontmatterAsCode])); // inline “code block” style

    // Remember the *wrapped* language so we don’t rewrap forever
    let wrappedLang: Language | null = null;

    const applyFrontmatter = (view: EditorView) => {
      const base = view.state.facet(language) as Language | null;
      if (!base) return;

      // Already wrapped? nothing to do.
      if (wrappedLang && base === wrappedLang) return;

      const content = new LanguageSupport(base);
      const support = yamlFrontmatter({ content });

      wrappedLang = support.language;

      view.dispatch({
        effects: fmLang.reconfigure(Prec.highest(support)),
      });

      // Debug (singular facet):
      const active = cm.editor.state.facet(language) as Language | null;
      console.info('[fm] active language:', active?.name ?? '(none)');
    };


    // 1) Try immediately (works if Joplin already set the base)
    applyFrontmatter(cm.editor);

    // 2) Try on the next animation frame (after Joplin’s init finishes)
    requestAnimationFrame(() => applyFrontmatter(cm.editor));

    // 3) Try again shortly after (some plugins reconfigure once more on open)
    setTimeout(() => applyFrontmatter(cm.editor), 50);

    // 4) Re-apply *only* when the base language identity actually changes
    cm.addExtension(EditorView.updateListener.of(u => {
    const current = u.state.facet(language) as Language | null;
      // If the top language changed (e.g., Joplin or another plugin reconfigured),
      // and it isn't our wrapped one yet, try wrapping again.
      if (current && current !== wrappedLang) applyFrontmatter(u.view);
    }));
  },
});