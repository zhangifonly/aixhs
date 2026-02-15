import Database from 'better-sqlite3';

const db = new Database('./data/aixhs.db');

// 获取每个分类的所有封面图
const categoryCoverImages: Record<string, string[]> = {};

const covers = db.prepare(`
  SELECT category, cover_image 
  FROM notes 
  WHERE cover_image IS NOT NULL AND cover_image != ''
`).all() as any[];

for (const row of covers) {
  if (!categoryCoverImages[row.category]) {
    categoryCoverImages[row.category] = [];
  }
  categoryCoverImages[row.category].push(row.cover_image);
}

console.log('各分类封面图数量:');
for (const [cat, imgs] of Object.entries(categoryCoverImages)) {
  console.log(`  ${cat}: ${imgs.length} 张`);
}

// 获取所有笔记
const notes = db.prepare('SELECT id, category, cover_image, images FROM notes').all() as any[];
console.log(`\n笔记总数: ${notes.length}`);

// 随机选择同分类的图片
function getRandomCategoryImages(category: string, exclude: string[], count: number): string[] {
  const available = (categoryCoverImages[category] || []).filter(img => !exclude.includes(img));
  const selected: string[] = [];
  
  // 如果同分类图片不够，从相近分类借用
  const similarCategories: Record<string, string[]> = {
    '美妆护肤': ['穿搭时尚', '家居生活'],
    '穿搭时尚': ['美妆护肤', '家居生活'],
    '美食探店': ['家居生活', '旅行攻略'],
    '旅行攻略': ['摄影', '美食探店'],
    '家居生活': ['美妆护肤', '穿搭时尚'],
    '健身运动': ['舞蹈', '学习成长'],
    '数码科技': ['游戏', '学习成长'],
    '学习成长': ['职场', '数码科技'],
    '影视': ['音乐', '游戏'],
    '职场': ['学习成长', '数码科技'],
    '情感': ['母婴', '萌宠'],
    '母婴': ['情感', '萌宠'],
    '萌宠': ['母婴', '情感'],
    '音乐': ['舞蹈', '影视'],
    '舞蹈': ['音乐', '健身运动'],
    '摄影': ['旅行攻略', '家居生活'],
    '游戏': ['数码科技', '影视']
  };
  
  let pool = [...available];
  
  // 如果不够，添加相近分类的图片
  if (pool.length < count) {
    const similar = similarCategories[category] || [];
    for (const simCat of similar) {
      const simImgs = (categoryCoverImages[simCat] || []).filter(img => !exclude.includes(img) && !pool.includes(img));
      pool.push(...simImgs);
      if (pool.length >= count * 2) break;
    }
  }
  
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    selected.push(pool[idx]);
    pool.splice(idx, 1);
  }
  
  return selected;
}

// 更新每篇笔记
const updateStmt = db.prepare('UPDATE notes SET images = ? WHERE id = ?');

let updated = 0;
for (const note of notes) {
  const coverImage = note.cover_image || '';
  const existingImages = [coverImage].filter(Boolean);
  
  // 获取3张同分类的图片（排除自己的封面图）
  const newImages = getRandomCategoryImages(note.category, existingImages, 3);
  
  if (newImages.length > 0) {
    updateStmt.run(JSON.stringify(newImages), note.id);
    updated++;
  }
}

console.log(`\n更新了 ${updated} 篇笔记的图片`);

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

// 抽样检查
console.log('\n抽样检查（每个分类1篇）:');
const sample = db.prepare(`
  SELECT category, title, cover_image, images 
  FROM notes 
  GROUP BY category 
  LIMIT 5
`).all() as any[];

for (const s of sample) {
  console.log(`\n[${s.category}] ${s.title}`);
  console.log(`  封面: ${s.cover_image}`);
  console.log(`  配图: ${s.images}`);
}

db.close();
