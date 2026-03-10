import OpenAI from 'openai'
import type { ChatContentItem, ChatRequest, SemanticChatClient } from './types'

export function createCustomEndpointClient(input: {
  apiKey: string
  serverURL: string
  getTimeoutMs: () => number
}): SemanticChatClient {
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.serverURL,
    maxRetries: 0,
  })

  return {
    chat: {
      send: async (request: ChatRequest): Promise<unknown> => {
        try {
          return await client.chat.completions.create(
            {
              model: request.model,
              messages: request.messages.map((message) => ({
                role: message.role,
                content: message.content.map((item) => mapContentItem(item)),
              })),
            } as never,
            {
              timeout: input.getTimeoutMs(),
              maxRetries: 0,
            },
          )
        } catch (error) {
          throw enrichOpenAIError(error)
        }
      },
    },
  }
}

function mapContentItem(item: ChatContentItem): Record<string, unknown> {
  switch (item.type) {
    case 'text':
      return {
        type: 'text',
        text: item.text,
      }
    case 'image_url':
      return {
        type: 'image_url',
        image_url: {
          url: item.imageUrl.url,
          detail: item.imageUrl.detail,
        },
      }
    case 'input_video':
      return {
        type: 'input_video',
        video_url: {
          url: item.videoUrl.url,
        },
      }
  }
}

function enrichOpenAIError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error))
  }

  const details = extractOpenAIErrorDetails(error)
  if (!details) {
    return error
  }

  return new Error(`${error.message} ${details}`)
}

function extractOpenAIErrorDetails(error: Error): string | null {
  const maybeApiError = error as Error & {
    error?: {
      code?: unknown
      message?: unknown
      details?: Array<{
        loc?: unknown
        msg?: unknown
        input?: unknown
        ctx?: unknown
      }>
    }
  }

  const nested = maybeApiError.error
  if (!nested || typeof nested !== 'object') {
    return null
  }

  const parts: string[] = []

  if (typeof nested.code === 'string' && nested.code.length > 0) {
    parts.push(`code=${nested.code}`)
  }

  if (typeof nested.message === 'string' && nested.message.length > 0) {
    parts.push(`provider_message=${nested.message}`)
  }

  if (Array.isArray(nested.details)) {
    for (const detail of nested.details) {
      const loc = Array.isArray(detail.loc) ? detail.loc.join('.') : ''
      const msg = typeof detail.msg === 'string' ? detail.msg : ''
      const inputPreview =
        detail.input === undefined ? '' : ` input=${safeCompactJson(detail.input).slice(0, 200)}`
      const ctxPreview =
        detail.ctx === undefined ? '' : ` ctx=${safeCompactJson(detail.ctx).slice(0, 120)}`
      const fragment = [loc ? `loc=${loc}` : '', msg ? `msg=${msg}` : '', inputPreview, ctxPreview]
        .filter((value) => value.length > 0)
        .join(' ')
      if (fragment.length > 0) {
        parts.push(fragment)
      }
    }
  }

  return parts.length > 0 ? parts.join(' | ') : null
}

function safeCompactJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
