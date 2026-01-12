/**
 * AI 评论生成模块 v3
 * 生成真实感的短评论，支持回复关系
 */

import { CLAUDE_API } from './api-config.js'
import { db, generateId } from './db.js'

// 评论者人设库
const COMMENTERS = [
  { nickname: '小仙女本仙', persona: '大学生，爱美' },
  { nickname: '成分党研究员', persona: '护肤成分爱好者' },
  { nickname: '打工人日记', persona: '上班族' },
  { nickname: '宝妈小确幸', persona: '宝妈' },
  { nickname: '学生党省钱', persona: '学生' },
  { nickname: '精致猪猪女', persona: '爱美女生' },
  { nickname: '懒人一枚', persona: '追求简单' },
  { nickname: '吃货本货', persona: '美食爱好者' },
  { nickname: '旅行青蛙', persona: '旅行爱好者' },
  { nickname: '健身小白', persona: '健身新手' },
  { nickname: '数码发烧友', persona: '科技爱好者' },
  { nickname: '考研上岸er', persona: '考研成功' },
  { nickname: '独居女孩', persona: '独居' },
  { nickname: '干皮星人', persona: '干性皮肤' },
  { nickname: '油皮姐妹', persona: '油性皮肤' },
  { nickname: '敏感肌宝宝', persona: '敏感肌' },
  { nickname: '小个子穿搭', persona: '155cm' },
  { nickname: '微胖女孩', persona: '微胖' },
]

interface CommentData {
  nickname: string
  content: string
  isReply?: boolean
  replyTo?: string
}

/**
 * 调用 AI 生成评论
 */
async function callAI(prompt: string): Promise<string | null> {
  try {
    const response = await fetch(`${CLAUDE_API.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLAUDE_API.apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_API.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      console.error('[AI] 请求失败:', response.status)
      return null
    }

    const data = await response.json()
    return data.content?.[0]?.text?.trim() || null
  } catch (error) {
    console.error('[AI] 错误:', error)
    return null
  }
}

/**
 * 生成一组评论（主评论+回复）
 */
async function generateCommentGroup(
  noteTitle: string,
  noteContent: string
): Promise<CommentData[]> {
  const prompt = `你是小红书用户。请为下面这篇笔记写3条短评论。

笔记标题：${noteTitle}
笔记内容：${noteContent.slice(0, 150)}...

要求：
1. 第1条是主评论，第2-3条是对第1条的回复
2. 每条评论15-35字，不能超过40字
3. 口语化，像真人随手打的
4. 可以用1-2个emoji

请严格按以下格式返回（每行一条，用|分隔昵称和内容）：
昵称1|主评论内容
昵称2|回复内容1
昵称3|回复内容2`

  const result = await callAI(prompt)
  if (!result) return []

  const comments: CommentData[] = []
  const lines = result.split('\n').filter(line => line.includes('|'))

  for (let i = 0; i < lines.length && i < 3; i++) {
    const [nickname, content] = lines[i].split('|').map(s => s.trim())
    if (nickname && content && content.length <= 60) {
      comments.push({
        nickname,
        content,
        isReply: i > 0,
        replyTo: i > 0 ? comments[0]?.nickname : undefined
      })
    }
  }

  return comments
}

/**
 * 生成独立评论
 */
async function generateSingleComment(
  noteTitle: string,
  noteContent: string,
  commenter: typeof COMMENTERS[0]
): Promise<string | null> {
  const prompt = `你是"${commenter.nickname}"（${commenter.persona}），请为这篇小红书笔记写一条短评论。

笔记标题：${noteTitle}
笔记内容：${noteContent.slice(0, 100)}...

要求：15-35字，口语化，可用1-2个emoji。只返回评论内容，不要其他任何文字。`

  const result = await callAI(prompt)
  if (!result || result.length > 60) return null

  // 清理可能的引号
  return result.replace(/^["']|["']$/g, '').trim()
}

function getRandomCommenter() {
  return COMMENTERS[Math.floor(Math.random() * COMMENTERS.length)]
}

/**
 * 为笔记生成评论
 */
export async function addAIComments(noteId: string, targetCount: number = 5): Promise<number> {
  const note = db.prepare('SELECT title, content FROM notes WHERE id = ?').get(noteId) as any
  if (!note) return 0

  let added = 0

  // 生成1-2组有回复关系的评论
  const groupCount = Math.min(2, Math.ceil(targetCount / 3))

  for (let i = 0; i < groupCount; i++) {
    console.log(`[AI评论] 生成第${i + 1}组对话...`)
    const comments = await generateCommentGroup(note.title, note.content)

    let mainId: string | null = null

    for (const comment of comments) {
      const id = generateId()
      const avatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${id}`
      const likes = Math.floor(Math.random() * 30)

      let content = comment.content
      let parentId: string | null = null

      if (comment.isReply && mainId && comment.replyTo) {
        content = `回复 @${comment.replyTo}：${comment.content}`
        parentId = mainId
      } else {
        mainId = id
      }

      db.prepare(`
        INSERT INTO comments (id, note_id, user_name, user_avatar, content, is_ai, likes, parent_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, noteId, comment.nickname, avatar, content, likes, parentId)

      added++
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // 补充独立评论
  const remaining = targetCount - added
  for (let i = 0; i < remaining && i < 3; i++) {
    const commenter = getRandomCommenter()
    console.log(`[AI评论] 生成独立评论 (${commenter.nickname})...`)

    const content = await generateSingleComment(note.title, note.content, commenter)

    if (content) {
      const id = generateId()
      const avatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${id}`
      const likes = Math.floor(Math.random() * 20)

      db.prepare(`
        INSERT INTO comments (id, note_id, user_name, user_avatar, content, is_ai, likes, parent_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, NULL)
      `).run(id, noteId, commenter.nickname, avatar, content, likes)

      added++
    }

    await new Promise(resolve => setTimeout(resolve, 800))
  }

  // 更新笔记评论数
  db.prepare('UPDATE notes SET comments_count = (SELECT COUNT(*) FROM comments WHERE note_id = ?) WHERE id = ?')
    .run(noteId, noteId)

  return added
}

/**
 * 清空所有AI评论
 */
export function clearAIComments(): number {
  const result = db.prepare('DELETE FROM comments WHERE is_ai = 1').run()
  db.prepare('UPDATE notes SET comments_count = (SELECT COUNT(*) FROM comments WHERE comments.note_id = notes.id)').run()
  return result.changes
}

/**
 * 批量生成评论
 */
export async function batchAddComments(minComments: number = 4, maxComments: number = 8): Promise<void> {
  const notes = db.prepare(`
    SELECT id, title, comments_count
    FROM notes
    WHERE status = 'published'
  `).all() as { id: string; title: string; comments_count: number }[]

  console.log(`找到 ${notes.length} 篇笔记`)

  for (const note of notes) {
    const targetCount = Math.floor(Math.random() * (maxComments - minComments + 1)) + minComments
    const currentCount = note.comments_count || 0

    if (currentCount >= minComments) {
      console.log(`[跳过] ${note.title.slice(0, 25)}... 已有 ${currentCount} 条`)
      continue
    }

    const needed = targetCount - currentCount
    if (needed > 0) {
      console.log(`[生成] ${note.title.slice(0, 25)}... 目标 ${targetCount} 条`)
      const added = await addAIComments(note.id, needed)
      console.log(`       添加了 ${added} 条评论`)
    }
  }
}
