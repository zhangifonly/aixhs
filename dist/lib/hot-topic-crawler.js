/**
 * 热点话题爬虫模块
 * 抓取小红书热搜话题，支持模拟数据和真实爬虫
 */
import { db, generateId } from './db.js';
// 模拟热点话题数据（参考真实小红书热搜风格）
const MOCK_HOT_TOPICS = {
    beauty: [
        '黄黑皮逆袭冷白皮的秘密',
        '烂脸急救指南亲测有效',
        '毛孔粗大这样做真的会变小',
        '素颜霜测评谁才是真伪素颜',
        '眼霜到底有没有用',
        '油痘肌的护肤顺序你搞对了吗',
        '防晒霜搓泥是什么原因',
        '敏感肌红血丝修复全攻略',
        '美白精华到底怎么选',
        '护肤品搭配禁忌千万别踩雷',
        '情人节约会妆容教程手把手教',
        '开学季学生党平价护肤清单',
        '春季换季维稳护肤攻略',
        '早春敏感肌急救方案',
        '节后熬夜脸急救三步走'
    ],
    fashion: [
        '今年流行的多巴胺穿搭',
        '155小个子逆袭穿搭模板',
        '通勤穿搭不踩雷指南',
        '微胖女生夏天怎么穿显瘦',
        '一衣多穿省钱又时髦',
        '梨形身材的救星裤子',
        '这几个颜色显白又高级',
        '优衣库隐藏款必入清单',
        '职场穿搭高级感秘诀',
        '约会穿搭男生视角',
        '情人节约会穿搭甜而不腻',
        '早春穿搭叠穿技巧大全',
        '开学季校园穿搭灵感',
        '春节走亲戚得体穿搭',
        '新年开运红色穿搭合集'
    ],
    food: [
        '这家店排队2小时值不值',
        '网红餐厅避雷实测',
        '一人食也要好好吃饭',
        '减脂餐这样做好吃不胖',
        '空气炸锅万物皆可炸',
        '便利店隐藏吃法大公开',
        '自制奶茶比外面好喝',
        '懒人电饭煲焖饭食谱',
        '深夜食堂治愈系美食',
        '打工人带饭一周不重样',
        '情人节在家做烛光晚餐',
        '元宵节汤圆创意吃法',
        '春节剩菜花式改造',
        '开学季宿舍神器美食',
        '节后清肠刮油食谱'
    ],
    travel: [
        '人少景美的小众旅行地',
        '三亚怎么玩才不踩坑',
        '穷游党省钱攻略大全',
        '拍照出片的宝藏机位',
        '周末两天一夜去哪玩',
        '云南旅行最全攻略',
        '日本自由行避坑指南',
        '海边度假穿搭拍照',
        'citywalk路线推荐',
        '露营装备清单新手必看',
        '情人节浪漫旅行目的地',
        '春节错峰游最佳去处',
        '早春赏花路线推荐',
        '开学前最后的旅行清单',
        '元宵灯会打卡攻略'
    ],
    home: [
        '出租屋改造花500变高级',
        '收纳整理后家里大了一倍',
        '宜家必买清单实测',
        '租房党也能拥有氛围感',
        '小户型显大的秘密',
        '厨房收纳神器推荐',
        '提升幸福感的家居好物',
        '卫生间清洁小妙招',
        '香薰蜡烛测评合集',
        '懒人打扫卫生攻略',
        '情人节房间布置浪漫氛围',
        '春节大扫除收纳攻略',
        '开学季宿舍改造指南',
        '新年换新家居焕新清单',
        '早春家居换季整理术'
    ],
    fitness: [
        '帕梅拉跟练一个月变化',
        '腰腹赘肉这样练真的会瘦',
        '体态矫正每天10分钟',
        '新手健身房器械使用指南',
        '减脂期怎么吃不掉肌肉',
        '久坐族拉伸动作合集',
        '跑步膝盖疼怎么办',
        '居家无器械全身训练',
        '增肌餐食谱分享',
        '运动后拉伸很重要',
        '春节胖了怎么快速瘦回来',
        '节后减脂计划21天挑战',
        '开学季校园跑步打卡',
        '情人节前紧急瘦身攻略',
        '早春户外跑步注意事项'
    ],
    tech: [
        'iPhone16到底值不值得买',
        '平板选iPad还是华为',
        '千元机性价比之王',
        '蓝牙耳机横评谁是王者',
        '提升效率的App推荐',
        '手机摄影隐藏功能',
        '机械键盘入坑指南',
        '显示器怎么选不踩雷',
        '智能家居入门推荐',
        '数码产品以旧换新攻略',
        '开学季学生平板怎么选',
        '新年数码好物清单',
        '春节送长辈什么数码产品',
        '情人节数码礼物推荐',
        '节后二手数码捡漏攻略'
    ],
    study: [
        '考研上岸学姐经验分享',
        '雅思7分备考方法',
        '高效背单词的秘诀',
        '考公上岸时间规划',
        '自律的人都在用的方法',
        '专注力训练每天5分钟',
        '笔记整理方法论',
        '图书馆学习vlog',
        '时间管理四象限法则',
        '学习博主的一天',
        '开学季新学期学习计划',
        '寒假弯道超车学习法',
        '春招简历准备攻略',
        '考研复试经验分享',
        '新学期书单推荐'
    ],
    movie: [
        '最近超火的国产剧推荐',
        '甜宠剧合集甜到齁',
        '悬疑剧高能反转盘点',
        '周末宅家必看电影',
        '综艺名场面笑死我了',
        '韩剧男主颜值天花板',
        '国产电影年度最佳',
        '追剧清单更新啦',
        '这部剧真的被低估了',
        '影视剧穿搭学起来',
        '情人节必看爱情电影',
        '春节档电影哪部值得看',
        '开年最火的剧你追了吗',
        '元宵节适合全家看的电影',
        '春节假期追剧清单'
    ],
    career: [
        '面试被问离职原因怎么答',
        '职场新人必知的潜规则',
        '简历这样写HR秒回',
        '跳槽涨薪的正确姿势',
        '领导PUA的几种表现',
        '副业搞钱真实经历',
        '裸辞三个月的感悟',
        '职场沟通话术大全',
        '年终总结模板分享',
        '打工人的精神状态',
        '春招求职避坑指南',
        '节后跳槽黄金期攻略',
        '新年职场目标怎么定',
        '开学季实习面试技巧',
        '年后第一周如何快速进入状态'
    ],
    emotion: [
        '分手后复合的几种情况',
        '异地恋真的很难吗',
        '恋爱脑怎么治',
        '单身久了是什么体验',
        '原生家庭的影响有多大',
        '如何判断他是否喜欢你',
        '情绪价值到底是什么',
        '社恐人的日常',
        '治愈系文案合集',
        '独居女生的安全感',
        '情人节单身狗自救指南',
        '情人节送什么礼物不踩雷',
        '春节被催婚怎么应对',
        '异地恋情人节怎么过',
        '新年新恋情脱单攻略'
    ],
    baby: [
        '新生儿必备清单不踩雷',
        '宝宝辅食添加时间表',
        '哄睡神器真的有用吗',
        '母乳喂养常见问题',
        '婴儿车怎么选',
        '宝宝湿疹护理方法',
        '早教到底有没有必要',
        '二胎妈妈的崩溃日常',
        '产后恢复黄金期',
        '宝宝睡眠训练方法',
        '春节带娃出行攻略',
        '开学季幼儿园入园准备',
        '春季宝宝过敏怎么办',
        '节后宝宝作息调整方法',
        '情人节宝妈也要爱自己'
    ],
    pet: [
        '养猫一个月花多少钱',
        '猫粮测评避雷指南',
        '猫咪行为解读大全',
        '新手养猫必看攻略',
        '猫主子的迷惑行为',
        '狗狗训练基础教程',
        '宠物医院怎么选',
        '猫咪驱虫全攻略',
        '养宠物后的变化',
        '铲屎官的快乐日常',
        '春节寄养宠物注意事项',
        '春季宠物换毛期护理',
        '情人节和毛孩子的合照',
        '开学了宠物独自在家怎么办',
        '节后宠物分离焦虑怎么缓解'
    ],
    music: [
        '单曲循环停不下来的歌',
        '深夜emo歌单',
        '治愈系纯音乐推荐',
        '学习工作BGM',
        '小众宝藏歌手安利',
        '演唱会现场超燃',
        '翻唱比原唱还好听',
        '适合开车听的歌',
        '失恋必听歌单',
        '粤语歌入坑指南',
        '情人节浪漫歌单合集',
        '春节年味BGM推荐',
        '开学季元气满满歌单',
        '新年第一首歌听什么',
        '适合春天听的清新歌单'
    ],
    dance: [
        '零基础学舞蹈从哪开始',
        '超火韩舞教程分解',
        '跳舞减肥真的有效',
        '古典舞身韵练习',
        '街舞入门动作教学',
        '舞蹈生的日常训练',
        '婚礼舞蹈速成',
        '广场舞也可以很酷',
        '舞蹈室穿搭分享',
        '跳舞前热身很重要',
        '情人节双人舞教程',
        '春节联欢舞蹈节目排练',
        '开学季舞蹈社团招新',
        '春天适合跳的活力舞蹈',
        '新年第一支舞挑战'
    ],
    photo: [
        '手机拍照参数设置',
        '修图调色教程保姆级',
        '拍照姿势大全收藏',
        '人像摄影布光技巧',
        '风景照怎么拍好看',
        '证件照自己在家拍',
        '相机入门推荐',
        '后期修图软件对比',
        '氛围感照片怎么拍',
        '旅行拍照必备技巧',
        '情人节情侣照怎么拍',
        '春节全家福拍摄技巧',
        '早春花海拍照攻略',
        '开学季校园写真教程',
        '新年烟花怎么拍好看'
    ],
    game: [
        '原神新版本攻略',
        '王者荣耀上分技巧',
        '手游氪金值不值',
        '治愈系游戏推荐',
        '和平精英吃鸡攻略',
        'Steam夏促必买清单',
        '独立游戏宝藏推荐',
        '游戏搭子怎么找',
        '电竞酒店体验测评',
        '新游首发测评',
        '春节和家人一起玩的游戏',
        '情人节双人游戏推荐',
        '开学前最后的肝游戏时间',
        '新年新游戏愿望清单',
        '节后上班摸鱼小游戏'
    ],
    wellness: [
        '八段锦每天15分钟身体变化',
        '中药奶茶配方自己在家做',
        '泡脚加什么料效果最好',
        '艾灸入门新手必看',
        '节气养生食谱大全',
        '年轻人的养生朋克指南',
        '失眠怎么办中医调理方法',
        '湿气重的表现和祛湿方法',
        '养生茶搭配不踩雷',
        '体质自测你是什么体质',
        '春节大吃大喝后如何调理',
        '早春养肝最佳时节',
        '情人节养生甜品DIY',
        '节后肠胃不适中医调理',
        '开学季提神醒脑养生茶'
    ],
    mental: [
        'MBTI各类型深度解析',
        '5分钟冥想入门教程',
        '情绪管理的实用技巧',
        '社交焦虑怎么克服',
        '原生家庭创伤如何疗愈',
        '高敏感人群的自我保护',
        '拖延症的心理学解释',
        '如何建立健康的边界感',
        '正念呼吸练习跟做',
        '心理咨询到底有没有用',
        '节后上班焦虑怎么缓解',
        '春节社交恐惧应对指南',
        '情人节单身焦虑如何自处',
        '新年目标总完不成的心理原因',
        '开学季适应焦虑调节方法'
    ],
    finance: [
        '月薪5000怎么存下钱',
        '记账一年我存了多少钱',
        '基金定投入门指南',
        '年轻人第一份保险怎么买',
        '消费降级后生活质量反而高了',
        '理财小白避坑指南',
        '存钱挑战52周存钱法',
        '信用卡薅羊毛攻略',
        '副业收入超过主业的经历',
        '记账App哪个好用',
        '春节红包理财小技巧',
        '新年理财目标怎么定',
        '节后钱包空了怎么回血',
        '情人节省钱又有心意的礼物',
        '开学季学生党省钱攻略'
    ],
    car: [
        '女生第一辆车怎么选',
        '新能源车真实使用体验',
        '10万以内最值得买的车',
        '自驾游必备清单',
        '新手停车技巧图解',
        '车内必备好物推荐',
        '洗车养护省钱攻略',
        '驾照科目二一把过经验',
        '电车冬天续航实测',
        '二手车怎么买不被坑',
        '春节自驾回家路线规划',
        '节后车辆保养检查清单',
        '情人节车内布置浪漫氛围',
        '早春自驾赏花路线推荐',
        '开学季校园周边停车攻略'
    ],
    outdoor: [
        '新手露营装备清单',
        '周末徒步路线推荐',
        '骑行入坑指南',
        '滑雪新手必看攻略',
        '钓鱼入门装备推荐',
        '户外穿搭功能与颜值兼顾',
        '帐篷怎么选不踩雷',
        '登山杖有必要买吗',
        '户外急救知识必备',
        '越野跑和公路跑的区别',
        '早春徒步赏花路线',
        '春节户外亲子活动推荐',
        '情人节户外约会好去处',
        '节后户外运动恢复计划',
        '开学季户外社团推荐'
    ],
    handmade: [
        '手账排版灵感合集',
        '编织入门从围巾开始',
        '滴胶手作新手教程',
        '黏土手办制作过程',
        '刺绣入门针法教学',
        '手工香薰蜡烛DIY',
        '干花书签制作教程',
        '毛线编织包包教程',
        '手账胶带收纳方法',
        '木工入门工具推荐',
        '情人节手工礼物DIY教程',
        '新年手账封面设计',
        '春节手工红包制作',
        '早春押花手作教程',
        '开学季手账本推荐'
    ],
    culture: [
        '书法入门从哪种字体开始',
        '新中式茶道入门指南',
        '汉服入坑第一套怎么选',
        '非遗手艺体验推荐',
        '国潮好物推荐清单',
        '古风妆造教程',
        '中式插花美学',
        '传统节日习俗科普',
        '焚香品茗的仪式感',
        '新中式家居美学',
        '元宵节传统习俗你知道几个',
        '春节写春联书法教程',
        '情人节中式浪漫表达',
        '新年汉服拜年穿搭',
        '早春茶道品春茶指南'
    ],
    ai: [
        'AI绘画入门零基础教程',
        'ChatGPT实用技巧大全',
        'AI修图一键变大片',
        'Midjourney提示词攻略',
        'AI写作工具对比测评',
        'AI视频生成太震撼了',
        'Prompt工程师是什么',
        'AI配音工具推荐',
        'AI做PPT效率翻倍',
        'Sora文生视频体验',
        'AI生成情人节贺卡教程',
        '用AI制作新年祝福视频',
        'AI帮你写开学计划',
        '春节用AI生成全家福',
        '2026最值得关注的AI工具'
    ]
};
/**
 * 获取模拟热点话题
 */
function getMockHotTopics() {
    const topics = [];
    // 从每个分类随机选取话题
    for (const [category, categoryTopics] of Object.entries(MOCK_HOT_TOPICS)) {
        // 随机选取 1-3 个话题
        const count = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...categoryTopics].sort(() => Math.random() - 0.5);
        for (let i = 0; i < count && i < shuffled.length; i++) {
            topics.push({
                title: shuffled[i],
                category,
                heat_score: Math.floor(Math.random() * 10000) + 1000
            });
        }
    }
    // 按热度排序
    return topics.sort((a, b) => b.heat_score - a.heat_score);
}
/**
 * 抓取热点话题（模拟版本）
 * 实际生产环境需要替换为真实爬虫
 */
export async function crawlHotTopics() {
    console.log('[热点爬虫] 开始抓取热点话题...');
    const topics = getMockHotTopics();
    let newCount = 0;
    for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        // 检查是否已存在相似话题（24小时内）
        const existing = db.prepare(`
      SELECT id FROM hot_topics
      WHERE title = ?
      AND created_at > datetime('now', '-24 hours')
    `).get(topic.title);
        if (existing) {
            continue;
        }
        // 插入新话题
        const id = generateId();
        db.prepare(`
      INSERT INTO hot_topics (id, title, source, category, heat_score, rank, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, topic.title, 'xiaohongshu', topic.category, topic.heat_score, i + 1, 'pending');
        newCount++;
    }
    console.log(`[热点爬虫] 抓取完成，新增 ${newCount} 个话题`);
    return newCount;
}
/**
 * 获取待处理的热点话题
 */
export function getPendingTopics(limit = 10) {
    return db.prepare(`
    SELECT * FROM hot_topics
    WHERE status = 'pending'
    ORDER BY heat_score DESC, created_at DESC
    LIMIT ?
  `).all(limit);
}
/**
 * 获取热点话题列表
 */
export function getHotTopics(options) {
    const { status, category, limit = 20, offset = 0 } = options || {};
    let sql = 'SELECT * FROM hot_topics WHERE 1=1';
    const params = [];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    if (category) {
        sql += ' AND category = ?';
        params.push(category);
    }
    sql += ' ORDER BY heat_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
}
/**
 * 获取单个热点话题
 */
export function getHotTopic(id) {
    return db.prepare('SELECT * FROM hot_topics WHERE id = ?').get(id);
}
/**
 * 更新热点话题状态
 */
export function updateHotTopicStatus(id, status, noteId, errorMessage) {
    if (status === 'published' && noteId) {
        db.prepare(`
      UPDATE hot_topics
      SET status = ?, note_id = ?, processed_at = datetime('now')
      WHERE id = ?
    `).run(status, noteId, id);
    }
    else if (status === 'failed' && errorMessage) {
        db.prepare(`
      UPDATE hot_topics
      SET status = ?, error_message = ?, processed_at = datetime('now')
      WHERE id = ?
    `).run(status, errorMessage, id);
    }
    else {
        db.prepare('UPDATE hot_topics SET status = ? WHERE id = ?').run(status, id);
    }
}
/**
 * 清理过期热点（超过7天）
 */
export function cleanExpiredTopics() {
    const result = db.prepare(`
    DELETE FROM hot_topics
    WHERE created_at < datetime('now', '-7 days')
    AND status != 'published'
  `).run();
    return result.changes;
}
/**
 * 获取热点统计
 */
export function getHotTopicStats() {
    const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'generating' THEN 1 ELSE 0 END) as generating,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM hot_topics
    WHERE created_at > datetime('now', '-24 hours')
  `).get();
    return {
        total: stats.total || 0,
        pending: stats.pending || 0,
        generating: stats.generating || 0,
        published: stats.published || 0,
        failed: stats.failed || 0
    };
}
