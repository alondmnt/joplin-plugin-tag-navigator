import joplin from 'api';
import { parseLinkLines, parseTagsLines } from './parser';
import { loadQuery } from './searchPanel';
import { clearNoteReferences } from './search';
import { TagSettings, getTagSettings } from './settings';

export class DatabaseManager {
  static db: NoteDatabase = null;

  static getDatabase() {
    if (!DatabaseManager.db) {
      DatabaseManager.db = new NoteDatabase();
    }
    return DatabaseManager.db;
  }

  static clearDatabase() {
    if (DatabaseManager.db) {
      DatabaseManager.db.clearData();
    }
  }
}

export type ResultSet = { [id: string]: Set<number> };

class Note {
  id: string;
  title: string;
  tags: { [tag: string]: Set<number> };
  noteLinksById: { [noteId: string]: Set<number> };
  noteLinksByTitle: { [title: string]: Set<number> };
  savedQuery: boolean;
  displayResults: boolean;

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
    this.tags = {};
    this.noteLinksById = {};
    this.noteLinksByTitle = {};
    this.savedQuery = false;
    this.displayResults = false;
  }

  addTag(tag: string, lineNumber: number) {
    if (!this.tags[tag]) {
      this.tags[tag] = new Set();
    }
    this.tags[tag].add(lineNumber);
  }

  setSavedQuery(saved: boolean) {
    this.savedQuery = saved;
  }

  setDisplay(display: boolean) {
    this.displayResults = display;
  }

  addLink(title: string, noteId: string, lineNumber: number) {
    if (!this.noteLinksById[noteId]) {
      this.noteLinksById[noteId] = new Set();
    }
    this.noteLinksById[noteId].add(lineNumber);

    if (!this.noteLinksByTitle[title]) {
      this.noteLinksByTitle[title] = new Set();
    }
    this.noteLinksByTitle[title].add(lineNumber);
  }

  addTagLines(tag: string, lines: Set<number>) {
    // batch function
    if (!this.tags[tag]) {
      this.tags[tag] = new Set();
    }
    lines.forEach(line => this.tags[tag].add(line));
  }

  addLinkIdLines(noteId: string, lines: Set<number>) {
    // batch function
    if (!this.noteLinksById[noteId]) {
      this.noteLinksById[noteId] = new Set();
    }
    lines.forEach(line => this.noteLinksById[noteId].add(line));
  }

  addLinkTitleLines(title: string, lines: Set<number>) {
    // batch function
    if (!this.noteLinksByTitle[title]) {
      this.noteLinksByTitle[title] = new Set();
    }
    lines.forEach(line => this.noteLinksByTitle[title].add(line));
  }

  getNoteLines(): Set<number> {
    let allPos: Set<number> = new Set();
    for (const tag in this.tags) {
      allPos = unionSets(allPos, this.tags[tag]);
    }
    for (const noteId in this.noteLinksById) {
      allPos = unionSets(allPos, this.noteLinksById[noteId]);
    }
    for (const title in this.noteLinksByTitle) {
      allPos = unionSets(allPos, this.noteLinksByTitle[title]);
    }
    return allPos;
  }
}

export class NoteDatabase {
  notes: { [id: string]: Note }
  tags: { [tag: string]: number }  // Used to filter tags

  constructor() {
    this.notes = {};
    this.tags = {};
  }

  addNote(note: Note): void {
    // Add a note to the database
    // Check if note already exists
    if (this.notes[note.id]) {
      this.removeNote(note.id);
    }
    // Add or update the note in the database
    this.notes[note.id] = note;
    // Update tags count
    for (const tag in note.tags) {
      this.tags[tag] = (this.tags[tag] || 0) + note.tags[tag].size;
    }
  }

  removeNote(id: string): void {
    // Remove a note from the database
    if (!this.notes[id]) {
      console.error(`Note with id ${id} does not exist in the database.`);
      return
    }
    // Update tags count
    for (const tag in this.notes[id].tags) {
      this.tags[tag] = this.tags[tag] - this.notes[id].tags[tag].size;
    }
    // Remove the note from the database
    delete this.notes[id];
  }

  filterTags(minCount: number): void {
    // Filter tags with count less than minCount
    for (const tag in this.tags) {
      if (this.tags[tag] < minCount) {
        delete this.tags[tag];
      }
    }
  }

  // Clear all data
  clearData() {
    this.notes = {};
    this.tags = {};
  }

  getTags(): string[] {
    // Return a list of tags sorted alphabetically
    return Object.keys(this.tags).sort();
  }

  getNotes(): { title: string, externalId: string }[] {
    // Return a list of note titles and ids
    return Object.values(this.notes)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(note => { return {title: note.title, externalId: note.id}; });
  }

  getNoteId(title: string): string {
    // Return the note id given the note title
    return Object.values(this.notes).find(note => note.title === title)?.id;
  }

  getQueryNotes(): string[] {
    // Return a list of note ids that contain a saved query
    return Object.values(this.notes).filter(note => note.savedQuery).map(note => note.id);
  }

  getResultNotes(): string[] {
    // Return a list of note ids that should display results
    return Object.values(this.notes).filter(note => note.displayResults).map(note => note.id);
  }

  searchBy(by: string, query: string, negated: boolean): ResultSet {
    // Return a dictionary of note ids and positions of the given tag
    // If negated is true, all positions without the tag are returned
    const result: ResultSet = {};
    for (const noteId in this.notes) {
      let resPos: Set<number> = new Set();
      switch (by) {
        case 'tag':
          resPos = this.notes[noteId].tags[query];
          break;
        case 'noteLinkId':
          resPos = this.notes[noteId].noteLinksById[query];
          break;
        case 'noteLinkTitle':
          resPos = this.notes[noteId].noteLinksByTitle[query];
          break;
      }

      if (!negated) {
        if (resPos) { result[noteId] = resPos; }
      } else {
        const allPos = this.notes[noteId].getNoteLines();
        result[noteId] = diffSets(allPos, resPos);
      }
    }
    return result;
  }
}

export function intersectSets(setA: Set<number>, setB: Set<number>): Set<number> {
  // Return the intersection of two sets
  return new Set([...setA].filter(x => setB.has(x)));
}

export function unionSets(setA: Set<number>, setB: Set<number>): Set<number> {
  // Return the union of two sets
  return new Set([...setA, ...setB]);
}

function diffSets(setA: Set<number>, setB: Set<number>): Set<number> {
  // Return the set difference of two sets
  if (!setB) { return setA; }
  return new Set([...setA].filter(x => !setB.has(x)));
}

export async function processAllNotes() {
  // Create the in-memory database
  DatabaseManager.clearDatabase();
  const db = DatabaseManager.getDatabase();
  const tagSettings = await getTagSettings();

  // Get all notes
  let hasMore = true;
  let page = 1;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'title', 'body', 'markup_language', 'is_conflict'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    for (let note of notes.items) {
      if (tagSettings.ignoreHtmlNotes && (note.markup_language === 2)) {
        note = clearNoteReferences(note);
        continue;
      }
      if (note.is_conflict == 1) {
        note = clearNoteReferences(note);
        continue;
      }
      await processNote(db, note, tagSettings);
      note = clearNoteReferences(note);
    }
    // Remove the reference to the notes to avoid memory leaks
    notes.items = null;
  }

  const minCount = await joplin.settings.value('itags.minCount');
  db.filterTags(minCount);
}

export async function processNote(db: NoteDatabase, note: any, tagSettings: TagSettings): Promise<void> {
  try {
    const noteRecord = new Note(note.id, note.title);
    const tagLines = await parseTagsLines(note.body, tagSettings);

    // Process each tagLine within the transaction
    for (const tagLine of tagLines) {
      for (const lineNumber of tagLine.lines) {
        noteRecord.addTag(tagLine.tag, lineNumber);
      }
    }

    // Process links
    const linkLines = await parseLinkLines(note.body, tagSettings.ignoreCodeBlocks, tagSettings.inheritTags);
    for (const linkLine of linkLines) {
      noteRecord.addLink(linkLine.title, linkLine.noteId, linkLine.line);
    }

    // Insert into Results table if results should be displayed
    const searchQuery = await loadQuery(db, note);
    if (searchQuery.query[0].length > 0) {
      noteRecord.setSavedQuery(true);
    }
    noteRecord.setDisplay(searchQuery.displayInNote);

    // Add the note to the database
    db.addNote(noteRecord);

  } catch (error) {
    console.error(`Error processing note ${note.id}:`, error);
  }
}