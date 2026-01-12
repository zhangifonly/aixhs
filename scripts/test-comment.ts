/**
 * 测试评论生成
 */

import { addAIComments } from '../src/lib/ai-comments.js'
import { db } from '../src/lib/db.js'

async function test() {
  const note = db.prepare('SELECT id, title FROM notes LIMIT 1').get() as any
  console.log('测试笔记:', note.title)

  const added = await addAIComments(note.id, 3)
  console.log('添加评论数:', added)

  const comments = db.prepare('SELECT user_name, content FROM comments WHERE note_id = ?').all(note.id) as any[]
  console.log('\n生成的评论:')
  comments.forEach((c, i) => console.log(`${i + 1}. [${c.user_name}] ${c.content}`))
}

test().catch(console.error)
