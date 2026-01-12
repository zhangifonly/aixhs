/**
 * AI 小红书 - 主入口
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'

import { initDB } from './lib/db.js'
import { initCreators } from './lib/note-writer.js'
import api from './routes/api.js'

const app = new Hono()

// 中间件
app.use('*', cors())

// API 路由
app.route('/api', api)

// 静态文件
app.use('/*', serveStatic({ root: './public' }))

// 初始化
initDB()
initCreators()

const port = parseInt(process.env.PORT || '3000')
console.log(`AI 小红书启动成功: http://localhost:${port}`)

serve({ fetch: app.fetch, port })
