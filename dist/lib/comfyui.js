/**
 * ComfyUI 图片生成服务
 * 通过 ZeroTier 网络连接 Windows 上的 ComfyUI
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { CLAUDE_API, COMFYUI_CONFIG, COMFYUI_URL } from './api-config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 图片保存目录
const UPLOADS_DIR = join(__dirname, '../../public/uploads');
// 确保上传目录存在
if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
}
/**
 * 小红薯风格的工作流模板
 * 使用 Z-Image-Turbo 模型快速生成
 * 参考: QWEN-Anime-L_00002_.png 工作流
 *
 * 关键参数（从参考工作流提取）：
 * - CFG: 1.0（必须保持 1.0！）
 * - Sampler: res_multistep
 * - Steps: 9
 * - 需要 ModelSamplingAuraFlow 节点（shift=3.0）
 * - 使用 ConditioningZeroOut 处理负面提示词（不使用文本负面词）
 */
function createWorkflow(prompt, negativePrompt = '') {
    const seed = Math.floor(Math.random() * 1000000000000000);
    return {
        // 1. 加载模型 (对应参考工作流节点 34)
        "1": {
            "inputs": {
                "ckpt_name": "zImageTurboAIO_zImageTurboFP8AIO.safetensors"
            },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "Load Checkpoint" }
        },
        // 2. ModelSamplingAuraFlow (对应参考工作流节点 2)
        "2": {
            "inputs": {
                "shift": 3.0,
                "model": ["1", 0]
            },
            "class_type": "ModelSamplingAuraFlow",
            "_meta": { "title": "ModelSamplingAuraFlow" }
        },
        // 3. 正面提示词编码 (对应参考工作流节点 20)
        "3": {
            "inputs": {
                "text": prompt,
                "clip": ["1", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "Positive Prompt" }
        },
        // 4. ConditioningZeroOut - 关键修正！输入是正面提示词的输出 (对应参考工作流节点 40)
        // 参考工作流: 节点40的输入是 ["20", 0]，即正面提示词节点的输出
        "4": {
            "inputs": {
                "conditioning": ["3", 0]
            },
            "class_type": "ConditioningZeroOut",
            "_meta": { "title": "ConditioningZeroOut" }
        },
        // 5. 空白潜空间图像 (对应参考工作流节点 6)
        "5": {
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage",
            "_meta": { "title": "Empty Latent Image" }
        },
        // 6. KSampler (对应参考工作流节点 17)
        "6": {
            "inputs": {
                "seed": seed,
                "steps": 9,
                "cfg": 1.0,
                "sampler_name": "res_multistep",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["2", 0],
                "positive": ["3", 0],
                "negative": ["4", 0],
                "latent_image": ["5", 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        // 7. VAE 解码 (对应参考工作流节点 11)
        "7": {
            "inputs": {
                "samples": ["6", 0],
                "vae": ["1", 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAE Decode" }
        },
        // 8. 保存图片 (对应参考工作流节点 26)
        "8": {
            "inputs": {
                "filename_prefix": "xiaohongshu",
                "images": ["7", 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "Save Image" }
        }
    };
}
/**
 * 用 AI 根据文章标题生成中文图片提示词
 * zImage 模型支持中文提示词
 */
async function generateImagePromptWithAI(title, category) {
    const systemPrompt = `你是一个图片提示词生成器。根据小红书文章标题生成中文图片提示词。

规则：
1. 只输出提示词，不要其他内容
2. 描述具体的物品、场景、光线、风格、构图
3. 禁止出现人物、人脸、文字、logo、水印
4. 30-60个中文字
5. 风格：精致、美观、适合小红书的审美

示例：
输入：冬季嘴唇干裂起皮？这个方法3天见效
输出：护唇产品平铺摆拍，粉色润唇膏和唇膜，玫瑰花瓣点缀，大理石背景，蜂蜜质地，柔和暖光，美妆产品摄影，精致美学

输入：哈尔滨冰雪大世界攻略
输出：哈尔滨冰雕夜景，彩色灯光照亮冰雪城堡，雪花飘落，冬日仙境，蓝调时刻，梦幻氛围，广角风景，冰雪建筑细节

输入：iPhone 16 Pro使用体验
输出：iPhone 16 Pro放在大理石桌面，钛金属质感，相机模组特写，极简布置，柔和窗光，数码产品摄影，苹果美学

输入：空气炸锅食谱分享
输出：空气炸锅美食摆盘，金黄酥脆的炸鸡翅，新鲜蔬菜配菜，木质餐桌，暖色调灯光，美食摄影，家常料理风格`;
    const userPrompt = `标题：${title}
分类：${category}

生成图片提示词：`;
    try {
        const response = await fetch(`${CLAUDE_API.baseURL}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLAUDE_API.apiKey}`,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: CLAUDE_API.model,
                max_tokens: 200,
                messages: [{ role: 'user', content: userPrompt }],
                system: systemPrompt
            })
        });
        if (!response.ok) {
            console.log('[AI Prompt] API 调用失败，使用备用方案');
            return '';
        }
        const data = await response.json();
        const prompt = data.content?.[0]?.text?.trim() || '';
        // 清理可能的多余内容
        let cleanPrompt = prompt
            .replace(/^[#\s]*.*[:：]\s*/i, '') // 移除开头的标题或标签
            .replace(/^(输出|Output|Prompt|图片提示词)[:：]?\s*/gi, '')
            .replace(/\n.*/s, '') // 只取第一行
            .trim();
        // 如果太短，使用备用方案
        if (cleanPrompt.length < 15) {
            console.log('[AI Prompt] 返回太短，使用备用方案');
            return '';
        }
        console.log(`[AI Prompt] 生成: ${cleanPrompt.slice(0, 40)}...`);
        return cleanPrompt;
    }
    catch (error) {
        console.log('[AI Prompt] 生成失败，使用备用方案:', error);
        return '';
    }
}
/**
 * 备用方案：从标题中提取中文关键词
 */
function extractKeywordsFromTitle(title, category) {
    const keywordMaps = {
        beauty: {
            '嘴唇': '护唇产品，润唇膏，玫瑰花瓣，蜂蜜质地',
            '唇': '唇釉唇彩，光泽质感，粉色美学',
            '美白': '美白精华瓶，维C成分，明亮干净背景',
            '保湿': '保湿面霜，水珠质感，补水护肤',
            '干皮': '滋润面霜质地，滋养精油，冬季护肤',
            '油皮': '控油产品，清爽质地，绿茶元素',
            '毛孔': '毛孔护理产品，清洁肌肤质感，极简风格',
            '敏感': '温和护肤品，舒缓成分，柔和粉色调',
            '抗老': '抗衰精华，视黄醇瓶装，奢华金色点缀',
            '眼霜': '眼霜罐装，细腻质地，珍珠元素',
            '精华': '精华滴管，玻璃瓶，金色液体',
            '面膜': '面膜片，水疗场景，黄瓜片',
            '防晒': '防晒霜瓶装，海滩元素，夏日氛围',
            '底妆': '粉底液瓶装，美妆蛋，无瑕质感',
            '痘': '祛痘产品，茶树成分，清爽临床美学',
            '水乳': '水乳套装，配套瓶装，极简风格',
            '早C晚A': '维C和视黄醇精华，日夜护肤概念'
        },
        fashion: {
            '羽绒服': '羽绒服平铺，冬季配饰，羊毛围巾',
            '大衣': '羊毛大衣优雅垂坠，皮包，秋叶',
            '针织': '针织衫堆叠，麻花纹理，暖色调',
            '小个子': '小个子穿搭平铺，高腰裤，厚底鞋',
            '显瘦': '显瘦黑色穿搭，竖条纹，优雅轮廓',
            '通勤': '通勤穿搭平铺，电脑包，咖啡杯',
            '约会': '约会裙装，鲜花，粉色配饰',
            '配饰': '配饰摆放，首饰，围巾，帽子',
            '围巾': '羊绒围巾折叠，冬季配饰，暖色',
            '帽子': '帽子系列，贝雷帽和毛线帽，时尚摆放',
            '叠穿': '叠穿穿搭平铺，多层次质感，秋季风格',
            '老钱风': '静奢单品，羊绒，珍珠，中性色调',
            '美拉德': '棕色系穿搭，焦糖色，秋季美学'
        },
        food: {
            '火锅': '火锅配新鲜食材，热气腾腾，红汤锅底',
            '奶茶': '奶茶杯，珍珠，精致咖啡厅场景',
            '早餐': '早餐摆盘，鸡蛋吐司，晨光',
            '减脂': '健康沙拉碗，彩色蔬菜，健身美学',
            '空气炸锅': '空气炸锅美食，金黄酥脆，厨房场景',
            '甜品': '甜品摆放，马卡龙蛋糕，粉彩色调',
            '宵夜': '深夜小吃，霓虹灯，街头美食风格',
            '年夜饭': '年夜饭盛宴，红色装饰，家常菜',
            '蘸料': '蘸料小碗，香料，食材',
            '红薯': '烤红薯，秋收，暖色调'
        },
        travel: {
            '哈尔滨': '哈尔滨冰雕，彩色灯光，雪景',
            '云南': '云南梯田，云雾山峦，民族风情',
            '新疆': '新疆沙漠风光，雪山，丝绸之路',
            '西双版纳': '热带雨林，棕榈树，佛寺',
            '厦门': '厦门海岸风光，鼓浪屿，殖民建筑',
            '成都': '成都茶馆，竹林，熊猫元素',
            '日本': '日本寺庙，樱花，传统庭院',
            '泰国': '泰国海滩日落，热带天堂，金色寺庙',
            '滑雪': '滑雪场，雪山，冬季运动装备',
            '温泉': '温泉热气，日式温泉，放松氛围'
        },
        home: {
            '出租屋': '小公寓改造，温馨角落，小灯串',
            '收纳': '收纳盒整理，整洁货架，极简风格',
            '厨房': '厨房收纳，调料罐，干净台面',
            '卧室': '温馨卧室，柔软床品，暖色灯光',
            '浴室': '浴室收纳，洗漱用品摆放，水疗氛围',
            '绿植': '室内植物摆放，龟背竹，多肉花园',
            '香薰': '香薰蜡烛，香薰机，放松氛围',
            '床品': '奢华床品套装，柔软质感，酒店风格',
            '取暖': '温暖取暖器，毛毯，冬日舒适',
            '衣柜': '整洁衣柜，颜色分类衣物，整齐衣架'
        },
        fitness: {
            '帕梅拉': '居家健身布置，瑜伽垫，弹力带',
            '腹肌': '腹肌轮和垫子，核心训练器材，活力感',
            '臀腿': '弹力带，臀腿训练，健身房美学',
            '跑步': '跑鞋，运动手表，户外跑道',
            '瑜伽': '瑜伽垫和瑜伽砖，宁静场景，绿植',
            '拉伸': '拉伸器材，泡沫轴，恢复工具',
            '减脂': '有氧器材，跳绑，运动毛巾',
            '增肌': '哑铃和蛋白粉，健身房场景，力量感',
            '体态': '体态矫正器，调整工具，健康'
        },
        tech: {
            'iPhone': 'iPhone放在大理石上，极简风格，苹果美学',
            '华为': '华为手机，现代科技，流线设计',
            '小米': '小米设备生态，智能家居，现代感',
            '手机': '手机平铺，配件，科技生活方式',
            'MacBook': 'MacBook放在木桌上，咖啡，创意工作空间',
            '笔记本': '笔记本电脑工作区，效率布置，干净桌面',
            'iPad': 'iPad配Apple Pencil，创意工具，数字艺术',
            '耳机': '无线耳机，高端头戴耳机，音频设备',
            '充电': '充电宝和数据线，充电站，整齐摆放',
            '游戏本': '游戏笔记本，RGB灯光，游戏外设'
        },
        study: {
            '考研': '考研书籍堆叠，荧光笔，备考场景',
            '考公': '公务员考试资料，整理笔记，台灯',
            '英语': '英语教材，单词卡，语言学习',
            '时间管理': '计划本和日历，效率工具，整齐摆放',
            '自律': '习惯追踪器，晨间物品，励志感',
            '读书': '书籍堆叠，阅读眼镜，温馨阅读角',
            '副业': '笔记本电脑和笔记本，副业布置，创业感',
            'Excel': '屏幕上的表格，数据分析，专业感',
            'PPT': '演示材料，商务会议布置',
            '面试': '专业作品集，简历，面试准备',
            '简历': '简历文档，职业规划，专业物品',
            '新年计划': '目标设定日记，新年计划本，新开始'
        }
    };
    const keywords = keywordMaps[category] || {};
    for (const [cn, prompt] of Object.entries(keywords)) {
        if (title.includes(cn)) {
            return prompt;
        }
    }
    return '';
}
/**
 * 根据板块和图片类型生成差异化的中文提示词
 * 优先使用 AI 生成，失败时使用备用方案
 */
export async function buildImagePromptAsync(title, category, imageType = 'cover') {
    // 尝试用 AI 生成
    const aiPrompt = await generateImagePromptWithAI(title, category);
    if (aiPrompt && aiPrompt.length > 10) {
        return `${aiPrompt}，高清细节，4K分辨率，无文字，无水印，无logo，无人物，无人脸`;
    }
    // 备用方案
    return buildImagePrompt(title, category, imageType);
}
/**
 * 同步版本的提示词生成（备用方案）- 中文版
 */
export function buildImagePrompt(title, category, imageType = 'cover') {
    const titleKeywords = extractKeywordsFromTitle(title, category);
    const categoryStyles = {
        beauty: {
            cover: `护肤品摄影，${titleKeywords || '精致化妆品瓶罐摆放在大理石上'}，柔和自然光，奢华美学，专业商业摄影`,
            detail: `化妆品质地特写，${titleKeywords || '玻璃表面的面霜纹理'}，微距摄影，柔焦背景`,
            scene: `浴室梳妆台场景，${titleKeywords || '护肤品整齐摆放'}，晨间护肤，柔和窗光`
        },
        fashion: {
            cover: `时尚穿搭平铺摄影，${titleKeywords || '完整穿搭组合'}，极简白色背景，杂志风格`,
            detail: `服装面料质感，${titleKeywords || '缝线细节'}，微距时尚摄影`,
            scene: `衣柜内部，${titleKeywords || '衣物整齐悬挂'}，整洁衣橱，柔和自然光`
        },
        food: {
            cover: `美食摄影，${titleKeywords || '精美摆盘的美味佳肴'}，诱人色彩，暖色灯光，45度角`,
            detail: `食材特写，${titleKeywords || '新鲜食材'}，微距美食摄影，鲜艳色彩`,
            scene: `餐桌布置，${titleKeywords || '即将享用的美食'}，温馨餐厅氛围`
        },
        travel: {
            cover: `旅行风景摄影，${titleKeywords || '壮丽自然风光'}，黄金时刻光线，广角，鲜艳色彩`,
            detail: `旅行细节，${titleKeywords || '当地建筑'}，文化元素，纪实风格`,
            scene: `旅行生活场景，${titleKeywords || '风景观景点'}，旅行氛围`
        },
        home: {
            cover: `室内设计摄影，${titleKeywords || '温馨生活空间'}，极简北欧风格，柔和自然光`,
            detail: `家居装饰特写，${titleKeywords || '装饰物品'}，质感细节，暖色调`,
            scene: `温馨角落场景，${titleKeywords || '阅读角'}，暖色灯光，舒适氛围`
        },
        fitness: {
            cover: `健身器材摄影，${titleKeywords || '专业健身器材'}，明亮环境，活力氛围`,
            detail: `健身装备特写，${titleKeywords || '运动配件'}，产品摄影`,
            scene: `家庭健身房布置，${titleKeywords || '运动空间'}，晨间运动氛围`
        },
        tech: {
            cover: `数码产品摄影，${titleKeywords || '精致电子设备'}，极简背景，专业灯光`,
            detail: `科技产品特写，${titleKeywords || '设备细节'}，微距产品摄影`,
            scene: `桌面布置场景，${titleKeywords || '设备工作区'}，高效氛围`
        },
        study: {
            cover: `书桌摄影，${titleKeywords || '书籍和文具'}，暖色台灯光，舒适氛围`,
            detail: `文具特写，${titleKeywords || '笔记本页面'}，微距摄影，柔和灯光`,
            scene: `温馨学习角落，${titleKeywords || '书架背景'}，暖色环境光`
        }
    };
    const defaultPrompts = {
        cover: `产品摄影，${titleKeywords || '整洁摆放'}，柔和灯光，专业摄影`,
        detail: `细节特写，${titleKeywords || '质感和材质'}，微距摄影`,
        scene: `生活场景，${titleKeywords || '温馨氛围'}，自然光线`
    };
    const prompts = categoryStyles[category] || defaultPrompts;
    const basePrompt = prompts[imageType];
    return `${basePrompt}，高清细节，4K分辨率，无文字，无水印，无logo，无人物，无人脸`;
}
/**
 * 检查 ComfyUI 服务是否可用
 */
export async function checkComfyUIHealth() {
    try {
        const response = await fetch(`${COMFYUI_URL}/system_stats`, {
            signal: AbortSignal.timeout(5000)
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * 提交工作流到 ComfyUI
 */
async function queuePrompt(workflow) {
    const clientId = randomUUID();
    const response = await fetch(`${COMFYUI_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: workflow,
            client_id: clientId
        })
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`ComfyUI 提交失败: ${error}`);
    }
    const result = await response.json();
    return result.prompt_id;
}
/**
 * 等待图片生成完成
 */
async function waitForCompletion(promptId) {
    const startTime = Date.now();
    while (Date.now() - startTime < COMFYUI_CONFIG.timeout) {
        const response = await fetch(`${COMFYUI_URL}/history/${promptId}`);
        if (response.ok) {
            const history = await response.json();
            if (history[promptId]) {
                const outputs = history[promptId].outputs;
                const images = [];
                // 遍历所有输出节点找到图片
                for (const nodeId in outputs) {
                    const nodeOutput = outputs[nodeId];
                    if (nodeOutput.images) {
                        for (const img of nodeOutput.images) {
                            images.push(img.filename);
                        }
                    }
                }
                if (images.length > 0) {
                    return images;
                }
            }
        }
        // 等待 500ms 后重试
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('图片生成超时');
}
/**
 * 从 ComfyUI 下载图片并保存到本地
 */
async function downloadImage(filename) {
    const response = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}`);
    if (!response.ok) {
        throw new Error(`下载图片失败: ${filename}`);
    }
    const buffer = await response.arrayBuffer();
    // 生成唯一文件名
    const ext = filename.split('.').pop() || 'png';
    const localFilename = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
    const localPath = join(UPLOADS_DIR, localFilename);
    writeFileSync(localPath, Buffer.from(buffer));
    // 返回可访问的 URL 路径
    return `/uploads/${localFilename}`;
}
/**
 * 生成图片的主函数
 * @param title 文章标题
 * @param category 板块分类
 * @param imageType 图片类型：cover(封面)、detail(细节)、scene(场景)
 */
export async function generateImage(title, category, imageType = 'cover') {
    try {
        // 检查服务可用性
        const isHealthy = await checkComfyUIHealth();
        if (!isHealthy) {
            return { success: false, error: 'ComfyUI 服务不可用' };
        }
        // 用 AI 生成差异化提示词
        const prompt = await buildImagePromptAsync(title, category, imageType);
        console.log(`[ComfyUI] 生成${imageType}图提示词:`, prompt.slice(0, 100) + '...');
        // 创建工作流
        const workflow = createWorkflow(prompt);
        // 提交任务
        console.log('[ComfyUI] 提交生成任务...');
        const promptId = await queuePrompt(workflow);
        console.log('[ComfyUI] 任务ID:', promptId);
        // 等待完成
        console.log('[ComfyUI] 等待生成完成...');
        const images = await waitForCompletion(promptId);
        console.log('[ComfyUI] 生成完成, 图片数:', images.length);
        // 下载第一张图片
        if (images.length > 0) {
            const imageUrl = await downloadImage(images[0]);
            console.log('[ComfyUI] 图片已保存:', imageUrl);
            return { success: true, imageUrl };
        }
        return { success: false, error: '未生成图片' };
    }
    catch (error) {
        console.error('[ComfyUI] 生成失败:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
        };
    }
}
/**
 * 批量生成多张图片
 */
export async function generateImages(title, category, count = 1) {
    const urls = [];
    for (let i = 0; i < count; i++) {
        const result = await generateImage(title, category);
        if (result.success && result.imageUrl) {
            urls.push(result.imageUrl);
        }
    }
    return urls;
}
