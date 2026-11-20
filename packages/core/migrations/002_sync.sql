ALTER TABLE categories ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE categories ADD COLUMN base_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN base_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reminders ADD COLUMN base_version INTEGER NOT NULL DEFAULT 0;
UPDATE categories SET dirty=0 WHERE updated_at=0;  -- seeded defaults are identical on every device; never push them
-- Any local UPDATE that does not itself change `dirty` marks the row for sync. The sync engine writes dirty=2 first to apply remote rows silently.
CREATE TRIGGER categories_dirty AFTER UPDATE ON categories WHEN OLD.dirty=NEW.dirty BEGIN UPDATE categories SET dirty=1 WHERE id=NEW.id; END;
CREATE TRIGGER tasks_dirty AFTER UPDATE ON tasks WHEN OLD.dirty=NEW.dirty BEGIN UPDATE tasks SET dirty=1 WHERE id=NEW.id; END;
CREATE TRIGGER reminders_dirty AFTER UPDATE ON reminders WHEN OLD.dirty=NEW.dirty BEGIN UPDATE reminders SET dirty=1 WHERE id=NEW.id; END;
CREATE TABLE sync_conflicts(id INTEGER PRIMARY KEY AUTOINCREMENT,tbl TEXT NOT NULL,record_id TEXT NOT NULL,local_json TEXT NOT NULL,server_version INTEGER NOT NULL,at INTEGER NOT NULL);
