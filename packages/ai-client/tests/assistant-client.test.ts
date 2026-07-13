import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineAssistant } from '@tanstack/ai'
import { AssistantClient } from '../src/assistant-client.js'
import { fetchServerSentEvents } from '../src/connection-adapters.js'
import type { AssistantSystem } from '../src/assistant-types.js'

describe('AssistantClient', () => {
  it('creates one sub-client per declared capability', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    expect(client.has('chat')).toBe(true)
    expect(client.has('image')).toBe(true)
    expect(client.has('speech')).toBe(false)
    expect(client.chat).toBeDefined()
    expect(client.get('image')).toBeDefined()
    expect(client.capabilities).toEqual(['chat', 'image'])
  })

  it('tags each sub-client with its capability', () => {
    const assistant = defineAssistant({
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    expect(client.chat).toBeUndefined()
    expect(client.has('chat')).toBe(false)
    expect(client.get('image')).toBeDefined()
  })

  it('dispose() tears down the chat client and every one-shot client', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
      speech: async () => ({}) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    const chatDisposeCalls: Array<true> = []
    const imageDisposeCalls: Array<true> = []
    const speechDisposeCalls: Array<true> = []
    client.chat!.dispose = () => {
      chatDisposeCalls.push(true)
    }
    client.get('image')!.dispose = () => {
      imageDisposeCalls.push(true)
    }
    client.get('speech')!.dispose = () => {
      speechDisposeCalls.push(true)
    }

    client.dispose()

    expect(chatDisposeCalls).toHaveLength(1)
    expect(imageDisposeCalls).toHaveLength(1)
    expect(speechDisposeCalls).toHaveLength(1)
  })

  it('AssistantSystem exposes only declared capabilities, typed', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    type Sys = AssistantSystem<typeof assistant>
    expectTypeOf<Sys>().toHaveProperty('chat')
    expectTypeOf<Sys>().toHaveProperty('image')
    // @ts-expect-error speech was not declared
    expectTypeOf<Sys>().toHaveProperty('speech')
    expectTypeOf<Sys['image']['result']>().toMatchTypeOf<{
      id: string
      model: string
      images: Array<any>
    } | null>()
  })
})
