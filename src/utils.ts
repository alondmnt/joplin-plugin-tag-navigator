export function clearNoteReferences(note: any): null {
  if (!note) { return null; }

  // Remove references to the note
  note.body = null;
  note.title = null;
  note.id = null;
  note.parent_id = null;
  note.updated_time = null;
  note.created_time = null;
  note = null;

  return null;
}
