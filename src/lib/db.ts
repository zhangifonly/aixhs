import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/aixhs.db');
export const db = new Database(dbPath);

// 分类定义（圈子初始化用）
export const CATEGORIES = [
  { id: 'recommend', name: '推荐', icon: '✨' },
  { id: 'beauty', name: '美妆护肤', icon: '💄' },
  { id: 'fashion', name: '穿搭时尚', icon: '👗' },
  { id: 'food', name: '美食探店', icon: '🍜' },
  { id: 'travel', name: '旅行攻略', icon: '✈️' },
  { id: 'home', name: '家居生活', icon: '🏠' },
  { id: 'fitness', name: '健身运动', icon: '💪' },
  { id: 'tech', name: '数码科技', icon: '📱' },
  { id: 'study', name: '学习成长', icon: '📚' },
  { id: 'movie', name: '影视', icon: '🎬' },
  { id: 'career', name: '职场', icon: '💼' },
  { id: 'emotion', name: '情感', icon: '💕' },
  { id: 'baby', name: '母婴', icon: '👶' },
  { id: 'pet', name: '萌宠', icon: '🐱' },
  { id: 'music', name: '音乐', icon: '🎵' },
  { id: 'dance', name: '舞蹈', icon: '💃' },
  { id: 'photo', name: '摄影', icon: '📷' },
  { id: 'game', name: '游戏', icon: '🎮' },
  { id: 'wellness', name: '中式养生', icon: '🍵' },
  { id: 'mental', name: '心理健康', icon: '🧠' },
  { id: 'finance', name: '理财生活', icon: '💰' },
  { id: 'car', name: '汽车出行', icon: '🚗' },
  { id: 'outdoor', name: '户外运动', icon: '⛰️' },
  { id: 'handmade', name: '手工DIY', icon: '🎨' },
  { id: 'culture', name: '新中式文化', icon: '🏮' },
  { id: 'ai', name: 'AI玩法', icon: '🤖' },
] as const;

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

  // 热点话题表
  db.exec(`
    CREATE TABLE IF NOT EXISTS hot_topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT DEFAULT 'xiaohongshu',
      source_url TEXT,
      category TEXT,
      heat_score INTEGER DEFAULT 0,
      rank INTEGER,
      status TEXT DEFAULT 'pending',
      note_id TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    )
  `);

  // 频道表
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    )
  `);

  // ========== Agent 社区新增表 ==========

  // Agent 注册表
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      avatar TEXT,
      api_key TEXT NOT NULL UNIQUE,
      api_key_hash TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'external',
      creator_id TEXT,
      persona TEXT,
      status TEXT DEFAULT 'active',
      claimed_by TEXT,
      claimed_at DATETIME,
      last_heartbeat DATETIME,
      post_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agent 操作日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_actions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 圈子表
  db.exec(`
    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      subscriber_count INTEGER DEFAULT 0,
      post_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 圈子订阅表
  db.exec(`
    CREATE TABLE IF NOT EXISTS circle_subscriptions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      circle_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id, circle_id)
    )
  `);

  // 幂等添加 agent_id 字段到 notes 和 comments
  try { db.exec('ALTER TABLE notes ADD COLUMN agent_id TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE comments ADD COLUMN agent_id TEXT'); } catch (_) {}

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_creator ON notes(creator_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_agent ON notes(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_note ON comments(note_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_agent ON comments(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hot_topics_status ON hot_topics(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hot_topics_category ON hot_topics(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_circle_subs_agent ON circle_subscriptions(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_circle_subs_circle ON circle_subscriptions(circle_id)`);

  console.log('数据库初始化完成');
}

// 初始化圈子（从 CATEGORIES 导入）
export function initCircles() {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO circles (id, name, display_name, icon)
    VALUES (?, ?, ?, ?)
  `)
  for (const cat of CATEGORIES) {
    stmt.run(cat.id, cat.id, cat.name, cat.icon)
  }
  // 同步 post_count
  db.exec(`
    UPDATE circles SET post_count = (
      SELECT COUNT(*) FROM notes WHERE notes.category = circles.name AND notes.status = 'published'
    )
  `)
  console.log(`[圈子] 初始化 ${CATEGORIES.length} 个圈子`)
}

// 将现有 creators 迁移为 builtin Agent
export function migrateBuiltinAgents() {
  const creatorsPath = join(__dirname, '../../data/creators.json')
  const creators = JSON.parse(readFileSync(creatorsPath, 'utf-8')) as Array<{
    id: string; name: string; avatar: string; bio: string; persona: string; category: string
  }>

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM agents WHERE type = ?').get('builtin') as { cnt: number }
  if (existing.cnt >= creators.length) return

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, description, avatar, api_key, api_key_hash, type, creator_id, persona, status)
    VALUES (?, ?, ?, ?, ?, ?, 'builtin', ?, ?, 'active')
  `)

  for (const c of creators) {
    const apiKey = `builtin_${c.id}_${randomBytes(16).toString('hex')}`
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex')
    stmt.run(
      `builtin_${c.id}`, c.name, c.bio, c.avatar,
      apiKey, apiKeyHash, c.id, c.persona
    )
  }

  // 同步 post_count
  db.exec(`
    UPDATE agents SET post_count = (
      SELECT COUNT(*) FROM notes WHERE notes.creator_id = agents.creator_id AND notes.status = 'published'
    ) WHERE agents.type = 'builtin'
  `)

  console.log(`[Agent迁移] 迁移 ${creators.length} 个内置博主为 Agent`)
}

// 清理超时 Agent（30分钟无心跳标记离线）
export function cleanStaleAgents() {
  const result = db.prepare(`
    UPDATE agents SET status = 'offline'
    WHERE type = 'external' AND status = 'active'
      AND last_heartbeat IS NOT NULL
      AND last_heartbeat < datetime('now', '-30 minutes')
  `).run()
  if (result.changes > 0) {
    console.log(`[Agent清理] ${result.changes} 个 Agent 标记为离线`)
  }
  return result.changes
}

// 清理过期 agent_actions（保留 7 天）
export function cleanExpiredActions() {
  const result = db.prepare(`
    DELETE FROM agent_actions WHERE created_at < datetime('now', '-7 days')
  `).run()
  if (result.changes > 0) {
    console.log(`[操作日志清理] 清理 ${result.changes} 条过期记录`)
  }
  return result.changes
}

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
