/**
 * 批量生成笔记脚本
 * 为每个栏目生成足够数量的文章
 */

import { db, generateId } from '../src/lib/db.js'
import { generateImage, checkComfyUIHealth } from '../src/lib/comfyui.js'
import { CLAUDE_API } from '../src/lib/api-config.js'

// 每个栏目的话题列表
const TOPICS_BY_CATEGORY: Record<string, { creatorId: string; topics: string[] }> = {
  beauty: {
    creatorId: 'xiaomei',
    topics: [
      '干皮姐妹看过来！冬季保湿我踩了800块的雷💰',
      '冬季干皮保湿攻略｜成分党必看',
      '冬季嘴唇干裂起皮？这个方法3天见效💋',
      '黄黑皮逆袭！这个美白方法让我白了2个度✨',
      '毛孔粗大有救了！用了3个月终于看到效果💆‍♀️',
      '敏感肌换季必看！修复屏障我只认这3瓶💊',
      '早C晚A正确用法｜新手避坑指南⚠️',
      '30+姐姐抗老必看｜这些成分真的有用💡',
      '学生党护肤攻略！全套不到200元真的够用💰',
      '痘印怎么消？我用了2个月终于淡了💊',
      '眼霜到底有没有用？成分党用数据说话💡',
      '冬天底妆卡粉起皮？这样做服帖一整天💄',
      '素颜也能发光！我的护肤全记录✨',
      '回购10次不踩雷！这5款平价精华真的能打💰'
    ]
  },
  fashion: {
    creatorId: 'chuanda',
    topics: [
      '羽绒服怎么穿不臃肿？这5个技巧太绝了🔥',
      '小个子冬季穿搭｜155也能穿出170既视感❄️',
      '微胖女生冬季穿搭｜158cm/55kg这样穿瘦10斤✨',
      '老钱风穿搭公式｜平价单品也能穿出高级感✨',
      '美拉德色系穿搭｜158cm穿出高级感🍂',
      '通勤穿搭一周不重样｜158cm打工人的省心搭配📋',
      '约会穿搭｜158cm冬日氛围感look💕',
      '大衣+阔腿裤｜158cm穿出168既视感🔥',
      '学生党平价穿搭｜全身不过百也能穿出质感✨',
      '针织衫叠穿技巧｜158cm穿出层次感还显高🍂',
      '冬季配饰搭配｜围巾帽子这样选显脸小又保暖🧣',
      '黄黑皮显白穿搭｜这些颜色千万别碰！'
    ]
  },
  food: {
    creatorId: 'chihuo',
    topics: [
      '人均50吃到撑！这家火锅太绝了🔥',
      '冬天必吃的10种暖身美食🔥越吃越暖和',
      '一人食晚餐｜10分钟搞定3菜1汤🍳',
      '减脂餐这样做｜好吃不胖还饱腹💪',
      '早餐不知道吃什么？这10个搭配换着来🌅',
      '宵夜推荐｜深夜放毒！这5家店营业到凌晨🌙',
      '年夜饭菜单｜8道硬菜让你成为全场焦点🧧',
      '烤红薯的100种吃法｜这样吃真的绝了🍠',
      '冬日暖心甜品｜在家就能做🍮',
      '火锅蘸料调配｜这个比例绝了🔥'
    ]
  },
  travel: {
    creatorId: 'lvxing',
    topics: [
      '哈尔滨3天2晚｜人均1800玩转冰雪大世界❄️',
      '云南冬季6天5晚｜人均1800小众路线攻略🍂',
      '新疆滑雪4天3晚｜南方人第一次看雪人均1800✨',
      '西双版纳5天4晚｜人均1800穿短袖过冬🌴',
      '厦门3天2晚｜人均1200文艺小清新攻略✨',
      '成都美食之旅｜吃货必打卡的20家店🌶️人均不到100',
      '日本7天6晚｜人均4500泡温泉看雪景攻略❄️',
      '泰国普吉岛5天4晚｜人均3500躲避寒冷攻略🏝️',
      '周末2天1夜｜苏州人均400元古镇游🏮',
      '成都拍照打卡攻略｜这8个地方出片率超高📷',
      '穷游攻略｜人均1000玩转苏州3天2晚🎉',
      '春节避坑指南｜这5个小众目的地人少景美💰人均1500'
    ]
  },
  home: {
    creatorId: 'jujia',
    topics: [
      '厨房收纳｜小空间也能整整齐齐🍳',
      '卧室改造｜500块打造ins风小窝✨',
      '浴室好物｜这10件让洗澡变成享受🛁',
      '冬季取暖神器｜这5款真的暖到心里❄️',
      '断舍离实践｜扔掉这8类东西，家里瞬间大两倍✨',
      '用了3个月才敢推！这5款香薰蜡烛真的绝了🕯️',
      '手残党必看！这8种绿植冬天冻不死🌿',
      '住了3年才敢说！这5套床品真的太舒服了😴',
      '租房党必看！这10件好物让出租屋变温馨🏠',
      '衣柜收纳｜换季衣服这样整理省空间又好找👗'
    ]
  },
  fitness: {
    creatorId: 'jianshen',
    topics: [
      '居家燃脂｜20分钟暴汗不用器械💦',
      '腹肌训练｜每天10分钟练出马甲线 💪',
      '臀腿训练30天｜从扁平臀到蜜桃臀🍑',
      '别再驼背了！30天改善圆肩｜亲测有效✨',
      '跑步入门30天计划｜从3公里到10公里亲测有效🏃‍♀️',
      '瑜伽入门｜每天15分钟改善体态✨',
      '减脂饮食｜这样吃一个月瘦8斤不反弹🥗',
      '新手健身房攻略｜第一次去不尴尬💪',
      '办公室拉伸｜久坐党必看！5分钟缓解腰酸背痛🪑',
      '睡前拉伸｜10分钟改善睡眠质量😴'
    ]
  },
  tech: {
    creatorId: 'shuma',
    topics: [
      '华为Mate 70用了15天真实体验｜到底值不值9999？',
      '小米15 vs iPhone 16｜用了30天告诉你选谁💰',
      '2024年最值得买的5款手机📱真实测评避坑指南',
      'MacBook选购指南｜M3芯片到底值不值得买💻',
      'iPad学习党必看｜生产力还是爱奇艺？📱',
      '降噪耳机怎么选？AirPods Pro2 vs 索尼WF-1000XM5🎧',
      '学生党笔记本怎么选？5000元档真香机推荐💻',
      '2024游戏本怎么选？3款性价比之王实测对比💻',
      '别乱买了！这5个数码配件真的能提升效率📱',
      '2024充电宝怎么选？5款实测避坑指南📱'
    ]
  },
  study: {
    creatorId: 'xuexi',
    topics: [
      '考研英语80+｜我的单词记忆法分享📚',
      '考公上岸｜行测80+的刷题技巧💡',
      '英语四六级｜一个月从425到550的方法✨',
      'Excel技巧｜这10个函数让你效率翻倍📊',
      'PPT制作｜5分钟做出高级感模板💼',
      '别再瞎忙了！学霸的12小时高效作息表📚',
      '自律养成｜21天习惯养成计划✨亲测有效',
      '读书笔记｜这本书让我开窍了！真的绝了📚',
      '副业赚钱｜下班后月入3000+的真实经历💰',
      '面试技巧｜这样准备通过率翻倍💼',
      '简历优化｜HR眼中的好简历长这样📄',
      '新年计划｜2024年目标这样定才能实现🎯'
    ]
  }
}

// 生成单篇笔记内容
async function generateNoteContent(topic: string, creatorId: string, category: string): Promise<{ title: string; content: string; tags: string[] } | null> {
  const systemPrompt = `你是一个小红书博主，请根据话题写一篇小红书笔记。

要求：
1. 标题要吸引人，带emoji
2. 正文要真实、接地气，像在和朋友聊天
3. 适当使用emoji增加可读性
4. 结尾要有互动引导
5. 标签要相关且热门

输出格式：
【标题】标题内容
【正文】正文内容
【标签】#标签1 #标签2 #标签3`

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: `请写一篇关于「${topic}」的小红书笔记` }],
        system: systemPrompt
      })
    })

    if (!response.ok) {
      console.log(`[生成失败] API 错误: ${response.status}`)
      return null
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text?.trim() || ''

    // 解析内容
    const titleMatch = raw.match(/【标题】(.+?)(?=【|$)/s)
    const contentMatch = raw.match(/【正文】(.+?)(?=【标签】|$)/s)
    const tagsMatch = raw.match(/【标签】(.+?)$/s)

    const title = titleMatch?.[1]?.trim() || topic
    const content = contentMatch?.[1]?.trim() || raw
    const tagsStr = tagsMatch?.[1]?.trim() || ''
    const tags = tagsStr.match(/#[^\s#]+/g) || [`#${category}`]

    return { title, content, tags }
  } catch (error) {
    console.log(`[生成失败] 异常: ${error}`)
    return null
  }
}

async function main() {
  console.log('=== 批量生成笔记 ===\n')

  // 检查 ComfyUI 服务
  console.log('检查 ComfyUI 服务状态...')
  const isHealthy = await checkComfyUIHealth()
  if (!isHealthy) {
    console.log('⚠️ ComfyUI 服务不可用，将跳过封面图生成')
  } else {
    console.log('✅ ComfyUI 服务在线')
  }

  // 获取当前各栏目文章数量
  const currentCounts = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM notes WHERE status='published'
    GROUP BY category
  `).all() as { category: string; count: number }[]

  const countMap: Record<string, number> = {}
  for (const row of currentCounts) {
    countMap[row.category] = row.count
  }

  console.log('\n当前文章数量:')
  for (const [cat, count] of Object.entries(countMap)) {
    console.log(`  ${cat}: ${count}`)
  }

  const TARGET_COUNT = 10 // 每个栏目目标数量
  let totalGenerated = 0
  let totalFailed = 0

  for (const [category, config] of Object.entries(TOPICS_BY_CATEGORY)) {
    const currentCount = countMap[category] || 0
    const needed = Math.max(0, TARGET_COUNT - currentCount)

    if (needed === 0) {
      console.log(`\n[${category}] 已有 ${currentCount} 篇，跳过`)
      continue
    }

    console.log(`\n[${category}] 需要生成 ${needed} 篇`)

    // 选择需要的话题
    const topicsToGenerate = config.topics.slice(0, needed)

    for (let i = 0; i < topicsToGenerate.length; i++) {
      const topic = topicsToGenerate[i]
      console.log(`  [${i + 1}/${needed}] ${topic.slice(0, 30)}...`)

      // 生成内容
      const noteData = await generateNoteContent(topic, config.creatorId, category)
      if (!noteData) {
        console.log(`    ❌ 内容生成失败`)
        totalFailed++
        continue
      }

      // 生成封面图
      let coverImage = null
      if (isHealthy) {
        const imageResult = await generateImage(noteData.title, category, 'cover')
        if (imageResult.success) {
          coverImage = imageResult.imageUrl
        }
      }

      // 保存到数据库
      const id = generateId()
      const likes = Math.floor(Math.random() * 5000) + 500
      const collects = Math.floor(Math.random() * 2000) + 100
      const views = Math.floor(Math.random() * 10000) + 1000

      db.prepare(`
        INSERT INTO notes (id, creator_id, title, content, category, tags, cover_image, likes, collects, views, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
      `).run(id, config.creatorId, noteData.title, noteData.content, category, JSON.stringify(noteData.tags), coverImage, likes, collects, views)

      console.log(`    ✅ 已保存: ${noteData.title.slice(0, 20)}...`)
      totalGenerated++

      // 延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log('\n=== 生成完成 ===')
  console.log(`成功: ${totalGenerated}`)
  console.log(`失败: ${totalFailed}`)

  // 显示最终统计
  const finalCounts = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM notes WHERE status='published'
    GROUP BY category
    ORDER BY category
  `).all() as { category: string; count: number }[]

  console.log('\n最终文章数量:')
  for (const row of finalCounts) {
    console.log(`  ${row.category}: ${row.count}`)
  }
}

main().catch(console.error)
