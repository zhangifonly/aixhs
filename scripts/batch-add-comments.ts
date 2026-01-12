/**
 * 批量生成高质量 AI 评论脚本
 * 每篇文章生成 4-8 条评论，包含回复关系
 */

import { batchAddComments } from '../src/lib/ai-comments.js'

async function main() {
  console.log('=== 批量生成高质量 AI 评论 ===\n')
  console.log('新版评论特点：')
  console.log('  - 评论之间有回复关系')
  console.log('  - 针对文章具体内容生成')
  console.log('  - 每个评论者有独特人设')
  console.log('')

  await batchAddComments(4, 8)

  console.log('\n=== 完成 ===')
}

main().catch(console.error)
