/**
 * 批量生成文章脚本
 * 基于真实小红书热门话题，为8个栏目各生成10+篇文章
 */

import { db, generateId } from '../src/lib/db.js'
import { generateNoteStream, parseNoteContent, saveNote } from '../src/lib/note-writer.js'

// 8个栏目的文章策划（基于小红书真实热门话题）
const articlePlans: Record<string, { creatorId: string; topics: string[] }> = {
  // 美妆护肤 - 博主：小美酱
  beauty: {
    creatorId: 'xiaomei',
    topics: [
      // 冬季护肤
      '冬季嘴唇干裂起皮？这个方法3天见效',
      '黄黑皮逆袭！这个美白方法让我白了2个度',
      '毛孔粗大有救了！亲测有效的收缩毛孔方法',
      '敏感肌换季必看！修复屏障我只认这3瓶',
      '早C晚A正确用法｜新手避坑指南',
      '30+姐姐抗老必看｜这些成分真的有用',
      '学生党平价护肤｜全套不超过200元',
      '痘印怎么消？我用了2个月终于淡了',
      '眼霜到底有没有用？成分党来分析',
      '冬天底妆卡粉起皮？这样做服帖一整天',
      '素颜也能发光！我的护肤全记录',
      '回购10次的5款平价精华推荐',
    ]
  },

  // 穿搭时尚 - 博主：穿搭日记
  fashion: {
    creatorId: 'chuanda',
    topics: [
      // 冬季穿搭
      '羽绒服怎么穿不臃肿？这5个技巧太绝了',
      '小个子冬季穿搭｜155也能穿出170既视感',
      '微胖女生冬季显瘦穿搭｜遮肉又时髦',
      '老钱风穿搭公式｜低调有质感',
      '美拉德色系搭配｜今年最火的大地色穿搭',
      '通勤穿搭一周不重样｜上班族必看',
      '约会穿搭｜冬日氛围感满满',
      '大衣+阔腿裤｜显瘦显高的万能公式',
      '学生党平价穿搭｜全身不过百',
      '针织衫叠穿技巧｜保暖又时髦',
      '冬季配饰搭配｜围巾帽子怎么选',
      '显白穿搭｜黄黑皮避雷这些颜色',
    ]
  },

  // 美食探店 - 博主：吃货小分队
  food: {
    creatorId: 'chihuo',
    topics: [
      // 冬季美食
      '人均50吃到撑！这家火锅太绝了',
      '冬天必吃的10种暖身美食',
      '一个人也要好好吃饭｜独居快手菜',
      '空气炸锅神仙食谱｜懒人必备',
      '减脂期也能吃的低卡美食',
      '年夜饭菜单｜简单又有面子',
      '早餐这样做｜营养又快手',
      '自制奶茶｜比外面买的还好喝',
      '烤红薯的100种吃法',
      '冬日暖心甜品｜在家就能做',
      '火锅蘸料调配｜这个比例绝了',
      '宵夜推荐｜深夜放毒系列',
    ]
  },

  // 旅行攻略 - 博主：旅行青蛙
  travel: {
    creatorId: 'lvxing',
    topics: [
      // 冬季旅行
      '哈尔滨冰雪大世界攻略｜人均2000玩3天',
      '云南冬季旅行｜避开人潮的小众路线',
      '新疆滑雪攻略｜南方人第一次看雪',
      '西双版纳5天4晚｜冬天也能穿短袖',
      '厦门3天2晚｜文艺小清新之旅',
      '成都美食之旅｜吃货必打卡的20家店',
      '日本冬季旅行｜泡温泉看雪景',
      '泰国普吉岛｜冬天去海岛躲避寒冷',
      '周末游推荐｜2天1夜说走就走',
      '拍照打卡攻略｜这些地方出片率超高',
      '穷游攻略｜人均1000玩转周边',
      '春节旅行推荐｜避开人潮的好去处',
    ]
  },

  // 家居生活 - 博主：居家生活家
  home: {
    creatorId: 'jujia',
    topics: [
      // 冬季家居
      '出租屋改造｜500块打造温馨小窝',
      '冬季取暖好物｜这些真的暖和',
      '厨房收纳神器｜小空间大容量',
      '卧室氛围感布置｜睡眠质量提升',
      '浴室收纳｜免打孔置物架推荐',
      '断舍离实践｜扔掉这些东西生活更轻松',
      '香薰蜡烛推荐｜让家里香香的',
      '绿植养护｜冬天也能养活的植物',
      '床品推荐｜睡过最舒服的四件套',
      '小家电推荐｜提升幸福感的好物',
      '衣柜收纳｜换季衣服这样整理',
      '年末大扫除｜清洁技巧分享',
    ]
  },

  // 健身运动 - 博主：健身打卡
  fitness: {
    creatorId: 'jianshen',
    topics: [
      // 冬季健身
      '帕梅拉一周暴汗计划｜亲测掉秤5斤',
      '居家健身｜不用器械也能练',
      '新手减脂入门｜从0开始的健身指南',
      '腹肌训练｜每天10分钟练出马甲线',
      '臀腿训练｜蜜桃臀养成记',
      '体态矫正｜告别驼背圆肩',
      '跑步入门｜从3公里到10公里',
      '减脂饮食｜吃对了才能瘦',
      '冬天不想动？这些运动在家就能做',
      '健身打卡30天｜身材变化对比',
      '拉伸放松｜运动后必做的动作',
      '增肌餐食谱｜高蛋白低脂肪',
    ]
  },

  // 数码科技 - 博主：数码测评君
  tech: {
    creatorId: 'shuma',
    topics: [
      // 数码测评
      'iPhone 16 Pro 三个月真实体验',
      '华为Mate 70深度测评｜值不值得买',
      '小米15对比iPhone｜谁更值得入手',
      '2024年最值得买的5款手机',
      'MacBook选购指南｜M3芯片怎么选',
      'iPad学习党必看｜生产力还是爱奇艺',
      '降噪耳机横评｜AirPods vs 索尼',
      '学生党笔记本推荐｜5000元档位',
      '游戏本选购｜性价比之王推荐',
      '数码好物推荐｜提升效率的配件',
      '手机摄影技巧｜拍出大片感',
      '充电宝推荐｜出门必备的续航神器',
    ]
  },

  // 学习成长 - 博主：学习委员
  study: {
    creatorId: 'xuexi',
    topics: [
      // 学习成长
      '考研上岸经验｜一战985的备考方法',
      '考公上岸｜行测申论复习技巧',
      '英语学习｜从四级到雅思7分',
      '时间管理｜高效学习的一天',
      '自律养成｜21天习惯养成计划',
      '读书笔记｜这本书改变了我的思维',
      '副业赚钱｜下班后的第二收入',
      'Excel技巧｜职场必备的10个公式',
      'PPT制作｜让你的汇报更专业',
      '面试技巧｜如何拿到心仪offer',
      '简历优化｜HR眼中的好简历',
      '新年计划｜2025年目标制定',
    ]
  }
}

// 生成单篇文章
async function generateArticle(creatorId: string, topic: string, categoryId: string): Promise<boolean> {
  console.log(`  生成: ${topic}`)

  try {
    let fullContent = ''
    const generator = generateNoteStream(creatorId, topic, { categoryId })

    for await (const chunk of generator) {
      if (chunk.type === 'text') {
        fullContent += chunk.content
      } else if (chunk.type === 'error') {
        console.log(`    ❌ API错误: ${chunk.content}`)
        return false
      }
    }

    if (!fullContent) {
      console.log(`    ❌ 内容为空`)
      return false
    }

    // 解析内容
    const parsed = parseNoteContent(fullContent)

    // 保存到数据库
    const noteId = saveNote(
      creatorId,
      parsed.title || topic,
      parsed.content,
      categoryId,
      parsed.tags
    )

    console.log(`    ✅ 已保存: ${noteId}`)
    return true
  } catch (error) {
    console.log(`    ❌ 失败: ${error}`)
    return false
  }
}

// 主函数
async function main() {
  console.log('=== 批量生成文章 ===\n')
  console.log('基于小红书真实热门话题，为8个栏目生成内容\n')

  const stats = {
    total: 0,
    success: 0,
    failed: 0
  }

  for (const [categoryId, plan] of Object.entries(articlePlans)) {
    console.log(`\n📁 ${categoryId} (${plan.topics.length}篇)`)
    console.log('─'.repeat(40))

    for (const topic of plan.topics) {
      stats.total++
      const success = await generateArticle(plan.creatorId, topic, categoryId)
      if (success) {
        stats.success++
      } else {
        stats.failed++
      }

      // 短暂延迟，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('\n' + '='.repeat(40))
  console.log('生成完成!')
  console.log(`总计: ${stats.total}`)
  console.log(`成功: ${stats.success}`)
  console.log(`失败: ${stats.failed}`)
}

main().catch(console.error)
