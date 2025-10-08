import type { ContentScriptContext, MarkdownItContentScriptModule } from 'api/types';

const EXPAND_SETTING_KEY = 'itags.renderFrontMatterDetails';

// Strict front-matter matcher at the very start of the doc.
// Captures the content between the first and second '---' lines.
const FM_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

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
    },

    // Ship CSS via assets (see CSS below)
    assets: () => [
      { name: 'fmMarkdown.css' },
      { name: 'mobileMermaidFix.js' },
    ],
  };
}
