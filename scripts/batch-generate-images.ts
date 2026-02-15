/**
 * 批量为文章生成配图脚本
 * 为缺少配图的文章生成2张配图
 */

import { db } from '../src/lib/db.js'
import { generateImage } from '../src/lib/comfyui.js'

interface Note {
  id: string
  title: string
  content: string
  category: string
  cover_image: string
  images: string | null
}

async function main() {
  console.log('=== 批量生成文章配图 ===\n')

  // 查找缺少配图的文章
  const notes = db.prepare(`
    SELECT id, title, content, category, cover_image, images
    FROM notes
    WHERE status = 'published'
    AND (images IS NULL OR images = '' OR images = '[]')
  `).all() as Note[]

  console.log(`找到 ${notes.length} 篇缺少配图的文章\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    console.log(`[${i + 1}/${notes.length}] ${note.title.slice(0, 30)}...`)

    try {
      // 生成2张配图
      const images: string[] = []

      // 生成2张不同类型的配图：detail(细节图) 和 scene(场景图)
      const imageTypes: Array<'detail' | 'scene'> = ['detail', 'scene']

      for (let j = 0; j < 2; j++) {
        const imageType = imageTypes[j]
        console.log(`  生成配图 ${j + 1}/2 (${imageType})...`)

        // 生成图片（传入标题、分类和图片类型）
        const result = await generateImage(note.title, note.category, imageType)

        if (result.success && result.imageUrl) {
          images.push(result.imageUrl)
          console.log(`  ✓ 配图 ${j + 1} 完成: ${result.imageUrl}`)
        } else {
          console.log(`  ✗ 配图 ${j + 1} 失败: ${result.error || '未知错误'}`)
        }

        // 间隔避免过载
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      if (images.length > 0) {
        // 更新数据库
        db.prepare('UPDATE notes SET images = ? WHERE id = ?')
          .run(JSON.stringify(images), note.id)
        success++
        console.log(`  ✓ 已保存 ${images.length} 张配图\n`)
      } else {
        failed++
        console.log(`  ✗ 未生成任何配图\n`)
      }

    } catch (error) {
      failed++
      console.error(`  ✗ 错误:`, error)
    }
  }

  console.log('\n=== 完成 ===')
  console.log(`成功: ${success} 篇`)
  console.log(`失败: ${failed} 篇`)
}

main().catch(console.error)
