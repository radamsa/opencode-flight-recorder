import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs"
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

  describe("clearHistory", () => {
    it("returns 0 when no sessions exist", () => {
      const reader = new StorageReader(baseDir)
      expect(reader.clearHistory("all")).toBe(0)
    })

    it("clears all sessions with spec=all", () => {
      createTestSession(baseDir, "s1", 1)
      createTestSession(baseDir, "s2", 1)
      const reader = new StorageReader(baseDir)
      expect(reader.clearHistory("all")).toBe(2)
      expect(reader.listSessions()).toHaveLength(0)
    })

    it("clears sessions by year", () => {
      const now = new Date()
      const y = String(now.getFullYear())
      const m = String(now.getMonth() + 1).padStart(2, "0")
      const d = String(now.getDate()).padStart(2, "0")

      mkdirSync(join(baseDir, "2020", "01", "01", "old-session"), { recursive: true })
      writeFileSync(join(baseDir, "2020", "01", "01", "old-session", "session.json"), JSON.stringify({ id: "old", createdAt: "2020-01-01", exchangeCount: 1 }))

      createTestSession(baseDir, "current", 1)
      const reader = new StorageReader(baseDir)
      expect(reader.clearHistory("2020")).toBe(1)
      expect(reader.listSessions()).toHaveLength(1)
    })

    it("clears sessions by year-month", () => {
      const now = new Date()
      const y = String(now.getFullYear())
      const m = String(now.getMonth() + 1).padStart(2, "0")
      const d = String(now.getDate()).padStart(2, "0")

      mkdirSync(join(baseDir, y, "01", "01", "jan-session"), { recursive: true })
      writeFileSync(join(baseDir, y, "01", "01", "jan-session", "session.json"), JSON.stringify({ id: "jan", createdAt: `${y}-01-01`, exchangeCount: 1 }))

      createTestSession(baseDir, "feb-session", 1)
      const reader = new StorageReader(baseDir)
      expect(reader.clearHistory(`${y}-01`)).toBe(1)
      expect(reader.listSessions()).toHaveLength(1)
    })

    it("clears sessions by year-month-day", () => {
      const now = new Date()
      const y = String(now.getFullYear())
      const m = String(now.getMonth() + 1).padStart(2, "0")
      const d = String(now.getDate()).padStart(2, "0")

      mkdirSync(join(baseDir, y, m, d, "today-session"), { recursive: true })
      writeFileSync(join(baseDir, y, m, d, "today-session", "session.json"), JSON.stringify({ id: "today", createdAt: now.toISOString(), exchangeCount: 1 }))

      const reader = new StorageReader(baseDir)
      expect(reader.clearHistory(`${y}-${m}-${d}`)).toBe(1)
      expect(reader.listSessions()).toHaveLength(0)
    })

    it("rejects invalid spec format", () => {
      const reader = new StorageReader(baseDir)
      expect(reader.resolveSpecTarget("abc")).toBeNull()
      expect(reader.resolveSpecTarget("202")).toBeNull()
      expect(reader.resolveSpecTarget("2026-1")).toBeNull()
      expect(reader.resolveSpecTarget("2026-01-1")).toBeNull()
    })

    it("rejects path traversal", () => {
      const reader = new StorageReader(baseDir)
      expect(reader.resolveSpecTarget("../../etc")).toBeNull()
    })

    it("clears empty baseDir without error", () => {
      rmSync(baseDir, { recursive: true, force: true })
      const reader = new StorageReader(baseDir)
      expect(() => reader.clearHistory("all")).not.toThrow()
      mkdirSync(baseDir, { recursive: true })
    })
  })
})
