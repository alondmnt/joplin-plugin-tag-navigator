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