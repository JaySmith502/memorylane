import Database from 'better-sqlite3'
import type { Migration } from '../migrator'

export const migration: Migration = {
  name: '0003_fts_sync_triggers',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS activities_ad AFTER DELETE ON activities BEGIN
        INSERT INTO activities_fts(activities_fts, rowid, summary, ocr_text)
          VALUES ('delete', old.rowid, old.summary, old.ocr_text);
      END
    `)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS activities_au AFTER UPDATE ON activities BEGIN
        INSERT INTO activities_fts(activities_fts, rowid, summary, ocr_text)
          VALUES ('delete', old.rowid, old.summary, old.ocr_text);
        INSERT INTO activities_fts(rowid, summary, ocr_text)
          VALUES (new.rowid, new.summary, new.ocr_text);
      END
    `)
  },
}
