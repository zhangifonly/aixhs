/**
 * 笔记生成核心模块
 * 集成智能 prompt 构建器，支持板块画像和参考文章
 */
import { createChatStream } from './claude.js';
import { db, generateId } from './db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildSmartPrompt, getRelevantReferences, getExampleTitles, getSeasonalSuggestions } from './prompt-builder.js';
import { matchCategory, matchSubTopic, getCategoryProfile, getSubTopics, getAllCategories, getCurrentSeason } from './topic-matcher.js';
import { CLAUDE_API } from './api-config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 加载博主配置
export function loadCreators() {
    const path = join(__dirname, '../../data/creators.json');
    return JSON.parse(readFileSync(path, 'utf-8'));
}
// 初始化博主到数据库
export function initCreators() {
    const creators = loadCreators();
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO creators (id, name, avatar, bio, persona, category, style)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    for (const c of creators) {
        stmt.run(c.id, c.name, c.avatar, c.bio, c.persona, c.category, c.style);
    }
}
// 获取博主
export function getCreator(id) {
    return db.prepare('SELECT * FROM creators WHERE id = ?').get(id);
}
// 获取所有博主
export function getAllCreators() {
    return db.prepare('SELECT * FROM creators').all();
}
// 导出话题匹配相关函数
export { matchCategory, matchSubTopic, getCategoryProfile, getSubTopics, getAllCategories, getCurrentSeason, getExampleTitles, getSeasonalSuggestions, getRelevantReferences };
// 流式生成笔记（增强版）
export async function* generateNoteStream(creatorId, topic, options) {
    const creator = getCreator(creatorId);
    if (!creator) {
        yield { type: 'error', content: '博主不存在' };
        return;
    }
    // 构建智能提示词
    const systemPrompt = buildSmartPrompt({
        creator,
        topic,
        categoryId: options?.categoryId,
        subTopicId: options?.subTopicId,
        includeReferences: options?.includeReferences ?? true,
        maxReferences: 2
    });
    const messages = [
        { role: 'user', content: `请写一篇关于「${topic}」的小红薯笔记` }
    ];
    const stream = createChatStream(messages, {
        apiKey: CLAUDE_API.apiKey,
        baseURL: CLAUDE_API.baseURL,
        model: CLAUDE_API.model,
        systemPrompt,
        maxTokens: 2048,
    });
    for await (const chunk of stream) {
        yield chunk;
    }
}
// 解析生成的笔记内容
export function parseNoteContent(raw) {
    const titleMatch = raw.match(/【标题】(.+?)(?=【|$)/s);
    const contentMatch = raw.match(/【正文】(.+?)(?=【标签】|$)/s);
    const tagsMatch = raw.match(/【标签】(.+?)$/s);
    const title = titleMatch?.[1]?.trim() || '无标题';
    const content = contentMatch?.[1]?.trim() || raw;
    const tagsStr = tagsMatch?.[1]?.trim() || '';
    const tags = tagsStr.match(/#[^\s#]+/g) || [];
    return { title, content, tags };
}
// 保存笔记到数据库
export function saveNote(creatorId, title, content, category, tags, suggestionId) {
    const id = generateId();
    db.prepare(`
    INSERT INTO notes (id, creator_id, title, content, category, tags, suggestion_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, creatorId, title, content, category, JSON.stringify(tags), suggestionId || null);
    // 更新博主笔记数
    db.prepare('UPDATE creators SET notes_count = notes_count + 1 WHERE id = ?').run(creatorId);
    return id;
}
// 获取话题建议
export function getTopicSuggestions(categoryId) {
    return {
        seasonal: getSeasonalSuggestions(categoryId),
        examples: getExampleTitles(categoryId),
        subTopics: getSubTopics(categoryId)
    };
}
