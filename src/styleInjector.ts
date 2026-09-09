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

/**
 * Neutralises any closing style tag inside a CSS chunk.
 *
 * Chunks are interpolated into an html_block token, so a chunk containing
 * "</style>" would close the element early and inject the rest as live markup.
 * Escaping the slash is inert to the HTML parser while leaving the text visible
 * in the stylesheet, so a user who pastes a stray tag sees broken CSS rather
 * than a broken note. Callers that assign to textContent instead do not need
 * this, but the element is built here, so the guarantee belongs here.
 */
function sealChunk(cssChunk: string): string {
  return cssChunk.replace(/<\/(style)/gi, '<\\/$1');
}

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

  // Seal before the duplicate check, so the stored and compared forms match.
  const sealed = sealChunk(cssChunk);
  if (data.chunks.includes(sealed)) {
    return;
  }

  data.chunks.push(sealed);
  data.token.content = `<style>\n${data.chunks.join('\n')}\n</style>`;
}
