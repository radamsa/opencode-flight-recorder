import { describe, it, expect } from "vitest"
import { ExchangeBuilder, normalizeUsage, estimateCost } from "../src/capture/ExchangeBuilder.js"

describe("ExchangeBuilder", () => {
  it("creates exchange with sessionId", () => {
    const builder = new ExchangeBuilder("session-1")
    const exchange = builder.build()
    expect(exchange.sessionId).toBe("session-1")
    expect(exchange.id).toMatch(/^exc_/)
    expect(exchange.timestampStart).toBeDefined()
  })

  it("sets provider and model", () => {
    const exchange = new ExchangeBuilder("s1")
      .setProvider("anthropic")
      .setModel("claude-3-5-sonnet-20241022")
      .build()
    expect(exchange.provider).toBe("anthropic")
    expect(exchange.model).toBe("claude-3-5-sonnet-20241022")
  })

  it("sets request snapshot", () => {
    const exchange = new ExchangeBuilder("s1")
      .setRequest({
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.7,
        maxTokens: 4096,
      })
      .build()
    expect(exchange.request.messages).toHaveLength(1)
    expect(exchange.request.temperature).toBe(0.7)
    expect(exchange.request.maxTokens).toBe(4096)
  })

  it("sets response and computes timestampEnd", () => {
    const builder = new ExchangeBuilder("s1")
    builder.setRequest({ messages: [] })
    const before = new Date().toISOString()
    builder.setResponse({ text: "response text", finishReason: "stop" })
    const exchange = builder.build()
    expect(exchange.response?.text).toBe("response text")
    expect(exchange.response?.finishReason).toBe("stop")
    expect(exchange.timestampEnd).toBeDefined()
    expect(new Date(exchange.timestampEnd).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    )
  })

  it("sets usage with totalTokens", () => {
    const exchange = new ExchangeBuilder("s1")
      .setUsage({ promptTokens: 50, completionTokens: 30 })
      .build()
    expect(exchange.usage?.promptTokens).toBe(50)
    expect(exchange.usage?.completionTokens).toBe(30)
    expect(exchange.usage?.totalTokens).toBe(80)
  })

  it("sets latency", () => {
    const exchange = new ExchangeBuilder("s1")
      .setLatency(1234)
      .build()
    expect(exchange.latencyMs).toBe(1234)
  })

  it("sets lineage", () => {
    const exchange = new ExchangeBuilder("s1")
      .setLineage({ parentId: "parent-1", rootId: "root-1" })
      .build()
    expect(exchange.lineage?.parentId).toBe("parent-1")
    expect(exchange.lineage?.rootId).toBe("root-1")
  })

  it("adds tool events", () => {
    const exchange = new ExchangeBuilder("s1")
      .addToolEvent({
        callId: "call-1",
        name: "bash",
        arguments: { command: "ls" },
        timestamp: new Date().toISOString(),
      })
      .addToolEvent({
        callId: "call-2",
        name: "read",
        arguments: { filePath: "/tmp/test" },
        result: "content",
        timestamp: new Date().toISOString(),
      })
      .build()
    expect(exchange.tools).toHaveLength(2)
    expect(exchange.tools![0].name).toBe("bash")
    expect(exchange.tools![1].result).toBe("content")
  })
})

describe("normalizeUsage", () => {
  it("normalizes all token fields", () => {
    const usage = normalizeUsage(100, 50, 10)
    expect(usage.promptTokens).toBe(100)
    expect(usage.completionTokens).toBe(50)
    expect(usage.cachedTokens).toBe(10)
    expect(usage.totalTokens).toBe(150)
  })

  it("defaults undefined to 0", () => {
    const usage = normalizeUsage(undefined, undefined)
    expect(usage.promptTokens).toBe(0)
    expect(usage.completionTokens).toBe(0)
    expect(usage.totalTokens).toBe(0)
  })
})

describe("estimateCost", () => {
  it("calculates cost based on token counts", () => {
    const cost = estimateCost({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 })
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeCloseTo(0.003 + 0.0075, 4)
  })

  it("returns undefined for zero tokens", () => {
    const cost = estimateCost({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
    expect(cost).toBeUndefined()
  })
})
