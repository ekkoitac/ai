import { describe, expect, it } from 'vitest'
import { defineAssistant } from '@tanstack/ai'
import { stream } from '@tanstack/ai-client'
import { createAssistant } from '../src/create-assistant.svelte.js'

// A connection adapter that replays canned chunks for both capabilities,
// branching on the `capability` discriminator forwarded by AssistantClient.
function fakeConnection() {
  return stream(async function* (_messages, data) {
    const capability = (data as Record<string, unknown> | undefined)
      ?.capability

    if (capability === 'chat') {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'm1',
        role: 'assistant',
      } as any
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        delta: 'hello',
      } as any
      yield { type: 'TEXT_MESSAGE_END', messageId: 'm1' } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    } else {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: { id: 'i', model: 'gpt-image-1', images: [{ url: 'u' }] },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    }
  })
}

describe('createAssistant', () => {
  it('exposes only the declared capabilities', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })

    const system = createAssistant(assistant, { connection: fakeConnection() })

    expect(system.chat).toBeDefined()
    expect(system.image).toBeDefined()
    expect((system as any).speech).toBeUndefined()

    system.dispose()
  })

  it('generate() on a one-shot capability populates its result', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })

    const system = createAssistant(assistant, { connection: fakeConnection() })

    await system.image.generate({ prompt: 'a fox' })

    expect(system.image.result?.images[0]?.url).toBe('u')

    system.dispose()
  })

  it('sendMessage() on the chat capability populates messages', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })

    const system = createAssistant(assistant, { connection: fakeConnection() })

    await system.chat.sendMessage('hi')

    expect(system.chat.messages.length).toBeGreaterThan(0)

    system.dispose()
  })
})
