import type { ContentScriptContext, MarkdownItContentScriptModule } from 'api/types';

const TAG_PATTERNS: Record<string, RegExp> = {
  hash: /(?<=^|\s)(#)([^\s#@'",.()\[\]:;\?\\]+)/g,
  at: /(?<=^|\s)(@)([^\s#@'",.()\[\]:;\?\\]+)/g,
  plus: /(?<=^|\s)(\+)([^\s#@'",.()\[\]:;\?\\]+)/g,
  slash: /(?<=^|\s)(\/\/)([^\s#@'",.()\[\]:;\?\\]+)/g,
};

export default function (_context: ContentScriptContext): MarkdownItContentScriptModule {
  return {
    plugin: (markdownIt: any) => {
      const defaultRender =
        markdownIt.renderer.rules.text || ((tokens: any, idx: number) => tokens[idx].content);

      markdownIt.renderer.rules.text = (tokens: any, idx: number, options: any, env: any, self: any) => {
        let output = defaultRender(tokens, idx, options, env, self);
        if (typeof output !== 'string' || !output) {
          return output;
        }

        for (const [key, pattern] of Object.entries(TAG_PATTERNS)) {
          output = output.replace(pattern, (match: string) => {
            if (!match) {
              return match;
            }
            return `<span class="itags-search-renderedTag itags-search-renderedTag--${key}">${match}</span>`;
          });
        }

        return output;
      };
    },
  };
}
