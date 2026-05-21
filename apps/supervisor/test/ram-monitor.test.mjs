import { describe, it, expect } from "vitest";
import { createRamMonitor } from "../src/ram-monitor.mjs";

describe("createRamMonitor", () => {
  it("uses mock value when provided", async () => {
    const mon = createRamMonitor({ pollMs: 10, mockRamMb: 1234 });
    mon.start();
    await new Promise((r) => setTimeout(r, 30));
    const snap = mon.getSnapshot();
    expect(snap.availableMb).toBe(1234);
    expect(snap.totalMb).toBeGreaterThan(0);
    mon.stop();
  });

  it("falls back to last snapshot on reader failure", async () => {
    let calls = 0;
    const mon = createRamMonitor({
      pollMs: 10,
      reader: async () => {
        calls++;
        return calls === 1 ? 5000 : -1;
      },
    });
    mon.start();
    await new Promise((r) => setTimeout(r, 50));
    const snap = mon.getSnapshot();
    expect(snap.availableMb).toBe(5000);
    mon.stop();
  });

  it("custom reader is used over Windows default", async () => {
    let reads = 0;
    const mon = createRamMonitor({
      pollMs: 10,
      reader: async () => {
        reads++;
        return 7777;
      },
    });
    mon.start();
    await new Promise((r) => setTimeout(r, 30));
    mon.stop();
    expect(reads).toBeGreaterThan(0);
    expect(mon.getSnapshot().availableMb).toBe(7777);
  });

  it("stop halts polling", async () => {
    let reads = 0;
    const mon = createRamMonitor({
      pollMs: 10,
      reader: async () => {
        reads++;
        return 100;
      },
    });
    mon.start();
    await new Promise((r) => setTimeout(r, 25));
    mon.stop();
    const at = reads;
    await new Promise((r) => setTimeout(r, 30));
    expect(reads).toBe(at);
  });

  it("invokes onSnapshot callback", async () => {
    const seen = [];
    const mon = createRamMonitor({
      pollMs: 10,
      mockRamMb: 999,
      onSnapshot: (s) => seen.push(s.availableMb),
    });
    mon.start();
    await new Promise((r) => setTimeout(r, 35));
    mon.stop();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe(999);
  });
});
