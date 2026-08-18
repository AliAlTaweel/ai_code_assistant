// db/apply.ts — usage: tsx db/apply.ts <sqlFilePath> <connectionString>
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const [, , sqlPath, argConnectionString] = process.argv;
if (!sqlPath) {
  console.error("usage: tsx db/apply.ts <sqlFilePath> <connectionString>");
  process.exit(1);
}

const connectionString =
  argConnectionString ||
  process.env.DATABASE_URL ||
  "postgres://admin:password@localhost:5432/agileday_local";

const client = new Client({ connectionString });
await client.connect();
const sql = readFileSync(sqlPath, "utf-8");
await client.query(sql);
await client.end();
console.log(`applied ${sqlPath} to ${connectionString.replace(/:[^:@]+@/, ":***@")}`);
