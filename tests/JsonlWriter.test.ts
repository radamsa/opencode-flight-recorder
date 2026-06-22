import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { JsonlWriter } from "../src/storage/JsonlWriter.js"

describe("JsonlWriter", () => {
  let baseDir: string

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "flight-test-"))
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it("creates session.json on init", async () => {
    const writer = new JsonlWriter(baseDir)
    const sessionId = "test-session"

    await writer.init(sessionId, { cwd: "/tmp", gitBranch: "main", gitCommit: "abc123" })

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, sessionId)

    expect(existsSync(join(sessionDir, "session.json"))).toBe(true)
    const session = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"))
    expect(session.id).toBe(sessionId)
    expect(session.cwd).toBe("/tmp")
    expect(session.gitBranch).toBe("main")
  })

  it("appends exchanges as JSONL", async () => {
    const writer = new JsonlWriter(baseDir)
    await writer.init("test-session-2", { cwd: "/tmp" })

    const exchange = {
      id: "exc_1",
      sessionId: "test-session-2",
      timestampStart: new Date().toISOString(),
      provider: "openai",
      model: "gpt-4",
      request: { messages: [] },
    }

    await writer.appendExchange(exchange)
    await writer.finalize()

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, "test-session-2")

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).id).toBe("exc_1")

    const session = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"))
    expect(session.exchangeCount).toBe(1)
    expect(session.endedAt).toBeDefined()
  })

  it("does not write after finalize", async () => {
    const writer = new JsonlWriter(baseDir)
    await writer.init("test-session-3", { cwd: "/tmp" })

    const exchange = {
      id: "exc_1",
      sessionId: "test-session-3",
      timestampStart: new Date().toISOString(),
      provider: "openai",
      model: "gpt-4",
      request: { messages: [] },
    }

    await writer.appendExchange(exchange)
    await writer.finalize()
    await writer.appendExchange({ ...exchange, id: "exc_2" })

    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const sessionDir = join(baseDir, yyyy, mm, dd, "test-session-3")

    const lines = readFileSync(join(sessionDir, "exchanges.jsonl"), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
  })
})
