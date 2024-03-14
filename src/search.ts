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

export async function runSearch(db: any, queries: Query[][]): Promise<GroupedResult[]> {
  const dbQueries = convertToDbQuery(queries);
  const dbResults =  await executeQueries(db, dbQueries);
  const logicResults = applyDNFLogic(dbResults);
  const processedResults = await processQueryResults(logicResults);

  return processedResults;
}

export function convertToDbQuery(groups: Query[][]): string[][] {
  return groups.map(group => {
    return group.map(condition => {
      // Base query parts
      let baseQuery = 'SELECT n.noteId, n.externalId, l.lineNumber FROM Notes n';
      let joinClause = '';
      let whereClause = 'WHERE ';

      // Construct query based on condition type
      if (condition.tag) {
        joinClause += 'INNER JOIN NoteTags l ON l.noteId = n.noteId INNER JOIN Tags t ON l.tagId = t.tagId ';
        whereClause += `${condition.negated ? 't.tag !=' : 't.tag ='} '${condition.tag}' `;

      } else if (condition.externalId) {
        joinClause += 'INNER JOIN NoteLinks l ON l.noteId = n.noteId '
        whereClause += `${condition.negated ? 'l.linkedNoteId !=' : 'l.linkedNoteId ='} '${condition.externalId}' `;
      }

      // Return the final query for this condition
      return `${baseQuery} ${joinClause} ${whereClause}`.trim();
    });
  });
}

function executeQueries(db: any, queries: string[][]): Promise<QueryResult[][][]> {
  return Promise.all(queries.map(group => {
    return Promise.all(group.map(query => {
      return new Promise<QueryResult[]>((resolve, reject) => {
        db.all(query, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            noteId: row.noteId,
            externalId: row.externalId,
            lineNumber: row.lineNumber
          })));
        });
      });
    }));
  }));
}

// Finds the intersection of two QueryResult arrays
function intersectResults(a: QueryResult[], b: QueryResult[]): QueryResult[] {
  const result = a.filter(item => b.some(other =>
    (other.noteId === item.noteId) && (other.lineNumber === item.lineNumber)));
  return result
}

// Unions two arrays of QueryResult objects
function unionResults(a: QueryResult[], b: QueryResult[]): QueryResult[] {
  const combined = [...a, ...b];
  const unique = Array.from(new Set(combined.map(item => JSON.stringify(item)))).map(item => JSON.parse(item));
  return unique;
}

// Disjoint Normal Form (DNF) logic on query results
function applyDNFLogic(queryResults: QueryResult[][][]): QueryResult[] {
  // Flatten the structure since each group ultimately contributes a single QueryResult
  const andResults = queryResults.flatMap(groupResults => {
    // Apply AND logic within each group to find a common result, if applicable
    return groupResults.reduce<QueryResult[]>((acc, currentResults, index) => {
      if (index === 0) return currentResults; // Start with the first item for comparison
      // Assuming intersectResults can handle comparing and possibly merging or selecting from two QueryResult arrays
      return intersectResults(acc, currentResults);
    }, []);
  });

  // Apply OR logic across all groups, where andResults now correctly represents an array of QueryResult from each group
  const orResult = andResults.reduce<QueryResult[]>((acc, currentResult) => {
    // This assumes unionResults can add a QueryResult to an array if it's not already present
    return unionResults(acc, [currentResult]);
  }, []);

  return orResult;
}

async function processQueryResults(queryResults: QueryResult[]): Promise<GroupedResult[]> {
  // group the results by externalId and get the note content
  queryResults.sort((a, b) => a.noteId - b.noteId);

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