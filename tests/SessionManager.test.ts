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
    const sm = new SessionManager(baseDir)
    await sm.start("test-session-id")

    const sessionDir = join(baseDir, ...dtPath(), "test-session-id")

    expect(existsSync(join(sessionDir, "session.json"))).toBe(true)
    const session = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"))
    expect(session.id).toBe("test-session-id")
    expect(session.cwd).toBeDefined()
  })

  it("tracks exchange count across messages", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

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

    const dir = join(baseDir, ...dtPath(), "test-session")

    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(3)

    const session = JSON.parse(readFileSync(join(dir, "session.json"), "utf-8"))
    expect(session.exchangeCount).toBe(3)
  })

  it("captures model parameters via onChatParams", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

    sm.onChatParams(sm.sessionId, { temperature: 0.7, maxTokens: 4096, topP: 0.9 })
    sm.onChatMessage("msg-1", sm.sessionId, "openai", "gpt-4", [
      { type: "text", text: "hello" },
    ])
    sm.onChatResponse("msg-1", "world", "stop")

    await sm.end()

    const dir = join(baseDir, ...dtPath(), "test-session")

    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    const exchange = JSON.parse(lines[0])
    expect(exchange.request.temperature).toBe(0.7)
    expect(exchange.request.maxTokens).toBe(4096)
    expect(exchange.request.topP).toBe(0.9)
  })

  it("flushes pending exchanges on end", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "hello" },
    ])
    // No response — should still be flushed on end
    sm.onChatMessage("msg-2", sm.sessionId, "openai", "gpt-4", [
      { type: "text", text: "foo" },
    ])
    sm.onChatResponse("msg-2", "bar", "stop")

    await sm.end()

    const dir = join(baseDir, ...dtPath(), "test-session")

    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(2)
  })

  it("tracks tool calls linked to exchanges", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

    sm.onChatParams(sm.sessionId, { temperature: 0, maxTokens: 2000, topP: 1 })
    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "list files" },
    ])

    sm.onToolBefore("bash", "call-1", sm.sessionId)
    sm.onToolAfter("call-1", "file1.txt\nfile2.txt", 150)

    sm.onChatResponse("msg-1", "Here are your files:", "tool_use")

    await sm.end()

    const dir = join(baseDir, ...dtPath(), "test-session")
    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)

    const exchange = JSON.parse(lines[0])
    expect(exchange.tools).toHaveLength(1)
    expect(exchange.tools[0].callId).toBe("call-1")
    expect(exchange.tools[0].result).toBe("file1.txt\nfile2.txt")
  })

  it("builds conversation lineage with parentId and rootId", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "first message" },
    ])
    sm.onChatResponse("msg-1", "first response", "stop")

    sm.onChatMessage("msg-2", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "second message" },
    ])
    sm.onChatResponse("msg-2", "second response", "stop")

    sm.onChatMessage("msg-3", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "third message" },
    ])
    sm.onChatResponse("msg-3", "third response", "stop")

    await sm.end()

    const dir = join(baseDir, ...dtPath(), "test-session")
    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(3)

    const exc1 = JSON.parse(lines[0])
    const exc2 = JSON.parse(lines[1])
    const exc3 = JSON.parse(lines[2])

    // First exchange: no parent, self as root
    expect(exc1.lineage).toBeUndefined()

    // Second: parent is first, root is first
    expect(exc2.lineage.parentId).toBe(exc1.id)
    expect(exc2.lineage.rootId).toBe(exc1.id)

    // Third: parent is second, root is still first
    expect(exc3.lineage.parentId).toBe(exc2.id)
    expect(exc3.lineage.rootId).toBe(exc1.id)
  })

  it("captures tool arguments from before hook", async () => {
    const sm = new SessionManager(baseDir)
    await sm.start("test-session")

    sm.onChatMessage("msg-1", sm.sessionId, "anthropic", "claude-3", [
      { type: "text", text: "read file" },
    ])

    sm.onToolBefore("read", "call-1", sm.sessionId, { filePath: "/tmp/test.txt" })
    sm.onToolAfter("call-1", "file content", 50)

    sm.onChatResponse("msg-1", "Here it is:", "tool_use")

    await sm.end()

    const dir = join(baseDir, ...dtPath(), "test-session")
    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    const exchange = JSON.parse(lines[0])
    expect(exchange.tools).toHaveLength(1)
    expect(exchange.tools[0].arguments).toEqual({ filePath: "/tmp/test.txt" })
    expect(exchange.tools[0].result).toBe("file content")
  })

  it("restores existing session on re-init with same id", async () => {
    const sm1 = new SessionManager(baseDir)
    await sm1.start("restore-session")
    sm1.onChatMessage("msg-1", sm1.sessionId, "openai", "gpt-4", [
      { type: "text", text: "hello" },
    ])
    sm1.onChatResponse("msg-1", "world", "stop")
    await sm1.end()

    // simulate new opencode process, same session ID
    const sm2 = new SessionManager(baseDir)
    await sm2.start("restore-session")
    expect(sm2.sessionId).toBe("restore-session")
    sm2.onChatMessage("msg-2", sm2.sessionId, "openai", "gpt-4", [
      { type: "text", text: "again" },
    ])
    sm2.onChatResponse("msg-2", "hello again", "stop")
    await sm2.end()

    const dir = join(baseDir, ...dtPath(), "restore-session")
    const lines = readFileSync(join(dir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(2)

    const session = JSON.parse(readFileSync(join(dir, "session.json"), "utf-8"))
    expect(session.exchangeCount).toBe(2)
    expect(session.createdAt).toBeDefined()
  })
})

function dtPath(): string[] {
  const now = new Date()
  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ]
}
