/**
 * 为所有文章重新生成配图
 * 每篇文章生成3张与内容匹配的图片
 */
import Database from 'better-sqlite3';
import { generateImage, checkComfyUIHealth, type ImageType } from '../src/lib/comfyui.js';

const db = new Database('./data/aixhs.db');

async function main() {
  // 检查 ComfyUI
  const isHealthy = await checkComfyUIHealth();
  if (!isHealthy) {
    console.error('ComfyUI 不可用，退出');
    process.exit(1);
  }
  console.log('ComfyUI 连接成功\n');

  // 获取所有笔记
  const notes = db.prepare(`
    SELECT id, category, title, cover_image, images
    FROM notes
    ORDER BY created_at DESC
  `).all() as any[];

  console.log(`共 ${notes.length} 篇文章需要处理\n`);

  const updateStmt = db.prepare("UPDATE notes SET images = ?, cover_image = COALESCE(NULLIF(cover_image, ''), ?) WHERE id = ?");

  let processed = 0;
  let failed = 0;

  for (const note of notes) {
    const current = processed + failed + 1;
    console.log(`\n[${current}/${notes.length}] ${note.category} - ${note.title}`);

    const images: string[] = [];
    const imageTypes: ImageType[] = ['cover', 'detail', 'scene'];

    for (const imageType of imageTypes) {
      try {
        const result = await generateImage(note.title, note.category, imageType);
        if (result.success && result.imageUrl) {
          images.push(result.imageUrl);
          console.log(`  [OK] ${imageType}: ${result.imageUrl}`);
        } else {
          console.log(`  [FAIL] ${imageType}: ${result.error}`);
        }
      } catch (err: any) {
        console.log(`  [FAIL] ${imageType}: ${err.message}`);
      }

      // 每张图片间隔1秒，避免请求过快
      await new Promise(r => setTimeout(r, 1000));
    }

    if (images.length > 0) {
      // 第一张作为封面图（如果原来没有的话）
      const coverImage = images[0];
      updateStmt.run(JSON.stringify(images), coverImage, note.id);
      processed++;
      console.log(`  保存成功: ${images.length} 张图片`);
    } else {
      failed++;
      console.log(`  保存失败: 没有生成任何图片`);
    }

    // 每篇文章间隔2秒
    await new Promise(r => setTimeout(r, 2000));

    // 每处理10篇输出进度
    if (current % 10 === 0) {
      console.log(`\n--- 进度: ${current}/${notes.length}, 成功: ${processed}, 失败: ${failed} ---\n`);
    }
  }

  console.log(`\n========================================`);
  console.log(`处理完成！`);
  console.log(`成功: ${processed} 篇`);
  console.log(`失败: ${failed} 篇`);
  console.log(`========================================`);

  db.close();
}

main().catch(console.error);
