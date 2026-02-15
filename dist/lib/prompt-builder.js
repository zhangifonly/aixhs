/**
 * 智能 Prompt 构建器
 * 根据板块画像、细分话题、参考文章等构建高质量的写作提示词
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { matchCategory, matchSubTopic, getCategoryProfile, getCurrentSeason } from './topic-matcher.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 缓存
let styleConfig = null;
/**
 * 加载全局风格配置
 */
export function loadStyleConfig() {
    if (styleConfig)
        return styleConfig;
    const path = join(__dirname, '../../data/style.json');
    styleConfig = JSON.parse(readFileSync(path, 'utf-8'));
    return styleConfig;
}
/**
 * 加载参考文章
 */
export function loadReferences(categoryId) {
    const path = join(__dirname, `../../data/references/${categoryId}.json`);
    if (!existsSync(path))
        return [];
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return [];
    }
}
/**
 * 获取最相关的参考文章
 */
export function getRelevantReferences(categoryId, subTopicId, limit = 2) {
    const references = loadReferences(categoryId);
    if (subTopicId) {
        // 优先返回匹配细分话题的文章
        const matched = references.filter(r => r.subTopic === subTopicId);
        if (matched.length >= limit) {
            return matched.slice(0, limit);
        }
        // 不够则补充其他文章
        const others = references.filter(r => r.subTopic !== subTopicId);
        return [...matched, ...others].slice(0, limit);
    }
    // 按质量排序
    return references
        .sort((a, b) => {
        if (a.quality === 'excellent' && b.quality !== 'excellent')
            return -1;
        if (b.quality === 'excellent' && a.quality !== 'excellent')
            return 1;
        return (b.metrics.likes + b.metrics.collects) - (a.metrics.likes + a.metrics.collects);
    })
        .slice(0, limit);
}
/**
 * 构建读者心理分析部分
 */
function buildReaderPsychologySection(profile) {
    const { readerPsychology } = profile;
    return `【目标读者心理】
核心需求：${readerPsychology.coreNeeds.join('、')}
喜欢看到：${readerPsychology.likesToSee.join('、')}
不喜欢：${readerPsychology.dislikesToSee.join('、')}
触发互动的关键词：${readerPsychology.triggerPoints.join('、')}
建立信任的信号：${readerPsychology.trustSignals.join('、')}`;
}
/**
 * 构建写作策略部分
 */
function buildWritingStrategySection(profile, subTopic) {
    const { writingStrategy } = profile;
    let section = `【写作策略】
标题公式参考：
${writingStrategy.titleFormulas.map((f, i) => `${i + 1}. ${f}`).join('\n')}

开头风格：
${writingStrategy.openingStyles.map((s, i) => `${i + 1}. ${s}`).join('\n')}

内容结构：${writingStrategy.contentStructure}

结尾技巧：${writingStrategy.closingTips}`;
    if (subTopic) {
        section += `\n\n【细分话题指导】
话题：${subTopic.name}
关键词：${subTopic.keywords.join('、')}
专属技巧：${subTopic.specificTips}`;
    }
    return section;
}
/**
 * 构建反AI检测规范
 */
function buildAntiAISection() {
    const style = loadStyleConfig();
    const { antiAIDetection } = style;
    const forbidden = antiAIDetection.forbiddenPatterns
        .slice(0, 4)
        .map(p => `- 禁止：「${p.pattern}」→ ${p.alternative}`)
        .join('\n');
    const encouraged = antiAIDetection.encouragedPatterns
        .slice(0, 4)
        .map(p => `- 推荐：${p.pattern}，如「${p.example}」`)
        .join('\n');
    return `【反AI检测规范】
${forbidden}

${encouraged}

句子长短要有变化，避免整齐划一
第一人称每段不超过3次，可用「姐妹们」「宝子们」替代`;
}
/**
 * 构建参考文章部分（Few-shot）
 */
function buildReferencesSection(references) {
    if (references.length === 0)
        return '';
    const examples = references.map((ref, i) => {
        return `【参考文章${i + 1}】
标题：${ref.title}
正文：
${ref.content}

亮点分析：${ref.keyFeatures}`;
    }).join('\n\n');
    return `【优秀文章参考】
以下是该领域的优秀文章示例，请学习其写作风格和技巧：

${examples}`;
}
/**
 * 构建写作禁忌部分
 */
function buildTaboosSection(profile) {
    return `【写作禁忌】
${profile.taboos.map(t => `- ${t}`).join('\n')}`;
}
/**
 * 构建完整的写作提示词
 */
export function buildSmartPrompt(options) {
    const { creator, topic, categoryId, subTopicId, includeReferences = true, maxReferences = 2 } = options;
    // 1. 匹配板块
    const profile = categoryId
        ? getCategoryProfile(categoryId)
        : matchCategory(topic);
    if (!profile) {
        // 降级到简单提示词
        return buildSimplePrompt(creator, topic);
    }
    // 2. 匹配细分话题
    const subTopic = subTopicId
        ? profile.subTopics.find(s => s.id === subTopicId)
        : matchSubTopic(topic, profile.id);
    // 3. 获取参考文章
    const references = includeReferences
        ? getRelevantReferences(profile.id, subTopic?.id, maxReferences)
        : [];
    // 4. 构建完整提示词
    const sections = [
        // 博主人设
        `你是小红薯博主「${creator.name}」，${creator.persona}

写作风格：${creator.style}`,
        // 读者心理
        buildReaderPsychologySection(profile),
        // 写作策略
        buildWritingStrategySection(profile, subTopic || undefined),
        // 反AI检测
        buildAntiAISection(),
        // 参考文章
        buildReferencesSection(references),
        // 写作禁忌
        buildTaboosSection(profile),
        // 输出格式
        `【输出格式】
请严格按以下格式输出：

【标题】你的标题（10-20字，可用emoji）

【正文】
你的正文内容...
（口语化，分段清晰，适当使用emoji）

【标签】#标签1 #标签2 #标签3 #标签4 #标签5`
    ];
    return sections.filter(Boolean).join('\n\n');
}
/**
 * 简单提示词（降级方案）
 */
function buildSimplePrompt(creator, topic) {
    return `你是小红薯博主「${creator.name}」，${creator.persona}

写作风格：${creator.style}

写作要求：
1. 标题：吸引眼球，可用emoji，10-20字
2. 开头：直接切入主题，不要"大家好"
3. 正文：口语化，分段清晰，适当使用emoji
4. 结尾：互动引导，如"姐妹们觉得呢？"
5. 标签：生成3-5个相关话题标签

输出格式（严格遵守）：
【标题】你的标题
【正文】
你的正文内容...
【标签】#标签1 #标签2 #标签3

禁止：
- 过于官方的表达
- AI痕迹明显的句式（如"首先、其次、总之"）
- 虚假夸大的描述`;
}
/**
 * 获取板块的示例标题
 */
export function getExampleTitles(categoryId) {
    const profile = getCategoryProfile(categoryId);
    return profile?.exampleTitles || [];
}
/**
 * 获取当季热门话题建议
 */
export function getSeasonalSuggestions(categoryId) {
    const profile = getCategoryProfile(categoryId);
    if (!profile)
        return [];
    const season = getCurrentSeason();
    return profile.seasonalTopics[season] || [];
}
