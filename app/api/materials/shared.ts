import type Database from 'better-sqlite3';
import type { CollectedMaterial } from '@/types';

export function getMaterial(db: Database.Database, id: number): CollectedMaterial | undefined {
  return db.prepare('SELECT * FROM collected_materials WHERE id = ?').get(id) as CollectedMaterial | undefined;
}
