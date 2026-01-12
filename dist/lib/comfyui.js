/**
 * ComfyUI 图片生成服务
 * 通过 ZeroTier 网络连接 Windows 上的 ComfyUI
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ComfyUI 配置
const COMFYUI_CONFIG = {
    host: '192.168.193.188',
    port: 8188,
    timeout: 120000, // 2分钟超时
};
const COMFYUI_URL = `http://${COMFYUI_CONFIG.host}:${COMFYUI_CONFIG.port}`;
// 图片保存目录
const UPLOADS_DIR = join(__dirname, '../../public/uploads');
// 确保上传目录存在
if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
}
/**
 * 小红书风格的工作流模板
 * 使用 zImageTurbo 模型快速生成
 */
function createWorkflow(prompt, negativePrompt = '') {
    const seed = Math.floor(Math.random() * 1000000000);
    return {
        "3": {
            "inputs": {
                "seed": seed,
                "steps": 6,
                "cfg": 2,
                "sampler_name": "dpmpp_sde",
                "scheduler": "karras",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "4": {
            "inputs": {
                "ckpt_name": "zImageTurboAIO_zImageTurboFP8AIO.safetensors"
            },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "Load Checkpoint" }
        },
        "5": {
            "inputs": {
                "width": 768,
                "height": 1024,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage",
            "_meta": { "title": "Empty Latent Image" }
        },
        "6": {
            "inputs": {
                "text": prompt,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIP Text Encode (Positive)" }
        },
        "7": {
            "inputs": {
                "text": negativePrompt || "ugly, blurry, low quality, distorted, deformed, watermark, text, logo",
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIP Text Encode (Negative)" }
        },
        "8": {
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAE Decode" }
        },
        "9": {
            "inputs": {
                "filename_prefix": "xiaohongshu",
                "images": ["8", 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "Save Image" }
        }
    };
}
/**
 * 根据板块生成风格化的提示词
 */
export function buildImagePrompt(title, category, content) {
    // 板块风格映射
    const categoryStyles = {
        beauty: 'skincare products, cosmetics, beauty flatlay, soft lighting, pastel colors, aesthetic, clean composition',
        fashion: 'fashion photography, outfit flatlay, stylish clothing, minimalist aesthetic, soft natural lighting',
        food: 'food photography, delicious meal, appetizing, warm lighting, restaurant ambiance, gourmet presentation',
        travel: 'travel photography, scenic landscape, beautiful destination, golden hour lighting, wanderlust aesthetic',
        home: 'interior design, cozy home decor, minimalist style, natural lighting, aesthetic living space',
        fitness: 'fitness lifestyle, healthy living, workout equipment, energetic mood, bright lighting',
        tech: 'technology product, gadget photography, clean minimal background, professional lighting, modern aesthetic',
        study: 'study desk setup, books and stationery, cozy study corner, warm ambient lighting, productive atmosphere',
    };
    const baseStyle = categoryStyles[category] || 'aesthetic photography, high quality, professional lighting';
    // 从标题提取关键词
    const keywords = title
        .replace(/[！!？?。，,、]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1)
        .slice(0, 5)
        .join(', ');
    // 构建完整提示词
    const prompt = `${keywords}, ${baseStyle}, xiaohongshu style, high quality, 8k, detailed, sharp focus, professional photography`;
    return prompt;
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
 */
export async function generateImage(title, category, content) {
    try {
        // 检查服务可用性
        const isHealthy = await checkComfyUIHealth();
        if (!isHealthy) {
            return { success: false, error: 'ComfyUI 服务不可用' };
        }
        // 构建提示词
        const prompt = buildImagePrompt(title, category, content);
        console.log('[ComfyUI] 生成提示词:', prompt);
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
