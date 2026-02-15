/**
 * 自动生成服务
 * 监听热点话题，自动生成笔记内容
 */
import { getPendingTopics, updateHotTopicStatus } from './hot-topic-crawler.js';
import { generateNoteStream, parseNoteContent, saveNote, loadCreators } from './note-writer.js';
import { addAIComments } from './ai-comments.js';
import { generateImage, checkComfyUIHealth } from './comfyui.js';
import { db } from './db.js';
// 博主缓存
let creatorsCache = null;
// ComfyUI 可用性缓存
let comfyUIAvailable = null;
/**
 * 为笔记生成封面图
 */
async function generateCoverImage(noteId, title, category) {
    // 检查 ComfyUI 是否可用（缓存结果避免频繁检查）
    if (comfyUIAvailable === null) {
        comfyUIAvailable = await checkComfyUIHealth();
        if (!comfyUIAvailable) {
            console.log('[封面图] ComfyUI 不可用，跳过图片生成');
            return;
        }
    }
    if (!comfyUIAvailable) {
        return;
    }
    console.log(`[封面图] 开始生成: ${title}`);
    const result = await generateImage(title, category, 'cover');
    if (result.success && result.imageUrl) {
        // 更新笔记的封面图
        db.prepare(`
      UPDATE notes SET cover_image = ? WHERE id = ?
    `).run(result.imageUrl, noteId);
        console.log(`[封面图] 生成成功: ${result.imageUrl}`);
    }
    else {
        console.log(`[封面图] 生成失败: ${result.error}`);
    }
}
/**
 * 获取分类对应的博主
 */
function getCreatorByCategory(category) {
    if (!creatorsCache) {
        creatorsCache = loadCreators();
    }
    // 分类到博主ID的映射
    const categoryToCreator = {
        '美妆护肤': 'xiaomei',
        '穿搭时尚': 'chuanda',
        '美食探店': 'chihuo',
        '旅行攻略': 'lvxing',
        '家居生活': 'jujia',
        '健身运动': 'jianshen',
        '数码科技': 'shuma',
        '学习成长': 'xuexi',
        '影视': 'movie',
        '职场': 'career',
        '情感': 'emotion',
        '母婴': 'baby',
        '萌宠': 'pet',
        '音乐': 'music',
        '舞蹈': 'dance',
        '摄影': 'photo',
        '游戏': 'game',
        '中式养生': 'wellness',
        '心理健康': 'mental',
        '理财生活': 'finance',
        '汽车出行': 'car',
        '户外运动': 'outdoor',
        '手工DIY': 'handmade',
        '新中式文化': 'culture',
        'AI玩法': 'ai',
        // 英文ID映射
        'beauty': 'xiaomei',
        'fashion': 'chuanda',
        'food': 'chihuo',
        'travel': 'lvxing',
        'home': 'jujia',
        'fitness': 'jianshen',
        'tech': 'shuma',
        'study': 'xuexi',
        'movie': 'movie',
        'career': 'career',
        'emotion': 'emotion',
        'baby': 'baby',
        'pet': 'pet',
        'music': 'music',
        'dance': 'dance',
        'photo': 'photo',
        'game': 'game',
        'wellness': 'wellness',
        'mental': 'mental',
        'finance': 'finance',
        'car': 'car',
        'outdoor': 'outdoor',
        'handmade': 'handmade',
        'culture': 'culture',
        'ai': 'ai'
    };
    const creatorId = categoryToCreator[category];
    if (!creatorId)
        return null;
    return creatorsCache.find(c => c.id === creatorId) || null;
}
/**
 * 生成单个热点话题的笔记
 */
export async function generateNoteForTopic(topic) {
    console.log(`[自动生成] 开始生成话题: ${topic.title}`);
    // 更新状态为生成中
    updateHotTopicStatus(topic.id, 'generating');
    try {
        // 获取对应的博主
        const creator = topic.category ? getCreatorByCategory(topic.category) : null;
        if (!creator) {
            throw new Error(`找不到分类 ${topic.category} 对应的博主`);
        }
        // 收集生成的内容
        let fullContent = '';
        const stream = generateNoteStream(creator.id, topic.title, {
            categoryId: topic.category || undefined,
            includeReferences: true
        });
        for await (const chunk of stream) {
            if (chunk.type === 'text' || chunk.type === 'content') {
                fullContent += chunk.content;
            }
            else if (chunk.type === 'error') {
                throw new Error(chunk.content);
            }
        }
        // 解析笔记内容
        const { title, content, tags } = parseNoteContent(fullContent);
        // 保存笔记
        const noteId = saveNote(creator.id, title, content, creator.category, tags);
        // 更新热点话题状态
        updateHotTopicStatus(topic.id, 'published', noteId);
        // 异步生成封面图（不阻塞主流程）
        generateCoverImage(noteId, title, creator.category).catch(err => {
            console.error(`[自动生成] 生成封面图失败: ${err.message}`);
        });
        // 异步生成AI评论（不阻塞主流程）
        addAIComments(noteId, 3).catch(err => {
            console.error(`[自动生成] 生成评论失败: ${err.message}`);
        });
        console.log(`[自动生成] 话题生成完成: ${topic.title} -> 笔记ID: ${noteId}`);
        return noteId;
    }
    catch (error) {
        console.error(`[自动生成] 生成失败: ${error.message}`);
        updateHotTopicStatus(topic.id, 'failed', undefined, error.message);
        return null;
    }
}
/**
 * 批量处理待生成的热点话题
 */
export async function processPendingTopics(limit = 5) {
    const topics = getPendingTopics(limit);
    console.log(`[自动生成] 找到 ${topics.length} 个待处理话题`);
    const result = {
        success: 0,
        failed: 0,
        noteIds: []
    };
    for (const topic of topics) {
        const noteId = await generateNoteForTopic(topic);
        if (noteId) {
            result.success++;
            result.noteIds.push(noteId);
        }
        else {
            result.failed++;
        }
        // 每个话题之间间隔一段时间，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`[自动生成] 批量处理完成: 成功 ${result.success}, 失败 ${result.failed}`);
    return result;
}
/**
 * 获取自动生成统计
 */
export function getAutoGenerateStats() {
    const today = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as generated,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM hot_topics
    WHERE processed_at > datetime('now', '-24 hours')
  `).get();
    const total = db.prepare(`
    SELECT COUNT(*) as count FROM hot_topics WHERE status = 'published'
  `).get();
    return {
        todayGenerated: today?.generated || 0,
        todayFailed: today?.failed || 0,
        totalGenerated: total?.count || 0
    };
}
