/**
 * 重新生成所有文章的封面图
 * 使用优化后的差异化提示词
 */

import { db } from '../src/lib/db.js'
import { generateImage, checkComfyUIHealth } from '../src/lib/comfyui.js'

interface Note {
  id: string
  title: string
  category: string
  cover_image: string | null
}

async function main() {
  console.log('=== 重新生成封面图 ===\n')

  // 检查 ComfyUI 服务
  console.log('检查 ComfyUI 服务状态...')
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    console.error('❌ ComfyUI 服务不可用，请检查连接')
    process.exit(1)
  }
  console.log('✅ ComfyUI 服务在线\n')

  // 获取所有已发布的笔记
  const notes = db.prepare(`
    SELECT id, title, category, cover_image
    FROM notes
    WHERE status = 'published'
    ORDER BY category, created_at
  `).all() as Note[]

  console.log(`找到 ${notes.length} 篇笔记需要重新生成封面\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    console.log(`[${i + 1}/${notes.length}] ${note.category} | ${note.title.slice(0, 30)}...`)

    try {
      const result = await generateImage(note.title, note.category, 'cover')

      if (result.success && result.imageUrl) {
        // 更新数据库
        db.prepare('UPDATE notes SET cover_image = ? WHERE id = ?')
          .run(result.imageUrl, note.id)
        console.log(`    ✅ 成功: ${result.imageUrl}`)
        success++
      } else {
        console.log(`    ❌ 失败: ${result.error}`)
        failed++
      }
    } catch (error) {
      console.log(`    ❌ 异常: ${error}`)
      failed++
    }

    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log('\n=== 生成完成 ===')
  console.log(`成功: ${success}`)
  console.log(`失败: ${failed}`)
  console.log(`总计: ${notes.length}`)
}

main().catch(console.error)
