export async function runQueryAndPrintResults(db: any, query: string) {
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Assuming 'n.name' is the column you're interested in, print each result
        console.log("Resulting Table:");
        rows.forEach(row => {
          console.log(row);
        });
        resolve(rows);
      }
    });
  });
}

export function convertToSQLiteQuery(groups: Array<Array<{ tag: string, negated: boolean }>>) {
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

  console.log(finalQuery);
  
  return `SELECT DISTINCT noteId, lineNumber FROM (${finalQuery})`;
}
