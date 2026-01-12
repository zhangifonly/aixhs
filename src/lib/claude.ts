/**
 * Claude API 流式调用模块
 */

import { randomUUID } from 'crypto'

const CLAUDE_CODE_FAKE = {
  userAgent: 'claude-cli/2.0.69 (external, cli)',
  headers: {
    'x-app': 'cli',
    'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14',
    'anthropic-version': '2023-06-01',
  },
}

const STAINLESS_HEADERS = {
  'X-Stainless-Lang': 'js',
  'X-Stainless-Package-Version': '0.75.0',
  'X-Stainless-OS': 'Darwin',
  'X-Stainless-Arch': 'arm64',
  'X-Stainless-Runtime': 'node',
  'X-Stainless-Runtime-Version': '20.0.0',
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  apiKey: string
  baseURL?: string
  model?: string
  systemPrompt?: string
  maxTokens?: number
}

function generateUserId(): string {
  const hash = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
  return `user_${hash}_account__session_${randomUUID()}`
}

export async function* createChatStream(
  messages: Message[],
  options: ChatOptions
): AsyncGenerator<{ type: string; content: string }> {
  const {
    apiKey,
    baseURL = 'https://api.anthropic.com',
    model = 'claude-sonnet-4-5-20250929',
    systemPrompt = '你是一个小红书博主',
    maxTokens = 4096,
  } = options

  const apiUrl = `${baseURL.replace(/\/$/, '')}/v1/messages`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': CLAUDE_CODE_FAKE.userAgent,
    Authorization: `Bearer ${apiKey}`,
    ...CLAUDE_CODE_FAKE.headers,
    ...STAINLESS_HEADERS,
  }

  const requestBody = {
    model,
    max_tokens: maxTokens,
    stream: true,
    system: [{ type: 'text', text: systemPrompt }],
    messages,
    metadata: { user_id: generateUserId() },
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      yield { type: 'error', content: `API 错误: ${errorText}` }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', content: '无法获取响应流' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data:')) continue
        const dataStr = line.slice(5).trim()
        if (dataStr === '[DONE]') break

        try {
          const data = JSON.parse(dataStr)
          if (data.type === 'content_block_delta') {
            const delta = data.delta
            if (delta?.type === 'text_delta' && delta.text) {
              yield { type: 'text', content: delta.text }
            }
          } else if (data.type === 'message_stop') {
            break
          }
        } catch {}
      }
    }
    yield { type: 'done', content: '' }
  } catch (error) {
    yield { type: 'error', content: error instanceof Error ? error.message : '未知错误' }
  }
}
