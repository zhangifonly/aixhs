/**
 * ComfyUI 图片生成服务
 * 通过 ZeroTier 网络连接 Windows 上的 ComfyUI
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import { CLAUDE_API, COMFYUI_CONFIG, COMFYUI_URL } from './api-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 图片保存目录
const UPLOADS_DIR = join(__dirname, '../../public/uploads')

// 确保上传目录存在
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true })
}

/**
 * 小红书风格的工作流模板
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
function createWorkflow(prompt: string, negativePrompt: string = ''): object {
  const seed = Math.floor(Math.random() * 1000000000000000)

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
  }
}

/**
 * 图片类型枚举
 * cover: 封面图 - 主体产品/场景的整体展示
 * detail: 细节图 - 产品细节、成分、质地特写
 * scene: 场景图 - 使用场景、氛围感、生活化展示
 */
export type ImageType = 'cover' | 'detail' | 'scene'

/**
 * 用 AI 根据文章标题生成图片提示词
 * 每篇文章都会得到独特的、与内容相关的提示词
 */
async function generateImagePromptWithAI(title: string, category: string): Promise<string> {
  const categoryNames: Record<string, string> = {
    beauty: '美妆护肤',
    fashion: '穿搭时尚',
    food: '美食探店',
    travel: '旅行攻略',
    home: '家居生活',
    fitness: '健身运动',
    tech: '数码科技',
    study: '学习成长'
  }

  const systemPrompt = `You are an image prompt generator. Generate English prompts for AI image generation based on Chinese article titles.

Rules:
1. Output ONLY the English prompt, nothing else
2. Describe specific objects, scenes, lighting, style, composition
3. NO humans, faces, text, logos, watermarks
4. 50-80 English words
5. Style: elegant, aesthetic, suitable for Xiaohongshu (Chinese social media)

Examples:
Input: 冬季嘴唇干裂起皮？这个方法3天见效
Output: lip care products flat lay, pink lip balm tubes and jars, rose petals scattered, soft pink marble background, honey dripping, moisturizing texture, warm soft lighting, beauty product photography, luxurious aesthetic, top down view

Input: 哈尔滨冰雪大世界攻略
Output: Harbin ice sculpture at night, colorful LED lights illuminating ice castle, snow falling gently, winter wonderland scene, blue hour photography, magical atmosphere, wide angle landscape, frozen architecture details

Input: iPhone 16 Pro使用体验
Output: iPhone 16 Pro on marble desk, titanium finish gleaming, camera module detail, minimalist setup, soft window light, tech product photography, Apple aesthetic, clean composition, premium feel`

  const userPrompt = `Title: ${title}
Category: ${categoryNames[category] || category}

Generate the image prompt:`

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
    })

    if (!response.ok) {
      console.log('[AI Prompt] API 调用失败，使用备用方案')
      return ''
    }

    const data = await response.json()
    const prompt = data.content?.[0]?.text?.trim() || ''

    // 清理可能的多余内容
    let cleanPrompt = prompt
      .replace(/^[#\s]*.*[:：]\s*/i, '') // 移除开头的标题或标签
      .replace(/^(输出|Output|Prompt|图片提示词)[:：]?\s*/gi, '')
      .replace(/\n.*/s, '') // 只取第一行
      .trim()

    // 如果结果包含中文，说明 AI 没有正确理解，使用备用方案
    if (/[\u4e00-\u9fa5]/.test(cleanPrompt)) {
      console.log('[AI Prompt] 返回包含中文，使用备用方案')
      return ''
    }

    // 如果太短，也使用备用方案
    if (cleanPrompt.length < 30) {
      console.log('[AI Prompt] 返回太短，使用备用方案')
      return ''
    }

    console.log(`[AI Prompt] 生成: ${cleanPrompt.slice(0, 60)}...`)
    return cleanPrompt
  } catch (error) {
    console.log('[AI Prompt] 生成失败，使用备用方案:', error)
    return ''
  }
}

/**
 * 备用方案：从标题中提取关键词
 */
function extractKeywordsFromTitle(title: string, category: string): string {
  const keywordMaps: Record<string, Record<string, string>> = {
    beauty: {
      '嘴唇': 'lip balm and lip care products, rose petals, honey texture',
      '唇': 'lip gloss tubes, glossy texture, pink aesthetic',
      '美白': 'whitening serum bottles, vitamin C, bright clean background',
      '保湿': 'moisturizer jars, water droplets, hydrating texture',
      '干皮': 'rich cream texture, nourishing oils, winter skincare',
      '油皮': 'mattifying products, oil control, fresh green tea leaves',
      '毛孔': 'pore care products, clean skin texture, minimalist',
      '敏感': 'gentle skincare, calming ingredients, soft pink tones',
      '抗老': 'anti-aging serum, retinol bottles, luxury gold accents',
      '眼霜': 'eye cream jar, delicate texture, pearl elements',
      '精华': 'serum droppers, glass bottles, golden liquid',
      '面膜': 'sheet masks, spa setting, cucumber slices',
      '防晒': 'sunscreen bottles, beach elements, summer vibes',
      '底妆': 'foundation bottles, makeup sponges, flawless texture',
      '痘': 'acne treatment, tea tree, clean clinical aesthetic',
      '水乳': 'toner and lotion set, matching bottles, minimalist',
      '早C晚A': 'vitamin C and retinol serums, day and night concept'
    },
    fashion: {
      '羽绒服': 'puffer jacket flat lay, winter accessories, cozy wool scarf',
      '大衣': 'wool coat draped elegantly, leather bag, autumn leaves',
      '针织': 'knitwear stack, cable knit texture, warm tones',
      '小个子': 'petite outfit flat lay, high waist pants, platform shoes',
      '显瘦': 'slimming black outfit, vertical lines, elegant silhouette',
      '通勤': 'office outfit flat lay, laptop bag, coffee cup',
      '约会': 'romantic dress, flowers, soft pink accessories',
      '配饰': 'accessories arrangement, jewelry, scarves, hats',
      '围巾': 'cashmere scarves folded, winter accessories, warm colors',
      '帽子': 'hat collection, berets and beanies, stylish arrangement',
      '叠穿': 'layered outfit flat lay, multiple textures, autumn style',
      '老钱风': 'quiet luxury items, cashmere, pearls, neutral tones',
      '美拉德': 'brown tones outfit, caramel colors, autumn aesthetic'
    },
    food: {
      '火锅': 'hot pot with fresh ingredients, steam rising, red soup base',
      '奶茶': 'bubble tea cups, tapioca pearls, aesthetic cafe setting',
      '早餐': 'breakfast spread, eggs and toast, morning sunlight',
      '减脂': 'healthy salad bowl, colorful vegetables, fitness aesthetic',
      '空气炸锅': 'crispy air fried food, golden texture, kitchen setting',
      '甜品': 'dessert arrangement, macarons and cakes, pastel colors',
      '宵夜': 'late night snacks, neon lights, street food aesthetic',
      '年夜饭': 'Chinese New Year feast, red decorations, family dishes',
      '蘸料': 'dipping sauces in small bowls, spices, ingredients',
      '红薯': 'roasted sweet potatoes, autumn harvest, warm colors'
    },
    travel: {
      '哈尔滨': 'Harbin ice sculptures, colorful lights, snow scenery',
      '云南': 'Yunnan terraced rice fields, misty mountains, ethnic culture',
      '新疆': 'Xinjiang desert landscape, snow mountains, silk road',
      '西双版纳': 'tropical rainforest, palm trees, Buddhist temple',
      '厦门': 'Xiamen coastal scenery, Gulangyu island, colonial architecture',
      '成都': 'Chengdu teahouse, bamboo forest, panda elements',
      '日本': 'Japanese temple, cherry blossoms, traditional garden',
      '泰国': 'Thai beach sunset, tropical paradise, golden temple',
      '滑雪': 'ski resort, snow mountains, winter sports equipment',
      '温泉': 'hot spring steam, Japanese onsen, relaxing atmosphere'
    },
    home: {
      '出租屋': 'small apartment makeover, cozy corner, fairy lights',
      '收纳': 'organized storage boxes, tidy shelves, minimalist',
      '厨房': 'kitchen organization, spice jars, clean countertop',
      '卧室': 'cozy bedroom, soft bedding, warm lamp light',
      '浴室': 'bathroom organization, toiletries arranged, spa vibes',
      '绿植': 'indoor plants arrangement, monstera, succulent garden',
      '香薰': 'scented candles, diffuser, relaxing atmosphere',
      '床品': 'luxurious bedding set, soft textures, hotel style',
      '取暖': 'cozy heater, warm blanket, winter comfort',
      '衣柜': 'organized closet, color coordinated clothes, neat hangers'
    },
    fitness: {
      '帕梅拉': 'home workout setup, yoga mat, resistance bands',
      '腹肌': 'ab roller and mat, core workout equipment, energetic',
      '臀腿': 'resistance bands, booty workout, gym aesthetic',
      '跑步': 'running shoes, fitness tracker, outdoor trail',
      '瑜伽': 'yoga mat and blocks, peaceful setting, plants',
      '拉伸': 'stretching equipment, foam roller, recovery tools',
      '减脂': 'cardio equipment, jump rope, sweat towel',
      '增肌': 'dumbbells and protein shake, gym setting, powerful',
      '体态': 'posture corrector, alignment tools, wellness'
    },
    tech: {
      'iPhone': 'iPhone on marble surface, minimalist, Apple aesthetic',
      '华为': 'Huawei smartphone, modern tech, sleek design',
      '小米': 'Xiaomi devices ecosystem, smart home, modern',
      '手机': 'smartphone flat lay, accessories, tech lifestyle',
      'MacBook': 'MacBook on wooden desk, coffee, creative workspace',
      '笔记本': 'laptop workspace, productivity setup, clean desk',
      'iPad': 'iPad with Apple Pencil, creative tools, digital art',
      '耳机': 'wireless earbuds, premium headphones, audio gear',
      '充电': 'power bank and cables, charging station, organized',
      '游戏本': 'gaming laptop, RGB lighting, gaming peripherals'
    },
    study: {
      '考研': 'study books stacked, highlighters, exam preparation',
      '考公': 'civil service exam materials, organized notes, desk lamp',
      '英语': 'English textbooks, vocabulary cards, language learning',
      '时间管理': 'planner and calendar, productivity tools, organized',
      '自律': 'habit tracker, morning routine items, motivational',
      '读书': 'book stack, reading glasses, cozy reading nook',
      '副业': 'laptop and notebook, side hustle setup, entrepreneurial',
      'Excel': 'spreadsheet on screen, data analysis, professional',
      'PPT': 'presentation materials, business meeting setup',
      '面试': 'professional portfolio, resume, interview preparation',
      '简历': 'resume document, career planning, professional items',
      '新年计划': 'goal setting journal, new year planner, fresh start'
    }
  }

  const keywords = keywordMaps[category] || {}
  for (const [cn, en] of Object.entries(keywords)) {
    if (title.includes(cn)) {
      return en
    }
  }
  return ''
}

/**
 * 根据板块和图片类型生成差异化的英文提示词
 * 优先使用 AI 生成，失败时使用备用方案
 */
export async function buildImagePromptAsync(
  title: string,
  category: string,
  imageType: ImageType = 'cover'
): Promise<string> {
  // 尝试用 AI 生成
  const aiPrompt = await generateImagePromptWithAI(title, category)
  if (aiPrompt && aiPrompt.length > 20) {
    return `${aiPrompt}, high detail, 4K resolution, no text, no watermark, no logo, no human, no person, no face, no portrait`
  }

  // 备用方案
  return buildImagePrompt(title, category, imageType)
}

/**
 * 同步版本的提示词生成（备用方案）
 */
export function buildImagePrompt(
  title: string,
  category: string,
  imageType: ImageType = 'cover'
): string {
  const titleKeywords = extractKeywordsFromTitle(title, category)

  const categoryStyles: Record<string, Record<ImageType, string>> = {
    beauty: {
      cover: `skincare product photography, ${titleKeywords || 'elegant cosmetic bottles and jars on marble'}, soft natural lighting, luxury aesthetic, professional commercial photography`,
      detail: `cosmetic texture close-up, ${titleKeywords || 'cream swirl on glass surface'}, macro photography, soft focus background`,
      scene: `bathroom vanity scene, ${titleKeywords || 'skincare products arranged'}, morning routine, soft window light`
    },
    fashion: {
      cover: `fashion flat lay photography, ${titleKeywords || 'complete outfit arrangement'}, minimalist white background, magazine style`,
      detail: `clothing fabric texture, ${titleKeywords || 'stitching details'}, macro fashion photography`,
      scene: `wardrobe interior, ${titleKeywords || 'clothes hanging neatly'}, organized closet, soft natural light`
    },
    food: {
      cover: `food photography, ${titleKeywords || 'delicious dish with beautiful plating'}, appetizing colors, warm lighting, 45 degree angle`,
      detail: `food ingredient close-up, ${titleKeywords || 'fresh ingredients'}, macro food photography, vibrant colors`,
      scene: `dining table setting, ${titleKeywords || 'meal ready to serve'}, cozy restaurant atmosphere`
    },
    travel: {
      cover: `travel landscape photography, ${titleKeywords || 'magnificent natural scenery'}, golden hour lighting, wide angle, vibrant colors`,
      detail: `travel details, ${titleKeywords || 'local architecture'}, cultural elements, documentary style`,
      scene: `travel lifestyle scene, ${titleKeywords || 'scenic viewpoint'}, wanderlust atmosphere`
    },
    home: {
      cover: `interior design photography, ${titleKeywords || 'cozy living space'}, minimalist Nordic style, soft natural light`,
      detail: `home decor close-up, ${titleKeywords || 'decorative objects'}, texture details, warm tones`,
      scene: `cozy corner scene, ${titleKeywords || 'reading nook'}, warm lamp light, hygge atmosphere`
    },
    fitness: {
      cover: `fitness equipment photography, ${titleKeywords || 'professional gym equipment'}, bright environment, energetic atmosphere`,
      detail: `fitness gear close-up, ${titleKeywords || 'workout accessories'}, product photography`,
      scene: `home gym setup, ${titleKeywords || 'workout space'}, morning exercise atmosphere`
    },
    tech: {
      cover: `digital product photography, ${titleKeywords || 'elegant electronic device'}, minimalist background, professional lighting`,
      detail: `tech product close-up, ${titleKeywords || 'device details'}, macro product photography`,
      scene: `desk setup scene, ${titleKeywords || 'workspace with devices'}, productive atmosphere`
    },
    study: {
      cover: `study desk photography, ${titleKeywords || 'books and stationery'}, warm desk lamp lighting, comfortable atmosphere`,
      detail: `stationery close-up, ${titleKeywords || 'notebook pages'}, macro photography, soft lighting`,
      scene: `cozy study corner, ${titleKeywords || 'bookshelf background'}, warm ambient light`
    }
  }

  const defaultPrompts: Record<ImageType, string> = {
    cover: `product photography, ${titleKeywords || 'clean arrangement'}, soft lighting, professional photography`,
    detail: `close-up detail shot, ${titleKeywords || 'texture and material'}, macro photography`,
    scene: `lifestyle scene, ${titleKeywords || 'cozy atmosphere'}, natural lighting`
  }

  const prompts = categoryStyles[category] || defaultPrompts
  const basePrompt = prompts[imageType]

  return `${basePrompt}, high detail, 4K resolution, no text, no watermark, no logo, no human, no person, no face, no portrait`
}

/**
 * 检查 ComfyUI 服务是否可用
 */
export async function checkComfyUIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${COMFYUI_URL}/system_stats`, {
      signal: AbortSignal.timeout(5000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 提交工作流到 ComfyUI
 */
async function queuePrompt(workflow: object): Promise<string> {
  const clientId = randomUUID()

  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: workflow,
      client_id: clientId
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`ComfyUI 提交失败: ${error}`)
  }

  const result = await response.json()
  return result.prompt_id
}

/**
 * 等待图片生成完成
 */
async function waitForCompletion(promptId: string): Promise<string[]> {
  const startTime = Date.now()

  while (Date.now() - startTime < COMFYUI_CONFIG.timeout) {
    const response = await fetch(`${COMFYUI_URL}/history/${promptId}`)

    if (response.ok) {
      const history = await response.json()

      if (history[promptId]) {
        const outputs = history[promptId].outputs
        const images: string[] = []

        // 遍历所有输出节点找到图片
        for (const nodeId in outputs) {
          const nodeOutput = outputs[nodeId]
          if (nodeOutput.images) {
            for (const img of nodeOutput.images) {
              images.push(img.filename)
            }
          }
        }

        if (images.length > 0) {
          return images
        }
      }
    }

    // 等待 500ms 后重试
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error('图片生成超时')
}

/**
 * 从 ComfyUI 下载图片并保存到本地
 */
async function downloadImage(filename: string): Promise<string> {
  const response = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}`)

  if (!response.ok) {
    throw new Error(`下载图片失败: ${filename}`)
  }

  const buffer = await response.arrayBuffer()

  // 生成唯一文件名
  const ext = filename.split('.').pop() || 'png'
  const localFilename = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
  const localPath = join(UPLOADS_DIR, localFilename)

  writeFileSync(localPath, Buffer.from(buffer))

  // 返回可访问的 URL 路径
  return `/uploads/${localFilename}`
}

/**
 * 生成图片的主函数
 * @param title 文章标题
 * @param category 板块分类
 * @param imageType 图片类型：cover(封面)、detail(细节)、scene(场景)
 */
export async function generateImage(
  title: string,
  category: string,
  imageType: ImageType = 'cover'
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    // 检查服务可用性
    const isHealthy = await checkComfyUIHealth()
    if (!isHealthy) {
      return { success: false, error: 'ComfyUI 服务不可用' }
    }

    // 用 AI 生成差异化提示词
    const prompt = await buildImagePromptAsync(title, category, imageType)
    console.log(`[ComfyUI] 生成${imageType}图提示词:`, prompt.slice(0, 100) + '...')

    // 创建工作流
    const workflow = createWorkflow(prompt)

    // 提交任务
    console.log('[ComfyUI] 提交生成任务...')
    const promptId = await queuePrompt(workflow)
    console.log('[ComfyUI] 任务ID:', promptId)

    // 等待完成
    console.log('[ComfyUI] 等待生成完成...')
    const images = await waitForCompletion(promptId)
    console.log('[ComfyUI] 生成完成, 图片数:', images.length)

    // 下载第一张图片
    if (images.length > 0) {
      const imageUrl = await downloadImage(images[0])
      console.log('[ComfyUI] 图片已保存:', imageUrl)
      return { success: true, imageUrl }
    }

    return { success: false, error: '未生成图片' }
  } catch (error) {
    console.error('[ComfyUI] 生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 批量生成多张图片
 */
export async function generateImages(
  title: string,
  category: string,
  count: number = 1
): Promise<string[]> {
  const urls: string[] = []

  for (let i = 0; i < count; i++) {
    const result = await generateImage(title, category)
    if (result.success && result.imageUrl) {
      urls.push(result.imageUrl)
    }
  }

  return urls
}
