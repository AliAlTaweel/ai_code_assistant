import { Client } from "pg";

const ADMIN_URL = "postgres://admin:password@localhost:5432/postgres";
const TEST_DB = "agileday_test";

export default async function globalSetup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();
}
