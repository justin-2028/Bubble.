import 'server-only';

import postgres from 'postgres';
import { getDatabaseUrl } from './env';

let sqlClient: postgres.Sql | null = null;

export async function getPostgresClient() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured for hosted Postgres storage');
  }

  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return sqlClient;
}
