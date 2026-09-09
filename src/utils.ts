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
export const SHARED_TAG_CLASS = 'itags-tag';

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
