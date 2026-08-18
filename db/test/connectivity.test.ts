// db/test/connectivity.test.ts
import { describe, it, expect } from "vitest";
import { Client } from "pg";

describe("postgres connectivity", () => {
  it("connects to agileday_test", async () => {
    const client = new Client({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgres://admin:password@localhost:5432/agileday_test",
    });
    await client.connect();
    const result = await client.query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
    await client.end();
  });
});
