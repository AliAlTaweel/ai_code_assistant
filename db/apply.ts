// db/apply.ts — usage: tsx db/apply.ts <sqlFilePath> <connectionString>
import { Client } from "pg";
import { readFileSync } from "node:fs";

const [, , sqlPath, connectionString] = process.argv;
if (!sqlPath || !connectionString) {
  console.error("usage: tsx db/apply.ts <sqlFilePath> <connectionString>");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();
const sql = readFileSync(sqlPath, "utf-8");
await client.query(sql);
await client.end();
console.log(`applied ${sqlPath} to ${connectionString.replace(/:[^:@]+@/, ":***@")}`);
