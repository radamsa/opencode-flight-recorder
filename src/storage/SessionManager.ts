import { randomUUID } from "node:crypto"
import { execSync } from "node:child_process"
import { hostname, platform } from "node:os"
import { cwd } from "node:process"
import { JsonlWriter } from "./JsonlWriter.js"
import { ExchangeBuilder } from "../capture/ExchangeBuilder.js"
import type { Exchange, ToolEvent } from "../types/index.js"

export class SessionManager {
  public sessionId: string
  private writer: JsonlWriter
  private requestIdToExchange: Map<string, string> = new Map()
  private exchangeBuilders: Map<string, ExchangeBuilder> = new Map()
  private pendingToolCalls: Map<string, { exchangeId: string; toolCallId: string }> = new Map()
  private paramsStore: Map<string, { temperature?: number; maxTokens?: number; topP?: number }> = new Map()
  private exchangeCount: number = 0

  constructor(sessionId?: string, baseDir?: string) {
    this.sessionId = sessionId ?? randomUUID()
    this.writer = new JsonlWriter(baseDir)
  }

  async start(): Promise<void> {
    const meta = {
      cwd: cwd(),
      gitBranch: this.getGitBranch(),
      gitCommit: this.getGitCommit(),
      hostname: hostname(),
      os: platform(),
    }
    await this.writer.init(this.sessionId, meta)
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

    const params = this.paramsStore.get(sessionID)
    builder.setRequest({
      messages: parts.map(p => ({ type: p.type, text: p.type === "text" ? (p.text ?? "") : "" })),
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

  onToolBefore(tool: string, callID: string, sessionID: string): void {
    const toolEvent: ToolEvent = {
      callId: callID,
      name: tool,
      arguments: {},
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
    for (const builder of this.exchangeBuilders.values()) {
      const exchange = builder.build()
      await this.writer.appendExchange(exchange)
    }
    this.exchangeBuilders.clear()
    await this.writer.finalize()
  }

  private async flushExchange(exchange: Exchange): Promise<void> {
    this.exchangeCount++
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
