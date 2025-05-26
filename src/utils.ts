/**
 * Recursively clears all references to properties within an object.
 * Handles nested objects, arrays, and circular references.
 * 
 * @param obj - The object to clear references from
 * @param visited - Set of visited objects to handle circular references
 * @returns {null} Always returns null
 */
export function clearObjectReferences<T extends Record<string, any>>(obj: T | null, visited: Set<any> = new Set()): null {
	if (!obj || typeof obj !== 'object' || visited.has(obj)) {
		return null;
	}

	visited.add(obj);

	// Handle arrays
	if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			if (typeof obj[i] === 'object' && obj[i] !== null) {
				clearObjectReferences(obj[i], visited);
			}
			obj[i] = null;
		}
	}

	// Handle objects
	for (const prop in obj) {
		if (typeof obj[prop] === 'object' && obj[prop] !== null) {
			clearObjectReferences(obj[prop], visited);
		}
		obj[prop] = null;
	}

	return null;
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