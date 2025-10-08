import type { ContentScriptContext, MarkdownItContentScriptModule } from 'api/types';
import { mapPrefixClass } from './utils';

const TAG_REGEX_SETTING_KEY = 'itags.tagRegex';
const EXCLUDE_REGEX_SETTING_KEY = 'itags.excludeRegex';

// Default fallback regex for matching inline tags.
const defTagRegex = /(^|\s)#([^\s#'",.()\[\]:;\?\\]+)/g;

// Inline default styling because the web app blocks loading plugin CSS assets.
// Wrapped in a CSS layer so Joplin's userstyle.css can override without !important.
const TAG_STYLE_CSS = [
  '@layer itagsDefaults;',
  '@layer itagsDefaults {',
  '  .itags-search-renderedTag {',
  '    background-color: #7698b3;',
  '    color: #ffffff;',
  '    padding: 0em 2px;',
  '    border-radius: 5px;',
  '    display: inline-block;',
  '    margin-bottom: 2px;',
  '    margin-top: 2px;',
  '  }',
  '}',
].join('\n');

function injectTagStyles(state: any, Token: any) {
  if (!state) return;

  if (!state.env) state.env = {};
  if (state.env.itagsTagStyleInjected) {
    return;
  }

  const styleToken = new Token('html_block', '', 0);
  styleToken.content = `<style>\n${TAG_STYLE_CSS}\n</style>`;
  state.tokens.unshift(styleToken);

  state.env.itagsTagStyleInjected = true;
}

function cloneRegex(pattern: RegExp | null): RegExp | null {
  if (!pattern) return null;
  return new RegExp(pattern.source, pattern.flags);
}

function compileTagRegex(value: unknown): RegExp {
  if (typeof value !== 'string' || value.trim() === '') {
    return defTagRegex;
  }

  try {
    return new RegExp(value, 'g');
  } catch (error) {
    console.warn('Tag Navigator: Invalid tag regex, falling back to default.', error);
    return defTagRegex;
  }
}

function compileExcludeRegex(value: unknown): RegExp | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  try {
    return new RegExp(value, 'g');
  } catch (error) {
    console.warn('Tag Navigator: Invalid exclude regex, ignoring.', error);
    return null;
  }
}

type TokenLike = {
  type: string;
  tag?: string;
  nesting?: number;
  children?: TokenLike[];
  meta?: Record<string, any> | null;
  content?: string;
};

function markSkippableTextTokens(markdownIt: any) {
  const SKIP_CONTAINER_TAGS = new Set(['code', 'pre', 'kbd', 'samp']);

  markdownIt.core.ruler.after('inline', 'itags_mark_skippable_tokens', (state: any) => {
    for (const token of state.tokens as TokenLike[]) {
      if (token.type !== 'inline' || !token.children) {
        continue;
      }

      const stack: string[] = [];
      for (const child of token.children) {
        const childType = child.type;

        if (childType === 'code_inline' || childType === 'math_inline') {
          if (!child.meta) child.meta = {};
          child.meta.itagsSkip = true;
          continue;
        }

        if (child.nesting === 1) {
          const pushTag = child.tag || childType;
          if (pushTag) stack.push(pushTag);
          continue;
        }

        if (child.nesting === -1) {
          stack.pop();
          continue;
        }

        if (childType !== 'text') {
          continue;
        }

        if (!stack.length) {
          continue;
        }

        const withinSkipContainer = stack.some(tag => SKIP_CONTAINER_TAGS.has(tag));
        if (withinSkipContainer) {
          if (!child.meta) child.meta = {};
          child.meta.itagsSkip = true;
        }
      }
    }
  });
}

function readSetting(pluginOptions: any, key: string, apply: (value: any) => void): void {
  if (!pluginOptions || typeof pluginOptions.settingValue !== 'function') {
    return;
  }

  try {
    const result = pluginOptions.settingValue(key);
    if (result && typeof result.then === 'function') {
      result
        .then((value: any) => apply(value))
        .catch((error: any) => console.warn('Tag Navigator: Failed to resolve setting value.', key, error));
    } else {
      apply(result);
    }
  } catch (error) {
    console.warn('Tag Navigator: Failed to read setting value.', key, error);
  }
}

export default function (_context: ContentScriptContext): MarkdownItContentScriptModule {
  let activeTagRegex: RegExp = defTagRegex;
  let activeExcludeRegex: RegExp | null = null;

  const applySetting = (key: string, value: any) => {
    switch (key) {
      case TAG_REGEX_SETTING_KEY:
        activeTagRegex = compileTagRegex(value);
        break;
      case EXCLUDE_REGEX_SETTING_KEY:
        activeExcludeRegex = compileExcludeRegex(value);
        break;
      default:
        break;
    }
  };

  return {
    plugin: (markdownIt: any, pluginOptions: any) => {
      readSetting(pluginOptions, TAG_REGEX_SETTING_KEY, value => applySetting(TAG_REGEX_SETTING_KEY, value));
      readSetting(pluginOptions, EXCLUDE_REGEX_SETTING_KEY, value => applySetting(EXCLUDE_REGEX_SETTING_KEY, value));

      if (pluginOptions && typeof pluginOptions.onSettingChange === 'function') {
        try {
          pluginOptions.onSettingChange((key: string, value: any) => applySetting(key, value));
        } catch (error) {
          console.warn('Tag Navigator: Failed to subscribe to setting changes.', error);
        }
      }

      markSkippableTextTokens(markdownIt);

      markdownIt.core.ruler.after('itags_mark_skippable_tokens', 'itags_wrap_tags', (state: any) => {
        const basePattern = cloneRegex(activeTagRegex);
        if (!basePattern) {
          return;
        }

        const excludePattern = cloneRegex(activeExcludeRegex);
        const Token = state.Token;

        injectTagStyles(state, Token);

        for (const token of state.tokens as TokenLike[]) {
          if (token.type !== 'inline' || !token.children) {
            continue;
          }

          const newChildren: TokenLike[] = [];

          for (const child of token.children) {
            if (child.type !== 'text' || (child.meta && child.meta.itagsSkip)) {
              newChildren.push(child);
              continue;
            }

            const text = child.content;
            const pattern = cloneRegex(basePattern);
            if (!pattern) {
              newChildren.push(child);
              continue;
            }

            let cursor = 0;
            let matched = false;
            let match: RegExpExecArray | null;

            while ((match = pattern.exec(text)) !== null) {
              if (pattern.lastIndex === match.index) {
                pattern.lastIndex += 1;
              }

              const fullMatch = match[0];
              const hashIndexInMatch = fullMatch.indexOf('#');
              const prefixPart = hashIndexInMatch > 0 ? fullMatch.slice(0, hashIndexInMatch) : '';
              const tagPart = hashIndexInMatch >= 0 ? fullMatch.slice(hashIndexInMatch) : fullMatch;

              const matchStart = match.index;
              const matchEnd = matchStart + fullMatch.length;

              if (matchStart > cursor) {
                const leadingText = text.slice(cursor, matchStart);
                if (leadingText) {
                  const leadingToken = new Token('text', '', 0);
                  leadingToken.content = leadingText;
                  newChildren.push(leadingToken);
                }
              }

              if (prefixPart) {
                const prefixToken = new Token('text', '', 0);
                prefixToken.content = prefixPart;
                newChildren.push(prefixToken);
              }

              let handled = false;
              if (tagPart) {
                if (excludePattern) {
                  excludePattern.lastIndex = 0;
                  if (excludePattern.test(tagPart)) {
                    const textToken = new Token('text', '', 0);
                    textToken.content = tagPart;
                    newChildren.push(textToken);
                    handled = true;
                  }
                }

                if (!handled) {
                  const open = new Token('html_inline', '', 0);
                  const prefixClass = mapPrefixClass(tagPart);
                  open.content = `<span class="itags-search-renderedTag itags-search-renderedTag--${prefixClass}">`;
                  const textToken = new Token('text', '', 0);
                  textToken.content = tagPart;
                  const close = new Token('html_inline', '', 0);
                  close.content = '</span>';
                  newChildren.push(open, textToken, close);
                  handled = true;
                }
              }

              const consumed = matchEnd;
              cursor = consumed;
              matched = true;
            }

            if (!matched) {
              newChildren.push(child);
            } else if (cursor < text.length) {
              const trailing = text.slice(cursor);
              if (trailing) {
                const trailingToken = new Token('text', '', 0);
                trailingToken.content = trailing;
                newChildren.push(trailingToken);
              }
            }
          }

          token.children = newChildren;
        }
      });
    },
    assets: () => [
      { name: 'mobileMermaidFix.js' },
    ],
  };
}
