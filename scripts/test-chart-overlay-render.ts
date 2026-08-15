/**
 * Overlay render generation / mutex harness — no network, no TradingView page.
 * Usage: npx tsx scripts/test-chart-overlay-render.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  assignStaggeredLabelAlign,
  buildDrawingLevels,
  labelLaneToAlign,
  labelLaneToHorzAlign,
  nativeLabelLayoutKey,
  type DrawingLevel,
} from "../lib/drawing-levels";
import { formatChartLevelLabel, formatChartOverlayLabel } from "../lib/plain-language";
import type { Bar, MarketContext } from "../lib/types";

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
  lastSetProperties?: Record<string, unknown>;
  lastSetPoints?: Array<{ time: number; price: number }>;
  setProperties?: (props: Record<string, unknown>) => void;
  setPoints?: (pts: Array<{ time: number; price: number }>) => void;
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
      const shape: MockShape = {
        id,
        text: String(opts.text || ""),
        properties: { ...(opts.overrides as Record<string, unknown>), text: opts.text },
        overrides: { ...((opts.overrides as Record<string, unknown>) || {}) },
        points,
        setProperties(props: Record<string, unknown>) {
          shape.lastSetProperties = { ...props };
          Object.assign(shape.properties, props);
          Object.assign(shape.overrides, props);
          if ("text" in props) shape.text = String(props.text ?? "");
        },
        setPoints(pts: Array<{ time: number; price: number }>) {
          shape.lastSetPoints = pts.slice();
          shape.points = pts.slice();
        },
      };
      shapes.set(id, shape);
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
    assert(formatChartLevelLabel("EQH", "eqh_0") === "Relative Equal Highs", "id map EQH");
    assert(formatChartLevelLabel("NY RTH H") === "New York Regular Trading Hours High", "expands NY RTH H");
    assert(formatChartOverlayLabel("New York Pre-Market Low", "ny_pre_low") === "NY Pre Low", "overlay shortens NY pre");
    assert(formatChartOverlayLabel("London Session High", "london_high") === "London High", "overlay shortens London");
    assert(formatChartOverlayLabel("Relative Equal Lows", "rel_0") === "REL", "overlay shortens REL");
    assert(formatChartOverlayLabel("New York Regular Trading Hours High", "ny_rth_high") === "NY RTH High", "overlay shortens NY RTH");
    assert(formatChartOverlayLabel("New York Afternoon Session Low", "ny_pm_low") === "NY PM Low", "overlay shortens NY PM");
    console.log("  formatChartLevelLabel: PASS");
  }

  {
    const h = createHarness();
    await h.drawViaBridge([{ id: "pdh", price: 21000, startTime: 1, label: "PDH" }], [], 5);
    const drawn = [...h.shapes.values()][0];
    assert(drawn, "native draw created a shape");
    assert(drawn.overrides.showLabel === true, "native TV paints stock drawing text");
    const visible = String(drawn.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    assert(visible.length > 0, "native shape text is visible");
    assert(String(drawn.text).includes(DC_SHAPE_TAG), "invisible ownership tag still present");
    assert(drawn.lastSetProperties != null, "line style is applied after create");
    assert(!("text" in (drawn.lastSetProperties || {})), "setProperties does not rewrite the title");
    assert(drawn.lastSetProperties?.showLabel === true, "setProperties keeps showLabel on");
    assert(drawn.overrides.textcolor == null && drawn.overrides.textColor == null, "no custom label text color");
    assert(drawn.overrides.fillLabelBackground == null, "no custom label chip fill");
    console.log("  visible native labels: PASS");
  }

  {
    const drawSrc = readFileSync(join(process.cwd(), "extension", "chart-draw.js"), "utf8");
    const bridgeSrc = readFileSync(join(process.cwd(), "extension", "tv-bridge.js"), "utf8");
    assert(!drawSrc.includes("dc-lvl-label"), "overlay HTML name pills are gone");
    assert(!drawSrc.includes("function appendLabel"), "overlay does not draw label DOM");
    assert(!drawSrc.includes("LABEL_NAME_JOIN"), "slash-joined cluster titles are gone");
    assert(!drawSrc.includes("applyClusterNameMerge"), "cluster name merge is gone");
    assert(!bridgeSrc.includes("LABEL_NAME_JOIN"), "bridge does not join titles with a slash");
    assert(drawSrc.includes("repeating-linear-gradient"), "overlay fallback dashes stay");
    assert(drawSrc.includes("overlayLabels: false"), "native success does not add overlay names");
    assert(bridgeSrc.includes("formatChartOverlayLabel"), "native titles use short names");
    assert(!bridgeSrc.includes("fillLabelBackground"), "native labels are stock TV, not custom chips");
    assert(bridgeSrc.includes("CREATE_CONCURRENCY"), "native creates run in a pool");
    assert(bridgeSrc.includes("MAX_NATIVE_LEVELS"), "native shape count is capped");
    assert(bridgeSrc.includes("applyNativeCollisionLayout"), "collision layout re-runs after native create");
    assert(bridgeSrc.includes("labelTimeShiftSec"), "native titles offset along the ray");
    assert(drawSrc.includes("skipped_tick"), "tick skip in drawOnChart");
    assert(!drawSrc.includes("await preClearNativeShapes"), "draw does not wait on a preclear round-trip");
    assert(!drawSrc.includes("await refreshVisibleRange"), "native draw does not wait on visible range");

    const h = createHarness();
    await h.drawViaBridge(
      [{ id: "rel_0", price: 21000, startTime: 1, label: "REL", color: "#e879f9", labelAlign: "top", labelLane: 0 }],
      [],
      7
    );
    const rel = [...h.shapes.values()][0];
    assert(rel, "REL ray created");
    assert(rel.overrides.showLabel === true, "native REL uses TradingView text");
    assert(String(rel.overrides.linecolor || "").toLowerCase() === "#e879f9", "REL stays pink");
    assert(Number(rel.overrides.linestyle) === 3, "native rays use large dashed, not 1px dots");
    assert(Number(rel.overrides.linewidth) >= 2, "native rays are at least 2px");
    const relText = String(rel.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    assert(relText === "REL", `REL title is short, got ${JSON.stringify(relText)}`);

    await h.drawViaBridge(
      [{ id: "london_high", price: 20900, startTime: 1, label: "London Session High", color: "#94a3b8" }],
      [],
      8
    );
    const session = [...h.shapes.values()][0];
    const sessionLine = String(session.overrides.linecolor || "").toLowerCase();
    assert(sessionLine === "#38bdf8", `session is cyan, got ${sessionLine}`);
    assert(sessionLine !== "#e879f9", "session color is not REL pink");
    assert(session.overrides.lineColor === session.overrides.linecolor, "TV lineColor alias set");
    const sessionText = String(session.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    assert(sessionText === "London High", `London title is short, got ${JSON.stringify(sessionText)}`);

    await h.drawViaBridge(
      [{ id: "org_top", price: 21100, startTime: 1, label: "ORG top", color: "#22d3ee" }],
      [],
      9
    );
    const org = [...h.shapes.values()][0];
    const orgLine = String(org.overrides.linecolor || "").toLowerCase();
    assert(orgLine === "#22d3ee", `ORG stays cyan, got ${orgLine}`);
    assert(orgLine !== sessionLine, "ORG cyan is distinct from session sky");

    await h.drawViaBridge(
      [{ id: "pdh", price: 21200, startTime: 1, label: "PDH", color: "#cbd5e1", group: "daily" }],
      [],
      10
    );
    const pdh = [...h.shapes.values()][0];
    const pdhLine = String(pdh.overrides.linecolor || "").toLowerCase();
    assert(pdhLine === "#a78bfa", `PDH is violet, got ${pdhLine}`);
    assert(new Set([rel.overrides.linecolor, sessionLine, orgLine, pdhLine]).size === 4, "REL/session/ORG/PDH use four different hues");
    console.log("  native TV text + typed line colors: PASS");
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
    await new Promise((r) => setTimeout(r, 400));
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
    const labeled = clusterLevels.filter((l) => l.showLabel !== false);
    assert(labeled.length === clusterLevels.length, "each nearby level keeps its own native label");
    assert(
      clusterLevels.filter((l) => String(l.id).startsWith("reh_") && l.showLabel !== false).length === 2,
      "stacked REH rays each keep their own name"
    );
    assert(clusterLevels.find((l) => l.id === "pdh")?.showLabel !== false, "PDH keeps its own title");
    assert(
      labeled.every((l) => !/\s\/\s/.test(l.displayLabel || "")),
      "cluster titles are never slash-joined"
    );
    assert(
      new Set(labeled.map((l) => l.displayLabel)).size >= 4,
      "distinct nearby names stay on separate drawings"
    );
    assert(labelLaneToAlign(0) === "top" && labelLaneToAlign(1) === "middle", "label lanes cycle top/middle");
    assert(labelLaneToAlign(2) === "bottom", "third lane sits below the ray");
    assert(labelLaneToHorzAlign(0) === "left" && labelLaneToHorzAlign(1) === "center", "horz lanes cycle left/center");
    const layoutKeys = labeled.map((l) => nativeLabelLayoutKey(l));
    assert(new Set(layoutKeys).size === labeled.length, "clustered native titles get unique vert/horz/time slots");
    console.log("  clustered label stagger: PASS");
  }

  {
    const sessionCluster: DrawingLevel[] = [
      { id: "london_high", label: "London Session High", price: 30244.5, color: "#94a3b8", dash: "2 3", group: "session" },
      { id: "ny_pm_high", label: "New York Afternoon Session High", price: 30244, color: "#94a3b8", dash: "2 3", group: "session" },
      { id: "ny_pre_high", label: "New York Pre-Market High", price: 30243.5, color: "#94a3b8", dash: "2 3", group: "session" },
      { id: "rel_0", label: "Relative Equal Lows", price: 30220, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_1", label: "REL", price: 30219.5, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_2", label: "REL", price: 30219, color: "#e879f9", dash: "6 4", group: "structure" },
    ];
    assignStaggeredLabelAlign(sessionCluster, [], {
      priceMin: 30190,
      priceMax: 30260,
      plotHeightPx: 280,
      visibleSpanSec: 3600,
    });
    const named = sessionCluster.filter((l) => l.showLabel !== false);
    assert(named.length === sessionCluster.length, "each session/REL keeps its own name");
    assert(named.every((l) => !/\s\/\s/.test(l.displayLabel || "")), "session/REL titles are never slash-joined");
    const highKeys = named.filter((l) => /high/i.test(l.id)).map((l) => nativeLabelLayoutKey(l));
    assert(new Set(highKeys).size === highKeys.length, "jammed session highs get unique native slots");
    const relKeys = named.filter((l) => l.id.startsWith("rel_")).map((l) => nativeLabelLayoutKey(l));
    assert(new Set(relKeys).size === relKeys.length, "stacked REL titles get unique native slots");
    console.log("  session label stagger: PASS");
  }

  {
    const dupRels: DrawingLevel[] = [
      { id: "rel_0", label: "REL", price: 21000, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_1", label: "Relative Equal Lows", price: 21001, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "pdl", label: "PDL", price: 20950, color: "#fff", dash: "2 3", group: "daily" },
    ];
    assignStaggeredLabelAlign(dupRels, [], { priceMin: 20940, priceMax: 21020 });
    const h = createHarness();
    await h.drawViaBridge(dupRels, [], 21);
    assert(h.shapes.size === 3, "duplicate REL still draws every ray");
    const named = [...h.shapes.values()].filter((s) => s.overrides.showLabel === true);
    assert(named.length === 3, "each REL and PDL keeps its own native TV title");
    assert(
      named.every((s) => String(s.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").length > 0),
      "identical names still produce a visible native title on every ray"
    );
    assert(
      named.every((s) => !/\s\/\s/.test(String(s.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""))),
      "duplicate REL titles are not slash-joined"
    );
    console.log("  native duplicate labels stay independent: PASS");
  }

  {
    const collide: DrawingLevel[] = [
      {
        id: "ny_pm_low",
        label: "New York Afternoon Session Low",
        price: 21000,
        color: "#94a3b8",
        dash: "2 3",
        group: "session",
      },
      {
        id: "london_low",
        label: "London Session Low",
        price: 21002,
        color: "#94a3b8",
        dash: "2 3",
        group: "session",
      },
    ];
    assignStaggeredLabelAlign(collide, [], { priceMin: 20980, priceMax: 21020 });
    const holders = collide.filter((l) => l.showLabel !== false);
    assert(holders.length === 2, "nearby session lows each keep their own native label");
    const titles = holders.map((l) => l.displayLabel).sort();
    assert(titles[0] === "London Low" && titles[1] === "NY PM Low", `independent titles, got ${JSON.stringify(titles)}`);
    assert(holders.every((l) => !/\s\/\s/.test(l.displayLabel || "")), "session lows are not slash-joined");
    const h = createHarness();
    await h.drawViaBridge(collide, [], 22);
    assert(h.shapes.size === 2, "nearby session lows still draw both rays");
    const named = [...h.shapes.values()].filter((s) => s.overrides.showLabel === true);
    assert(named.length === 2, "each ray has its own native TV title");
    const visible = named
      .map((s) => String(s.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""))
      .sort();
    assert(visible[0] === "London Low" && visible[1] === "NY PM Low", `native text, got ${JSON.stringify(visible)}`);
    assert(
      named.every((s) => ["top", "middle", "bottom"].includes(String(s.overrides.vertLabelsAlign))),
      "native TV vertLabelsAlign is set per drawing"
    );
    assert(
      named.every((s) => ["left", "center", "right"].includes(String(s.overrides.horzLabelsAlign))),
      "native TV horzLabelsAlign is set per drawing"
    );
    console.log("  independent native labels: PASS");
  }

  {
    const stale = [
      {
        id: "london_low",
        label: "London Session Low",
        price: 21002,
        displayLabel: "London Low / NY PM Low",
        showLabel: true,
      },
      {
        id: "ny_pm_low",
        label: "New York Afternoon Session Low",
        price: 21000,
        displayLabel: "London Low / NY PM Low",
        showLabel: false,
      },
    ];
    const h = createHarness();
    await h.drawViaBridge(stale, [], 23);
    const named = [...h.shapes.values()].filter((s) => s.overrides.showLabel === true);
    assert(named.length === 2, "stale merged payload still labels both rays");
    const visible = named
      .map((s) => String(s.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""))
      .sort();
    assert(visible[0] === "London Low" && visible[1] === "NY PM Low", `stale merge ignored, got ${JSON.stringify(visible)}`);
    console.log("  stale slash-join payload ignored: PASS");
  }

  {
    const far: DrawingLevel[] = [
      { id: "pdh", label: "PDH", price: 21200, color: "#fff", dash: "2 3", group: "daily" },
      { id: "pdl", label: "PDL", price: 20800, color: "#fff", dash: "2 3", group: "daily" },
    ];
    assignStaggeredLabelAlign(far, [], { priceMin: 20750, priceMax: 21250 });
    assert(far.every((l) => l.showLabel !== false), "well-separated levels keep their own titles");
    assert(
      far.every((l) => !(l.displayLabel || "").includes(" / ")),
      "separated levels are not slash-joined"
    );
    assert(
      far.every((l) => String(l.displayLabel || l.label || "").trim().length > 0),
      "separated levels keep non-empty native titles"
    );
    console.log("  separated labels stay independent: PASS");
  }

  {
    const twins: DrawingLevel[] = [
      { id: "rel_0", label: "REL", price: 21000, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_1", label: "Relative Equal Lows", price: 21000, color: "#e879f9", dash: "6 4", group: "structure" },
    ];
    assignStaggeredLabelAlign(twins, [], { priceMin: 20980, priceMax: 21020 });
    const holders = twins.filter((l) => l.showLabel !== false);
    assert(holders.length === 2, "identical names still each keep a native label");
    assert(
      holders.every((l) => String(l.displayLabel || l.label).trim().length > 0),
      "identical-name rays are not blank"
    );
    assert(
      holders.every((l) => !/\s\/\s/.test(l.displayLabel || "")),
      "identical names are not slash-joined"
    );
    console.log("  identical names keep independent titles: PASS");
  }

  {
    const dense: DrawingLevel[] = Array.from({ length: 16 }, (_, i) => ({
      id: `ny_rth_high_${i}`,
      label: `Level ${i}`,
      price: 21120 - i * 10,
      color: "#94a3b8",
      dash: "2 3",
      group: "session" as const,
    }));
    assignStaggeredLabelAlign(dense, [], { priceMin: 20940, priceMax: 21140 });
    const named = dense.filter((l) => l.showLabel !== false);
    assert(named.length === dense.length, "a wide book does not collapse to a single unlabeled cluster");
    assert(
      named.every((l) => String(l.displayLabel || l.label || "").trim().length > 0),
      "every native title is non-empty"
    );
    assert(
      named.every((l) => !/\s\/\s/.test(l.displayLabel || "")),
      "wide-book titles are never slash-joined"
    );
    console.log("  wide book keeps independent titles: PASS");
  }

  {
    const first: DrawingLevel[] = [
      { id: "rel_0", label: "REL", price: 21000, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_1", label: "REL", price: 20940, color: "#e879f9", dash: "6 4", group: "structure" },
    ];
    const h = createHarness();
    await h.drawViaBridge(first, [], 40);
    const moved: DrawingLevel[] = [
      { id: "rel_0", label: "REL", price: 21000, color: "#e879f9", dash: "6 4", group: "structure" },
      { id: "rel_1", label: "REL", price: 21001, color: "#e879f9", dash: "6 4", group: "structure" },
    ];
    await h.drawViaBridge(moved, [], 41);
    const rays = [...h.shapes.values()].filter((s) => s.overrides.showLabel === true);
    assert(rays.length === 2, "moved REL still draws two independent rays");
    const verts = rays.map((s) => String(s.overrides.vertLabelsAlign));
    const horz = rays.map((s) => String(s.overrides.horzLabelsAlign));
    const slots = verts.map((v, i) => `${v}|${horz[i]}`);
    assert(new Set(slots).size === 2, "collision layout re-runs when REL prices move together");
    assert(
      rays.every((s) => Math.abs(Number(s.points[0]?.price) - 21000) <= 2),
      "moved REL rays stay on the REL price, not the gutter"
    );
    assert(
      rays.every((s) => !/\s\/\s/.test(String(s.text).replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""))),
      "moved REL titles stay independent"
    );
    console.log("  collision layout reruns when levels move: PASS");
  }

  {
    const asiaBar: Bar = {
      time: new Date("2026-08-13T22:30:00.000Z"),
      open: 24120,
      high: 24180,
      low: 24100.25,
      close: 24140,
    };
    const londonBar: Bar = {
      time: new Date("2026-08-14T07:00:00.000Z"),
      open: 24150,
      high: 24220,
      low: 24140,
      close: 24200,
    };
    const ctx = {
      fetchedAt: "2026-08-14T10:20:00.000Z",
      daily: { lastClose: 24200, previousDayHigh: 24300, previousDayLow: 24000 },
      org: null,
      nwog: null,
      htfPdArrays: { levels: [], recentDailyFvgs: [], ndog: null, previousDay: {}, currentDay: {} },
      sessions: {
        asiaHigh: 50,
        asiaLow: 50,
        londonHigh: 50,
        londonLow: 50,
        nyPreHigh: 50,
        nyPreLow: 50,
        nyRthHigh: 50,
        nyRthLow: 50,
        nyPmHigh: 50,
        nyPmLow: 50,
      },
      structureFacts: { relativeEqualPools: [], m1UnfilledFvgs: [], liquiditySweeps: [], mss: null },
    } as unknown as MarketContext;
    const drawn = buildDrawingLevels(ctx, [asiaBar, londonBar], { currentPrice: 24200 });
    const asiaLow = drawn.find((l) => l.id === "asia_low");
    assert(asiaLow != null, "Asia Low draws when the Asia window has bars");
    assert(asiaLow?.price === 24100.25, `Asia Low sits on the session low, got ${asiaLow?.price}`);
    assert(!drawn.some((l) => l.id === "ny_rth_low"), "NY RTH Low is not drawn before the RTH window prints");
    assert(
      drawn.every((l) => Number(l.price) > 1000),
      "session rays never use a 0/gutter price"
    );
    console.log("  session lows sit on the window extreme: PASS");
  }

  console.log("All overlay harness checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
