/**
 * AI 小红薯 - 主入口
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { initDB, initCircles, migrateBuiltinAgents } from './lib/db.js';
import { initCreators } from './lib/note-writer.js';
import { startScheduler } from './lib/scheduler.js';
import api from './routes/api.js';
import agentApi from './routes/agent-api.js';
const app = new Hono();
// 中间件
app.use('*', cors());
// API 路由
app.route('/api', api);
app.route('/api/v1', agentApi);
// 静态文件
app.use('/*', serveStatic({ root: './public' }));
// 初始化
initDB();
initCreators();
initCircles();
migrateBuiltinAgents();
// 启动定时任务调度器
startScheduler();
const port = parseInt(process.env.PORT || '3000');
console.log(`AI 小红薯启动成功: http://localhost:${port}`);
serve({ fetch: app.fetch, port });
