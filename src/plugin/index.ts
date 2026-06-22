import { randomUUID } from "node:crypto"
import type { Plugin } from "@opencode-ai/plugin"
import { SessionManager } from "../storage/SessionManager.js"

const flightRecorderPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  const sessionManager = new SessionManager()
  await sessionManager.start()

  return {
    dispose: async () => {
      await sessionManager.end()
    },

    "chat.message": async (input, output) => {
      const { sessionID, messageID, model } = input
      const provider = model?.providerID ?? "unknown"
      const modelId = model?.modelID ?? "unknown"

      if (output.message.role === "user") {
        sessionManager.onChatMessage(
          messageID ?? randomUUID(),
          sessionID,
          provider,
          modelId,
          output.parts,
        )
      } else if (output.message.role === "assistant") {
        const text = output.parts
          .filter((p): p is any => p.type === "text")
          .map((p) => (p as any).text ?? "")
          .join("")

        sessionManager.onChatResponse(
          messageID ?? randomUUID(),
          text,
          (output.message as any).finishReason,
        )
      }
    },

    "tool.execute.before": async (input, output) => {
      sessionManager.onToolBefore(input.tool, input.callID, input.sessionID)
    },

    "tool.execute.after": async (input, output) => {
      sessionManager.onToolAfter(input.callID, output.output ?? output.title, undefined)
    },
  }
}

export default flightRecorderPlugin
