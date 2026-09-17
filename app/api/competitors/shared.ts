import type Database from 'better-sqlite3';
import type { Competitor } from '@/types';

export type CompetitorRow = Omit<Competitor, 'mentioned_by_exec'> & { mentioned_by_exec: number };

export function toCompetitor(row: CompetitorRow): Competitor {
  return { ...row, mentioned_by_exec: row.mentioned_by_exec === 1 };
}

export function getCompetitor(db: Database.Database, id: number): Competitor | undefined {
  const row = db.prepare('SELECT * FROM competitors WHERE id = ?').get(id) as CompetitorRow | undefined;
  return row ? toCompetitor(row) : undefined;
}
