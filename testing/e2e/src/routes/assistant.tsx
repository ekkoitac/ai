import { createFileRoute } from '@tanstack/react-router'
import { chat, defineAssistant, generateImage, maxIterations } from '@tanstack/ai'
import { fetchServerSentEvents, useAssistant } from '@tanstack/ai-react'
import { ChatUI } from '@/components/ChatUI'
import { createTextAdapter } from '@/lib/providers'
import { createImageAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export interface AssistantRouteSearch {
  provider: Provider
  testId?: string
  aimockPort?: number
}

const DEFAULT_PROVIDER: Provider = 'openai'

function parseAssistantRouteSearch(
  search: Record<string, unknown>,
): AssistantRouteSearch {
  const aimockPort =
    typeof search.aimockPort === 'string'
      ? Number.parseInt(search.aimockPort, 10)
      : undefined
  const provider =
    typeof search.provider === 'string'
      ? (search.provider as Provider)
      : DEFAULT_PROVIDER

  return {
    provider,
    ...(typeof search.testId === 'string' ? { testId: search.testId } : {}),
    ...(aimockPort !== undefined && !Number.isNaN(aimockPort)
      ? { aimockPort }
      : {}),
  }
}

export const Route = createFileRoute('/assistant')({
  component: AssistantRoute,
  validateSearch: parseAssistantRouteSearch,
})

// Client-side assistant definition. `defineAssistant` is inert — none of
// these callbacks ever run in the browser. `useAssistant` only reads the
// declared capability names (and their types) off this value to build the
// typed client system; the actual chat/image requests are always sent to
// the server route `/api/assistant`, which defines its own (real) callbacks.
// Mirroring the server route's two capabilities (chat + image) here just
// keeps the client types in sync with what the server actually supports.
const assistant = defineAssistant({
  chat: (req) =>
    chat({
      ...createTextAdapter('openai'),
      messages: req.messages,
      agentLoopStrategy: maxIterations(5),
      threadId: req.threadId,
      runId: req.runId,
    }),
  image: (req) =>
    generateImage({
      adapter: createImageAdapter('openai'),
      prompt: req.prompt as string,
    }),
})

function AssistantRoute() {
  const { provider, testId, aimockPort } = Route.useSearch()

  const system = useAssistant(assistant, {
    connection: fetchServerSentEvents('/api/assistant'),
    chat: { forwardedProps: { provider, testId, aimockPort } },
  })

  // The image one-shot's `GenerationClient` (unlike the chat sub-client) has
  // no `forwardedProps` option on `useAssistant` — its request body is fixed
  // to `{ capability: 'image' }` by `AssistantClient`. So the routing
  // metadata (provider/testId/aimockPort) the server needs rides along on
  // the `generate()` call's input instead: `GenerationClient.generate` merges
  // its input directly into the wire `forwardedProps`, and the server route
  // reads `provider`/`testId`/`aimockPort` back out of `forwardedProps`.
  // Declared as a variable (not an inline literal) so these extra fields
  // don't trip `ImageGenerateInput`'s excess-property check.
  const imageGenerateInput = {
    prompt: '[assistant] a fox',
    provider,
    testId,
    aimockPort,
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 overflow-hidden">
        <ChatUI
          messages={system.chat.messages}
          isLoading={system.chat.isLoading}
          onSendMessage={(text) => {
            system.chat.sendMessage(text)
          }}
          onStop={system.chat.stop}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-gray-700 p-3">
        <button
          type="button"
          data-testid="assistant-generate-image"
          className="rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
          onClick={() => {
            void system.image.generate(imageGenerateInput)
          }}
        >
          Generate Image
        </button>
        <span
          data-testid="assistant-image-result"
          className="break-all text-xs text-gray-400"
        >
          {system.image.result?.images[0]?.url ?? ''}
        </span>
      </div>
    </div>
  )
}
