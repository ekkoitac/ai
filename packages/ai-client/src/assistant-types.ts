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
import type { AnyClientTool } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from './connection-adapters.js'
import type { ChatClientOptions } from './types.js'
import type {
  AudioGenerateInput,
  GenerationClientOptions,
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
