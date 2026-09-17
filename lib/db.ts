import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'admin.db');
  db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}
