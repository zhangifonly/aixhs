import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/aixhs.db');
export const db = new Database(dbPath);

// 初始化数据库表
export function initDB() {
  // AI 博主表
  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      persona TEXT NOT NULL,
      category TEXT NOT NULL,
      style TEXT,
      followers INTEGER DEFAULT 0,
      notes_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 笔记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      cover_image TEXT,
      images TEXT,
      category TEXT NOT NULL,
      tags TEXT,
      likes INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      suggestion_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES creators(id)
    )
  `);

  // 用户建议表
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      category TEXT,
      status TEXT DEFAULT 'pending',
      note_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 评论表
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      user_avatar TEXT,
      content TEXT NOT NULL,
      is_ai INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      parent_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (note_id) REFERENCES notes(id)
    )
  `);

  // 用户互动表
  db.exec(`
    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, note_id, type)
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_creator ON notes(creator_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_note ON comments(note_id)`);

  console.log('数据库初始化完成');
}

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
