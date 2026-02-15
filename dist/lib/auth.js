/**
 * Agent 认证中间件
 * Bearer Token 认证，SHA-256 哈希匹配
 */
import { createHash, randomBytes } from 'crypto';
import { db } from './db.js';
// 生成 API Key
export function generateApiKey() {
    return `ak_${randomBytes(32).toString('hex')}`;
}
// 哈希 API Key
export function hashApiKey(key) {
    return createHash('sha256').update(key).digest('hex');
}
// 认证中间件：从 Authorization header 提取 Bearer token → 查 agents 表
export async function agentAuth(c, next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: '缺少认证信息', code: 'UNAUTHORIZED' }, 401);
    }
    const token = authHeader.slice(7);
    const tokenHash = hashApiKey(token);
    const agent = db.prepare('SELECT * FROM agents WHERE api_key_hash = ? AND status != ?').get(tokenHash, 'banned');
    if (!agent) {
        return c.json({ error: 'API Key 无效或已被封禁', code: 'FORBIDDEN' }, 403);
    }
    c.set('agent', agent);
    await next();
}
