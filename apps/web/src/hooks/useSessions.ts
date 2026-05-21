import { useEffect, useState, useCallback } from "preact/hooks";
import type { SessionRecord, SupervisorHeartbeat } from "@ai-dashboard/shared";
import { fetchSessions } from "../lib/api.js";
import { mergeSession } from "../lib/merge.js";

interface State {
  sessions: SessionRecord[];
  heartbeat: SupervisorHeartbeat | null;
  connected: boolean;
  error: string | null;
}

export function useSessions(): State & { refresh: () => Promise<void> } {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [heartbeat, setHeartbeat] = useState<SupervisorHeartbeat | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/stream");
    es.addEventListener("session_updated", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as SessionRecord;
        setSessions((cur) => mergeSession(cur, data));
      } catch (e) {
        console.error("session_updated parse", e);
      }
    });
    es.addEventListener("heartbeat", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as SupervisorHeartbeat;
        setHeartbeat(data);
      } catch (e) {
        console.error("heartbeat parse", e);
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [refresh]);

  return { sessions, heartbeat, connected, error, refresh };
}
