/**
 * Clears all references to properties within an object and sets the object itself to null.
 * This can be useful for memory management and cleanup.
 * 
 * @param obj - The object to clear references from
 * @returns {null} Always returns null
 * 
 * @example
 * const myObj = { a: 1, b: { c: 2 } };
 * clearObjectReferences(myObj); // Returns null, myObj properties are nullified
 */
export function clearObjectReferences<T extends Record<string, any>>(obj: T | null): null {
	if (!obj) { return null; }

	// Remove references to object properties
	for (const prop in obj) {
		obj[prop] = null;
	}
	obj = null;

	return null;
}