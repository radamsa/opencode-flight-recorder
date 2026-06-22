import { execSync } from "node:child_process"
import { hostname, platform } from "node:os"
import { cwd } from "node:process"
import { JsonlWriter } from "./JsonlWriter.js"
import { ExchangeBuilder } from "../capture/ExchangeBuilder.js"
import type { Exchange, ToolEvent } from "../types/index.js"

export class SessionManager {
  public sessionId: string = ""
  private writer: JsonlWriter
  private started: boolean = false
  private requestIdToExchange: Map<string, string> = new Map()
  private exchangeBuilders: Map<string, ExchangeBuilder> = new Map()
  private pendingToolCalls: Map<string, { exchangeId: string; toolCallId: string }> = new Map()
  private paramsStore: Map<string, { temperature?: number; maxTokens?: number; topP?: number }> = new Map()
  private exchangeCount: number = 0
  private rootExchangeId: string | undefined
  private lastExchangeId: string | undefined

  constructor(baseDir?: string) {
    this.writer = new JsonlWriter(baseDir)
  }

  async start(sessionId: string): Promise<void> {
    if (this.started) return
    this.started = true
    this.sessionId = sessionId
    const meta = {
      cwd: cwd(),
      gitBranch: this.getGitBranch(),
      gitCommit: this.getGitCommit(),
      hostname: hostname(),
      os: platform(),
    }
    await this.writer.init(sessionId, meta)
  }

  onChatMessage(
    messageID: string,
    sessionID: string,
    provider: string,
    model: string,
    parts: { type: string; text?: string }[],
  ): void {
    const builder = new ExchangeBuilder(sessionID)
    builder.setProvider(provider).setModel(model)

    if (this.lastExchangeId) {
      builder.setLineage({
        parentId: this.lastExchangeId,
        rootId: this.rootExchangeId ?? this.lastExchangeId,
      })
    }

    const params = this.paramsStore.get(sessionID)
    const mappedMessages = parts.map((p) => {
      const text = p.type === "text" ? (p.text ?? "") : ""
      return { type: p.type, text }
    })
    builder.setRequest({
      messages: mappedMessages,
      temperature: params?.temperature,
      maxTokens: params?.maxTokens,
      topP: params?.topP,
    })

    this.requestIdToExchange.set(messageID, builder.build().id)
    this.exchangeBuilders.set(messageID, builder)
  }

  onChatParams(sessionID: string, params: { temperature: number; maxTokens?: number; topP: number }): void {
    this.paramsStore.set(sessionID, params)
  }

  onChatResponse(
    messageID: string,
    text: string,
    finishReason?: string,
    usage?: { promptTokens?: number; completionTokens?: number; cachedTokens?: number },
  ): void {
    const builder = this.exchangeBuilders.get(messageID)
    if (!builder) return

    builder.setResponse({ text, finishReason })
    if (usage) {
      builder.setUsage({
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
      })
    }
    builder.setLatency(this.calcLatency(builder))

    const exchange = builder.build()
    this.flushExchange(exchange)
    this.exchangeBuilders.delete(messageID)
  }

  onToolBefore(tool: string, callID: string, sessionID: string, args?: unknown): void {
    const toolEvent: ToolEvent = {
      callId: callID,
      name: tool,
      arguments: args ?? {},
      timestamp: new Date().toISOString(),
    }

    for (const [msgId, builder] of this.exchangeBuilders) {
      builder.addToolEvent(toolEvent)
      this.pendingToolCalls.set(callID, { exchangeId: msgId, toolCallId: callID })
      break
    }
  }

  onToolAfter(callID: string, result: unknown, durationMs?: number): void {
    const pending = this.pendingToolCalls.get(callID)
    if (!pending) return

    const builder = this.exchangeBuilders.get(pending.exchangeId)
    if (!builder) return

    builder.updateToolEvent(callID, { result, durationMs })

    this.pendingToolCalls.delete(callID)
  }

  async end(): Promise<void> {
    if (!this.started) return
    for (const builder of this.exchangeBuilders.values()) {
      const exchange = builder.build()
      await this.writer.appendExchange(exchange)
    }
    this.exchangeBuilders.clear()
    await this.writer.finalize()
  }

  updateRequestText(messageId: string, text: string): void {
    const builder = this.exchangeBuilders.get(messageId)
    if (builder) {
      builder.setRequest({
        messages: [{ type: "text" as const, text }],
        temperature: undefined,
        maxTokens: undefined,
        topP: undefined,
      })
    }
  }

  private async flushExchange(exchange: Exchange): Promise<void> {
    this.exchangeCount++
    this.lastExchangeId = exchange.id
    if (!this.rootExchangeId) {
      this.rootExchangeId = exchange.id
    }
    await this.writer.appendExchange(exchange)
  }

  private calcLatency(builder: ExchangeBuilder): number {
    const exchange = builder.build()
    if (!exchange.timestampEnd) return 0
    const start = new Date(exchange.timestampStart).getTime()
    const end = new Date(exchange.timestampEnd).getTime()
    return end - start
  }

  private getGitBranch(): string | undefined {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim()
    } catch {
      return undefined
    }
  }

  private getGitCommit(): string | undefined {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim()
    } catch {
      return undefined
    }
  }
}
