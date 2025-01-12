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