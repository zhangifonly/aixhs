import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('./data/aixhs.db');

// 获取所有可用图片
const uploadsDir = './public/uploads';
const allImages = fs.readdirSync(uploadsDir)
  .filter(f => f.endsWith('.png'))
  .map(f => `/uploads/${f}`);

console.log(`可用图片总数: ${allImages.length}`);

// 获取所有笔记
const notes = db.prepare('SELECT id, cover_image, images FROM notes').all() as any[];
console.log(`笔记总数: ${notes.length}`);

// 随机选择图片
function getRandomImages(exclude: string[], count: number): string[] {
  const available = allImages.filter(img => !exclude.includes(img));
  const selected: string[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length);
    selected.push(available[idx]);
    available.splice(idx, 1);
  }
  return selected;
}

// 更新每篇笔记
const updateStmt = db.prepare('UPDATE notes SET images = ?, cover_image = ? WHERE id = ?');

let updated = 0;
for (const note of notes) {
  let currentImages: string[] = [];
  try {
    if (note.images && note.images !== '[]') {
      currentImages = JSON.parse(note.images);
    }
  } catch (e) {
    currentImages = [];
  }
  
  const coverImage = note.cover_image || '';
  const existingImages = [coverImage, ...currentImages].filter(Boolean);
  
  // 需要至少3张内容图片
  const needed = Math.max(0, 3 - currentImages.length);
  
  if (needed > 0) {
    const newImages = getRandomImages(existingImages, needed);
    const finalImages = [...currentImages, ...newImages];
    
    // 如果没有封面图，用第一张作为封面
    let finalCover = coverImage;
    if (!finalCover && finalImages.length > 0) {
      finalCover = finalImages[0];
    }
    
    updateStmt.run(JSON.stringify(finalImages), finalCover, note.id);
    updated++;
  }
}

console.log(`更新了 ${updated} 篇笔记的图片`);

// 验证结果
const result = db.prepare(`
  SELECT 
    CASE 
      WHEN images IS NULL OR images = '' OR images = '[]' THEN 0
      ELSE json_array_length(images)
    END as image_count,
    COUNT(*) as note_count
  FROM notes
  GROUP BY image_count
  ORDER BY image_count
`).all() as any[];

console.log('\n更新后图片分布:');
result.forEach(r => console.log(`  ${r.image_count} 张图片: ${r.note_count} 篇`));

db.close();
