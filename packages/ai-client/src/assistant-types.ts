// packages/ai-client/src/assistant-types.ts
import type {
  AssistantDefinition,
  AudioGenerationResult,
  ImageGenerationResult,
  SummarizationResult,
  TTSResult,
  TranscriptionResult,
  VideoJobResult,
} from '@tanstack/ai'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from './connection-adapters.js'
import type {
  ChatClientOptions,
  ChatClientState,
  ConnectionStatus,
  MultimodalContent,
  UIMessage,
} from './types.js'
import type {
  AudioGenerateInput,
  GenerationClientOptions,
  GenerationClientState,
  ImageGenerateInput,
  SpeechGenerateInput,
  SummarizeGenerateInput,
  TranscriptionGenerateInput,
  VideoGenerateInput,
} from './generation-types.js'

/**
 * Reactive state callbacks forwarded into the underlying sub-clients.
 *
 * `ChatClient` and `GenerationClient` only accept these callbacks via their
 * constructors (`updateOptions` does not accept them), so `AssistantClient`
 * must thread them through at construction time rather than attaching them
 * post-construction.
 */
export interface AssistantClientCallbacks {
  /** Reactive state callbacks forwarded to the `ChatClient` constructor. */
  chat?: Pick<
    ChatClientOptions,
    | 'onMessagesChange'
    | 'onLoadingChange'
    | 'onErrorChange'
    | 'onStatusChange'
    | 'onSubscriptionChange'
    | 'onConnectionStatusChange'
    | 'onSessionGeneratingChange'
  >
  /**
   * Reactive state callbacks forwarded to a one-shot capability's
   * `GenerationClient` constructor. Invoked once per declared one-shot
   * capability so each sub-client can be wired independently.
   */
  oneShot?: (
    capability: OneShotCapabilityName,
  ) => Pick<
    GenerationClientOptions<any, any, any>,
    'onResultChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
  >
}

/** Options for AssistantClient (framework-agnostic core). */
export interface AssistantClientOptions<
  TDef extends AssistantDefinition<any>,
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
> {
  assistant: TDef
  connection: ConnectConnectionAdapter
  id?: string
  threadId?: string
  /** Chat-only options mirrored onto the underlying ChatClient. */
  chat?: {
    tools?: TChatTools
    forwardedProps?: Record<string, any>
  }
  /**
   * Reactive state callbacks forwarded into the sub-clients' constructors.
   * Set by framework hooks (not users) to wire up reactive state.
   */
  callbacks?: AssistantClientCallbacks
}

/** Maps declared capability names to their client generate-input type. */
export interface GenerateInputByCapability {
  image: ImageGenerateInput
  audio: AudioGenerateInput
  speech: SpeechGenerateInput
  video: VideoGenerateInput
  transcription: TranscriptionGenerateInput
  summarize: SummarizeGenerateInput
}

/** Maps declared capability names to their result type. */
export interface ResultByCapability {
  image: ImageGenerationResult
  audio: AudioGenerationResult
  speech: TTSResult
  video: VideoJobResult
  transcription: TranscriptionResult
  summarize: SummarizationResult
}

export type OneShotCapabilityName = keyof GenerateInputByCapability

/** The chat capability surface — mirrors the frameworks' useChat return. */
export interface AssistantChatSurface<
  TTools extends ReadonlyArray<AnyClientTool> = [],
> {
  /** Current messages in the conversation. */
  messages: Array<UIMessage<TTools>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   */
  sendMessage: (content: string | MultimodalContent) => Promise<void>

  /**
   * Append a message to the conversation.
   */
  append: (message: ModelMessage | UIMessage<TTools>) => Promise<void>

  /**
   * Reload the last assistant message.
   */
  reload: () => Promise<void>

  /**
   * Stop the current response generation.
   */
  stop: () => void

  /**
   * Clear all messages.
   */
  clear: () => void

  /**
   * Set messages manually.
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Add the result of a client-side tool execution.
   */
  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>

  /**
   * Respond to a tool approval request.
   */
  addToolApprovalResponse: (response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }) => Promise<void>

  /**
   * Whether a response is currently being generated.
   */
  isLoading: boolean

  /**
   * Current error, if any.
   */
  error: Error | undefined

  /**
   * Current status of the chat client.
   */
  status: ChatClientState

  /**
   * Whether the subscription loop is currently active.
   */
  isSubscribed: boolean

  /**
   * Current connection lifecycle status.
   */
  connectionStatus: ConnectionStatus

  /**
   * Whether the shared session is actively generating.
   */
  sessionGenerating: boolean
}

/** The one-shot capability surface — mirrors useGeneration return. */
export interface AssistantGenerationSurface<TInput, TResult> {
  generate: (input: TInput) => Promise<void>
  result: TResult | null
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  stop: () => void
  reset: () => void
}

/** Map a capability name to its client surface. */
export type CapabilitySurface<
  TCapability extends string,
  TChatTools extends ReadonlyArray<AnyClientTool>,
> = TCapability extends 'chat'
  ? AssistantChatSurface<TChatTools>
  : TCapability extends OneShotCapabilityName
    ? AssistantGenerationSurface<
        GenerateInputByCapability[TCapability],
        ResultByCapability[TCapability]
      >
    : never

/** The full typed system returned by useAssistant. */
export type AssistantSystem<
  TDef extends AssistantDefinition<any>,
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
> = {
  [K in keyof TDef['~caps'] & string]: CapabilitySurface<K, TChatTools>
}
