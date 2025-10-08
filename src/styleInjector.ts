type MarkdownState = {
  env?: Record<string, any>;
  tokens: any[];
};

type TokenConstructor = new (type: string, tag: string, nesting: number) => any;

type StyleInjectionState = {
  token: any;
  chunks: string[];
};

const ENV_KEY = 'itagsStyleInjection';

export function injectStyleChunk(state: MarkdownState | null, Token: TokenConstructor | null, cssChunk: string): void {
  if (!state || !Token) return;
  if (!cssChunk) return;

  if (!state.env) state.env = {};

  let data: StyleInjectionState | undefined = state.env[ENV_KEY];
  if (!data) {
    const styleToken = new Token('html_block', '', 0);
    styleToken.content = '<style></style>';
    state.tokens.unshift(styleToken);

    data = {
      token: styleToken,
      chunks: [],
    };
    state.env[ENV_KEY] = data;
  }

  if (data.chunks.includes(cssChunk)) {
    return;
  }

  data.chunks.push(cssChunk);
  data.token.content = `<style>\n${data.chunks.join('\n')}\n</style>`;
}
