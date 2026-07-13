---
title: Assistant
id: assistant
order: 1
description: "Bundle chat, image, and speech generation behind one endpoint with defineAssistant() and drive them from a single typed client with useAssistant() — including chaining a generated image straight into a chat turn."
keywords:
  - tanstack ai
  - assistant
  - defineAssistant
  - useAssistant
  - multi-capability
  - chat
  - image generation
  - text-to-speech
---

# Assistant

`defineAssistant()` bundles multiple capabilities — `chat`, `image`, `speech`,
and more — behind a single request handler. `useAssistant()` gives you back a
single typed client, keyed by whichever capabilities you declared, so you can
compose them: generate an image, then hand its URL straight to the model as
the next chat turn, all through one connection.

## Defining the Assistant (Server)

Each capability is a plain callback: `(req) => <activity call>`. The `chat`
capability must return the stream `chat()` produces; one-shot capabilities
(`image`, `speech`, `audio`, `video`, `transcription`, `summarize`) return
either a `Promise` of their result or — with `stream: true` — an
`AsyncIterable`. Every key is optional; the client only sees what you declare.
`defineAssistant()` itself is inert: none of these callbacks run, and no
adapter is constructed, until a request actually reaches `assistant.handler`.

```ts
// api/assistant.ts
import {
  chat,
  defineAssistant,
  generateImage,
  generateSpeech,
} from '@tanstack/ai'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

export const assistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
    }),
  image: (req) => {
    // `req.prompt` arrives as `unknown` — narrow it before use.
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
      numberOfImages: req.numberOfImages,
    })
  },
  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice,
      format: req.format,
    }),
})

export const POST = (request: Request) => assistant.handler(request)
```

The handler discriminates each incoming request by capability — routed there
by the client below — parses it into the matching request shape
(`AssistantChatRequest`, `AssistantImageRequest`, `AssistantSpeechRequest`,
...), and streams whatever the callback returns back over Server-Sent Events.

## Driving It From the Client

`useAssistant()` (also available for Solid, Vue, and Svelte) takes the same
assistant definition and a connection adapter, and returns one `system`
object with a property per declared capability: `system.chat` looks like
`useChat`'s return value, and each one-shot capability (`system.image`,
`system.speech`) looks like `useGenerateImage` / `useGenerateSpeech`'s.

```tsx
// components/Assistant.tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import {
  chat,
  defineAssistant,
  generateImage,
  generateSpeech,
} from '@tanstack/ai'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const assistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
    }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice,
    }),
})

function Assistant() {
  const system = useAssistant(assistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <button onClick={() => system.chat.sendMessage('Hello!')}>Send</button>
      {system.chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}

      <button
        onClick={() =>
          system.image.generate({ prompt: 'a red fox in a snowy forest' })
        }
      >
        Generate image
      </button>
      {system.image.result?.images[0]?.url && (
        <img src={system.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

`system.chat.sendMessage(...)` and `system.chat.messages` behave exactly like
[`useChat`](../chat/streaming) — streaming, tool calls, and message parts all
work the same way. `system.image.generate({ prompt })` and
`system.image.result` behave like
[`useGenerateImage`](../media/image-generation#hook-api).

## Chaining Capabilities

Because every capability shares the same `system` object, you can feed the
result of one straight into another — the reason to reach for a single
assistant instead of separate `useChat` / `useGenerateImage` hooks.

### Image → Chat

Generate an image, then hand its URL to the model as multimodal input
alongside a follow-up instruction:

```tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant, generateImage } from '@tanstack/ai'
import { openaiImage, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const assistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
    }),
  image: (req) => {
    if (typeof req.prompt !== 'string') {
      throw new Error('image prompt must be a string')
    }
    return generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.prompt,
    })
  },
})

function ImageThenChat() {
  const system = useAssistant(assistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  async function writeAboutImage(prompt: string) {
    await system.image.generate({ prompt })
    const url = system.image.result?.images[0]?.url
    if (!url) return

    await system.chat.sendMessage({
      content: [
        { type: 'image', source: { type: 'url', value: url } },
        {
          type: 'text',
          content: 'Write a short blog post about this image.',
        },
      ],
    })
  }

  return (
    <button onClick={() => writeAboutImage('a red fox in a snowy forest')}>
      Generate + write about it
    </button>
  )
}
```

### Chat → Speech

The reverse works too — read the model's latest reply out of
`system.chat.messages` and hand its text to another capability, here narrating
it with `system.speech.generate`:

```tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant, generateSpeech } from '@tanstack/ai'
import { openaiSpeech, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const assistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
    }),
  speech: (req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.text,
      voice: req.voice,
    }),
})

function NarrateLastReply() {
  const system = useAssistant(assistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  async function narrate() {
    const last = system.chat.messages.at(-1)
    const text = last?.parts.find((part) => part.type === 'text')?.content
    if (!text) return

    await system.speech.generate({ text })
  }

  return <button onClick={narrate}>Read reply aloud</button>
}
```

See [Text-to-Speech](../media/text-to-speech#playing-audio-in-the-browser)
for turning `system.speech.result.audio` into playable audio.

## Chat Tools

Client tools for the `chat` capability are declared the same way as
[`useChat`'s `tools`](../tools/client-tools) — pass them through the `chat`
option, and `system.chat.messages` picks up their types:

```ts
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { assistant } from './assistant'

const showToastDef = toolDefinition({
  name: 'show_toast',
  description: 'Show a browser notification',
  inputSchema: z.object({ message: z.string() }),
})

const showToast = showToastDef.client((input) => {
  console.log(input.message)
  return { ok: true }
})

function useAssistantWithTools() {
  return useAssistant(assistant, {
    connection: fetchServerSentEvents('/api/assistant'),
    chat: { tools: [showToast] },
  })
}
```

`system.chat.messages[number].parts` then narrows `tool-call` parts to
`show_toast`'s inferred input/output, exactly as it would for `useChat({
tools })`.
