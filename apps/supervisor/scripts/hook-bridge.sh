#!/usr/bin/env bash
# hook-bridge.sh — invoked by Claude Code for every hook event.
# Reads JSON from stdin, POSTs to supervisor :7777, echoes response.
# Stays under 60s (Claude hook timeout) via -m 5 + fail-open fallback.

set +e

body=$(cat)
if [ -z "${body//[[:space:]]/}" ]; then
  echo "{}"
  exit 0
fi

port="${AID_SUPERVISOR_PORT:-7777}"
url="http://127.0.0.1:${port}/hook"

resp=$(printf '%s' "$body" | curl -sS -m 5 -X POST \
  -H "Content-Type: application/json" \
  --data-binary @- "$url" 2>/dev/null)

if [ -z "$resp" ]; then
  echo "{}"
else
  printf '%s' "$resp"
fi
exit 0
