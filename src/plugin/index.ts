import type { Plugin } from "@opencode-ai/plugin"
import { SessionManager } from "../storage/SessionManager.js"

const partTexts = new Map<string, string>()
const idMap = new Map<string, string>()
const sessionMeta = new Map<string, { provider: string; model: string }>()

export const flightRecorderPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  const sessionManager = new SessionManager()
  await sessionManager.start()

  return {
    dispose: async () => {
      await sessionManager.end()
    },

    event: async ({ event: raw }: { event: { type: string; properties: Record<string, unknown> } }) => {
      const event = raw as { type: string; properties: Record<string, unknown> }
      if (event.type === "message.part.updated" || event.type === "message.part.delta") {
        const props = event.properties
        const p = props?.part as { type?: string; messageID?: string; text?: string } | undefined
        const msgID = p?.messageID || (props?.messageID as string | undefined)
        if (p?.type === "text" && p.messageID) {
          const existing = partTexts.get(p.messageID) || ""
          partTexts.set(p.messageID, existing + (p.text || ""))
          if (idMap.has(p.messageID)) {
            sessionManager.updateRequestText(p.messageID, existing + (p.text || ""))
          }
        }
        if (props?.delta && msgID) {
          const existing = partTexts.get(msgID) || ""
          const updated = existing + (props.delta as string)
          partTexts.set(msgID, updated)
          if (idMap.has(msgID)) {
            sessionManager.updateRequestText(msgID, updated)
          }
        }
      }

      if (event.type === "message.updated") {
        const msg = (event.properties as Record<string, unknown>)?.info as Record<string, unknown> | undefined
        if (!msg) return
        const role = msg.role as string | undefined
        const completed = !!(msg.time as Record<string, unknown> | undefined)?.completed

        if (role === "user" && !idMap.has(msg.id as string)) {
          idMap.set(msg.id as string, msg.id as string)
          const text = partTexts.get(msg.id as string) || ""
          const fallback = sessionMeta.get(msg.sessionID as string) ?? { provider: "unknown", model: "unknown" }
          const provider = ((msg.model as Record<string, unknown> | undefined)?.providerID as string) || fallback.provider
          const model = ((msg.model as Record<string, unknown> | undefined)?.modelID as string) || fallback.model
          sessionManager.onChatMessage(
            msg.id as string,
            msg.sessionID as string,
            provider,
            model,
            text ? [{ type: "text" as const, text }] : []
          )
        }

        if (role === "assistant" && completed) {
          const parentKey = idMap.get(msg.parentID as string) || (msg.parentID as string)
          idMap.delete(msg.parentID as string)
          const text = partTexts.get(msg.id as string) || ""
          partTexts.delete(msg.id as string)
          sessionManager.onChatResponse(
            parentKey,
            text,
            msg.finish as string | undefined,
            {
              promptTokens: ((msg.tokens as Record<string, unknown> | undefined)?.input as number) || 0,
              completionTokens: ((msg.tokens as Record<string, unknown> | undefined)?.output as number) || 0,
              cachedTokens: (((msg.tokens as Record<string, unknown> | undefined)?.cache as Record<string, unknown> | undefined)?.read as number) || 0,
            }
          )
        }
      }
    },

    "chat.params": async (input, output) => {
      sessionManager.onChatParams(input.sessionID, {
        temperature: output.temperature,
        maxTokens: output.maxOutputTokens,
        topP: output.topP,
      })
      if (!sessionMeta.has(input.sessionID)) {
        sessionMeta.set(input.sessionID, {
          provider: (input.provider as { info?: { id: string }; id?: string })?.info?.id || (input.provider as { id?: string })?.id || "unknown",
          model: (input.model as { id?: string })?.id || "unknown",
        })
      }
    },

    "tool.execute.before": async (input, output) => {
      sessionManager.onToolBefore(input.tool, input.callID, input.sessionID, output.args)
    },

    "tool.execute.after": async (input, output) => {
      sessionManager.onToolAfter(input.callID, output.output ?? output.title, undefined)
    },
  }
}
