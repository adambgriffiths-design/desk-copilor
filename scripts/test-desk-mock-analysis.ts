/**
 * Mock desk analysis lifecycle — no network, no prod APIs.
 * Usage: npx tsx scripts/test-desk-mock-analysis.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {

const root = join(process.cwd(), "extension");

function createEl(tag: string, attrs: Record<string, string> = {}) {
  return {
    tagName: tag.toUpperCase(),
    className: "",
    classList: {
      _set: new Set<string>(),
      add(...c: string[]) {
        c.forEach((x) => this._set.add(x));
      },
      remove(...c: string[]) {
        c.forEach((x) => this._set.delete(x));
      },
      toggle(c: string, force?: boolean) {
        const has = this._set.has(c);
        const next = force ?? !has;
        if (next) this._set.add(c);
        else this._set.delete(c);
      },
      contains(c: string) {
        return this._set.has(c);
      },
    },
    textContent: "",
    innerHTML: "",
    title: "",
    id: attrs.id || "",
    children: [] as unknown[],
    parentElement: null as unknown,
    closest() {
      return null;
    },
    appendChild() {
      return this;
    },
    querySelectorAll() {
      return [];
    },
  };
}

const elements = new Map<string, ReturnType<typeof createEl>>();

function ensureEl(id: string) {
  if (!elements.has(id)) elements.set(id, createEl("div", { id }));
  const el = elements.get(id)!;
  el.id = id;
  return el;
}

const ids = [
  "dc-verdict-card",
  "dc-verdict-empty",
  "dc-verdict-body",
  "dc-verdict-analyzing",
  "dc-mock-badge",
  "dc-mock-badge-analyzing",
  "dc-analyzing-steps",
  "dc-verdict-headline",
  "dc-verdict-symbol",
  "dc-verdict-status",
  "dc-verdict-dq",
  "dc-v-bias",
  "dc-v-structure",
  "dc-v-liquidity",
  "dc-v-fvg",
  "dc-v-pd",
  "dc-v-entry",
  "dc-v-invalidation",
  "dc-v-target",
  "dc-v-freshness",
  "dc-verdict-invalidation-wrap",
  "dc-evidence-wrap",
  "dc-evidence-list",
  "dc-evidence-sections",
  "dc-evidence-why",
  "dc-evidence-facts",
  "dc-evidence-risk",
  "dc-evidence-dq",
  "dc-full-analysis",
  "dc-get-verdict",
  "dc-new-analysis",
  "dc-prev-verdict",
];

for (const id of ids) ensureEl(id);

const document = {
  getElementById(id: string) {
    return ensureEl(id);
  },
  createElement(tag: string) {
    return createEl(tag);
  },
  querySelectorAll(sel: string) {
    if (sel.includes("dc-analyzing-step")) {
      return [
        createEl("li"),
        createEl("li"),
        createEl("li"),
        createEl("li"),
      ];
    }
    return [];
  },
};

const storage: Record<string, string> = {};
const localStorage = {
  getItem: (k: string) => (k in storage ? storage[k] : null),
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
};
const sessionStorage = { ...localStorage };

function loadScript(name: string) {
  const code = readFileSync(join(root, name), "utf8");
  // eslint-disable-next-line no-new-func
  const fn = new Function("window", "document", "localStorage", "sessionStorage", code);
  fn(globalThis, document, localStorage, sessionStorage);
}

loadScript("desk-ui-components.js");
loadScript("desk-mock-analysis.js");
loadScript("desk-verdict-ui.js");

const Mock = (globalThis as unknown as { DeskCopilotMockAnalysis: Record<string, unknown> }).DeskCopilotMockAnalysis;
const VerdictUI = (globalThis as unknown as { DeskCopilotVerdictUI: Record<string, unknown> }).DeskCopilotVerdictUI;

assert(Mock != null, "DeskCopilotMockAnalysis loaded");
assert(VerdictUI != null, "DeskCopilotVerdictUI loaded");

assert((Mock.SCENARIO_KEYS as string[]).length === 3, "three scenarios");
assert(!(Mock.isEnabled as () => boolean)(), "mock disabled by default");

(Mock.setEnabled as (v: boolean) => void)(true);
assert((Mock.isEnabled as () => boolean)(), "mock can be enabled");

for (const key of Mock.SCENARIO_KEYS as string[]) {
  (Mock.setScenarioKey as (k: string) => void)(key);
  const payload = (Mock.buildVerdictPayload as (k: string) => Record<string, unknown>)(key);
  assert(payload.mock === true, `${key} payload marked mock`);
  const c = (payload.deskPipeline as { analysis_contract: { verdict: string } }).analysis_contract;
  assert(c.verdict === key, `${key} contract verdict`);
  assert(String(payload.panel).includes("VERDICT:"), `${key} panel brief`);
}

(Mock.setScenarioKey as (k: string) => void)("LONG");
const longPayload = (Mock.buildVerdictPayload as (k: string) => Record<string, unknown>)("LONG");
const contract = (VerdictUI.contractFromData as (d: unknown) => { verdict: string })(longPayload);
assert(contract.verdict === "LONG", "contractFromData parses LONG");

(VerdictUI.showReadyState as () => void)();
assert(VerdictUI.getLifecycleState() === "ready", "ready state");
assert(!ensureEl("dc-verdict-empty").classList.contains("hidden"), "empty visible");

(VerdictUI.showAnalyzingState as (o: { mock: boolean }) => void)({ mock: true });
assert(VerdictUI.getLifecycleState() === "analyzing", "analyzing state");
assert(!ensureEl("dc-verdict-analyzing").classList.contains("hidden"), "analyzing panel visible");

(VerdictUI.applyVerdictData as (d: unknown, o: unknown) => void)(longPayload, {
  mock: true,
  showNewAnalysis: true,
});
assert(VerdictUI.getLifecycleState() === "verdict", "verdict state");
assert(!ensureEl("dc-mock-badge").classList.contains("hidden"), "mock badge on verdict");
assert(String(ensureEl("dc-verdict-headline").textContent).includes("LONG"), "headline shows LONG");

(VerdictUI.resetMockAnalysis as () => void)();
assert(VerdictUI.getLifecycleState() === "ready", "reset returns ready");

let fetchCalled = false;
const originalFetch = globalThis.fetch;
(globalThis as { fetch?: typeof fetch }).fetch = (() => {
  fetchCalled = true;
  return Promise.reject(new Error("fetch should not run"));
}) as typeof fetch;

(Mock.setScenarioKey as (k: string) => void)("WAIT");
const run = (Mock.runLifecycle as (h: Record<string, unknown>) => { cancel: () => void })({
  onVerdict: (data: { mock?: boolean }) => {
    assert(data.mock === true, "lifecycle verdict is mock");
  },
});
assert(typeof run.cancel === "function", "lifecycle returns cancel");

await new Promise<void>((resolve) => {
  setTimeout(() => {
    assert(!fetchCalled, "no prod API calls during mock lifecycle");
    globalThis.fetch = originalFetch;
    console.log("test-desk-mock-analysis: ok");
    resolve();
  }, 2600);
});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
