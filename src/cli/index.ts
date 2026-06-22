#!/usr/bin/env node
import { StorageReader } from "../storage/StorageReader.js"
import { listSessions, showSession, printStats, searchExchanges, exportData, clearHistory, report } from "./commands.js"

const reader = new StorageReader()

function help(): void {
  console.log(`
Usage: flight <command> [options]

Commands:
  session list                List all recorded sessions
  session show <id>           Show session details and exchanges
  clear [spec]                Clear history (spec: all, YYYY, YYYY-MM, YYYY-MM-DD)
                                default: all
  report [spec]               Generate HTML usage report (spec: all, YYYY, YYYY-MM, YYYY-MM-DD)
                                default: all
  stats                       Show aggregate statistics
  search [json|yaml] <query>  Search exchanges by text (default: pretty, use json/yaml for output format)
  export [sessionId]          Export data as JSON
  help                        Show this help
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    help()
    return
  }

  const [cmd, sub, ...rest] = args

  switch (cmd) {
    case "session":
      if (sub === "list") {
        listSessions(reader)
      } else if (sub === "show") {
        const id = rest[0]
        if (!id) {
          console.log("Usage: flight session show <sessionId>")
          return
        }
        showSession(reader, id)
      } else {
        help()
      }
      break

    case "clear":
      await clearHistory(reader, sub || "all")
      break

    case "report":
      report(reader, sub || "all")
      break

    case "stats":
      printStats(reader)
      break

    case "search": {
      let format: string | undefined
      let queryArgs: string[]
      if (sub === "json" || sub === "yaml") {
        format = sub
        queryArgs = rest
      } else {
        queryArgs = sub ? [sub, ...rest] : rest
      }
      const query = queryArgs.join(" ")
      if (!query) {
        console.log("Usage: flight search [json|yaml] <query>")
        return
      }
      searchExchanges(reader, query, format)
      break
    }

    case "export":
      exportData(reader, rest[0])
      break

    case "help":
      help()
      break

    default:
      help()
  }
}

main().catch(console.error)
