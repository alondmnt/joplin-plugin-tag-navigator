import joplin from 'api';

export interface Query {
  tag: string;
  negated: boolean;
}

interface QueryResult {
  noteId: string;
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

export async function getQueryResults(db: any, query: string): Promise<GroupedResult[]> {
  if (!query) return [];
  return new Promise((resolve, reject) => {
    db.all(query, [], async (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(await processQueryResults(rows));
      }
    });
  });
}

export function convertToSQLiteQuery(groups: Query[][]) {
  if (groups.length === 0) return '';
  // Process each group to create a part of the WHERE clause
  const groupConditions = groups.map(group => {
    // For each tag in the group, create a conditional aggregation check
    const conditions = group.map(({ tag, negated }) => {
      // Adjust for presence or absence of the tag
      return `${negated ? 'SUM(CASE WHEN t.tag = \'' + tag + '\' THEN 1 ELSE 0 END) = 0' : 'SUM(CASE WHEN t.tag = \'' + tag + '\' THEN 1 ELSE 0 END) > 0'}`;
    }).join(' AND '); // Intersect conditions within a group with AND

    // Return the conditional checks for this group, wrapped in HAVING for aggregation filtering
    return `SELECT nt.noteId, nt.lineNumber FROM NoteTags nt JOIN Tags t ON nt.tagId = t.tagId GROUP BY nt.noteId, nt.lineNumber HAVING ${conditions}`;
  });

  // Union the groups with OR
  const finalQuery = groupConditions.length > 1 ? groupConditions.join(' UNION ') : groupConditions[0];

  return `SELECT sub.noteId, sub.lineNumber, n.externalId
    FROM (${finalQuery}) AS sub
    JOIN Notes n ON sub.noteId = n.noteId
    ORDER BY sub.noteId, sub.lineNumber;`
}

async function processQueryResults(queryResults: QueryResult[]): Promise<GroupedResult[]> {
  // assuming that queryResults are already sorted by noteId
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