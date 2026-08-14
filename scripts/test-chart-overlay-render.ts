/**
 * Overlay render generation / mutex harness — no network, no TradingView page.
 * Usage: npx tsx scripts/test-chart-overlay-render.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  assignStaggeredLabelAlign,
  labelBBox,
  labelLaneToAlign,
  priceToLineY,
  type DrawingLevel,
} from "../lib/drawing-levels";
import { formatChartLevelLabel } from "../lib/plain-language";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const DC_SHAPE_TAG = "\u200B\u2060\u200C\u200B";
const DC_SHAPE_TAG_LEGACY = "\u200BDC\u200B";
const REGISTRY_KEY = "dc-tv-shape-registry-v1";

type MockShape = {
  id: string;
  text: string;
  properties: Record<string, unknown>;
  overrides: Record<string, unknown>;
  points: Array<{ time: number; price: number }>;
};

function createHarness() {
  const storage: Record<string, string> = {};
  const sessionStorage = {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => {
      storage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
  };

  const shapes = new Map<string, MockShape>();
  let nextId = 1;
  let createDelayMs = 0;
  let createShouldFail = false;
  let widgetPresent = true;

  const chart = {
    getAllShapes: () => [...shapes.keys()],
    getShapeById: (id: string) => shapes.get(id) || null,
    removeEntity: (id: string) => {
      shapes.delete(String(id));
    },
    createMultipointShape: async (points: Array<{ time: number; price: number }>, opts: Record<string, unknown>) => {
      if (createShouldFail) throw new Error("create_failed");
      if (createDelayMs > 0) await new Promise((r) => setTimeout(r, createDelayMs));
      const id = `shape-${nextId++}`;
      shapes.set(id, {
        id,
        text: String(opts.text || ""),
        properties: { ...(opts.overrides as Record<string, unknown>), text: opts.text },
        overrides: (opts.overrides as Record<string, unknown>) || {},
        points,
      });
      return id;
    },
    getVisibleRange: () => ({ from: 1_700_000_000, to: 1_700_010_000 }),
    exportData: async () => ({ data: [], schema: [] }),
  };

  const win = globalThis as unknown as Record<string, unknown>;
  win.window = win;
  win.sessionStorage = sessionStorage;
  win.__dcTvBridge = undefined;
  win.__dcTvBridgeRev = undefined;
  win.__dcTvBridgeOnMessage = undefined;
  win.__dcShapeIds = [];
  win.tvWidget = {
    activeChart: () => (widgetPresent ? chart : null),
  };

  const listeners: Array<(event: { source: unknown; data: Record<string, unknown> }) => void> = [];
  win.addEventListener = (type: string, fn: (event: { source: unknown; data: Record<string, unknown> }) => void) => {
    if (type === "message") listeners.push(fn);
  };
  win.removeEventListener = () => {};
  win.postMessage = (data: Record<string, unknown>) => {
    queueMicrotask(() => {
      for (const fn of listeners) fn({ source: win, data });
    });
  };

  const root = join(process.cwd(), "extension");
  const bridgeCode = readFileSync(join(root, "tv-bridge.js"), "utf8");
  // eslint-disable-next-line no-new-func
  const runBridge = new Function("window", "document", "sessionStorage", bridgeCode);
  runBridge(win, { querySelectorAll: () => [], querySelector: () => null }, sessionStorage);

  function registryIds(): string[] {
    try {
      const raw = sessionStorage.getItem(REGISTRY_KEY);
      if (!raw) return [];
      return JSON.parse(raw).ids || [];
    } catch {
      return [];
    }
  }

  function dcShapeCount() {
    let n = 0;
    for (const s of shapes.values()) {
      if (String(s.text).includes(DC_SHAPE_TAG) || s.overrides.dcDeskCopilot) n += 1;
    }
    return n;
  }

  function userShape(label: string) {
    const id = `user-${nextId++}`;
    shapes.set(id, {
      id,
      text: label,
      properties: { text: label },
      overrides: {},
      points: [{ time: 1_700_000_100, price: 21000 }],
    });
    return id;
  }

  async function drawViaBridge(levels: unknown[], zones: unknown[], generation: number) {
    win.postMessage({ type: "DC_DRAW_TV", generation, levels, zones });
    await new Promise((r) => setTimeout(r, 30));
  }

  async function clearViaBridge(generation: number) {
    win.postMessage({ type: "DC_DRAW_TV", action: "clear", generation });
    await new Promise((r) => setTimeout(r, 20));
  }

  return {
    shapes,
    registryIds,
    dcShapeCount,
    userShape,
    drawViaBridge,
    clearViaBridge,
    sessionStorage,
    win,
    setCreateDelay(ms: number) {
      createDelayMs = ms;
    },
    setCreateFail(v: boolean) {
      createShouldFail = v;
    },
    orphanDcShape() {
      const id = `orphan-${nextId++}`;
      shapes.set(id, {
        id,
        text: `${DC_SHAPE_TAG_LEGACY}PDH`,
        properties: { dcDeskCopilot: true, text: `${DC_SHAPE_TAG_LEGACY}PDH` },
        overrides: { dcDeskCopilot: true },
        points: [{ time: 1_700_000_000, price: 21500 }],
      });
      return id;
    },
    orphanLeakedDcShape() {
      const id = `orphan-leak-${nextId++}`;
      shapes.set(id, {
        id,
        text: "DCPDH",
        properties: { text: "DCPDH" },
        overrides: {},
        points: [{ time: 1_700_000_000, price: 21500 }],
      });
      return id;
    },
    reloadBridgeRegistryOnly() {
      win.__dcShapeIds = [];
    },
  };
}

async function main() {
  console.log("test-chart-overlay-render");

  {
    const h = createHarness();
    const userId = h.userShape("My trend line");
    h.orphanDcShape();
    const leakedId = h.orphanLeakedDcShape();
    h.sessionStorage.setItem(REGISTRY_KEY, JSON.stringify({ ids: ["stale-1"], generation: 1 }));
    await h.clearViaBridge(2);
    assert(h.shapes.has(userId), "user drawing preserved on STRIP");
    assert(!h.shapes.has(leakedId), "STRIP removes leaked visible DC prefix");
    assert(h.dcShapeCount() === 0, "STRIP removes all DC-tagged shapes");
    assert(h.registryIds().length === 0, "registry cleared on STRIP");
    console.log("  STRIP cleanup: PASS");
  }

  {
    assert(formatChartLevelLabel("DC PDH") === "Previous Day High", "strips DC prefix + expands PDH");
    assert(formatChartLevelLabel("\u200BDC\u200BPDL") === "Previous Day Low", "strips legacy DC tag");
    assert(formatChartLevelLabel("Previous day high (PDH)") === "Previous Day High", "drops parenthetical abbrev");
    assert(formatChartLevelLabel("FVG", "d_fvg_bullish_0") === "Fair Value Gap", "expands FVG");
    assert(formatChartLevelLabel("REH", "reh_0") === "Relative Equal Highs", "id map REH");
    assert(formatChartLevelLabel("NY RTH H") === "New York Regular Trading Hours High", "expands NY RTH H");
    console.log("  formatChartLevelLabel: PASS");
  }

  {
    const h = createHarness();
    await h.drawViaBridge([{ id: "pdh", price: 21000, startTime: 1, label: "PDH" }], [], 5);
    const drawn = [...h.shapes.values()][0];
    assert(drawn, "native draw created a shape");
    const visible = String(drawn.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    assert(!/^DC/i.test(visible), `no visible DC prefix, got ${JSON.stringify(visible)}`);
    assert(visible === "Previous Day High", `readable name, got ${JSON.stringify(visible)}`);
    assert(String(drawn.text).includes(DC_SHAPE_TAG), "invisible ownership tag still present");
    console.log("  visible native labels: PASS");
  }

  {
    const h = createHarness();
    const zones = [
      {
        kind: "fvg",
        top: 21500,
        bottom: 21450,
        ce: 21475,
        startTime: 1_700_000_000,
        label: "FVG",
        showLabel: true,
      },
    ];
    await h.drawViaBridge([], zones, 1);
    assert(h.registryIds().length === 2, "FVG creates rectangle + CE once");
    await h.drawViaBridge([], zones, 2);
    assert(h.registryIds().length === 2, "redraw replaces prior FVG pair");
    assert(h.dcShapeCount() === 2, "no FVG duplication after redraw");
    console.log("  FVG single-render: PASS");
  }

  {
    const h = createHarness();
    h.setCreateDelay(120);
    const p1 = h.drawViaBridge([{ price: 21000, startTime: 1, label: "A" }], [], 1);
    await new Promise((r) => setTimeout(r, 10));
    await h.drawViaBridge([{ price: 21100, startTime: 1, label: "B" }], [], 2);
    await p1;
    await new Promise((r) => setTimeout(r, 200));
    assert(h.registryIds().length === 1, "superseded draw leaves one level");
    console.log("  superseded draw: PASS");
  }

  {
    const h = createHarness();
    h.setCreateDelay(80);
    void h.drawViaBridge([{ price: 21000, startTime: 1, label: "slow" }], [], 1);
    await new Promise((r) => setTimeout(r, 20));
    await h.drawViaBridge([{ price: 21200, startTime: 1, label: "fast" }], [], 2);
    await new Promise((r) => setTimeout(r, 200));
    assert(h.dcShapeCount() <= 1, "slow native draw superseded without duplication");
    console.log("  slow native draw: PASS");
  }

  {
    const h = createHarness();
    h.setCreateFail(true);
    h.win.postMessage({
      type: "DC_DRAW_TV",
      generation: 1,
      levels: [{ price: 21000, startTime: 1, label: "X" }],
      zones: [],
    });
    await new Promise((r) => setTimeout(r, 40));
    assert(h.registryIds().length === 0, "failed native draw creates no tracked shapes");
    console.log("  native draw failure: PASS");
  }

  {
    const h = createHarness();
    await h.drawViaBridge([{ price: 21000, startTime: 1, label: "PDH" }], [], 5);
    const before = h.registryIds().length;
    h.reloadBridgeRegistryOnly();
    h.win.postMessage({ type: "DC_SYNC_REGISTRY" });
    await new Promise((r) => setTimeout(r, 20));
    assert((h.win.__dcShapeIds as string[]).length === before, "reload sync restores registry");
    await h.clearViaBridge(6);
    assert(h.dcShapeCount() === 0, "post-reload STRIP clears synced shapes");
    console.log("  extension reload: PASS");
  }

  {
    const h = createHarness();
    for (let i = 1; i <= 5; i++) {
      await h.drawViaBridge([{ price: 21000 + i, startTime: 1, label: `L${i}` }], [], i);
    }
    assert(h.registryIds().length === 1, "repeated auto-draw keeps one generation");
    console.log("  repeated auto-draw: PASS");
  }

  {
    const h = createHarness();
    h.setCreateDelay(60);
    void h.drawViaBridge([{ price: 21000, startTime: 1, label: "M1" }], [], 10);
    void h.drawViaBridge([{ price: 21100, startTime: 1, label: "M2" }], [], 11);
    await new Promise((r) => setTimeout(r, 250));
    assert(h.registryIds().length === 1, "mutex serializes concurrent native draws");
    console.log("  concurrent render prevention: PASS");
  }

  {
    const clusterLevels: DrawingLevel[] = [
      { id: "pdh", label: "PDH", price: 21000, color: "#fff", dash: "2 3", group: "daily" },
      { id: "ny_rth_high", label: "NY RTH H", price: 21002, color: "#fff", dash: "2 3", group: "session" },
      { id: "reh_0", label: "REH", price: 21001, color: "#fff", dash: "6 4", group: "structure" },
      { id: "reh_1", label: "REH", price: 21001, color: "#fff", dash: "6 4", group: "structure" },
      { id: "org_top", label: "ORG top", price: 20998, color: "#fff", dash: "4 3", group: "org" },
    ];
    assignStaggeredLabelAlign(clusterLevels, [], { priceMin: 20990, priceMax: 21010 });
    assert(
      clusterLevels.every((l) => l.showLabel !== false),
      "stagger never hides level labels"
    );
    assert(
      clusterLevels.every((l) => l.labelLane != null && l.labelLane >= 0),
      "stagger assigns labelLane to every clustered label"
    );
    assert(labelLaneToAlign(0) === "top" && labelLaneToAlign(1) === "bottom", "label lanes alternate above/below");
    const aligns = new Set(clusterLevels.map((l) => l.labelAlign));
    assert(aligns.size >= 2, "clustered levels get mixed above/below align");
    assert(
      clusterLevels.every((l) => !l.displayLabel),
      "stagger keeps full labels — no displayLabel dedup"
    );

    function clusterBboxesOverlap(levels: DrawingLevel[], pMin: number, pMax: number): boolean {
      const plotH = 480;
      const boxes = levels.map((l) => {
        const lineY = priceToLineY(l.price, pMin, pMax, plotH);
        return labelBBox(lineY, l.labelAlign ?? "top", l.labelLane ?? 0);
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a.bottom + 18 > b.top && b.bottom + 18 > a.top) return true;
        }
      }
      return false;
    }
    assert(!clusterBboxesOverlap(clusterLevels, 20990, 21010), "cluster label bboxes do not overlap");
    console.log("  clustered label stagger: PASS");
  }

  console.log("All overlay harness checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
