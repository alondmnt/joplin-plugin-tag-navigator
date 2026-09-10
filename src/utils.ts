/**
 * Matches multilingual tag names starting with #.
 * The default tag regex, used when no custom one is set in the settings.
 */
export const defTagRegex = /(?<=^|\s)#([^\s#'",.()\[\]:;\?\\]+)/g;

/**
 * Whether a pattern is free of constructs that can backtrack catastrophically.
 *
 * Applies wherever a user-supplied regex runs on untrusted-length input: the
 * indexer walks it over every line of every note, and the editor content script
 * runs it over the viewport on every keystroke, on the main thread. A rejected
 * pattern must fall back, never run.
 */
export function isRegexSafe(pattern: string): boolean {
  // Check for potentially dangerous patterns that could cause ReDoS
  const dangerousPatterns = [
    // Nested quantifiers like (a+)+ or (a*)* or (a+)*
    /\([^)]*[+*]\)[+*]/,
    // Alternation with overlapping patterns like (a|a)*
    /\([^)]*\|[^)]*\)[+*]/,
    // Excessive nesting depth
    /\([^)]*\([^)]*\([^)]*\(/,
    // Very long strings that could cause exponential backtracking
    /.{200,}/,
    // Catastrophic backtracking patterns like (.*)*
    /\(\.\*\)[+*]/,
    // Multiple consecutive quantifiers (but allow legitimate non-greedy patterns like *?, +?, ??)
    /[+*]{2,}|[+*?]\?[+*]|\?[+*]/,
  ];

  return !dangerousPatterns.some(dangerous => dangerous.test(pattern));
}

/**
 * Processes items in parallel batches
 * @param items - Array of items to process
 * @param batchSize - Number of items to process concurrently
 * @param fn - Async function to apply to each item
 */
export async function processBatch<T>(
  items: T[], batchSize: number, fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

/**
 * Escapes special characters in a string for use in regular expressions
 * @param string - String to escape
 * @returns Escaped string safe for regex use
 */
export function escapeRegex(string: string): string {
	return string
	  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	  .trim();
  }

/**
 * Compares two tag values with proper handling of value delimiters and numeric comparison
 * @param aValue First tag value to compare
 * @param bValue Second tag value to compare
 * @param valueDelim Value delimiter character (e.g., '=')
 * @returns Comparison result (-1, 0, 1)
 */
export function compareTagValues(aValue: string, bValue: string, valueDelim: string): number {
  let aCompareValue = aValue;
  let bCompareValue = bValue;

  // Extract value after delimiter if present
  if (aValue.includes(valueDelim)) {
    aCompareValue = aValue.split(valueDelim)[1];
  }
  if (bValue.includes(valueDelim)) {
    bCompareValue = bValue.split(valueDelim)[1];
  }

  // Try numeric comparison first
  const aNum = Number(aCompareValue);
  const bNum = Number(bCompareValue);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  } else {
    return aCompareValue.localeCompare(bCompareValue);
  }
}

/**
 * Sorts an array of tags using proper tag value comparison
 * @param tags Array of tags to sort
 * @param valueDelim Value delimiter character (e.g., '=')
 * @returns Sorted array of tags
 */
export function sortTags(tags: string[], valueDelim: string): string[] {
  return tags.sort((a, b) => compareTagValues(a, b, valueDelim));
}

/**
 * Class applied to every rendered inline tag, on all three surfaces: the search
 * panel, the Markdown preview and the editor. Lets one CSS rule style tags
 * everywhere, without the reader having to know that the panel and preview
 * happen to share a class name while the editor does not. The surface-specific
 * classes remain alongside it for per-surface targeting.
 */
const SHARED_TAG_CLASS = 'itags-tag';

// Map characters that are awkward in CSS selectors to readable class suffixes.
const PREFIX_CLASS_MAP: Record<string, string> = {
  '#': 'hash',
  '@': 'at',
  '+': 'plus',
  '/': 'slash',
};
const CLASS_SAFE_CHAR = /^[A-Za-z0-9_-]$/;

export function mapPrefixClass(tag: string): string {
  if (!tag) return 'unknown';
  const [prefix] = Array.from(tag);
  if (!prefix) return 'unknown';

  if (Object.prototype.hasOwnProperty.call(PREFIX_CLASS_MAP, prefix)) {
    return PREFIX_CLASS_MAP[prefix];
  }

  if (CLASS_SAFE_CHAR.test(prefix)) {
    return prefix;
  }

  const code = prefix.codePointAt(0);
  return code != null ? `char-${code.toString(16)}` : 'unknown';
}

/**
 * The full class list for a rendered inline tag.
 *
 * Every tag carries the shared classes, so one CSS rule can style tags on all
 * three surfaces, plus the given surface's own classes for per-surface
 * targeting. Both come in a bare and a per-prefix form:
 *
 *   itags-tag  itags-tag--at  itags-editor-tag  itags-editor-tag--at
 *
 * @param tag The tag text, used to derive the prefix suffix
 * @param surfaceClass The surface's own base class
 */
export function tagClasses(tag: string, surfaceClass: string): string {
  const prefix = mapPrefixClass(tag);
  return `${SHARED_TAG_CLASS} ${SHARED_TAG_CLASS}--${prefix} ${surfaceClass} ${surfaceClass}--${prefix}`;
}

/** Declarations shared by the default tag styling on every surface. */
const TAG_DEFAULT_DECLARATIONS = `    background-color: #7698b3;
    color: #ffffff;
    padding: 0em 2px;
    border-radius: 5px;`;

/** Hover colour, for surfaces where a tag is clickable. */
const TAG_DEFAULT_HOVER = '#7aaab8';

/**
 * Default tag styling for one surface, as a cascade layer.
 *
 * Layered so that any unlayered rule overrides it without !important: the
 * `Inline tags: Style` setting on every platform, and userstyle.css on desktop.
 * Defining it here rather than once per surface keeps the colours from drifting
 * apart, and gives all three surfaces the same override contract.
 *
 * @param surfaceClass The surface's own base class
 * @param options.block Adds inline-block and vertical margins. Right for the
 *   panel and preview; omitted in the editor, where they disturb caret
 *   placement and line height.
 * @param options.hover Adds a hover colour. Only for surfaces where tags are
 *   clickable.
 */
export function defaultTagCss(
  surfaceClass: string,
  options: { block?: boolean; hover?: boolean } = {},
): string {
  const block = options.block ? `
    display: inline-block;
    margin-top: 2px;
    margin-bottom: 2px;` : '';
  const hover = options.hover ? `
  .${surfaceClass}:hover {
    background-color: ${TAG_DEFAULT_HOVER};
  }` : '';

  return `@layer itagsDefaults;
@layer itagsDefaults {
  .${surfaceClass} {
${TAG_DEFAULT_DECLARATIONS}${block}
  }${hover}
}`;
}

/**
 * Locates the tag within a raw match, as an offset and the tag text.
 *
 * A tag regex may capture the whitespace around the tag rather than use a
 * lookbehind - (^|\s)#... leads with a space, (^|\s)#(\S+)(\s|$) trails one -
 * so the decoration is anchored on the tag itself, or the whitespace gets
 * painted. This is also what the panel maps its prefix class from.
 */
export function tagBounds(matchText: string): { tag: string; lead: number } {
  const tag = matchText.trim();
  return { tag, lead: tag ? matchText.indexOf(tag) : 0 };
}

/**
 * Class applied to every rendered checkbox marker, on every surface. The
 * counterpart of SHARED_TAG_CLASS: one CSS rule can colour task states in the
 * search panel and the editor at once, without the reader having to know which
 * surface paints a square and which paints the [x] text.
 */
const SHARED_CHECKBOX_CLASS = 'itags-checkbox';

/** One of the task states the plugin recognises, in inline [x]it! notation. */
export type CheckboxState = {
  /** Class suffix, and the stable identifier used across surfaces. */
  key: string;
  /** The characters that may appear between the brackets. Done takes both cases. */
  markers: string[];
  /** Default colour, shared by every surface that paints this state. */
  colour: string;
};

/**
 * The six task states, in the order the kanban board lays them out.
 *
 * One definition behind the panel's markup, the editor's highlighting and the
 * default colours of both. The colours are the ones searchPanelStyle.css has
 * always used, so the two surfaces agree by construction.
 */
export const CHECKBOX_STATES: CheckboxState[] = [
  { key: 'open', markers: [' '], colour: '#4178be' },
  { key: 'ongoing', markers: ['@'], colour: '#cb55c2' },
  { key: 'in-question', markers: ['?'], colour: '#cc913f' },
  { key: 'blocked', markers: ['!'], colour: '#e22d2d' },
  { key: 'done', markers: ['x', 'X'], colour: '#64a073' },
  { key: 'obsolete', markers: ['~'], colour: '#999999' },
];

/**
 * The state a bracket character stands for, or null when it stands for none.
 *
 * @param marker The single character between the brackets
 */
export function checkboxStateFor(marker: string): CheckboxState | null {
  return CHECKBOX_STATES.find(state => state.markers.includes(marker)) ?? null;
}

/**
 * The full class list for a rendered checkbox marker.
 *
 * The same contract as tagClasses: shared classes for styling every surface at
 * once, the surface's own classes for targeting one, each in a bare and a
 * per-state form:
 *
 *   itags-checkbox  itags-checkbox--done  itags-editor-checkbox  itags-editor-checkbox--done
 *
 * @param state The task state the marker is in
 * @param surfaceClass The surface's own base class
 */
export function checkboxClasses(state: CheckboxState, surfaceClass: string): string {
  return `${SHARED_CHECKBOX_CLASS} ${SHARED_CHECKBOX_CLASS}--${state.key} ${surfaceClass} ${surfaceClass}--${state.key}`;
}

/** Escapes a marker for use inside a regex character class. */
function escapeInClass(marker: string): string {
  return marker.replace(/[\\\]^-]/g, '\\$&');
}

/** Escapes a marker for use on its own in a regex. escapeRegex() trims, which would drop the space of an open task. */
function escapeMarker(marker: string): string {
  return marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a checkbox marker at the head of a list item, capturing the bracket
 * character. A fresh instance per call, because MatchDecorator mutates
 * lastIndex.
 *
 * Anchored at the start of the line and stopping at the closing bracket, so
 * only "[x]" is decorated. The list marker is left alone: Joplin replaces the
 * bullet of a list item with a widget of its own whenever markup rendering is
 * on, which is the default, and a decoration spanning it would paint half a
 * range that is no longer there.
 */
export function checkboxMarkerRegex(): RegExp {
  const markers = CHECKBOX_STATES.map(state => state.markers.map(escapeInClass).join('')).join('');
  return new RegExp(`^[ \\t]*[-*+][ \\t]+\\[([${markers}])\\](?=[ \\t]|$)`, 'g');
}

/**
 * Matches whole lines in one task state, capturing the indent and the text
 * after the marker. The form the search panel rewrites into HTML.
 *
 * @param state The task state to match
 */
export function checkboxLineRegex(state: CheckboxState): RegExp {
  const marker = state.markers.length === 1
    ? escapeMarker(state.markers[0])
    : `[${state.markers.map(escapeInClass).join('')}]`;
  return new RegExp(`(^[\\s]*)- \\[${marker}\\] (.*)$`, 'gm');
}

/**
 * Default checkbox styling for one surface, as a cascade layer plus one
 * unlayered rule.
 *
 * The colours are layered on the same terms as defaultTagCss, so the
 * `Inline tags and checkboxes: Style` setting and userstyle.css override them
 * without !important. Monospace and bold keep the marker legible at text size,
 * which is what the states looked like under Rich Markdown's overlays.
 *
 * The last two rules cannot be layered, because Joplin's editor theme is not.
 * A layered rule loses to an unlayered one at any specificity, so:
 *
 * - The font leads with `span` to clear `.<theme> span { font-family: inherit }`,
 *   which Joplin's theme applies to every span in the editor and which
 *   outranks a bare class. Ours ties on specificity and wins on order, since
 *   CodeMirror mounts its theme at the top of the head and this is appended.
 * - A marker is also a token of its own: Joplin reads [@] as a link and styles
 *   links and list content, so the marker text sits in a span inside the
 *   decoration carrying a colour and a font of its own. Making that span
 *   inherit hands both back to the decoration, and so to whoever styles it,
 *   rather than fixing a colour and a font here.
 *
 * The colours stay layered: nothing in the editor sets a colour on every span,
 * so there is nothing to outrank, and the layer keeps them overridable by a
 * plain class selector.
 *
 * @param surfaceClass The surface's own base class
 */
export function defaultCheckboxCss(surfaceClass: string): string {
  const colours = CHECKBOX_STATES.map(state =>
    `  .${surfaceClass}--${state.key} {
    color: ${state.colour};
  }`).join('\n');

  return `@layer itagsDefaults;
@layer itagsDefaults {
${colours}
}
span.${surfaceClass} {
  font-family: monospace;
  font-weight: bold;
}
span.${surfaceClass} * {
  color: inherit;
  font-family: inherit;
  font-weight: inherit;
}`;
}
