import { createInterface } from "node:readline"
import { writeFileSync } from "node:fs"
import { StorageReader } from "../storage/StorageReader.js"
import type { Exchange } from "../types/index.js"
import { generateHtmlReport } from "../report/template.js"

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${dd} ${h}:${mi}`
}

export function listSessions(reader: StorageReader): void {
  const sessions = reader.listSessions()
  if (sessions.length === 0) {
    console.log("No sessions found.")
    return
  }
  for (const s of sessions) {
    const date = fmtDate(s.createdAt)
    const id = s.id.length > 8 ? s.id.slice(0, 8) : s.id
    const excLabel = s.exchangeCount === 1 ? "exchange" : "exchanges"
    console.log(`  ${id}  ${date}  ${s.exchangeCount} ${excLabel}  ${s.cwd}`)
  }
}

export function showSession(reader: StorageReader, sessionId: string): void {
  const session = reader.getSession(sessionId)
  if (!session) {
    console.log(`Session "${sessionId}" not found.`)
    return
  }
  const exchanges = reader.getExchanges(sessionId)

  console.log(`Session: ${session.id}`)
  console.log("─".repeat(80))
  console.log(`  Created:   ${fmtDate(session.createdAt)}`)
  console.log(`  Ended:     ${session.endedAt ? fmtDate(session.endedAt) : "active"}`)
  console.log(`  CWD:       ${session.cwd}`)
  console.log(`  Git:       ${session.gitBranch ?? "-"} @ ${(session.gitCommit ?? "-").slice(0, 7)}`)
  console.log(`  Hostname:  ${session.hostname ?? "-"}`)
  console.log(`  Exchanges: ${session.exchangeCount}`)
  console.log()

  for (const exc of exchanges) {
    printExchange(exc)
  }
}

function printExchange(exc: Exchange): void {
  console.log(`  [${exc.id}] ${exc.provider}/${exc.model}`)
  console.log(`    start: ${fmtDate(exc.timestampStart)}`)
  if (exc.latencyMs != null) console.log(`    latency: ${exc.latencyMs}ms`)
  if (exc.usage) {
    console.log(`    tokens: ${exc.usage.totalTokens ?? "?"} (prompt: ${exc.usage.promptTokens}, completion: ${exc.usage.completionTokens})`)
  }
  if (exc.tools && exc.tools.length > 0) {
    console.log(`    tools: ${exc.tools.map((t) => t.name).join(", ")}`)
  }
  if (exc.response) {
    const preview = exc.response.text.slice(0, 120).replace(/\n/g, " ")
    console.log(`    response: "${preview}${exc.response.text.length > 120 ? "..." : ""}"`)
  }
  console.log()
}

export function printStats(reader: StorageReader): void {
  const all = reader.getAllExchanges()
  if (all.length === 0) {
    console.log("No data.")
    return
  }

  const totalTokens = all.reduce((sum, e) => sum + (e.usage?.totalTokens ?? 0), 0)
  const totalCost = all.reduce((sum, e) => sum + (e.usage?.costUsd ?? 0), 0)
  const modelMap = new Map<string, number>()
  const providerMap = new Map<string, number>()

  for (const e of all) {
    const key = `${e.provider}/${e.model}`
    modelMap.set(key, (modelMap.get(key) ?? 0) + 1)
    providerMap.set(e.provider, (providerMap.get(e.provider) ?? 0) + 1)
  }

  console.log("Stats:")
  console.log("─".repeat(80))
  console.log(`  Total exchanges:     ${all.length}`)
  console.log(`  Total tokens:        ${totalTokens.toLocaleString()}`)
  console.log(`  Total cost (USD):    $${totalCost.toFixed(4)}`)
  console.log(`  Avg tokens/exchange: ${Math.round(totalTokens / all.length).toLocaleString()}`)
  console.log()

  console.log("  By provider:")
  for (const [provider, count] of providerMap) {
    console.log(`    ${provider}: ${count}`)
  }
  console.log()

  console.log("  By model:")
  for (const [model, count] of modelMap) {
    console.log(`    ${model}: ${count}`)
  }
  console.log()
}

function toYaml(obj: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent)
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`
    return obj.map((item) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join("")
  }
  if (obj !== null && typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>)
    if (keys.length === 0) return `${pad}{}\n`
    return keys.map((k) => {
      const v = (obj as Record<string, unknown>)[k]
      if (typeof v === "string" && (v.includes("\n") || v.includes(":") || v.includes("#"))) {
        return `${pad}${k}: |\n${pad}  ${v.split("\n").join(`\n${pad}  `)}\n`
      }
      if (v === null || v === undefined) return `${pad}${k}: null\n`
      if (typeof v === "object") return `${pad}${k}:\n${toYaml(v, indent + 1)}`
      return `${pad}${k}: ${v}\n`
    }).join("")
  }
  return `${pad}${obj}\n`
}

export function searchExchanges(reader: StorageReader, query: string, format?: string): void {
  const all = reader.getAllExchanges()
  const lowerQuery = query.toLowerCase()
  const matches = all.filter((e) => {
    const messages = JSON.stringify(e.request.messages).toLowerCase()
    const response = e.response?.text.toLowerCase() ?? ""
    return messages.includes(lowerQuery) || response.includes(lowerQuery)
  })

  if (matches.length === 0) {
    console.log(`No matches for "${query}".`)
    return
  }

  if (format === "json") {
    console.log(JSON.stringify(matches, null, 2))
  } else if (format === "yaml") {
    console.log(toYaml(matches))
  } else {
    console.log(`Found ${matches.length} matches for "${query}":`)
    console.log("─".repeat(80))
    for (const exc of matches) {
      printExchange(exc)
    }
  }
}

export async function clearHistory(reader: StorageReader, spec: string): Promise<void> {
  const target = reader.resolveSpecTarget(spec)
  if (!target) {
    console.log(`Invalid spec "${spec}". Use all, YYYY, YYYY-MM, or YYYY-MM-DD.`)
    return
  }

  const preview = reader.countSessionsInTarget(target)
  if (preview === 0) {
    console.log(`Nothing to clear for "${spec}".`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Delete ${preview} session(s)? (y/N) `, resolve)
  })
  rl.close()

  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled.")
    return
  }

  const count = reader.clearHistory(spec)
  console.log(`Deleted ${count} session(s).`)
}

export function report(reader: StorageReader, spec: string): void {
  const target = reader.resolveSpecTarget(spec)
  if (!target) {
    console.log(`Invalid spec "${spec}". Use all, YYYY, YYYY-MM, or YYYY-MM-DD.`)
    return
  }

  const allSessions = reader.listSessions()
  const sessions = spec === "all"
    ? allSessions
    : allSessions.filter((s) => {
        const d = new Date(s.createdAt)
        const parts = spec.split("-")
        if (parts[0] && String(d.getFullYear()) !== parts[0]) return false
        if (parts[1] && String(d.getMonth() + 1).padStart(2, "0") !== parts[1]) return false
        if (parts[2] && String(d.getDate()).padStart(2, "0") !== parts[2]) return false
        return true
      })

  if (sessions.length === 0) {
    console.log("No data for the given period.")
    return
  }

  const exchanges: Exchange[] = []
  for (const s of sessions) {
    exchanges.push(...reader.getExchanges(s.id))
  }

  const html = generateHtmlReport(sessions, exchanges, spec)
  const filename = `flight-report-${spec === "all" ? "all" : spec}.html`
  writeFileSync(filename, html, "utf-8")
  console.log(`Report saved to ${filename}`)
}



export function exportData(reader: StorageReader, sessionId?: string): void {
  const all = sessionId
    ? reader.getExchanges(sessionId)
    : reader.getAllExchanges()

  const sessions = sessionId
    ? [reader.getSession(sessionId)].filter(Boolean)
    : reader.listSessions()

  const output = { sessions, exchanges: all }
  console.log(JSON.stringify(output, null, 2))
}
