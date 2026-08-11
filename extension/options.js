function setStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = ok === true ? "ok" : ok === false ? "err" : "";
}

async function load() {
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  document.getElementById("apiBaseUrl").value = apiBaseUrl || "";
}

document.getElementById("save").addEventListener("click", async () => {
  const raw = document.getElementById("apiBaseUrl").value.trim().replace(/\/+$/, "");
  if (raw && !/^https?:\/\//i.test(raw)) {
    setStatus("URL must start with http:// or https://", false);
    return;
  }
  await chrome.storage.sync.set({ apiBaseUrl: raw || "" });
  setStatus(raw ? `Saved — ${raw}` : "Saved — localhost fallback", true);
});

document.getElementById("clear").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = "";
  await chrome.storage.sync.set({ apiBaseUrl: "" });
  setStatus("Using localhost (ports 3000 / 3001)", true);
});

load();
