import joplin from 'api';
import { parseLinkLines, parseTagsFromFrontMatter, parseTagsLines } from './parser';
import { loadQuery } from './searchPanel';
import { TagSettings, getTagSettings } from './settings';
import { clearObjectReferences, clearApiResponse } from './memory';
import { processBatch } from './utils';

/**
 * Manages the singleton instance of the NoteDatabase
 */
export class DatabaseManager {
  static db: NoteDatabase = null;

  /**
   * Returns the singleton instance of NoteDatabase, creating it if necessary
   */
  static getDatabase(): NoteDatabase {
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

/** Mapping of note IDs to line numbers where matches were found */
export type ResultSet = { [id: string]: Set<number> };

/**
 * Represents a single note with its metadata, tags, and links
 */
class Note {
  id: string;
  title: string;
  updatedTime: number | null;
  tags: { [tag: string]: Set<number> };
  noteLinksById: { [noteId: string]: Set<number> };
  noteLinksByTitle: { [title: string]: Set<number> };
  savedQuery: boolean;
  displayResults: string;
  exists: boolean;

  /**
   * Creates a new Note instance
   * @param id - The unique identifier of the note
   * @param title - The title of the note
   */
  constructor(id: string, title: string, updatedTime: number | null) {
    this.id = id;
    this.title = title;
    this.updatedTime = updatedTime;
    this.tags = {};
    this.noteLinksById = {};
    this.noteLinksByTitle = {};
    this.savedQuery = false;
    this.displayResults = 'false';
    this.exists = true;
  }

  /**
   * Adds a tag at a specific line number
   * @param tag - The tag to add
   * @param lineNumber - The line number where the tag appears
   */
  addTag(tag: string, lineNumber: number): void {
    if (!this.tags[tag]) {
      this.tags[tag] = new Set();
    }
    this.tags[tag].add(lineNumber);
  }

  setUpdatedTime(time: number) {
    this.updatedTime = time;
  }

  setSavedQuery(saved: boolean) {
    this.savedQuery = saved;
  }

  setDisplay(display: string) {
    this.displayResults = display;
  }

  addLink(title: string, noteId: string, lineNumber: number) {
    if (noteId) {
      if (!this.noteLinksById[noteId]) {
        this.noteLinksById[noteId] = new Set();
      }
      this.noteLinksById[noteId].add(lineNumber);

      // Add only the noteId
      return;
    }

    // Fall back to title when noteId is not available
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

  getTagsAtLine(line: number): Set<string> {
    // Return all tags that contain this line
    // If line is null/undefined, return all tags
    const result = new Set<string>();
    for (const tag in this.tags) {
      if (line != null && this.tags[tag].has(line)) {
        result.add(tag);
      } else if (line == null) {
        result.add(tag);
      }
    }
    return result;
  }
}

/**
 * In-memory database for storing and querying notes, tags, and their relationships
 */
export class NoteDatabase {
  notes: { [id: string]: Note }
  /** Maps tag names to their occurrence count across all notes */
  tags: { [tag: string]: number }  // Used to filter tags

  constructor() {
    this.notes = {};
    this.tags = {};
  }

  getNoteUpdatedTime(id: string): number | null {
    return this.notes[id]?.updatedTime || null;
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
      if (this.tags[tag] === 0) {
        delete this.tags[tag];
      }
    }
    // Clear the note object
    clearObjectReferences(this.notes[id]);
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

  /**
   * Clears the exists flag for all notes
   */
  clearNoteExists() {
    for (const noteId in this.notes) {
      this.notes[noteId].exists = false;
    }
  }

  /**
   * Sets the exists flag for a note
   * @param id - The ID of the note
   */
  setNoteExists(id: string) {
    if (this.notes[id]) {
      this.notes[id].exists = true;
    }
  }

  /**
   * Removes notes that have been deleted from Joplin
   */
  removeNonExistingNotes() {
    for (const noteId in this.notes) {
      if (!this.notes[noteId].exists) {
        this.removeNote(noteId);
      }
    }
  }

  // Clear all data
  clearData() {
    this.notes = {};
    this.tags = {};
  }

  getTags(valueDelim?: string): string[] {
    // Return a list of tags sorted alphabetically
    if (valueDelim) {
      return Object.keys(this.tags)
        .filter(tag => !tag.includes(valueDelim))
        .sort((a, b) => a.localeCompare(b));
    } else {
      return Object.keys(this.tags)
        .sort((a, b) => a.localeCompare(b));
    }
  }

  getAllTagCounts(valueDelim?: string): { [tag: string]: number } {
    // Return a dictionary of all tags and their counts
    if (valueDelim) {
      return Object.fromEntries(Object.entries(this.tags)
        .filter(([tag]) => !tag.includes(valueDelim)));
    } else {
      return this.tags;
    }
  }

  getTagCount(tag: string): number {
    // Return the count of a tag
    return this.tags[tag] || 0;
  }

  getNotes(): { title: string, externalId: string }[] {
    // Return a list of note titles and ids
    return Object.values(this.notes)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(note => { return {title: note.title, externalId: note.id}; });
  }

  getNoteId(title: string): string {
    // Return the note id given the note title
    let noteId =  Object.values(this.notes).find(note => note.title === title)?.id;
    if (!noteId) {
      // Try to find a note with the title in lowercase
      noteId = Object.values(this.notes).find(note => note.title.toLowerCase() === title.toLowerCase())?.id;
    }
    if (!noteId) {
      // Try to find a note based on the first word of the title
      noteId = Object.values(this.notes).find(note => note.title.toLowerCase().split(' ')[0] === title.toLowerCase())?.id;
    }
    return noteId;
  }

  getQueryNotes(): string[] {
    // Return a list of note ids that contain a saved query
    return Object.values(this.notes).filter(note => note.savedQuery).map(note => note.id);
  }

  getQueryNotesWithTitles(): { title: string, externalId: string }[] {
    // Return a list of notes with saved queries, including their titles
    return Object.values(this.notes)
      .filter(note => note.savedQuery)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(note => ({ title: note.title, externalId: note.id }));
  }

  getResultNotes(): string[] {
    // Return a list of note ids that should display results
    return Object.values(this.notes).filter(note => (note.displayResults !== 'false')).map(note => note.id);
  }

  /**
   * Searches notes based on specified criteria
   * @param by - The type of search ('tag', 'noteLinkId', or 'noteLinkTitle')
   * @param query - The search term
   * @param negated - If true, returns positions without the search term
   * @returns Mapping of note IDs to matching line numbers
   */
  searchBy(by: 'tag' | 'noteLinkId' | 'noteLinkTitle', query: string, negated: boolean): ResultSet {
    // Return a dictionary of note ids and positions of the given tag
    // If negated is true, all positions without the tag are returned
    const result: ResultSet = {};
    for (const noteId in this.notes) {
      let resPos: Set<number> = new Set();
      switch (by) {
        case 'tag':
          resPos = this.notes[noteId].tags[query.toLowerCase()];  // Tags are case-insensitive
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

/**
 * Returns the intersection of two number sets
 * @param setA - First set
 * @param setB - Second set
 */
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

/**
 * Checks if the date has changed since last processing to require date tag eval
 */
function needsDailyUpdate(lastProcessedTime: number, currentDateString: string): boolean {
  const lastProcessed = new Date(lastProcessedTime);
  
  // Compare just the date parts (year, month, day) - ignore time
  return currentDateString !== lastProcessed.toDateString();
}

function isNotebookAllowed(parentId: string | undefined, tagSettings: TagSettings): boolean {
  if (parentId && tagSettings.excludeNotebooks.includes(parentId)) {
    return false;
  }

  if (tagSettings.includeNotebooks.length === 0) {
    return true;
  }

  if (!parentId) {
    return false;
  }

  return tagSettings.includeNotebooks.includes(parentId);
}

export async function processAllNotes() {
  const db = DatabaseManager.getDatabase();
  const tagSettings = await getTagSettings();

  // Cache current date string to avoid creating Date objects repeatedly
  const currentDateString = new Date().toDateString();

  // First loop: collect IDs of notes that need updating
  db.clearNoteExists();  // We will use the exist flag to remove deleted notes
  const notesToUpdate = new Set<string>();
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'updated_time', 'parent_id'],
      order_by: 'updated_time',
      order_dir: 'DESC',
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    for (const note of notes.items) {
      // Skip notes not allowed by include/exclude settings
      if (!isNotebookAllowed(note.parent_id, tagSettings)) {
        clearObjectReferences(note);
        continue;
      }

      db.setNoteExists(note.id);
      const noteUpdatedTime = db.getNoteUpdatedTime(note.id);

      // Check if note content has changed
      const contentChanged = !noteUpdatedTime || note.updated_time > noteUpdatedTime;

      // Check if enough time has passed for daily re-evaluation (handles date tags)
      const needsUpdate = contentChanged || (noteUpdatedTime && needsDailyUpdate(noteUpdatedTime, currentDateString));

      if (!needsUpdate) {
        clearObjectReferences(note);
        continue;
      }

      notesToUpdate.add(note.id);
      clearObjectReferences(note);
    }
    // Clear the API response to prevent memory leaks
    clearApiResponse(notes);
  }

  db.removeNonExistingNotes();

  // Second loop: fetch full details only for notes that need updating
  await processBatch(Array.from(notesToUpdate), tagSettings.readBatchSize, async (noteId) => {
    let note = await joplin.data.get(['notes', noteId], {
      fields: ['id', 'title', 'body', 'markup_language', 'is_conflict', 'updated_time', 'parent_id'],
    });

    // Double-check notebook exclusion (in case settings changed during processing)
    if (!isNotebookAllowed(note.parent_id, tagSettings)) {
      note = clearObjectReferences(note);
      return;
    }

    if (tagSettings.ignoreHtmlNotes && (note.markup_language === 2)) {
      note = clearObjectReferences(note);
      return;
    }
    if (note.is_conflict == 1) {
      note = clearObjectReferences(note);
      return;
    }

    await processNote(db, note, tagSettings);
    note = clearObjectReferences(note);
  });

  // Clear the Set
  notesToUpdate.clear();

  db.filterTags(tagSettings.minCount);
}

/**
 * Processes a single note and adds it to the database
 * @param db - The database instance
 * @param note - The note data from Joplin
 * @param tagSettings - Configuration for tag processing
 */
export async function processNote(
  db: NoteDatabase, 
  note: {
    id: string;
    title: string;
    body: string;
    markup_language: number;
    is_conflict: number;
    updated_time: number;
    parent_id?: string;
  }, 
  tagSettings: TagSettings
): Promise<void> {
  try {
    // Check if note's notebook is allowed based on include/exclude settings
    if (!isNotebookAllowed(note.parent_id, tagSettings)) {
      return; // Skip processing this note
    }

    const noteRecord = new Note(note.id, note.title, note.updated_time);

    // Process front matter tags
    const frontMatterTags = parseTagsFromFrontMatter(note.body, tagSettings);
    for (const tag of frontMatterTags) {
      for (const line of tag.lines) {
        noteRecord.addTag(tag.tag, line);
      }
    }

    // Process standard inline tags
    const tagLines = parseTagsLines(note.body, tagSettings);
    for (const tagLine of tagLines) {
      for (const lineNumber of tagLine.lines) {
        noteRecord.addTag(tagLine.tag, lineNumber);
      }
    }

    if (tagSettings.inheritTags) {
      // Get all tags from lines 0-1
      const topNoteTags = new Set([
        ...noteRecord.getTagsAtLine(0),
        ...noteRecord.getTagsAtLine(1)
      ]);
      // Get all lines in the note
      const allLines = noteRecord.getNoteLines();
      // Add all tags from line 0 to all lines in the note
      for (const tag of topNoteTags) {
        if (tag.endsWith('frontmatter')) {
          continue;
        }
        noteRecord.addTagLines(tag, allLines);
      }
      
      // Clear the Set
      topNoteTags.clear();
    }

    // Process links
    const linkLines = await parseLinkLines(note.body, tagSettings.ignoreCodeBlocks, tagSettings.inheritTags);
    for (const linkLine of linkLines) {
      noteRecord.addLink(linkLine.title, linkLine.noteId, linkLine.line);
    }

    // Insert into Results table if results should be displayed
    const searchQuery = loadQuery(note);
    if (searchQuery.query[0]?.length > 0) {
      noteRecord.setSavedQuery(true);
    }
    noteRecord.setDisplay(searchQuery.displayInNote);

    // Add the note to the database
    db.addNote(noteRecord);

  } catch (error) {
    console.error(`Error processing note ${note.id}:`, error);
  }
}
