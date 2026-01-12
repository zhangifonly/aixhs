/**
 * 话题匹配器
 * 根据用户输入的话题，匹配最相关的板块和细分话题
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface SubTopic {
  id: string
  name: string
  keywords: string[]
  specificTips: string
  seasonality: string
}

export interface CategoryProfile {
  id: string
  name: string
  icon: string
  nickname: string
  readerPsychology: {
    coreNeeds: string[]
    likesToSee: string[]
    dislikesToSee: string[]
    triggerPoints: string[]
    trustSignals: string[]
  }
  writingStrategy: {
    titleFormulas: string[]
    openingStyles: string[]
    contentStructure: string
    closingTips: string
    visualSuggestions: string[]
  }
  exampleTitles: string[]
  exampleParagraphs: { text: string; why: string }[]
  taboos: string[]
  subTopics: SubTopic[]
  seasonalTopics: {
    spring: string[]
    summer: string[]
    autumn: string[]
    winter: string[]
  }
}

// 缓存
let categoryProfiles: CategoryProfile[] | null = null

/**
 * 加载板块画像配置
 */
export function loadCategoryProfiles(): CategoryProfile[] {
  if (categoryProfiles) return categoryProfiles

  const path = join(__dirname, '../../data/category-profiles.json')
  categoryProfiles = JSON.parse(readFileSync(path, 'utf-8'))
  return categoryProfiles!
}

/**
 * 获取当前季节
 */
export function getCurrentSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/**
 * 计算话题与关键词的匹配分数
 */
function calculateMatchScore(topic: string, keywords: string[]): number {
  const topicLower = topic.toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase()
    if (topicLower.includes(keywordLower)) {
      // 完全包含关键词，加分
      score += 10
      // 如果关键词在开头或结尾，额外加分
      if (topicLower.startsWith(keywordLower) || topicLower.endsWith(keywordLower)) {
        score += 5
      }
    }
  }

  return score
}

/**
 * 匹配最相关的板块
 */
export function matchCategory(topic: string): CategoryProfile | null {
  const profiles = loadCategoryProfiles()
  let bestMatch: CategoryProfile | null = null
  let bestScore = 0

  for (const profile of profiles) {
    let score = 0

    // 检查板块名称
    if (topic.includes(profile.name) || topic.includes(profile.nickname)) {
      score += 20
    }

    // 检查所有细分话题的关键词
    for (const subTopic of profile.subTopics) {
      score += calculateMatchScore(topic, subTopic.keywords)
    }

    // 检查触发词
    score += calculateMatchScore(topic, profile.readerPsychology.triggerPoints)

    if (score > bestScore) {
      bestScore = score
      bestMatch = profile
    }
  }

  return bestMatch
}

/**
 * 匹配最相关的细分话题
 */
export function matchSubTopic(topic: string, categoryId?: string): SubTopic | null {
  const profiles = loadCategoryProfiles()
  let bestMatch: SubTopic | null = null
  let bestScore = 0

  const categoriesToSearch = categoryId
    ? profiles.filter(p => p.id === categoryId)
    : profiles

  for (const profile of categoriesToSearch) {
    for (const subTopic of profile.subTopics) {
      const score = calculateMatchScore(topic, subTopic.keywords)

      // 季节性加分
      const currentSeason = getCurrentSeason()
      if (subTopic.seasonality === currentSeason || subTopic.seasonality === 'all') {
        // 当季话题额外加分
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = subTopic
      }
    }
  }

  return bestMatch
}

/**
 * 获取板块的当季热门话题
 */
export function getSeasonalTopics(categoryId: string): string[] {
  const profiles = loadCategoryProfiles()
  const profile = profiles.find(p => p.id === categoryId)

  if (!profile) return []

  const season = getCurrentSeason()
  return profile.seasonalTopics[season] || []
}

/**
 * 获取板块的所有细分话题
 */
export function getSubTopics(categoryId: string): SubTopic[] {
  const profiles = loadCategoryProfiles()
  const profile = profiles.find(p => p.id === categoryId)

  return profile?.subTopics || []
}

/**
 * 根据ID获取板块画像
 */
export function getCategoryProfile(categoryId: string): CategoryProfile | null {
  const profiles = loadCategoryProfiles()
  return profiles.find(p => p.id === categoryId) || null
}

/**
 * 获取所有板块列表
 */
export function getAllCategories(): { id: string; name: string; icon: string }[] {
  const profiles = loadCategoryProfiles()
  return profiles.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon
  }))
}
