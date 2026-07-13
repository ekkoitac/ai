import { createFileRoute } from '@tanstack/react-router'
import { chat, defineAssistant, generateImage, maxIterations } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import { createImageAdapter } from '@/lib/media-providers'
import type { AssistantConfig } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        // `assistant.handler(request)` below consumes the body itself via
        // `request.json()`, so peek at a clone here to pull the
        // provider/testId/aimockPort needed to construct adapters, and pass
        // the original (unconsumed) request through to the handler.
        const peekBody = await request.clone().json()
        const peekData = peekBody.forwardedProps ?? peekBody.data ?? peekBody
        const { provider, testId, aimockPort } = peekData as {
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const assistant = defineAssistant({
          // Cast: `AssistantConfig['chat']`'s declared return type
          // (`TextActivityResult<any, any>`) resolves — via TS's
          // any-produces-union-of-branches behavior on the nested
          // conditional type — to `Promise<string> |
          // StructuredOutputStream<unknown>`, which drops the default
          // `ChatStream` branch entirely (a type-level gap in that generic
          // instantiation, tracked separately). `chat()`'s actual default
          // return (no `outputSchema`, no `stream: false`) is `ChatStream`,
          // which `defineAssistant`'s handler correctly detects via
          // `isAsyncIterable` at runtime — the runtime is fine either way.
          chat: ((req) =>
            chat({
              ...createTextAdapter(
                provider,
                undefined,
                aimockPort,
                testId,
                'assistant',
              ),
              messages: req.messages,
              agentLoopStrategy: maxIterations(5),
              threadId: req.threadId,
              runId: req.runId,
            })) as NonNullable<AssistantConfig['chat']>,
          image: (req) =>
            generateImage({
              adapter: createImageAdapter(provider, aimockPort, testId),
              prompt: req.prompt as string,
            }),
        })

        return assistant.handler(request)
      },
    },
  },
})
