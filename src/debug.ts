import joplin from "api";
import { createTables } from "./db";
const sqlite3 = joplin.require('sqlite3');

export async function dumpInMemoryDbToFile(dbMemory: any, filePath: string) {
  
  return new Promise<void>(async (resolve, reject) => {
    const plugin_dir = await joplin.plugins.dataDir();
    const dbFile = await createTables(plugin_dir + '/' + filePath);
    const tables = await fetchTableNames(dbMemory);
    console.log(tables);

    // Use Promise.all to wait for all table data to be inserted
    await Promise.all(tables.map(tableName => {
      return new Promise<void>((resolveTable, rejectTable) => {
        console.log(`Dumping table: ${tableName}`);

        dbMemory.all(`SELECT * FROM ${tableName}`, (err, rows) => {
          if (err) {
            console.error(`Error fetching data from table ${tableName}`, err);
            rejectTable(err);
            return;
          }

          if (rows.length > 0) {
            const keys = Object.keys(rows[0]);
            const placeholders = keys.map(() => '?').join(',');
            const insertStmt = `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`;

            dbFile.serialize(() => {
              dbFile.run('BEGIN');
              rows.forEach(row => {
                dbFile.run(insertStmt, Object.values(row), (err) => {
                  if (err) {
                    console.error(`Error inserting data into ${tableName}`, err);
                    rejectTable(err);
                  }
                });
              });
              dbFile.run('COMMIT', (err) => {
                if (err) {
                  console.error('Error committing transaction', err);
                  rejectTable(err);
                } else {
                  console.log(`Successfully dumped table: ${tableName}`);
                  resolveTable();
                }
              });
            });
          } else {
            // No rows to insert, just resolve
            resolveTable();
          }
        });
      });
    })).then(() => {
      dbFile.close((err) => {
        if (err) {
          console.error('Error closing file database', err);
          reject(err);
        } else {
          console.log('File database closed successfully');
          resolve();
        }
      });
    }).catch(reject); // Catch any errors from the table processing promises
  });
}

async function fetchTableNames(db: any): Promise<{ name: string }[]> {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'", (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(row => row.name));
      }
    });
  });
}