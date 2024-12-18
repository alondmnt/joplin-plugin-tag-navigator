export function clearObjectReferences(obj: any): null {
	if (!obj) { return null; }

	// Remove references to object properties
	for (const prop in obj) {
		obj[prop] = null;
	}
	obj = null;

	return null;
}