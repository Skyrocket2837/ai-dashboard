import { useEffect, useState } from "preact/hooks";
import { fetchSession, postCommand, type SessionDetailResponse } from "../lib/api.js";
import { formatRelative, stateColor } from "../lib/merge.js";

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function EventDrawer({ sessionId, onClose }: Props) {
  const [data, setData] = useState<SessionDetailResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSession(sessionId).then((d) => {
      if (alive) setData(d);
    });
    const t = setInterval(() => {
      fetchSession(sessionId).then((d) => {
        if (alive) setData(d);
      });
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId]);

  const send = async (cmd: "approve" | "cancel" | "pause" | "resume") => {
    setBusy(true);
    try {
      await postCommand({ session_id: sessionId, command: cmd });
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div class="fixed inset-y-0 right-0 w-full max-w-xl border-l border-slate-800 bg-slate-950 p-6">
        <button onClick={onClose} class="text-slate-400 hover:text-white">Close</button>
        <div class="mt-4 text-slate-500">Loading…</div>
      </div>
    );
  }
  const s = data.session;
  return (
    <div class="fixed inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-slate-950">
      <div class="sticky top-0 border-b border-slate-800 bg-slate-950 p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-mono text-sm">{s.id}</div>
            <div class="text-xs text-slate-500">{s.machine} · {s.project ?? "—"} · {s.branch ?? ""}</div>
          </div>
          <button onClick={onClose} class="text-slate-400 hover:text-white">✕</button>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <span class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${stateColor(s.state)}`}>{s.state}</span>
          <span class="text-xs text-slate-500">{formatRelative(s.last_activity_at)}</span>
        </div>
        {s.current_prompt && (
          <div class="mt-3 rounded bg-slate-900 p-3 text-sm text-slate-200">
            <div class="mb-1 text-xs uppercase tracking-wide text-slate-500">Current prompt</div>
            {s.current_prompt}
          </div>
        )}
        <div class="mt-3 flex gap-2">
          <button
            onClick={() => send("approve")}
            disabled={busy}
            class="rounded bg-emerald-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => send("pause")}
            disabled={busy}
            class="rounded bg-yellow-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            Pause
          </button>
          <button
            onClick={() => send("cancel")}
            disabled={busy}
            class="rounded bg-red-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
      <div class="p-4">
        <div class="mb-2 text-xs uppercase tracking-wide text-slate-500">Recent events</div>
        <ul class="space-y-1">
          {data.events.map((e) => (
            <li key={e.id} class="rounded bg-slate-900 p-2 text-xs">
              <div class="flex justify-between">
                <span class="font-mono text-slate-300">{e.type}</span>
                <span class="text-slate-500">{formatRelative(e.at)}</span>
              </div>
              {e.payload && (
                <pre class="mt-1 overflow-x-auto text-[10px] text-slate-500">{e.payload}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
