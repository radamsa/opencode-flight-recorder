import { StorageReader } from "../storage/StorageReader.js"
import type { Exchange } from "../types/index.js"

export function listSessions(reader: StorageReader): void {
  const sessions = reader.listSessions()
  if (sessions.length === 0) {
    console.log("No sessions found.")
    return
  }
  for (const s of sessions) {
    const d = new Date(s.createdAt)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const h = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    const date = `${y}-${mo}-${day} ${h}:${mi}`
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
  console.log(`  Created:   ${new Date(session.createdAt).toLocaleString()}`)
  console.log(`  Ended:     ${session.endedAt ? new Date(session.endedAt).toLocaleString() : "active"}`)
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
  console.log(`    start: ${new Date(exc.timestampStart).toLocaleString()}`)
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

export function searchExchanges(reader: StorageReader, query: string): void {
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

  console.log(`Found ${matches.length} matches for "${query}":`)
  console.log("─".repeat(80))
  for (const exc of matches) {
    printExchange(exc)
  }
}

export function clearHistory(reader: StorageReader, spec: string, force: boolean): void {
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

  if (!force) {
    console.log(`This will delete ${preview} session(s).`)
    console.log("Use --force to confirm: flight clear --force " + spec)
    return
  }

  const count = reader.clearHistory(spec)
  console.log(`Deleted ${count} session(s).`)
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
