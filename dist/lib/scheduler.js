/**
 * 定时任务调度器
 * 管理热点抓取、自动生成、清理等定时任务
 */
import { crawlHotTopics, cleanExpiredTopics, getHotTopicStats } from './hot-topic-crawler.js';
import { processPendingTopics, getAutoGenerateStats } from './auto-generator.js';
import { cleanStaleAgents, cleanExpiredActions } from './db.js';
// 任务列表
const tasks = new Map();
// 调度器状态
let isSchedulerRunning = false;
let schedulerInterval = null;
/**
 * 注册定时任务
 */
function registerTask(name, interval, handler) {
    tasks.set(name, {
        name,
        interval,
        lastRun: 0,
        isRunning: false,
        handler
    });
}
/**
 * 执行单个任务
 */
async function runTask(task) {
    if (task.isRunning) {
        console.log(`[调度器] 任务 ${task.name} 正在运行中，跳过`);
        return;
    }
    const now = Date.now();
    if (now - task.lastRun < task.interval) {
        return;
    }
    task.isRunning = true;
    task.lastRun = now;
    try {
        console.log(`[调度器] 开始执行任务: ${task.name}`);
        await task.handler();
        console.log(`[调度器] 任务完成: ${task.name}`);
    }
    catch (error) {
        console.error(`[调度器] 任务失败: ${task.name}`, error.message);
    }
    finally {
        task.isRunning = false;
    }
}
/**
 * 调度器主循环
 */
async function schedulerLoop() {
    for (const task of tasks.values()) {
        await runTask(task);
    }
}
/**
 * 启动调度器
 */
export function startScheduler() {
    if (isSchedulerRunning) {
        console.log('[调度器] 调度器已在运行中');
        return;
    }
    console.log('[调度器] 启动定时任务调度器...');
    // 注册任务
    // 1. 热点抓取任务 - 每小时执行一次
    registerTask('crawl-hot-topics', 60 * 60 * 1000, async () => {
        const count = await crawlHotTopics();
        console.log(`[热点抓取] 新增 ${count} 个热点话题`);
    });
    // 2. 自动生成任务 - 每30分钟执行一次
    registerTask('auto-generate', 30 * 60 * 1000, async () => {
        const result = await processPendingTopics(3);
        console.log(`[自动生成] 成功: ${result.success}, 失败: ${result.failed}`);
    });
    // 3. 清理过期话题 - 每天凌晨执行一次
    registerTask('clean-expired', 24 * 60 * 60 * 1000, async () => {
        const count = cleanExpiredTopics();
        console.log(`[清理任务] 清理了 ${count} 个过期话题`);
    });
    // 4. 清理超时 Agent - 每10分钟执行一次
    registerTask('clean-stale-agents', 10 * 60 * 1000, async () => {
        cleanStaleAgents();
    });
    // 5. 清理过期操作日志 - 每天执行一次
    registerTask('clean-expired-actions', 24 * 60 * 60 * 1000, async () => {
        cleanExpiredActions();
    });
    // 启动调度循环（每分钟检查一次）
    schedulerInterval = setInterval(schedulerLoop, 60 * 1000);
    isSchedulerRunning = true;
    // 立即执行一次热点抓取
    const crawlTask = tasks.get('crawl-hot-topics');
    if (crawlTask) {
        runTask(crawlTask);
    }
    console.log('[调度器] 调度器启动完成');
}
/**
 * 停止调度器
 */
export function stopScheduler() {
    if (!isSchedulerRunning) {
        console.log('[调度器] 调度器未在运行');
        return;
    }
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
    isSchedulerRunning = false;
    console.log('[调度器] 调度器已停止');
}
/**
 * 手动触发任务
 */
export async function triggerTask(taskName) {
    const task = tasks.get(taskName);
    if (!task) {
        console.log(`[调度器] 任务不存在: ${taskName}`);
        return false;
    }
    // 重置上次运行时间，强制执行
    task.lastRun = 0;
    await runTask(task);
    return true;
}
/**
 * 获取调度器状态
 */
export function getSchedulerStatus() {
    return {
        isRunning: isSchedulerRunning,
        tasks: Array.from(tasks.values()).map(t => ({
            name: t.name,
            interval: t.interval,
            lastRun: t.lastRun,
            isRunning: t.isRunning
        })),
        stats: {
            hotTopics: getHotTopicStats(),
            autoGenerate: getAutoGenerateStats()
        }
    };
}
/**
 * 获取可用的任务列表
 */
export function getAvailableTasks() {
    return Array.from(tasks.keys());
}
