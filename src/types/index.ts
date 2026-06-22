export interface Usage {
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  totalTokens?: number
  costUsd?: number
}

export interface Lineage {
  parentId?: string
  rootId?: string
}

export interface ToolEvent {
  callId: string
  name: string
  arguments: unknown
  result?: unknown
  durationMs?: number
  timestamp: string
}

export interface RequestSnapshot {
  messages: unknown[]
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

export interface ResponseSnapshot {
  text: string
  toolCalls?: unknown[]
  finishReason?: string
}

export interface Exchange {
  id: string
  sessionId: string
  timestampStart: string
  timestampEnd?: string
  provider: string
  model: string
  request: RequestSnapshot
  response?: ResponseSnapshot
  usage?: Usage
  latencyMs?: number
  tools?: ToolEvent[]
  lineage?: Lineage
}

export interface Session {
  id: string
  createdAt: string
  endedAt?: string
  cwd: string
  gitBranch?: string
  gitCommit?: string
  hostname?: string
  os?: string
  exchangeCount: number
}

export interface FlightRecord {
  session: Session
  exchanges: Exchange[]
}
