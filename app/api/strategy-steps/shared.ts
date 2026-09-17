import type Database from 'better-sqlite3';
import type { StrategyStep } from '@/types';

export function getStrategyStep(db: Database.Database, id: number): StrategyStep | undefined {
  return db.prepare('SELECT * FROM strategy_steps WHERE id = ?').get(id) as StrategyStep | undefined;
}
