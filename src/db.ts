import joplin from 'api';
import { getTagRegex, parseLinkLines, parseTagsLines } from './parser';
const sqlite3 = joplin.require('sqlite3');


export async function createTables(path: string) {
  // Open a SQLite database
  const db = new sqlite3.Database(path, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
    } else {
      console.log(`Opened database successfully in ${path}`);
    }
  });

  db.serialize(() => {
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS Notes (
    noteId INTEGER PRIMARY KEY AUTOINCREMENT,
    externalId TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL
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
    
    // Here we use externalId for the linked note because it's *stable*
    db.run(`CREATE TABLE IF NOT EXISTS NoteLinks (
    noteId INTEGER,
    linkedNoteId TEXT,
    lineNumber INTEGER,
    PRIMARY KEY (noteId, linkedNoteId, lineNumber),
    FOREIGN KEY (noteId) REFERENCES Notes(noteId),
    FOREIGN KEY (linkedNoteId) REFERENCES Notes(externalId)
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
  const ignoreHtmlNotes = await joplin.settings.value('itags.ignoreHtmlNotes');
  // Create the in-memory database
  const db = await createTables(':memory:');
  const tagRegex = await getTagRegex();
  const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
  const inheritTags = await joplin.settings.value('itags.inheritTags');

  // Build notes table, so we can process link to notes
  let hasMore = true;
  let page = 1;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'title'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    for (const note of notes.items) {
      await insertOrGetNoteId(db, note.id, note.title);
    }
  }

  // Get all notes
  hasMore = true;
  page = 1;
  while (hasMore) {
    const notes = await joplin.data.get(['notes'], {
      fields: ['id', 'title', 'body', 'markup_language'],
      limit: 50,
      page: page++,
    });
    hasMore = notes.has_more;

    for (const note of notes.items) {
      if (ignoreHtmlNotes && (note.markup_language === 2)) {
        continue;
      }
      await processNote(db, note, tagRegex, ignoreCodeBlocks, inheritTags);
    }
  }

  const minCount = await joplin.settings.value('itags.minCount');
  await filterTags(db, minCount);

  return db;
}

async function processNote(db: any, note: any, tagRegex: RegExp, ignoreCodeBlocks: boolean, inheritTags:boolean) {
  try {
    // Start a transaction
    await run(db, 'BEGIN TRANSACTION');

    const tagLines = await parseTagsLines(note.body, tagRegex, ignoreCodeBlocks, inheritTags);
    const noteId = await insertOrGetNoteId(db, note.id, note.title);

    // Process each tagLine within the transaction
    for (const tagLine of tagLines) {
      const tagId = await insertOrGetTagId(db, tagLine.tag);
      for (const lineNumber of tagLine.lines) {
        await insertNoteTag(db, noteId, tagId, lineNumber);
      }
    }

    // Process links
    const linkLines = await parseLinkLines(note.body);
    for (const linkLine of linkLines) {
      const linkedNoteId = await getNoteId(db, linkLine.noteId, linkLine.title);
      if (linkedNoteId) {
        await run(db, `INSERT INTO NoteLinks (noteId, linkedNoteId, lineNumber) VALUES (?, ?, ?)`, [noteId, linkedNoteId, linkLine.line]);
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

async function insertOrGetNoteId(db: any, externalId: string, title: string): Promise<number | null> {
  try {
    // Attempt to insert the note, ignoring if it already exists
    await run(db, `INSERT OR IGNORE INTO Notes (externalId, title) VALUES (?, ?)`, [externalId, title]);
    
    // Retrieve the noteId for the given note
    const result = await get(db, `SELECT noteId FROM Notes WHERE externalId = ?`, [externalId]);
    return result ? (result as any).noteId : null;
  } catch (error) {
    throw error; // Rethrow the error to be handled by the caller
  }
}

// search a note by externalId OR title (prefer externalId)
// currently returning externalId because it is *stable*
export async function getNoteId(db: any, externalId: string, title: string): Promise<number | null> {
  try {
    const resultById = await get(db, `SELECT externalId FROM Notes WHERE externalId = ?`, [externalId]);
    if (resultById) {
      return (resultById as any).externalId;
    } else {
      const resultByTitle = await get(db, `SELECT externalId FROM Notes WHERE title = ? LIMIT 1`, [title]);
      return resultByTitle ? (resultByTitle as any).externalId : null;
    }
  } catch (error) {
    throw error; // Rethrow the error to be handled by the caller
  }
}

async function filterTags(db: any, minCount: number) {
  // delete from Tags and NoteTags where tagId counts are less than minCount
  await run(db, `DELETE FROM Tags WHERE tagId NOT IN (SELECT tagId FROM NoteTags GROUP BY tagId HAVING COUNT(*) >= ?)`, [minCount]);
  await run(db, `DELETE FROM NoteTags WHERE tagId NOT IN (SELECT tagId FROM Tags)`);
}