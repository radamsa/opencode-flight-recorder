import type { Exchange, Lineage, RequestSnapshot, ResponseSnapshot, ToolEvent, Usage } from "../types/index.js"

let exchangeCounter = 0

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++exchangeCounter}`
}

export class ExchangeBuilder {
  private exchange: Exchange

  constructor(sessionId: string) {
    this.exchange = {
      id: generateId("exc"),
      sessionId,
      timestampStart: new Date().toISOString(),
      provider: "",
      model: "",
      request: { messages: [] },
    }
  }

  setProvider(provider: string): this {
    this.exchange.provider = provider
    return this
  }

  setModel(model: string): this {
    this.exchange.model = model
    return this
  }

  setRequest(request: RequestSnapshot): this {
    this.exchange.request = request
    return this
  }

  setResponse(response: ResponseSnapshot): this {
    this.exchange.response = response
    this.exchange.timestampEnd = new Date().toISOString()
    return this
  }

  setUsage(usage: Usage): this {
    this.exchange.usage = {
      ...usage,
      totalTokens: (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
    }
    return this
  }

  setLatency(ms: number): this {
    this.exchange.latencyMs = ms
    return this
  }

  setLineage(lineage: Lineage): this {
    this.exchange.lineage = lineage
    return this
  }

  addToolEvent(event: ToolEvent): this {
    if (!this.exchange.tools) {
      this.exchange.tools = []
    }
    this.exchange.tools.push(event)
    return this
  }

  updateToolEvent(callId: string, updates: Partial<ToolEvent>): this {
    if (!this.exchange.tools) return this
    const tool = this.exchange.tools.find(t => t.callId === callId)
    if (tool) {
      Object.assign(tool, updates)
    }
    return this
  }

  build(): Exchange {
    return { ...this.exchange }
  }
}

export function normalizeUsage(
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): Usage {
  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    cachedTokens,
    totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
  }
}

export function estimateCost(usage: Usage, _model?: string): number | undefined {
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  if (prompt === 0 && completion === 0) return undefined
  return prompt * 0.000003 + completion * 0.000015
}
