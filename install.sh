#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
PLUGINS_DIR="$CONFIG_DIR/plugins"

GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
header(){ echo -e "\n${BOLD}$1${NC}"; echo "──────────────────────────────"; }

build_plugin() {
  header "Building plugin"
  (cd "$PLUGIN_DIR" && npm install --silent 2>/dev/null || true && ./node_modules/.bin/tsc)
  info "Built opencode-flight-recorder"
}

install_local() {
  header "Installing plugin"

  mkdir -p "$PLUGINS_DIR"
  rm -rf "$PLUGINS_DIR/flight-recorder-dist"

  cp -r "$PLUGIN_DIR/dist" "$PLUGINS_DIR/flight-recorder-dist"

  cat > "$PLUGINS_DIR/flight-recorder.js" << 'PLUGINEOF'
import { SessionManager } from "./flight-recorder-dist/storage/SessionManager.js"

const partTexts = new Map()
const idMap = new Map()
const sessionMeta = new Map()

export const flightRecorderPlugin = async ({ client, project, $, directory, worktree }) => {
  const sessionManager = new SessionManager()
  await sessionManager.start()

  return {
    dispose: async () => {
      await sessionManager.end()
    },

    event: async ({ event }) => {
      const evt = event
      if (evt.type === "message.part.updated" || evt.type === "message.part.delta") {
        const props = evt.properties
        const p = props?.part
        const msgID = p?.messageID || props?.messageID
        if (p?.type === "text" && p.messageID) {
          const existing = partTexts.get(p.messageID) || ""
          partTexts.set(p.messageID, existing + (p.text || ""))
          if (idMap.has(p.messageID)) {
            sessionManager.updateRequestText(p.messageID, existing + (p.text || ""))
          }
        }
        if (props?.delta && msgID) {
          const existing = partTexts.get(msgID) || ""
          const updated = existing + props.delta
          partTexts.set(msgID, updated)
          if (idMap.has(msgID)) {
            sessionManager.updateRequestText(msgID, updated)
          }
        }
      }

      if (evt.type === "message.updated") {
        const msg = evt.properties?.info
        if (!msg) return
        const role = msg.role
        const completed = !!msg.time?.completed

        if (role === "user" && !idMap.has(msg.id)) {
          idMap.set(msg.id, msg.id)
          const text = partTexts.get(msg.id) || ""
          const fallback = sessionMeta.get(msg.sessionID) || { provider: "unknown", model: "unknown" }
          sessionManager.onChatMessage(
            msg.id,
            msg.sessionID,
            msg.model?.providerID || fallback.provider,
            msg.model?.modelID || fallback.model,
            text ? [{ type: "text", text }] : []
          )
        }

        if (role === "assistant" && completed) {
          const parentKey = idMap.get(msg.parentID) || msg.parentID
          idMap.delete(msg.parentID)
          const text = partTexts.get(msg.id) || ""
          partTexts.delete(msg.id)
          sessionManager.onChatResponse(
            parentKey,
            text,
            msg.finish,
            { promptTokens: msg.tokens?.input, completionTokens: msg.tokens?.output, cachedTokens: msg.tokens?.cache?.read }
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
          provider: input.provider?.info?.id || input.provider?.id || "unknown",
          model: input.model?.id || "unknown",
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
PLUGINEOF

  if [ -f "$CONFIG_DIR/package.json" ]; then
    if ! grep -q '"type": "module"' "$CONFIG_DIR/package.json"; then
      tmp=$(mktemp)
      python3 -c "
import json
with open('$CONFIG_DIR/package.json') as f:
    cfg = json.load(f)
cfg['type'] = 'module'
with open('$tmp', 'w') as f:
    json.dump(cfg, f, indent=2)
      " && mv "$tmp" "$CONFIG_DIR/package.json"
      info "Added 'type: module' to $CONFIG_DIR/package.json"
    fi
  else
    echo '{"type": "module"}' > "$CONFIG_DIR/package.json"
    info "Created $CONFIG_DIR/package.json with 'type: module'"
  fi

  info "Installed opencode-flight-recorder in $PLUGINS_DIR"
}

main() {
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    cat <<EOF
Usage: install.sh

Installs opencode-flight-recorder as a local OpenCode plugin in:
  $PLUGINS_DIR

Files placed in the plugins directory are loaded automatically by OpenCode.
EOF
    exit 0
  fi

  echo ""
  echo -e "${BOLD}OpenCode Flight Recorder — Installer${NC}"
  echo ""

  build_plugin
  install_local

  header "Installation complete"
  echo "  Plugin: opencode-flight-recorder"
  echo "  Scope:  global ($PLUGINS_DIR)"
  echo ""
  echo "Restart OpenCode for the plugin to take effect."
}

main "$@"
