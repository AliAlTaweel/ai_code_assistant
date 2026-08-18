import "dotenv/config";
import { Client } from "pg";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://admin:password@localhost:5432/agileday_test";

// Derive the admin (maintenance) connection URL by swapping the trailing
// database name for "postgres", and pull the target database name from the
// same tail segment.
const lastSlash = TEST_URL.lastIndexOf("/");
const TEST_DB = TEST_URL.slice(lastSlash + 1);
const ADMIN_URL = `${TEST_URL.slice(0, lastSlash)}/postgres`;

export default async function globalSetup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();
}
