import { spawn } from "node:child_process";
import { totalmem } from "node:os";

/**
 * Poll Windows performance counter for Available MBytes via PowerShell.
 * @returns {Promise<number>} available MB (or -1 on failure)
 */
export async function readAvailableMbWindows() {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Counter '\\Memory\\Available MBytes' -ErrorAction Stop).CounterSamples[0].CookedValue",
      ],
      { windowsHide: true },
    );
    let out = "";
    let err = "";
    ps.stdout.on("data", (b) => (out += b.toString()));
    ps.stderr.on("data", (b) => (err += b.toString()));
    ps.on("close", (code) => {
      if (code !== 0) {
        resolve(-1);
        return;
      }
      const n = Number.parseFloat(out.trim());
      resolve(Number.isFinite(n) ? Math.floor(n) : -1);
    });
    ps.on("error", () => resolve(-1));
  });
}

/**
 * @typedef {{ availableMb: number, totalMb: number, cpuPercent: number, at: number }} RamSnapshot
 *
 * @typedef {{
 *   start: () => void,
 *   stop: () => void,
 *   getSnapshot: () => RamSnapshot,
 * }} RamMonitorHandle
 */

/**
 * @param {{
 *   pollMs: number,
 *   mockRamMb?: number | null,
 *   reader?: () => Promise<number>,
 *   onSnapshot?: (snap: RamSnapshot) => void,
 * }} opts
 * @returns {RamMonitorHandle}
 */
export function createRamMonitor(opts) {
  const totalMb = Math.floor(totalmem() / (1024 * 1024));
  const reader = opts.reader ?? readAvailableMbWindows;
  /** @type {RamSnapshot} */
  let snap = { availableMb: totalMb, totalMb, cpuPercent: 0, at: Date.now() };
  /** @type {NodeJS.Timeout | null} */
  let timer = null;

  async function tick() {
    let availableMb;
    if (opts.mockRamMb != null) {
      availableMb = opts.mockRamMb;
    } else {
      const v = await reader();
      availableMb = v >= 0 ? v : snap.availableMb;
    }
    snap = { availableMb, totalMb, cpuPercent: 0, at: Date.now() };
    opts.onSnapshot?.(snap);
  }

  return {
    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), opts.pollMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    getSnapshot() {
      return snap;
    },
  };
}
