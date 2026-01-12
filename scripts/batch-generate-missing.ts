/**
 * 补充生成缺失的文章
 * tech 缺 1 篇，study 缺 11 篇
 */

import { db, generateId } from '../src/lib/db.js'
import { generateNoteStream, parseNoteContent, saveNote } from '../src/lib/note-writer.js'

// 缺失的文章
const missingArticles: { creatorId: string; topic: string; categoryId: string }[] = [
  // tech 缺 1 篇
  { creatorId: 'shuma', topic: '充电宝推荐｜出门必备的续航神器', categoryId: 'tech' },

  // study 缺 11 篇（第一篇已有）
  { creatorId: 'xuexi', topic: '考公上岸｜行测申论复习技巧', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '英语学习｜从四级到雅思7分', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '时间管理｜高效学习的一天', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '自律养成｜21天习惯养成计划', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '读书笔记｜这本书改变了我的思维', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '副业赚钱｜下班后的第二收入', categoryId: 'study' },
  { creatorId: 'xuexi', topic: 'Excel技巧｜职场必备的10个公式', categoryId: 'study' },
  { creatorId: 'xuexi', topic: 'PPT制作｜让你的汇报更专业', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '面试技巧｜如何拿到心仪offer', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '简历优化｜HR眼中的好简历', categoryId: 'study' },
  { creatorId: 'xuexi', topic: '新年计划｜2025年目标制定', categoryId: 'study' },
]

// 生成单篇文章
async function generateArticle(creatorId: string, topic: string, categoryId: string): Promise<boolean> {
  console.log(`  生成: ${topic}`)

  try {
    let fullContent = ''
    const generator = generateNoteStream(creatorId, topic, { categoryId })

    for await (const chunk of generator) {
      if (chunk.type === 'text') {
        fullContent += chunk.content
      } else if (chunk.type === 'error') {
        console.log(`    ❌ API错误: ${chunk.content}`)
        return false
      }
    }

    if (!fullContent) {
      console.log(`    ❌ 内容为空`)
      return false
    }

    // 解析内容
    const parsed = parseNoteContent(fullContent)

    // 保存到数据库
    const noteId = saveNote(
      creatorId,
      parsed.title || topic,
      parsed.content,
      categoryId,
      parsed.tags
    )

    console.log(`    ✅ 已保存: ${noteId}`)
    return true
  } catch (error) {
    console.log(`    ❌ 失败: ${error}`)
    return false
  }
}

// 主函数
async function main() {
  console.log('=== 补充生成缺失文章 ===\n')
  console.log(`共需生成 ${missingArticles.length} 篇文章\n`)

  const stats = {
    total: 0,
    success: 0,
    failed: 0
  }

  for (const article of missingArticles) {
    stats.total++
    const success = await generateArticle(article.creatorId, article.topic, article.categoryId)
    if (success) {
      stats.success++
    } else {
      stats.failed++
    }

    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n' + '='.repeat(40))
  console.log('生成完成!')
  console.log(`总计: ${stats.total}`)
  console.log(`成功: ${stats.success}`)
  console.log(`失败: ${stats.failed}`)
}

main().catch(console.error)
