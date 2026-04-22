/**
 * background.js — Mission Job service worker (Manifest v3)
 *
 * Handles:
 *   - API health polling (cached, 30s TTL)
 *   - PDF download proxy (fetch from FastAPI → chrome.downloads)
 *   - Cover letter generation relay (popup → content script not needed here)
 *   - Storage cleanup helpers
 */

const API_BASE = "http://localhost:8000";
let _healthCache = null;
let _healthTs    = 0;

// ── Health check (cached 30s) ─────────────────────────────────────────────────
async function checkHealth(force = false) {
  const now = Date.now();
  if (!force && _healthCache && now - _healthTs < 30_000) return _healthCache;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    _healthCache = res.ok ? await res.json() : { status: "error" };
  } catch {
    _healthCache = { status: "offline" };
  }
  _healthTs = now;
  return _healthCache;
}

// ── PDF download ──────────────────────────────────────────────────────────────
async function downloadPDF(filename = "prajjwal_pandey_resume.pdf") {
  try {
    await chrome.downloads.download({
      url:      `${API_BASE}/pdf`,
      filename: filename,
      saveAs:   false,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Cover letter via /tailor ──────────────────────────────────────────────────
async function generateCoverLetter(company, jd_text, hr_name = "") {
  const res = await fetch(`${API_BASE}/tailor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: company, job_description: jd_text, hr_name, generate_star: false }),
  });
  if (!res.ok) throw new Error(`/tailor ${res.status}`);
  return res.json();
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.action) {

      case "CHECK_HEALTH":
        sendResponse(await checkHealth(msg.force));
        break;

      case "DOWNLOAD_PDF":
        sendResponse(await downloadPDF(msg.filename));
        break;

      case "GENERATE_COVER_LETTER": {
        try {
          const result = await generateCoverLetter(msg.company, msg.jd_text, msg.hr_name);
          // Cache cover letter for form fill
          if (result.cover_letter) {
            await chrome.storage.local.set({ cover_letter: result.cover_letter });
          }
          sendResponse({ ok: true, ...result });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        break;
      }

      case "CLEAR_CACHE":
        await chrome.storage.local.remove(["current_job", "cover_letter"]);
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
    }
  })();
  return true;
});

// Keep service worker alive during active use
chrome.runtime.onInstalled.addListener(() => {
  console.log("Mission Job Assistant installed.");
});
