import { describe, expect, it, vi } from 'vitest'
import { defineAssistant } from '../../../src/activities/assistant/index.js'

describe('defineAssistant', () => {
  it('is inert: does not invoke any capability callback at define time', () => {
    const chatCb = vi.fn()
    const imageCb = vi.fn()
    const assistant = defineAssistant({ chat: chatCb, image: imageCb })
    expect(chatCb).not.toHaveBeenCalled()
    expect(imageCb).not.toHaveBeenCalled()
    expect(assistant.capabilities.slice().sort()).toEqual(['chat', 'image'])
    expect(typeof assistant.handler).toBe('function')
  })
})

function runAgentBody(capability: string, extra: Record<string, unknown> = {}) {
  return {
    threadId: 't1',
    runId: 'r1',
    state: {},
    messages: [],
    tools: [],
    context: [],
    forwardedProps: { capability, ...extra },
    data: { capability, ...extra },
  }
}

function req(body: unknown) {
  return new Request('http://x/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readSse(res: Response): Promise<Array<any>> {
  const text = await res.text()
  return text
    .split('\n\n')
    .map((l) => l.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

describe('assistant.handler', () => {
  it('400s on unknown capability', async () => {
    const assistant = defineAssistant({ chat: async function* () {} as any })
    const res = await assistant.handler(req(runAgentBody('image')))
    expect(res.status).toBe(400)
  })

  it('routes chat and streams the callback iterable', async () => {
    const assistant = defineAssistant({
      chat: async function* (r: any) {
        yield { type: 'RUN_STARTED', threadId: r.threadId, runId: r.runId } as any
        yield { type: 'RUN_FINISHED', threadId: r.threadId, runId: r.runId } as any
      },
    })
    const res = await assistant.handler(req(runAgentBody('chat')))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const chunks = await readSse(res)
    expect(chunks[0].type).toBe('RUN_STARTED')
  })

  it('wraps a one-shot promise as a generation:result CUSTOM event', async () => {
    const assistant = defineAssistant({
      image: async (r: any) => ({
        id: 'img1',
        model: 'gpt-image-1',
        images: [{ url: `generated:${String(r.prompt)}` }],
      }),
    })
    const res = await assistant.handler(
      req(runAgentBody('image', { prompt: 'a fox' })),
    )
    const chunks = await readSse(res)
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom.name).toBe('generation:result')
    expect(custom.value.images[0].url).toBe('generated:a fox')
  })
})
