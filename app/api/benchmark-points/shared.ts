import type Database from 'better-sqlite3';
import { SUMMARY_ITEM_KEYS, type BenchmarkPoint, type SummaryItemKey } from '@/types';

export function getBenchmarkPoint(db: Database.Database, id: number): BenchmarkPoint | undefined {
  return db.prepare('SELECT * FROM benchmark_points WHERE id = ?').get(id) as BenchmarkPoint | undefined;
}

export function isSummaryItemKey(value: unknown): value is SummaryItemKey {
  return typeof value === 'string' && (SUMMARY_ITEM_KEYS as string[]).includes(value);
}
