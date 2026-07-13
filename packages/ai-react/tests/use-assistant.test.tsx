import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { defineAssistant } from '@tanstack/ai'
import { stream } from '@tanstack/ai-client'
import { useAssistant } from '../src/use-assistant.js'

// A connection adapter that replays canned chunks for both capabilities,
// branching on the `capability` discriminator forwarded by AssistantClient.
function fakeConnection() {
  return stream(async function* (_messages, data) {
    const capability = (data as Record<string, unknown> | undefined)?.capability

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

describe('useAssistant', () => {
  it('exposes only the declared capabilities', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )
    expect(result.current.chat).toBeDefined()
    expect(result.current.image).toBeDefined()
    expect((result.current as any).speech).toBeUndefined()
  })

  it('generate() on a one-shot capability populates its result', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    await act(async () => {
      await result.current.image.generate({ prompt: 'a fox' })
    })

    expect(result.current.image.result?.images[0]?.url).toBe('u')
  })

  it('sendMessage() on the chat capability populates messages', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    await act(async () => {
      await result.current.chat.sendMessage('hi')
    })

    expect(result.current.chat.messages.length).toBeGreaterThan(0)
  })

  it('exposes chat.partial/final with cleared defaults on first render', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    expect((result.current.chat as any).partial).toEqual({})
    expect((result.current.chat as any).final).toBeNull()
  })
})
