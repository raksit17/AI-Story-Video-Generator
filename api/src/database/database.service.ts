import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";
import { config } from "../config";
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: config().databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  query<T extends QueryResultRow = any>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }
  async withAiQueueLock(action: () => Promise<void>) {
    const client = await this.pool.connect();
    let locked = false;
    let broken: Error | undefined;
    try {
      const result = await client.query(
        "SELECT pg_try_advisory_lock(78124003) AS locked",
      );
      locked = result.rows[0].locked;
      if (locked) await action();
    } finally {
      if (locked) {
        try {
          await client.query("SELECT pg_advisory_unlock(78124003)");
        } catch (error) {
          broken = error as Error;
        }
      }
      client.release(broken);
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
