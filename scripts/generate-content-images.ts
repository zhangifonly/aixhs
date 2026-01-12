/**
 * 批量生成文章内容配图
 * 为每篇文章生成3张差异化配图：封面图、细节图、场景图
 */

import { db } from '../src/lib/db.js'
import { generateImage, checkComfyUIHealth, type ImageType } from '../src/lib/comfyui.js'

interface Note {
  id: string
  title: string
  category: string
  cover_image: string | null
  images: string | null
}

// 图片类型配置：封面、细节、场景
const IMAGE_TYPES: ImageType[] = ['cover', 'detail', 'scene']

async function main() {
  console.log('=== 批量生成差异化文章配图 ===\n')
  console.log('图片类型：封面图(cover) + 细节图(detail) + 场景图(scene)\n')

  // 检查 ComfyUI 服务
  console.log('检查 ComfyUI 服务状态...')
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    console.error('❌ ComfyUI 服务不可用')
    process.exit(1)
  }
  console.log('✅ ComfyUI 服务在线\n')

  // 查询所有已发布的笔记
  const notes = db.prepare(`
    SELECT id, title, category, cover_image, images
    FROM notes
    WHERE status = 'published'
  `).all() as Note[]

  console.log(`找到 ${notes.length} 篇文章需要生成配图\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    console.log(`[${i + 1}/${notes.length}] ${note.title.slice(0, 25)}...`)

    const imageUrls: string[] = []
    let coverUrl: string | null = null

    // 为每篇文章生成3张差异化配图
    for (let j = 0; j < IMAGE_TYPES.length; j++) {
      const imageType = IMAGE_TYPES[j]
      const typeLabel = imageType === 'cover' ? '封面' : imageType === 'detail' ? '细节' : '场景'

      try {
        const result = await generateImage(note.title, note.category || 'beauty', imageType)
        if (result.success && result.imageUrl) {
          if (imageType === 'cover') {
            coverUrl = result.imageUrl
          }
          imageUrls.push(result.imageUrl)
          console.log(`    ${typeLabel}图: ${result.imageUrl}`)
        } else {
          console.log(`    ${typeLabel}图: 生成失败 - ${result.error}`)
        }
      } catch (error) {
        console.log(`    ${typeLabel}图: 异常`)
      }
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    if (imageUrls.length > 0) {
      // 更新数据库：封面图单独存储，其他图片存入 images 数组
      db.prepare('UPDATE notes SET cover_image = ?, images = ? WHERE id = ?')
        .run(coverUrl, JSON.stringify(imageUrls.slice(1)), note.id)
      console.log(`    ✅ 保存 ${imageUrls.length} 张配图 (封面+${imageUrls.length - 1}张内容图)`)
      success++
    } else {
      console.log(`    ❌ 无配图`)
      failed++
    }
  }

  console.log('\n=== 生成完成 ===')
  console.log(`成功: ${success}`)
  console.log(`失败: ${failed}`)
}

main().catch(console.error)
