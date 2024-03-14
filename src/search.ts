import joplin from 'api';

export interface Query {
  tag?: string;
  title?: string;
  externalId?: string;
  negated: boolean;
}

interface QueryResult {
  noteId: number;
  externalId: string;
  lineNumber: number;
}

export interface GroupedResult {
  externalId: string;
  lineNumbers: number[];
  text: string[];
  html: string[];
  title: string;
  notebook?: string;
  updatedTime?: number;
  createdTime?: number;
}

export async function runSearch(db: any, query: Query[][]): Promise<GroupedResult[]> {
  const currentNote = (await joplin.workspace.selectedNote());
  const dbQuery = convertToDbQuery(query, currentNote);
  const queryResults = await getQueryResults(db, dbQuery);
  const groupedResults = await processQueryResults(queryResults);
  return groupedResults;
}

async function getQueryResults(db: any, query: string): Promise<QueryResult[]> {
  if (!query) return [];
  return new Promise((resolve, reject) => {
    db.all(query, [], async (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function convertToDbQuery(groups: Query[][], currentNote: any): string {
  if (groups.length === 0) return '';

  // Create a subquery that unifies NoteTags with Tags and NoteLinks
  let subQuery = `
    SELECT n.noteId, n.externalId, sub.lineNumber, sub.tag, sub.linkedNoteId
    FROM 
        (SELECT nt.noteId, nt.lineNumber, t.tag, NULL as linkedNoteId
        FROM NoteTags nt
        INNER JOIN Tags t ON nt.tagId = t.tagId
        UNION ALL
        SELECT nl.noteId, nl.lineNumber, NULL as tag, nl.linkedNoteId
        FROM NoteLinks nl) AS sub
    JOIN Notes n ON sub.noteId = n.noteId  
  `;

  // Process each group to create a part of the WHERE clause
  const groupConditions = groups.map(group => {
    // For each condition in the group, create a conditional aggregation check
    const conditions = group.map(condition => {
      if (condition.tag) {
        // Adjust for presence or absence of the tag
        return `${condition.negated ? 'SUM(CASE WHEN sub.tag = \'' + condition.tag + '\' THEN 1 ELSE 0 END) = 0' : 'SUM(CASE WHEN sub.tag = \'' + condition.tag + '\' THEN 1 ELSE 0 END) > 0'}`;

      } else if (condition.externalId) {
        let conditionId = condition.externalId;
        if (condition.externalId == 'current') {
          conditionId = currentNote.id;
        }
        // Adjust for presence or absence of the linked note
        return `${condition.negated ? 'SUM(CASE WHEN sub.linkedNoteId = \'' + conditionId + '\' THEN 1 ELSE 0 END) = 0' : 'SUM(CASE WHEN sub.linkedNoteId = \'' + conditionId + '\' THEN 1 ELSE 0 END) > 0'}`;
      }
    }).join(' AND '); // Intersect conditions within a group with AND

    // Return the conditional checks for this group, wrapped in HAVING for aggregation filtering
    return `${subQuery} GROUP BY sub.noteId, sub.lineNumber HAVING ${conditions}`;
  });

  // Union the groups with OR
  const finalQuery = groupConditions.length > 1 ? groupConditions.join(' UNION ') : groupConditions[0];

  return `SELECT sub.noteId, sub.lineNumber, n.externalId
    FROM (${finalQuery}) AS sub
    JOIN Notes n ON sub.noteId = n.noteId
    ORDER BY sub.noteId, sub.lineNumber;`
}

async function processQueryResults(queryResults: QueryResult[]): Promise<GroupedResult[]> {
  queryResults.sort((a, b) => a.noteId - b.noteId);
  // group the results by externalId and get the note content
  const groupedResults: GroupedResult[] = [];
  if (queryResults.length === 0) return groupedResults;
  let lastExternalId = '';
  let ind = 0;

  for (const row of queryResults) {
    const { noteId, lineNumber, externalId } = row;

    if (externalId !== lastExternalId) {
      if (lastExternalId !== '') {
        // If this is not the first externalId, fetch the text for the last noteId
        ind = groupedResults.length - 1;
        groupedResults[ind] = await getTextAndTitle(groupedResults[ind]);
      }

      // If this is the first time we've seen this externalId, initialize the object
      groupedResults.push({
        externalId: externalId,
        lineNumbers: [],
        text: [],
        html: [],
        title: '',
      });
    }

    groupedResults[groupedResults.length -1].lineNumbers.push(lineNumber);
    lastExternalId = externalId;
  }

  ind = groupedResults.length - 1;
  groupedResults[ind] = await getTextAndTitle(groupedResults[ind]);
  return groupedResults;
}

async function getTextAndTitle(result: GroupedResult): Promise<GroupedResult> {
  const note = await joplin.data.get(['notes', result.externalId],
    { fields: ['title', 'body', 'updated_time', 'created_time', 'parent_id'] });
  const notebook = await joplin.data.get(['folders', note.parent_id], ['title']);
  const lines: string[] = note.body.split('\n');
  result.title = note.title;
  result.text = result.lineNumbers.map(lineNumber => lines[lineNumber]);
  result.notebook = notebook.title;
  result.updatedTime = note.updated_time;
  result.createdTime = note.created_time;
  return result
}