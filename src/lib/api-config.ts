/**
 * API 配置模块
 * 统一管理所有 API 配置，支持环境变量覆盖
 */

// Claude API 配置
export const CLAUDE_API = {
  apiKey: process.env.CLAUDE_API_KEY || 'sk-5RrW7Av0blv4KUCN4GUcksk3XohCf4u35s7bWgesLHY8n1VI',
  baseURL: process.env.CLAUDE_BASE_URL || 'https://zjz-ai.webtrn.cn',
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'
}

// ComfyUI 配置
export const COMFYUI_CONFIG = {
  host: process.env.COMFYUI_HOST || '192.168.193.188',
  port: parseInt(process.env.COMFYUI_PORT || '8188'),
  timeout: parseInt(process.env.COMFYUI_TIMEOUT || '120000')
}

export const COMFYUI_URL = `http://${COMFYUI_CONFIG.host}:${COMFYUI_CONFIG.port}`
