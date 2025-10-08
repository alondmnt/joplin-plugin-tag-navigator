import type { ContentScriptContext, MarkdownItContentScriptModule } from 'api/types';
import { injectStyleChunk } from './styleInjector';

const EXPAND_SETTING_KEY = 'itags.renderFrontMatterDetails';

// Strict front-matter matcher at the very start of the doc.
// Captures the content between the first and second '---' lines.
const FM_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

// Inline default styling because web builds reject CSS assets from plugin directories.
// Wrap in the same layer as tag defaults so userstyle.css rules win automatically.
const FM_STYLE_CSS = `@layer itagsDefaults {
  .fm-code {
    border: 1px solid var(--joplin-divider-color);
    border-radius: 10px;
    background: var(--joplin-background-color3);
    margin: 6px 0 8px;
    overflow: hidden;
  }

  .fm-code > summary {
    list-style: none;
    cursor: pointer;
    padding: 6px 10px;
    background: var(--joplin-background-color);
    border-bottom: 1px solid var(--joplin-divider-color);
    font-weight: 600;
    position: relative;
    padding-right: 1.4rem;
  }
  .fm-code > summary::marker { display: none; }
  .fm-code > summary::after {
    content: '';
    position: absolute; right: .6rem; top: 50%;
    width: 6px; height: 6px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: translateY(-50%) rotate(-45deg);
    opacity: .6; transition: transform .15s ease, opacity .15s ease;
  }
  .fm-code[open] > summary::after {
    transform: translateY(-50%) rotate(45deg);
    opacity: .85;
  }

  .fm-code pre, .fm-code code {
    margin: 0;
  }
  .fm-code pre {
    padding: 8px 10px;
    border-radius: 0;
  }

  .fm-code > summary .itags-search-renderedTag {
    margin-left: .5rem;
  }
}`;

function wrapFrontMatterAsCode(src: string, expandDetails: boolean): string | null {
  const m = FM_RE.exec(src);
  if (!m) return null;
  const fm = m[1];

  // Replace FM with details+fenced YAML. Keep the rest as-is.
  const rest = src.slice(m[0].length);
  const openAttr = expandDetails ? ' open' : '';
  const replacement =
    `<details class="fm-code"${openAttr}><summary>Front matter</summary>\n\n` +
    '```yaml\n' + fm + '\n```\n' +
    `</details>\n\n`;
  return replacement + rest;
}

function readExpandSetting(pluginOptions: any): boolean {
  if (!pluginOptions || typeof pluginOptions.settingValue !== 'function') {
    return false;
  }

  try {
    const result = pluginOptions.settingValue(EXPAND_SETTING_KEY);
    if (result && typeof result.then === 'function') {
      // Markdown-It plugins execute synchronously. If a promise is returned,
      // resolve it in the background but keep the default value for now.
      const noop = () => {};
      result.then(noop).catch(noop);
      return false;
    }
    return !!result;
  } catch (error) {
    console.warn('Tag Navigator: Failed to load front matter expand setting.', error);
    return false;
  }
}

export default function(_context: ContentScriptContext): MarkdownItContentScriptModule {
  return {
    plugin: (md: any, pluginOptions: any) => {
      let expandDetailsSetting = readExpandSetting(pluginOptions);

      if (pluginOptions && typeof pluginOptions.onSettingChange === 'function') {
        try {
          pluginOptions.onSettingChange((key: string, value: any) => {
            if (key === EXPAND_SETTING_KEY) {
              expandDetailsSetting = !!value;
            }
          });
        } catch (error) {
          console.warn('Tag Navigator: Failed to subscribe to setting changes.', error);
        }
      }

      // Run BEFORE the block parser so the fenced code is tokenized normally.
      md.core.ruler.before('block', 'fm_as_code_details', (state: any) => {
        const replaced = wrapFrontMatterAsCode(state.src, expandDetailsSetting);
        if (replaced != null) state.src = replaced;
      });

      md.core.ruler.after('block', 'fm_code_details_style', (state: any) => {
        const Token = state.Token;
        injectStyleChunk(state, Token, FM_STYLE_CSS);
      });
    },

    // Keep the Mermaid helper around for mobile rendering quirks.
    assets: () => [
      { name: 'mobileMermaidFix.js' },
    ],
  };
}
