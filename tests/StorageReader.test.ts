import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { StorageReader } from "../src/storage/StorageReader.js"
import { ExchangeBuilder } from "../src/capture/ExchangeBuilder.js"

function createTestSession(baseDir: string, sessionId: string, exchangeCount: number): void {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const dir = join(baseDir, yyyy, mm, dd, sessionId)
  mkdirSync(dir, { recursive: true })

  const session = {
    id: sessionId,
    createdAt: now.toISOString(),
    endedAt: now.toISOString(),
    cwd: "/test",
    exchangeCount,
  }
  writeFileSync(join(dir, "session.json"), JSON.stringify(session))

  const lines: string[] = []
  for (let i = 0; i < exchangeCount; i++) {
    const exc = new ExchangeBuilder(sessionId)
      .setProvider("openai")
      .setModel("gpt-4")
      .setRequest({ messages: [{ role: "user", content: `query ${i}` }] })
      .setResponse({ text: `response ${i}`, finishReason: "stop" })
      .build()
    lines.push(JSON.stringify(exc))
  }
  writeFileSync(join(dir, "exchanges.jsonl"), lines.join("\n") + "\n")
}

describe("StorageReader", () => {
  let baseDir: string

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "flight-reader-"))
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it("lists sessions", () => {
    createTestSession(baseDir, "session-1", 2)
    createTestSession(baseDir, "session-2", 5)

    const reader = new StorageReader(baseDir)
    const sessions = reader.listSessions()
    expect(sessions).toHaveLength(2)
  })

  it("gets session by id", () => {
    createTestSession(baseDir, "session-1", 3)
    const reader = new StorageReader(baseDir)
    const session = reader.getSession("session-1")
    expect(session).toBeDefined()
    expect(session!.id).toBe("session-1")
  })

  it("returns undefined for unknown session", () => {
    const reader = new StorageReader(baseDir)
    expect(reader.getSession("nonexistent")).toBeUndefined()
  })

  it("reads exchanges for a session", () => {
    createTestSession(baseDir, "session-1", 3)
    const reader = new StorageReader(baseDir)
    const exchanges = reader.getExchanges("session-1")
    expect(exchanges).toHaveLength(3)
    expect(exchanges[0].provider).toBe("openai")
  })

  it("returns all exchanges across sessions", () => {
    createTestSession(baseDir, "session-1", 2)
    createTestSession(baseDir, "session-2", 3)
    const reader = new StorageReader(baseDir)
    const all = reader.getAllExchanges()
    expect(all).toHaveLength(5)
  })

  it("returns empty array for nonexistent session exchanges", () => {
    const reader = new StorageReader(baseDir)
    expect(reader.getExchanges("nonexistent")).toEqual([])
  })
})
