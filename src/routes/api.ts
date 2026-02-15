/**
 * 核心 API 路由
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db, generateId } from '../lib/db.js'
import {
  getAllCreators,
  getCreator,
  generateNoteStream,
  parseNoteContent,
  saveNote,
  getCategoryProfile,
  getSubTopics,
  getTopicSuggestions,
  getRelevantReferences,
  getCurrentSeason,
  type Note,
  type Creator
} from '../lib/note-writer.js'
import {
  generateImage,
  checkComfyUIHealth,
  buildImagePrompt
} from '../lib/comfyui.js'
import { addAIComments, batchAddComments, clearAIComments } from '../lib/ai-comments.js'
import {
  crawlHotTopics,
  getHotTopics,
  getHotTopic,
  getHotTopicStats,
  cleanExpiredTopics
} from '../lib/hot-topic-crawler.js'
import {
  generateNoteForTopic,
  processPendingTopics,
  getAutoGenerateStats
} from '../lib/auto-generator.js'
import {
  getSchedulerStatus,
  triggerTask,
  getAvailableTasks
} from '../lib/scheduler.js'

const api = new Hono()

// 获取分类列表
api.get('/categories', (c) => {
  const categories = [
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
  ]
  return c.json(categories)
})

// 获取博主列表
api.get('/creators', (c) => {
  const creators = db.prepare(`
    SELECT c.*, COALESCE(n.cnt, 0) as notes_count
    FROM creators c
    LEFT JOIN (SELECT creator_id, COUNT(*) as cnt FROM notes GROUP BY creator_id) n
    ON c.id = n.creator_id
  `).all()
  return c.json(creators)
})

// 获取单个博主
api.get('/creators/:id', (c) => {
  const creator = getCreator(c.req.param('id'))
  if (!creator) return c.json({ error: '博主不存在' }, 404)
  return c.json(creator)
})

// 关注/取消关注博主
api.post('/creators/:id/follow', async (c) => {
  const creatorId = c.req.param('id')
  const { userId } = await c.req.json().catch(() => ({ userId: null }))
  const finalUserId = userId || `anon_${Date.now()}`

  const existing = db.prepare(
    'SELECT id FROM follows WHERE user_id = ? AND creator_id = ?'
  ).get(finalUserId, creatorId)

  if (existing) {
    db.prepare('DELETE FROM follows WHERE user_id = ? AND creator_id = ?').run(finalUserId, creatorId)
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM follows WHERE creator_id = ?').get(creatorId) as any).cnt
    return c.json({ followed: false, followers: count })
  } else {
    db.prepare('INSERT INTO follows (id, user_id, creator_id) VALUES (?, ?, ?)').run(generateId(), finalUserId, creatorId)
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM follows WHERE creator_id = ?').get(creatorId) as any).cnt
    return c.json({ followed: true, followers: count })
  }
})

// 获取博主统计数据（粉丝数、获赞与收藏）
api.get('/creators/:id/stats', (c) => {
  const creatorId = c.req.param('id')
  const followers = (db.prepare('SELECT COUNT(*) as cnt FROM follows WHERE creator_id = ?').get(creatorId) as any).cnt
  const stats = db.prepare(`
    SELECT COALESCE(SUM(likes), 0) as total_likes, COALESCE(SUM(collects), 0) as total_collects,
           COUNT(*) as notes_count
    FROM notes WHERE creator_id = ? AND status = 'published'
  `).get(creatorId) as any
  return c.json({
    followers,
    total_likes: stats.total_likes + stats.total_collects,
    notes_count: stats.notes_count
  })
})

// 获取博主被收藏的笔记（收藏标签页）
api.get('/creators/:id/collected-notes', (c) => {
  const creatorId = c.req.param('id')
  const notes = db.prepare(`
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    WHERE n.creator_id = ? AND n.status = 'published' AND n.collects > 0
    ORDER BY n.collects DESC
  `).all(creatorId)
  return c.json(notes)
})

// 获取博主被点赞的笔记（赞过标签页）
api.get('/creators/:id/liked-notes', (c) => {
  const creatorId = c.req.param('id')
  const notes = db.prepare(`
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    WHERE n.creator_id = ? AND n.status = 'published' AND n.likes > 0
    ORDER BY n.likes DESC
  `).all(creatorId)
  return c.json(notes)
})

// 获取博主的笔记列表
api.get('/creators/:id/notes', (c) => {
  const creatorId = c.req.param('id')
  const notes = db.prepare(`
    SELECT * FROM notes
    WHERE creator_id = ? AND status = 'published'
    ORDER BY created_at DESC
  `).all(creatorId)
  return c.json(notes)
})

// 获取信息流
api.get('/feed', (c) => {
  const category = c.req.query('category') || 'recommend'
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  let sql = `
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    WHERE n.status = 'published'
  `
  const params: any[] = []

  if (category !== 'recommend') {
    sql += ` AND n.category = ?`
    params.push(category)
  }

  sql += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const notes = db.prepare(sql).all(...params)
  return c.json(notes)
})

// 获取笔记详情
api.get('/notes/:id', (c) => {
  const note = db.prepare(`
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar, c.bio as creator_bio
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    WHERE n.id = ?
  `).get(c.req.param('id'))

  if (!note) return c.json({ error: '笔记不存在' }, 404)

  // 增加浏览量
  db.prepare('UPDATE notes SET views = views + 1 WHERE id = ?').run(c.req.param('id'))
  return c.json(note)
})

// 点赞笔记（防重复）
api.post('/notes/:id/like', async (c) => {
  const noteId = c.req.param('id')
  const { userId } = await c.req.json().catch(() => ({ userId: null }))
  const finalUserId = userId || `anon_${Date.now()}`

  // 检查是否已点赞
  const existing = db.prepare(
    'SELECT id FROM interactions WHERE user_id = ? AND note_id = ? AND type = ?'
  ).get(finalUserId, noteId, 'like')

  if (existing) {
    // 取消点赞
    db.prepare('DELETE FROM interactions WHERE user_id = ? AND note_id = ? AND type = ?')
      .run(finalUserId, noteId, 'like')
    db.prepare('UPDATE notes SET likes = MAX(0, likes - 1) WHERE id = ?').run(noteId)
    const note = db.prepare('SELECT likes FROM notes WHERE id = ?').get(noteId) as any
    return c.json({ likes: note?.likes || 0, liked: false })
  } else {
    // 添加点赞
    db.prepare('INSERT INTO interactions (id, user_id, note_id, type) VALUES (?, ?, ?, ?)')
      .run(generateId(), finalUserId, noteId, 'like')
    db.prepare('UPDATE notes SET likes = likes + 1 WHERE id = ?').run(noteId)
    const note = db.prepare('SELECT likes FROM notes WHERE id = ?').get(noteId) as any
    return c.json({ likes: note?.likes || 0, liked: true })
  }
})

// 收藏笔记（防重复）
api.post('/notes/:id/collect', async (c) => {
  const noteId = c.req.param('id')
  const { userId } = await c.req.json().catch(() => ({ userId: null }))
  const finalUserId = userId || `anon_${Date.now()}`

  // 检查是否已收藏
  const existing = db.prepare(
    'SELECT id FROM interactions WHERE user_id = ? AND note_id = ? AND type = ?'
  ).get(finalUserId, noteId, 'collect')

  if (existing) {
    // 取消收藏
    db.prepare('DELETE FROM interactions WHERE user_id = ? AND note_id = ? AND type = ?')
      .run(finalUserId, noteId, 'collect')
    db.prepare('UPDATE notes SET collects = MAX(0, collects - 1) WHERE id = ?').run(noteId)
    const note = db.prepare('SELECT collects FROM notes WHERE id = ?').get(noteId) as any
    return c.json({ collects: note?.collects || 0, collected: false })
  } else {
    // 添加收藏
    db.prepare('INSERT INTO interactions (id, user_id, note_id, type) VALUES (?, ?, ?, ?)')
      .run(generateId(), finalUserId, noteId, 'collect')
    db.prepare('UPDATE notes SET collects = collects + 1 WHERE id = ?').run(noteId)
    const note = db.prepare('SELECT collects FROM notes WHERE id = ?').get(noteId) as any
    return c.json({ collects: note?.collects || 0, collected: true })
  }
})

// 获取笔记评论
api.get('/notes/:id/comments', (c) => {
  const noteId = c.req.param('id')
  const comments = db.prepare(`
    SELECT * FROM comments WHERE note_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(noteId)
  return c.json(comments)
})

// 发表评论
api.post('/notes/:id/comments', async (c) => {
  const noteId = c.req.param('id')
  const { content, nickname } = await c.req.json()

  if (!content || content.trim().length === 0) {
    return c.json({ error: '评论内容不能为空' }, 400)
  }

  const id = generateId()
  const displayName = nickname || '匿名用户'
  const avatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${id}`

  db.prepare(`
    INSERT INTO comments (id, note_id, user_name, user_avatar, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, noteId, displayName, avatar, content.trim())

  // 更新笔记评论数
  db.prepare('UPDATE notes SET comments_count = comments_count + 1 WHERE id = ?').run(noteId)

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id)
  return c.json(comment)
})

// 流式生成笔记（增强版，支持板块和细分话题）
api.post('/generate', async (c) => {
  const { creatorId, topic, categoryId, subTopicId } = await c.req.json()
  if (!creatorId || !topic) {
    return c.json({ error: '缺少参数' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const generator = generateNoteStream(creatorId, topic, { categoryId, subTopicId })
    for await (const chunk of generator) {
      await stream.writeSSE({ data: JSON.stringify(chunk) })
    }
  })
})

// 搜索笔记
api.get('/search/notes', (c) => {
  const query = c.req.query('q') || ''
  if (!query) return c.json([])

  const notes = db.prepare(`
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    WHERE n.status = 'published'
      AND (n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)
    ORDER BY n.likes DESC
    LIMIT 50
  `).all(`%${query}%`, `%${query}%`, `%${query}%`)

  return c.json(notes)
})

// ========== 新增：板块画像和细分话题 API ==========

// 获取板块画像详情
api.get('/categories/:id/profile', (c) => {
  const categoryId = c.req.param('id')
  const profile = getCategoryProfile(categoryId)
  if (!profile) return c.json({ error: '板块不存在' }, 404)
  return c.json(profile)
})

// 获取板块的细分话题列表
api.get('/categories/:id/subtopics', (c) => {
  const categoryId = c.req.param('id')
  const subTopics = getSubTopics(categoryId)
  return c.json(subTopics)
})

// 获取板块的话题建议（当季热门+示例标题+细分话题）
api.get('/categories/:id/suggestions', (c) => {
  const categoryId = c.req.param('id')
  const suggestions = getTopicSuggestions(categoryId)
  return c.json(suggestions)
})

// 获取板块的参考文章
api.get('/categories/:id/references', (c) => {
  const categoryId = c.req.param('id')
  const subTopicId = c.req.query('subTopic')
  const limit = parseInt(c.req.query('limit') || '5')
  const references = getRelevantReferences(categoryId, subTopicId, limit)
  return c.json(references)
})

// 获取当前季节
api.get('/season', (c) => {
  return c.json({ season: getCurrentSeason() })
})

// 搜索博主
api.get('/search/creators', (c) => {
  const query = c.req.query('q') || ''
  if (!query) return c.json([])

  const creators = getAllCreators().filter(creator =>
    creator.name.includes(query) ||
    creator.bio?.includes(query) ||
    creator.category?.includes(query)
  )

  return c.json(creators)
})

// 提交建议
api.post('/suggestions', async (c) => {
  const { content, category } = await c.req.json()
  const id = generateId()
  db.prepare(`
    INSERT INTO suggestions (id, content, category, status)
    VALUES (?, ?, ?, 'pending')
  `).run(id, content, category || null)
  return c.json({ id, message: '建议已提交' })
})

// 后台统计数据
api.get('/admin/stats', (c) => {
  const noteCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE status = ?').get('published') as any
  const viewsResult = db.prepare('SELECT SUM(views) as total FROM notes').get() as any
  const suggestionCount = db.prepare('SELECT COUNT(*) as count FROM suggestions WHERE status = ?').get('pending') as any
  const creators = getAllCreators()

  // 计算7天趋势
  const notesRecent = (db.prepare("SELECT COUNT(*) as cnt FROM notes WHERE status='published' AND created_at >= datetime('now', '-7 days')").get() as any)?.cnt || 0
  const notesPrev = (db.prepare("SELECT COUNT(*) as cnt FROM notes WHERE status='published' AND created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')").get() as any)?.cnt || 0
  const viewsRecent = (db.prepare("SELECT SUM(views) as total FROM notes WHERE created_at >= datetime('now', '-7 days')").get() as any)?.total || 0
  const viewsPrev = (db.prepare("SELECT SUM(views) as total FROM notes WHERE created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')").get() as any)?.total || 0

  const calcTrend = (recent: number, prev: number) => prev === 0 ? (recent > 0 ? 100 : 0) : Math.round((recent - prev) / prev * 100)

  return c.json({
    notes: noteCount?.count || 0,
    creators: creators.length,
    views: viewsResult?.total || 0,
    pendingSuggestions: suggestionCount?.count || 0,
    notesTrend: calcTrend(notesRecent, notesPrev),
    viewsTrend: calcTrend(viewsRecent, viewsPrev)
  })
})

// 获取建议列表（带分页）
api.get('/suggestions', (c) => {
  const limit = parseInt(c.req.query('limit') || '50')
  const suggestions = db.prepare(`
    SELECT * FROM suggestions ORDER BY created_at DESC LIMIT ?
  `).all(limit)
  return c.json(suggestions)
})

// 删除建议
api.delete('/admin/suggestions/:id', (c) => {
  const id = c.req.param('id')
  db.prepare('DELETE FROM suggestions WHERE id = ?').run(id)
  return c.json({ success: true })
})

// 发布笔记
api.post('/admin/notes', async (c) => {
  const { creatorId, title, content, tags, category } = await c.req.json()
  const id = generateId()

  db.prepare(`
    INSERT INTO notes (id, creator_id, title, content, category, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')
  `).run(id, creatorId, title, content, category, JSON.stringify(tags || []))

  return c.json({ id, message: '发布成功' })
})

// 获取所有笔记（后台）
api.get('/admin/notes', (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  const notes = db.prepare(`
    SELECT n.*, c.name as creator_name, c.avatar as creator_avatar
    FROM notes n
    JOIN creators c ON n.creator_id = c.id
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset)

  const total = db.prepare('SELECT COUNT(*) as count FROM notes').get() as any

  return c.json({
    notes,
    total: total?.count || 0,
    page,
    limit
  })
})

// 删除笔记
api.delete('/admin/notes/:id', (c) => {
  const id = c.req.param('id')
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  return c.json({ success: true })
})

// 添加示例笔记（管理接口）
api.post('/admin/seed', (c) => {
  const sampleNotes = [
    { creator_id: 'xiaomei', title: '油皮亲妈！这款水乳真的绝了', content: '姐妹们！！！今天必须给你们安利这款水乳组合\n\n用了一个月，T区出油明显减少，毛孔也细腻了很多\n\n成分党来分析一下：\n- 烟酰胺 3%：控油+提亮\n- 水杨酸 0.5%：疏通毛孔\n- 透明质酸：保湿不油腻\n\n使用感受：\n质地很清爽，上脸秒吸收，完全不会搓泥\n\n适合肤质：油皮、混油皮\n不适合：干皮、敏感肌慎入\n\n姐妹们有同款吗？评论区聊聊～', category: 'beauty', tags: '["#护肤","#油皮护肤","#水乳推荐","#成分党"]', likes: 2341 },
    { creator_id: 'chuanda', title: '小个子穿搭｜155cm 也能穿出大长腿', content: '身高155的我，终于找到了显高穿搭公式！\n\n今日穿搭：\n上衣：短款针织开衫（提高腰线是关键）\n下装：高腰阔腿裤（遮肉显瘦）\n鞋子：厚底乐福鞋（隐形增高5cm）\n\n小个子穿搭技巧：\n1. 上短下长，黄金比例\n2. 同色系穿搭，视觉延伸\n3. 高腰是永远的神\n4. 避免横条纹和大印花\n\n这套搭配总价不到300，学生党也能轻松get～', category: 'fashion', tags: '["#小个子穿搭","#显高穿搭","#平价穿搭","#OOTD"]', likes: 1892 },
    { creator_id: 'chihuo', title: '人均50吃到撑！这家川菜太绝了', content: '终于找到一家好吃不贵的川菜馆！！\n\n地址：xx路xx号（地铁x号线x站）\n人均：50元\n\n必点菜品：\n1. 水煮牛肉 - 麻辣鲜香，牛肉超嫩\n2. 酸菜鱼 - 酸爽开胃，鱼片很厚\n3. 干煸四季豆 - 下饭神器\n4. 蒜泥白肉 - 蒜香浓郁\n\n避雷：\n- 回锅肉偏咸，不太推荐\n\n环境一般，但味道真的绝！适合朋友聚餐～', category: 'food', tags: '["#美食探店","#川菜","#平价美食","#聚餐推荐"]', likes: 3256 },
    { creator_id: 'lvxing', title: '三亚5天4晚｜人均2000超详细攻略', content: '刚从三亚回来！趁着记忆还热乎赶紧整理攻略\n\n【行程安排】\nDay1：到达+入住酒店\nDay2：蜈支洲岛一日游\nDay3：亚龙湾热带天堂森林公园\nDay4：南山寺+天涯海角\nDay5：免税店+返程\n\n【费用明细】\n机票：往返800/人\n酒店：4晚共600\n门票：约400\n餐饮：约300\n交通：约100\n\n【省钱tips】\n1. 提前订机票酒店\n2. 景点门票网上买更便宜\n3. 吃海鲜去第一市场加工', category: 'travel', tags: '["#三亚旅游","#旅行攻略","#穷游","#海岛游"]', likes: 5621 },
    { creator_id: 'jujia', title: '出租屋改造｜500块打造ins风小窝', content: '租房党也要有生活品质！\n\n改造清单：\n1. 仙女灯串 - 19.9\n2. 桌布+餐垫 - 35\n3. 绿植摆件 - 50\n4. 收纳盒套装 - 89\n5. 窗帘 - 120\n6. 地毯 - 79\n7. 装饰画 - 60\n8. 香薰蜡烛 - 45\n\n总花费：497.9元\n\n改造前后对比太明显了！\n房东看了都想涨房租（bushi\n\n租房党们有什么改造经验分享吗？', category: 'home', tags: '["#出租屋改造","#租房装修","#ins风","#省钱装修"]', likes: 4532 },
    { creator_id: 'jianshen', title: '帕梅拉一周暴汗计划｜亲测掉秤5斤', content: '坚持帕梅拉一周的真实记录！\n\n【每日安排】\n周一：20min全身燃脂\n周二：15min腹部训练\n周三：20min手臂塑形\n周四：休息\n周五：25min臀腿训练\n周六：20min全身拉伸\n周日：30min有氧舞蹈\n\n【饮食搭配】\n早餐：鸡蛋+全麦面包+牛奶\n午餐：糙米饭+鸡胸肉+蔬菜\n晚餐：沙拉/代餐\n\n一周体重变化：\n56kg → 53.5kg\n\n注意：刚开始会很累，但坚持下来真的有效！', category: 'fitness', tags: '["#帕梅拉","#健身打卡","#减肥","#暴汗运动"]', likes: 8923 },
    { creator_id: 'shuma', title: 'iPhone 16 Pro 一个月真实体验', content: '作为一个安卓转iOS的用户，说说真实感受\n\n【优点】\n1. A18芯片确实流畅\n2. 拍照直出效果好\n3. 生态体验无敌\n4. 钛金属边框手感好\n\n【缺点】\n1. 信号还是老问题\n2. 充电速度感人\n3. 没有长焦有点遗憾\n4. 价格确实贵\n\n【购买建议】\n如果你是：\n- 苹果生态用户 → 建议升级\n- 安卓用户 → 看个人需求\n- 上一代用户 → 没必要换\n\n总结：值得买，但不是必须买', category: 'tech', tags: '["#iPhone16Pro","#数码测评","#苹果","#手机推荐"]', likes: 6754 },
    { creator_id: 'xuexi', title: '考研上岸｜我的备考时间表分享', content: '一战上岸985！分享我的备考经验\n\n【每日时间安排】\n6:30 起床洗漱\n7:00-8:00 背单词\n8:00-12:00 数学\n12:00-14:00 午饭+午休\n14:00-18:00 专业课\n18:00-19:00 晚饭+休息\n19:00-21:00 政治\n21:00-22:30 英语阅读\n22:30-23:00 复盘总结\n\n【备考资料】\n数学：张宇18讲+1000题\n英语：红宝书+黄皮书\n政治：肖秀荣全套\n\n【心态调整】\n1. 每周休息半天\n2. 适当运动\n3. 不要和别人比进度\n\n加油！你也可以的！', category: 'study', tags: '["#考研","#考研经验","#学习方法","#时间管理"]', likes: 12453 },
    { creator_id: 'xiaomei', title: '早C晚A入门指南｜新手必看', content: '姐妹们！早C晚A真的太重要了\n\n【什么是早C晚A】\n早C = 早上用维C（抗氧化、提亮）\n晚A = 晚上用维A（抗老、去皱）\n\n【新手产品推荐】\n早C：\n- 修丽可CE精华（贵但好用）\n- 科颜氏维C精华（性价比）\n\n晚A：\n- 露得清A醇（入门）\n- 达尔肤A醇（进阶）\n\n【注意事项】\n1. 先建立耐受再提高浓度\n2. 白天必须防晒！\n3. 敏感肌慎用\n4. 孕妇禁用A醇\n\n有问题评论区问我～', category: 'beauty', tags: '["#早C晚A","#护肤科普","#抗老","#维C"]', likes: 7832 },
    { creator_id: 'chihuo', title: '宅家必备！空气炸锅神仙食谱', content: '空气炸锅真的是懒人福音！\n\n【炸鸡翅】\n温度：200°C\n时间：20分钟\n调料：盐、黑胡椒、蒜粉\n\n【烤红薯】\n温度：200°C\n时间：40分钟\n不用加任何东西！\n\n【炸薯条】\n温度：180°C\n时间：15分钟\n喷点油更酥脆\n\n【烤蛋挞】\n温度：180°C\n时间：12分钟\n买现成蛋挞皮就行\n\n你们还有什么好做的食谱？\n评论区分享一下！', category: 'food', tags: '["#空气炸锅","#懒人食谱","#宅家美食","#厨房小白"]', likes: 9876 },
  ]

  const stmt = db.prepare(`
    INSERT INTO notes (id, creator_id, title, content, category, tags, likes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
  `)

  for (const note of sampleNotes) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    stmt.run(id, note.creator_id, note.title, note.content, note.category, note.tags, note.likes || 0)
  }

  return c.json({ message: '示例笔记添加成功', count: sampleNotes.length })
})

// ========== 批量修复缺失封面图 ==========

// 按分类随机分配已有封面图给无封面笔记
api.post('/admin/fix-missing-covers', (c) => {
  // 1. 查询所有无封面的已发布笔记（按分类分组）
  const notesWithoutCover = db.prepare(`
    SELECT id, category, images FROM notes
    WHERE status = 'published' AND (cover_image IS NULL OR cover_image = '')
  `).all() as { id: string; category: string; images: string | null }[]

  if (notesWithoutCover.length === 0) {
    return c.json({ message: '所有笔记都已有封面图', fixed: 0 })
  }

  // 2. 按分类分组
  const byCategory: Record<string, typeof notesWithoutCover> = {}
  for (const note of notesWithoutCover) {
    const cat = note.category || 'unknown'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(note)
  }

  // 3. 查询每个分类已有的 cover_image 列表
  const coverPool: Record<string, string[]> = {}
  for (const cat of Object.keys(byCategory)) {
    const covers = db.prepare(`
      SELECT DISTINCT cover_image FROM notes
      WHERE status = 'published' AND category = ? AND cover_image IS NOT NULL AND cover_image != ''
    `).all(cat) as { cover_image: string }[]
    coverPool[cat] = covers.map(r => r.cover_image)
  }

  // 4. 全局封面池（兜底用）
  const globalCovers = db.prepare(`
    SELECT DISTINCT cover_image FROM notes
    WHERE status = 'published' AND cover_image IS NOT NULL AND cover_image != ''
    LIMIT 200
  `).all() as { cover_image: string }[]
  const globalPool = globalCovers.map(r => r.cover_image)

  // 5. 批量更新
  const updateStmt = db.prepare('UPDATE notes SET cover_image = ? WHERE id = ?')
  let fixed = 0
  let fromImages = 0
  const categoryStats: Record<string, number> = {}

  const updateMany = db.transaction(() => {
    for (const note of notesWithoutCover) {
      const cat = note.category || 'unknown'
      let pool = coverPool[cat] || []

      // 优先从同分类池中随机选
      let chosen: string | null = null
      if (pool.length > 0) {
        chosen = pool[Math.floor(Math.random() * pool.length)]
      } else if (globalPool.length > 0) {
        // 兜底：从全局池中选
        chosen = globalPool[Math.floor(Math.random() * globalPool.length)]
      } else if (note.images) {
        // 最后兜底：从 images 字段取第一张
        try {
          const imgs = JSON.parse(note.images)
          if (Array.isArray(imgs) && imgs.length > 0) {
            chosen = imgs[0]
            fromImages++
          }
        } catch {}
      }

      if (chosen) {
        updateStmt.run(chosen, note.id)
        fixed++
        categoryStats[cat] = (categoryStats[cat] || 0) + 1
      }
    }
  })

  updateMany()

  return c.json({
    message: `修复完成`,
    total_missing: notesWithoutCover.length,
    fixed,
    from_images: fromImages,
    category_stats: categoryStats
  })
})

// ========== ComfyUI 图片生成 API ==========

// 检查 ComfyUI 服务状态
api.get('/comfyui/health', async (c) => {
  const isHealthy = await checkComfyUIHealth()
  return c.json({
    status: isHealthy ? 'online' : 'offline',
    host: '192.168.193.188:8188'
  })
})

// 生成图片
api.post('/comfyui/generate', async (c) => {
  const { title, category, imageType } = await c.req.json()

  if (!title) {
    return c.json({ error: '缺少标题参数' }, 400)
  }

  const result = await generateImage(title, category || 'beauty', imageType || 'cover')

  if (result.success) {
    return c.json({
      success: true,
      imageUrl: result.imageUrl
    })
  } else {
    return c.json({
      success: false,
      error: result.error
    }, 500)
  }
})

// 预览图片提示词
api.post('/comfyui/preview-prompt', async (c) => {
  const { title, category } = await c.req.json()
  const prompt = buildImagePrompt(title || '测试', category || 'beauty')
  return c.json({ prompt })
})

// 批量为没有封面图的笔记生成图片
api.post('/comfyui/batch-generate', async (c) => {
  const { limit = 10 } = await c.req.json().catch(() => ({}))

  // 检查 ComfyUI 是否可用
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    return c.json({ error: 'ComfyUI 服务不可用' }, 503)
  }

  // 获取没有封面图的笔记
  const notes = db.prepare(`
    SELECT id, title, category FROM notes
    WHERE cover_image IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as { id: string; title: string; category: string }[]

  if (notes.length === 0) {
    return c.json({ message: '所有笔记都已有封面图', processed: 0 })
  }

  // 异步批量生成（不阻塞响应）
  const processNotes = async () => {
    let success = 0
    let failed = 0

    for (const note of notes) {
      try {
        console.log(`[批量补图] 处理: ${note.title}`)
        const result = await generateImage(note.title, note.category || 'beauty', 'cover')

        if (result.success && result.imageUrl) {
          db.prepare('UPDATE notes SET cover_image = ? WHERE id = ?').run(result.imageUrl, note.id)
          console.log(`[批量补图] 成功: ${note.id} -> ${result.imageUrl}`)
          success++
        } else {
          console.log(`[批量补图] 失败: ${note.id} - ${result.error}`)
          failed++
        }
      } catch (err: any) {
        console.error(`[批量补图] 错误: ${note.id} - ${err.message}`)
        failed++
      }

      // 间隔 1 秒避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log(`[批量补图] 完成: 成功 ${success}, 失败 ${failed}`)
  }

  // 启动异步处理
  processNotes().catch(err => console.error('[批量补图] 任务失败:', err))

  return c.json({
    message: `开始处理 ${notes.length} 篇笔记的封面图`,
    noteIds: notes.map(n => n.id)
  })
})

// 获取封面图统计
api.get('/comfyui/stats', (c) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN cover_image IS NOT NULL THEN 1 ELSE 0 END) as with_image,
      SUM(CASE WHEN cover_image IS NULL THEN 1 ELSE 0 END) as without_image
    FROM notes
  `).get() as any

  return c.json(stats)
})

// 批量为笔记生成多张配图（每篇3张）
api.post('/comfyui/batch-generate-images', async (c) => {
  const { limit = 10, imagesPerNote = 3 } = await c.req.json().catch(() => ({}))

  // 检查 ComfyUI 是否可用
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    return c.json({ error: 'ComfyUI 服务不可用' }, 503)
  }

  // 获取配图不足的笔记
  const notes = db.prepare(`
    SELECT id, title, category, images FROM notes
    WHERE images IS NULL OR images = '[]' OR images = ''
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as { id: string; title: string; category: string; images: string | null }[]

  if (notes.length === 0) {
    return c.json({ message: '所有笔记都已有配图', processed: 0 })
  }

  // 异步批量生成
  const processNotes = async () => {
    let success = 0
    let failed = 0

    for (const note of notes) {
      try {
        console.log(`[批量配图] 处理: ${note.title}`)
        const imageUrls: string[] = []

        // 生成多张不同类型的图片
        const imageTypes: Array<'cover' | 'detail' | 'scene'> = ['cover', 'detail', 'scene']

        for (let i = 0; i < imagesPerNote; i++) {
          const imageType = imageTypes[i % imageTypes.length]
          const result = await generateImage(note.title, note.category || 'beauty', imageType)

          if (result.success && result.imageUrl) {
            imageUrls.push(result.imageUrl)
            console.log(`[批量配图] 图${i + 1}: ${result.imageUrl}`)
          }

          // 间隔避免请求过快
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        if (imageUrls.length > 0) {
          db.prepare('UPDATE notes SET images = ? WHERE id = ?').run(JSON.stringify(imageUrls), note.id)
          console.log(`[批量配图] 成功: ${note.id} -> ${imageUrls.length}张`)
          success++
        } else {
          console.log(`[批量配图] 失败: ${note.id}`)
          failed++
        }
      } catch (err: any) {
        console.error(`[批量配图] 错误: ${note.id} - ${err.message}`)
        failed++
      }

      // 每篇笔记间隔
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log(`[批量配图] 完成: 成功 ${success}, 失败 ${failed}`)
  }

  processNotes().catch(err => console.error('[批量配图] 任务失败:', err))

  return c.json({
    message: `开始为 ${notes.length} 篇笔记生成配图（每篇${imagesPerNote}张）`,
    noteIds: notes.map(n => n.id)
  })
})

// 获取配图统计
api.get('/comfyui/images-stats', (c) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN images IS NOT NULL AND images != '[]' AND images != '' THEN 1 ELSE 0 END) as with_images,
      SUM(CASE WHEN images IS NULL OR images = '[]' OR images = '' THEN 1 ELSE 0 END) as without_images
    FROM notes
  `).get() as any

  return c.json(stats)
})

// 批量补充评论（每篇达到10条以上）
api.post('/comments/batch-fill', async (c) => {
  const { limit = 20, targetComments = 10 } = await c.req.json().catch(() => ({}))

  // 获取评论不足的笔记
  const notes = db.prepare(`
    SELECT n.id, n.title, n.content, n.category,
           (SELECT COUNT(*) FROM comments WHERE note_id = n.id) as comment_count
    FROM notes n
    WHERE (SELECT COUNT(*) FROM comments WHERE note_id = n.id) < ?
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(targetComments, limit) as { id: string; title: string; content: string; category: string; comment_count: number }[]

  if (notes.length === 0) {
    return c.json({ message: '所有笔记评论数都已达标', processed: 0 })
  }

  // 异步批量生成评论
  const processNotes = async () => {
    let success = 0
    let failed = 0

    for (const note of notes) {
      try {
        const needed = targetComments - note.comment_count
        console.log(`[批量评论] 处理: ${note.title} (需要${needed}条)`)

        const added = await addAIComments(note.id, targetComments)
        console.log(`[批量评论] 成功: ${note.id} 新增${added}条`)
        success++
      } catch (err: any) {
        console.error(`[批量评论] 错误: ${note.id} - ${err.message}`)
        failed++
      }

      // 间隔避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    console.log(`[批量评论] 完成: 成功 ${success}, 失败 ${failed}`)
  }

  processNotes().catch(err => console.error('[批量评论] 任务失败:', err))

  return c.json({
    message: `开始为 ${notes.length} 篇笔记补充评论（目标${targetComments}条）`,
    noteIds: notes.map(n => n.id)
  })
})

// 获取评论统计
api.get('/comments/stats', (c) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_notes,
      (SELECT COUNT(*) FROM comments) as total_comments,
      (SELECT AVG(cnt) FROM (SELECT COUNT(*) as cnt FROM comments GROUP BY note_id)) as avg_comments_per_note,
      (SELECT COUNT(*) FROM (SELECT note_id FROM comments GROUP BY note_id HAVING COUNT(*) >= 10)) as notes_with_10plus_comments
    FROM notes
  `).get() as any

  return c.json(stats)
})

// 发布笔记（带图片生成）
api.post('/admin/notes/with-image', async (c) => {
  const { creatorId, title, content, tags, category, generateCover } = await c.req.json()

  let coverImage = null

  // 如果需要生成封面图
  if (generateCover) {
    const imageResult = await generateImage(title, category || 'beauty', 'cover')
    if (imageResult.success) {
      coverImage = imageResult.imageUrl
    }
  }

  const id = generateId()

  db.prepare(`
    INSERT INTO notes (id, creator_id, title, content, category, tags, cover_image, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
  `).run(id, creatorId, title, content, category, JSON.stringify(tags || []), coverImage)

  return c.json({
    id,
    coverImage,
    message: '发布成功'
  })
})

// ========== AI 评论 API ==========

// 为单篇笔记生成 AI 评论
api.post('/admin/notes/:id/ai-comments', async (c) => {
  const noteId = c.req.param('id')
  const { count } = await c.req.json().catch(() => ({ count: 5 }))

  const added = await addAIComments(noteId, count || 5)
  return c.json({ success: true, added })
})

// 批量为所有笔记生成评论
api.post('/admin/batch-comments', async (c) => {
  const { minComments, maxComments } = await c.req.json().catch(() => ({ minComments: 3, maxComments: 8 }))

  // 异步执行，立即返回
  batchAddComments(minComments || 3, maxComments || 8).catch(console.error)

  return c.json({ success: true, message: '批量评论生成已启动' })
})

// 清空所有AI评论
api.delete('/admin/comments/ai', (c) => {
  const deleted = clearAIComments()
  return c.json({ success: true, deleted })
})

// ========== 热点话题 API ==========

// 获取热点话题列表
api.get('/hot-topics', (c) => {
  const category = c.req.query('category')
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') || '50')
  const topics = getHotTopics({ category, status, limit })
  return c.json(topics)
})

// 获取单个热点话题
api.get('/hot-topics/:id', (c) => {
  const topic = getHotTopic(c.req.param('id'))
  if (!topic) return c.json({ error: '话题不存在' }, 404)
  return c.json(topic)
})

// 获取热点统计
api.get('/hot-topics/stats', (c) => {
  const stats = getHotTopicStats()
  return c.json(stats)
})

// 手动触发热点抓取
api.post('/hot-topics/crawl', async (c) => {
  const count = await crawlHotTopics()
  return c.json({ success: true, count, message: `抓取了 ${count} 个新热点` })
})

// 手动触发单个话题生成
api.post('/hot-topics/:id/generate', async (c) => {
  const topic = getHotTopic(c.req.param('id'))
  if (!topic) return c.json({ error: '话题不存在' }, 404)

  const noteId = await generateNoteForTopic(topic)
  if (noteId) {
    return c.json({ success: true, noteId, message: '笔记生成成功' })
  } else {
    return c.json({ success: false, error: '生成失败' }, 500)
  }
})

// 批量处理待生成话题
api.post('/hot-topics/process', async (c) => {
  const { limit } = await c.req.json().catch(() => ({ limit: 5 }))
  const result = await processPendingTopics(limit || 5)
  return c.json(result)
})

// 清理过期话题
api.delete('/hot-topics/expired', (c) => {
  const count = cleanExpiredTopics()
  return c.json({ success: true, count, message: `清理了 ${count} 个过期话题` })
})

// ========== 调度器 API ==========

// 获取调度器状态
api.get('/scheduler/status', (c) => {
  const status = getSchedulerStatus()
  return c.json(status)
})

// 获取可用任务列表
api.get('/scheduler/tasks', (c) => {
  const tasks = getAvailableTasks()
  return c.json(tasks)
})

// 手动触发任务
api.post('/scheduler/trigger/:task', async (c) => {
  const taskName = c.req.param('task')
  const success = await triggerTask(taskName)
  if (success) {
    return c.json({ success: true, message: `任务 ${taskName} 已触发` })
  } else {
    return c.json({ success: false, error: `任务 ${taskName} 不存在` }, 404)
  }
})

// 获取自动生成统计
api.get('/auto-generate/stats', (c) => {
  const stats = getAutoGenerateStats()
  return c.json(stats)
})

export default api
