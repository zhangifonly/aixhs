/**
 * 批量生成封面图脚本
 * 为所有没有封面图的笔记生成 AI 封面
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
  console.log('=== 批量生成封面图 ===\n')

  // 检查 ComfyUI 服务
  console.log('检查 ComfyUI 服务状态...')
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    console.error('❌ ComfyUI 服务不可用，请确保 Windows 电脑上的 ComfyUI 已启动')
    process.exit(1)
  }
  console.log('✅ ComfyUI 服务在线\n')

  // 查询没有封面图的笔记
  const notes = db.prepare(`
    SELECT id, title, category, cover_image
    FROM notes
    WHERE cover_image IS NULL AND status = 'published'
  `).all() as Note[]

  console.log(`找到 ${notes.length} 篇需要生成封面的笔记\n`)

  if (notes.length === 0) {
    console.log('所有笔记都已有封面图，无需生成')
    process.exit(0)
  }

  let success = 0
  let failed = 0

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    console.log(`[${i + 1}/${notes.length}] 生成: ${note.title.slice(0, 30)}...`)

    try {
      // 使用 'cover' 类型生成封面图
      const result = await generateImage(note.title, note.category || 'beauty', 'cover')

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
    if (i < notes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log('\n=== 生成完成 ===')
  console.log(`成功: ${success}`)
  console.log(`失败: ${failed}`)
  console.log(`总计: ${notes.length}`)
}

main().catch(console.error)
