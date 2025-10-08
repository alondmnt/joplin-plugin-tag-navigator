import type { ContentScriptContext, MarkdownItContentScriptModule } from 'api/types';
import { mapPrefixClass } from './utils';

const TAG_REGEX_SETTING_KEY = 'itags.tagRegex';
const EXCLUDE_REGEX_SETTING_KEY = 'itags.excludeRegex';

// Default fallback regex for matching inline tags.
const defTagRegex = /(?<=^|\s)#([^\s#'",.()\[\]:;\?\\]+)/g;

function cloneRegex(pattern: RegExp | null): RegExp | null {
  if (!pattern) return null;
  return new RegExp(pattern.source, pattern.flags);
}

const SKIP_RENDERED_SUBSTRINGS = [
  'class="mermaid"',
  'joplin-source',
  'joplin-editable',
  'data-joplin-language=',
  'data-joplin-source-open',
  'data-joplin-source-close',
];

function shouldSkipRenderedFragment(rendered: string): boolean {
  for (const marker of SKIP_RENDERED_SUBSTRINGS) {
    if (rendered.includes(marker)) {
      return true;
    }
  }
  return false;
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

      const defaultRender =
        markdownIt.renderer.rules.text || ((tokens: any, idx: number) => tokens[idx].content);

      markdownIt.renderer.rules.text = (tokens: any, idx: number, options: any, env: any, self: any) => {
        const rendered = defaultRender(tokens, idx, options, env, self);
        if (typeof rendered !== 'string' || !rendered) {
          return rendered;
        }

        const tagPattern = cloneRegex(activeTagRegex);
        if (!tagPattern) {
          return rendered;
        }

        const excludePattern = cloneRegex(activeExcludeRegex);

        const token = tokens[idx];
        if (token && token.meta && token.meta.itagsSkip) {
          return rendered;
        }

        if (shouldSkipRenderedFragment(rendered)) {
          return rendered;
        }

        return rendered.replace(tagPattern, (match: string) => {
          if (!match) {
            return match;
          }

          if (excludePattern) {
            excludePattern.lastIndex = 0;
            if (excludePattern.test(match)) {
              return match;
            }
          }

          const prefixClass = mapPrefixClass(match);
          return `<span class="itags-search-renderedTag itags-search-renderedTag--${prefixClass}">${match}</span>`;
        });
      };
    },
    assets: () => [
      { name: 'tagMarkdown.css' },
    ],
  };
}
