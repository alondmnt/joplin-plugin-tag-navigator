import joplin from 'api';
import { parseTagsLines } from './parser';
const sqlite3 = joplin.require('sqlite3');


export async function createTables(path: string) {
  // Open an in-memory SQLite database
  const db = new sqlite3.Database(path, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
    } else {
      console.log('Opened in-memory database successfully');
    }
  });

  db.serialize(() => {
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS Notes (
    noteId INTEGER PRIMARY KEY AUTOINCREMENT,
    externalId TEXT NOT NULL
    );`);
    
    db.run(`CREATE TABLE IF NOT EXISTS Tags (
    tagId INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL UNIQUE
    );`);
    
    db.run(`CREATE TABLE IF NOT EXISTS NoteTags (
    noteId INTEGER,
    tagId INTEGER,
    lineNumber INTEGER,
    PRIMARY KEY (noteId, tagId, lineNumber),
    FOREIGN KEY (noteId) REFERENCES Notes(noteId),
    FOREIGN KEY (tagId) REFERENCES Tags(tagId)
    );`);
    
    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_noteId ON NoteTags(noteId);`);
  });
  
  return db;
}

function run(db: any, sql: string, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function get(db: any, sql: string, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export async function processAllNotes() {
  // Create the in-memory database
  const db = await createTables(':memory:');

  // Get all notes
  let hasMore = true;
  let page = 0;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'body'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    for (const note of notes.items) {
      await processNote(db, note);
    }
  }

  return db;
}

async function processNote(db: any, note: any) {
  try {
    // Start a transaction
    await run(db, 'BEGIN TRANSACTION');

    const tagLines = await parseTagsLines(note.body);
    const noteId = await insertOrGetNoteId(db, note.id);

    // Process each tagLine within the transaction
    for (const tagLine of tagLines) {
      const tagId = await insertOrGetTagId(db, tagLine.tag);
      for (const lineNumber of tagLine.lines) {
        await insertNoteTag(db, noteId, tagId, lineNumber);
      }
    }

    // Commit the transaction
    await run(db, 'COMMIT');
    // console.log(`Processed note ${note.id} successfully.`);
  } catch (error) {
    // Roll back the transaction in case of an error
    await run(db, 'ROLLBACK');
    console.error(`Error processing note ${note.id}:`, error);
  }
}

async function insertNoteTag(db: any, noteId: number, tagId: number, lineNumber: number) {
  try {
    await run(db, `INSERT INTO NoteTags (noteId, tagId, lineNumber) VALUES (?, ?, ?)`, [noteId, tagId, lineNumber]);
  } catch (error) {
    throw error; // Rethrow the error to be handled by the caller
  }
}

async function insertOrGetTagId(db: any, tag: string): Promise<number | null> {
  try {
    // Attempt to insert the tag, ignoring if it already exists
    await run(db, `INSERT OR IGNORE INTO Tags (tag) VALUES (?)`, [tag]);
    
    // Retrieve the tagId for the given tag
    const result = await get(db, `SELECT tagId FROM Tags WHERE tag = ?`, [tag]);
    return result ? (result as any).tagId : null;
  } catch (error) {
    throw error; // Rethrow the error to be handled by the caller
  }
}

async function insertOrGetNoteId(db: any, externalId: string): Promise<number | null> {
  try {
    // Attempt to insert the note, ignoring if it already exists
    await run(db, `INSERT OR IGNORE INTO Notes (externalId) VALUES (?)`, [externalId]);
    
    // Retrieve the noteId for the given tag
    const result = await get(db, `SELECT noteId FROM Notes WHERE externalId = ?`, [externalId]);
    return result ? (result as any).noteId : null;
  } catch (error) {
    throw error; // Rethrow the error to be handled by the caller
  }
}

export function getAllTags(db: any): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT tag FROM Tags`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const tags = rows.map(row => row.tag);
        resolve(tags);
      }
    });
  });
}