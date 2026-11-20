CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,color TEXT,is_custom INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,deleted_at INTEGER,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(title)>0),description TEXT,notes TEXT,
 category_id TEXT REFERENCES categories(id),priority INTEGER NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 3),
 priority_source TEXT NOT NULL DEFAULT 'manual' CHECK(priority_source IN('manual','suggested')),
 date TEXT,start_time TEXT,end_time TEXT,due_date TEXT,recurrence_json TEXT,recurrence_paused INTEGER NOT NULL DEFAULT 0,
 parent_id TEXT REFERENCES tasks(id),completed_at INTEGER,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER,version INTEGER NOT NULL DEFAULT 1,device_id TEXT);
CREATE INDEX idx_tasks_date ON tasks(date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at);
CREATE TABLE completions(task_id TEXT NOT NULL REFERENCES tasks(id),occurrence_date TEXT NOT NULL,completed_at INTEGER NOT NULL,
 PRIMARY KEY(task_id,occurrence_date));
CREATE TABLE reminders(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),offset_minutes INTEGER,fire_at_utc INTEGER,
 tz TEXT,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','fired','snoozed','dismissed')),
 snoozed_until INTEGER,updated_at INTEGER NOT NULL,deleted_at INTEGER,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX idx_rem_fire ON reminders(fire_at_utc) WHERE state IN('pending','snoozed');
CREATE TABLE attachments(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),path TEXT NOT NULL,
 updated_at INTEGER NOT NULL,deleted_at INTEGER,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE task_history(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,detail TEXT);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
INSERT INTO categories(id,name,color,updated_at) VALUES
('personal','Personal','#39ff14',0),('work','Work / Office','#2ecc71',0),('shopping','Shopping','#7dff6b',0),
('health','Health & Fitness','#00c853',0),('study','Study / Learning','#9aff9a',0),('finance','Finance / Bills','#1b5e20',0);
