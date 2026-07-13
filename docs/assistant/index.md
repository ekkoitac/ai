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
adapter is constructed, until a request actually reaches
`blogAssistant.handler`.

```ts
// api/assistant.ts
import {
  chat,
  defineAssistant,
  generateImage,
  generateSpeech,
} from '@tanstack/ai'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'

export const blogAssistant = defineAssistant({
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

export const POST = (request: Request) => blogAssistant.handler(request)
```

The handler discriminates each incoming request by capability — routed there
by the client below — parses it into the matching request shape
(`AssistantChatRequest`, `AssistantImageRequest`, `AssistantSpeechRequest`,
...), and streams whatever the callback returns back over Server-Sent Events.

## Driving It From the Client

`useAssistant()` (also available for Solid, Vue, and Svelte) takes the same
assistant definition and a connection adapter, and returns one `assistant`
object with a property per declared capability: `assistant.chat` looks like
`useChat`'s return value, and each one-shot capability (`assistant.image`,
`assistant.speech`) looks like `useGenerateImage` / `useGenerateSpeech`'s.

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
const blogAssistant = defineAssistant({
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
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <button onClick={() => assistant.chat.sendMessage('Hello!')}>Send</button>
      {assistant.chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.find((part) => part.type === 'text')?.content}
        </p>
      ))}

      <button
        onClick={() =>
          assistant.image.generate({ prompt: 'a red fox in a snowy forest' })
        }
      >
        Generate image
      </button>
      {assistant.image.result?.images[0]?.url && (
        <img src={assistant.image.result.images[0].url} alt="" />
      )}
    </div>
  )
}
```

`assistant.chat.sendMessage(...)` and `assistant.chat.messages` behave exactly
like [`useChat`](../chat/streaming) — streaming, tool calls, and message parts
all work the same way. `assistant.image.generate({ prompt })` and
`assistant.image.result` behave like
[`useGenerateImage`](../media/image-generation#hook-api).

## Chaining Capabilities

Because every capability shares the same `assistant` object, you can feed the
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
const blogAssistant = defineAssistant({
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
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  async function writeAboutImage(prompt: string) {
    await assistant.image.generate({ prompt })
    const url = assistant.image.result?.images[0]?.url
    if (!url) return

    await assistant.chat.sendMessage({
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
`assistant.chat.messages` and hand its text to another capability, here
narrating it with `assistant.speech.generate`:

```tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant, generateSpeech } from '@tanstack/ai'
import { openaiSpeech, openaiText } from '@tanstack/ai-openai'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
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
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  async function narrate() {
    const last = assistant.chat.messages.at(-1)
    const text = last?.parts.find((part) => part.type === 'text')?.content
    if (!text) return

    await assistant.speech.generate({ text })
  }

  return <button onClick={narrate}>Read reply aloud</button>
}
```

See [Text-to-Speech](../media/text-to-speech#playing-audio-in-the-browser)
for turning `assistant.speech.result.audio` into playable audio.

## Chat Tools

Tools passed to `chat({ tools: [...] })` inside the server callback
automatically type `assistant.chat.messages` — there's nothing to
re-declare on the client to get typed tool-call parts:

```tsx
// components/WeatherChat.tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ tempF: z.number(), conditions: z.string() }),
})

const getWeather = getWeatherDef.server(async ({ city }) => {
  return { tempF: 72, conditions: `Sunny in ${city}` }
})

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
      tools: [getWeather],
    }),
})

function WeatherChat() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  const weatherCall = assistant.chat.messages
    .at(-1)
    ?.parts.find(
      (part) => part.type === 'tool-call' && part.name === 'get_weather',
    )

  return (
    <div>
      <button
        onClick={() =>
          assistant.chat.sendMessage('What is the weather in Denver?')
        }
      >
        Ask
      </button>
      {weatherCall?.type === 'tool-call' && weatherCall.output && (
        <p>{weatherCall.output.conditions}</p>
      )}
    </div>
  )
}
```

No `chat: { tools }` option was passed to `useAssistant` above —
`weatherCall.output` is still narrowed to `{ tempF: number; conditions:
string }`, inferred entirely from the `tools: [getWeather]` the server
callback passed to `chat()`.

### Client-executed tools still need `chat: { tools }`

`chat: { tools }` on `useAssistant` is now **optional**, and exists for one
remaining reason: a client-executed tool's `.client()` implementation runs in
the browser, so its code can't cross the wire to the server. The server
callback only ever sees the tool's *definition* (for typing and to tell the
model it exists); the client has to register the runtime implementation
itself. Types still come from the server callback either way.

```ts
// lib/tools.ts — shared module: the definition, plus the client implementation
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const showToastDef = toolDefinition({
  name: 'show_toast',
  description: 'Show a browser notification',
  inputSchema: z.object({ message: z.string() }),
})

export const showToast = showToastDef.client((input) => {
  console.log(input.message)
  return { ok: true }
})
```

```tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { showToastDef, showToast } from './tools'

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
      tools: [showToastDef], // definition only — the client executes it
    }),
})

function useAssistantWithClientTool() {
  return useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
    chat: { tools: [showToast] },
  })
}
```

## Structured Output

If the `chat` callback passes `outputSchema` to `chat()`, `assistant.chat`
picks up typed `partial` (progressive, `DeepPartial`) and `final` (validated
terminal object) fields — the same inference
[`useChat({ outputSchema })`](../structured-outputs/streaming) gives you:

```tsx
// components/BlogOutlineForm.tsx
import { useAssistant, fetchServerSentEvents } from '@tanstack/ai-react'
import { chat, defineAssistant } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const BlogOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
})

// The same object your server route exports — share it from one module in a
// real app; repeated here so this snippet type-checks on its own.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      threadId: req.threadId,
      runId: req.runId,
      outputSchema: BlogOutlineSchema,
      stream: true,
    }),
})

function BlogOutlineForm() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/assistant'),
  })

  return (
    <div>
      <button
        onClick={() =>
          assistant.chat.sendMessage('Outline a blog post about red foxes')
        }
      >
        Generate outline
      </button>
      <p>Title: {assistant.chat.partial.title ?? '…'}</p>
      <ul>
        {assistant.chat.partial.sections?.map((section, i) => (
          <li key={i}>{section}</li>
        ))}
      </ul>
      {assistant.chat.final && (
        <pre>{JSON.stringify(assistant.chat.final, null, 2)}</pre>
      )}
    </div>
  )
}
```

`assistant.chat.partial` and `assistant.chat.final` only appear on the type
when the `chat` callback declares `outputSchema` — omit it and
`assistant.chat` has no `partial`/`final` fields, same as `useChat` without
`outputSchema`.
