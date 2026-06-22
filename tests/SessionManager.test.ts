import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SessionManager } from "../src/storage/SessionManager.js"

describe("SessionManager", () => {
  let baseDir: string

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "flight-session-test-"))
    // Override the JsonlWriter base dir
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it("creates session with metadata on start", async () => {
    const sm = new SessionManager(undefined, baseDir)
    await sm.start()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sm.sessionId)

    expect(existsSync(join(sessionDir, "session.json"))).toBe(true)
    const session = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"))
    expect(session.id).toBe(sm.sessionId)
    expect(session.cwd).toBeDefined()
  })

  it("tracks exchange count across messages", async () => {
    const sm = new SessionManager(undefined, baseDir)
    await sm.start()

    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "hello" },
    ])
    sm.onChatResponse("msg-1", "hi there", "stop", { promptTokens: 10, completionTokens: 5 })

    sm.onChatMessage("msg-2", sm.sessionId, "openai", "gpt-4", [
      { type: "text", text: "what is 2+2?" },
    ])
    sm.onChatResponse("msg-2", "4", "stop", { promptTokens: 20, completionTokens: 1 })

    sm.onChatMessage("msg-3", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "write code" },
    ])
    sm.onChatResponse("msg-3", "some code", "stop", { promptTokens: 15, completionTokens: 100 })

    await sm.end()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sm.sessionId)

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(3)

    const session = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"))
    expect(session.exchangeCount).toBe(3)
  })

  it("captures model parameters via onChatParams", async () => {
    const sm = new SessionManager(undefined, baseDir)
    await sm.start()

    sm.onChatParams(sm.sessionId, { temperature: 0.7, maxTokens: 4096, topP: 0.9 })
    sm.onChatMessage("msg-1", sm.sessionId, "openai", "gpt-4", [
      { type: "text", text: "hello" },
    ])
    sm.onChatResponse("msg-1", "world", "stop")

    await sm.end()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sm.sessionId)

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    const exchange = JSON.parse(lines[0])
    expect(exchange.request.temperature).toBe(0.7)
    expect(exchange.request.maxTokens).toBe(4096)
    expect(exchange.request.topP).toBe(0.9)
  })

  it("flushes pending exchanges on end", async () => {
    const sm = new SessionManager(undefined, baseDir)
    await sm.start()

    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "hello" },
    ])
    // No response — should still be flushed on end
    sm.onChatMessage("msg-2", sm.sessionId, "openai", "gpt-4", [
      { type: "text", text: "foo" },
    ])
    sm.onChatResponse("msg-2", "bar", "stop")

    await sm.end()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sm.sessionId)

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(2)
  })

  it("tracks tool calls linked to exchanges", async () => {
    const sm = new SessionManager(undefined, baseDir)
    await sm.start()

    sm.onChatParams(sm.sessionId, { temperature: 0, maxTokens: 2000, topP: 1 })
    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "list files" },
    ])

    sm.onToolBefore("bash", "call-1", sm.sessionId)
    sm.onToolAfter("call-1", "file1.txt\nfile2.txt", 150)

    sm.onChatResponse("msg-1", "Here are your files:", "tool_use")

    await sm.end()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sm.sessionId)

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)

    const exchange = JSON.parse(lines[0])
    expect(exchange.tools).toHaveLength(1)
    expect(exchange.tools[0].callId).toBe("call-1")
    expect(exchange.tools[0].result).toBe("file1.txt\nfile2.txt")
  })
})
