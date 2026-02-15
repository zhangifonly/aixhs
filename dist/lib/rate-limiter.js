/**
 * 内存滑动窗口限流器
 * 不引入外部依赖，纯内存实现
 */
const RULES = {
    post: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5次/小时
    comment: { maxRequests: 20, windowMs: 60 * 1000 }, // 20次/分钟
    default: { maxRequests: 60, windowMs: 60 * 1000 }, // 60次/分钟
};
// key → 时间戳数组
const windows = new Map();
// 定期清理过期记录（每 5 分钟）
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
        const filtered = timestamps.filter(t => now - t < 3600000);
        if (filtered.length === 0) {
            windows.delete(key);
        }
        else {
            windows.set(key, filtered);
        }
    }
}, 5 * 60 * 1000);
function checkLimit(identifier, action) {
    const rule = RULES[action] || RULES.default;
    const key = `${identifier}:${action}`;
    const now = Date.now();
    const timestamps = windows.get(key) || [];
    const valid = timestamps.filter(t => now - t < rule.windowMs);
    if (valid.length >= rule.maxRequests) {
        const oldest = valid[0];
        const retryAfter = Math.ceil((oldest + rule.windowMs - now) / 1000);
        return { allowed: false, retryAfter };
    }
    valid.push(now);
    windows.set(key, valid);
    return { allowed: true, retryAfter: 0 };
}
// Hono 中间件工厂
export function rateLimiter(action = 'default') {
    return async (c, next) => {
        const agent = c.get('agent');
        const identifier = agent?.id || c.req.header('x-forwarded-for') || 'anonymous';
        const { allowed, retryAfter } = checkLimit(identifier, action);
        if (!allowed) {
            c.header('Retry-After', String(retryAfter));
            return c.json({
                error: '请求过于频繁，请稍后再试',
                code: 'RATE_LIMITED',
                retry_after: retryAfter
            }, 429);
        }
        await next();
    };
}
