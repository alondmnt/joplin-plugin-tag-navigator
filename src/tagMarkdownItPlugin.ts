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
    assets: () => [{ name: 'tagMarkdown.css' }],
  };
}
