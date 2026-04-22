/**
 * popup.js — Mission Job popup controller
 * Communicates with: background.js (API calls) + content.js (page actions)
 */

const API_BASE = "http://localhost:8000";

// ── State ────────────────────────────────────────────────────────────────────
let currentJob = null;   // parsed job from /scrape-job
let apiOnline  = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const statusDot   = document.getElementById("status-dot");
const noJobMsg    = document.getElementById("no-job-msg");
const jobInfo     = document.getElementById("job-info");
const jobCompany  = document.getElementById("job-company");
const jobRole     = document.getElementById("job-role");
const skillsRow   = document.getElementById("skills-row");

const btnScrape   = document.getElementById("btn-scrape");
const btnFill     = document.getElementById("btn-fill");
const btnCover    = document.getElementById("btn-cover");
const btnPdf      = document.getElementById("btn-pdf");
const btnClear    = document.getElementById("btn-clear");
const fillBadge   = document.getElementById("fill-badge");

const coverSection = document.getElementById("cover-section");
const coverBody    = document.getElementById("cover-body");
const copyCover    = document.getElementById("copy-cover");
const toast        = document.getElementById("toast");


// ── Utilities ─────────────────────────────────────────────────────────────────

function setLoading(btn, on) {
  if (on) btn.classList.add("loading"), btn.disabled = true;
  else    btn.classList.remove("loading"), btn.disabled = false;
}

let _toastTimer;
function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

async function sendToContent(action, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, { action, ...extra });
}

function renderJob(job) {
  currentJob = job;
  noJobMsg.style.display = "none";
  jobInfo.style.display  = "block";
  jobCompany.textContent  = job.company  || "Unknown company";
  jobRole.textContent     = job.role     || "Unknown role";

  skillsRow.innerHTML = "";
  const skills = (job.required_skills || []).slice(0, 6);
  for (const s of skills) {
    const pill = document.createElement("span");
    pill.className   = "skill-pill";
    pill.textContent = s;
    skillsRow.appendChild(pill);
  }

  btnFill.disabled  = false;
  btnCover.disabled = false;
}


// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Check API health
  try {
    const h = await chrome.runtime.sendMessage({ action: "CHECK_HEALTH" });
    apiOnline = h?.status === "ok";
    statusDot.className = "status-dot " + (apiOnline ? "online" : "offline");
    statusDot.title = apiOnline
      ? `API online · Ollama ${h.ollama ? "✓" : "✗"}`
      : "API offline — start FastAPI on :8000";
  } catch {
    statusDot.className = "status-dot offline";
  }

  // 2. Restore cached job
  const stored = await chrome.storage.local.get(["current_job", "cover_letter"]);
  if (stored.current_job) {
    renderJob(stored.current_job);
  } else {
    noJobMsg.textContent = "Click 'Scrape JD' on a job page.";
  }

  // 3. Restore cover letter
  if (stored.cover_letter) {
    coverBody.textContent = stored.cover_letter;
    coverSection.classList.add("show");
  }
}

init();


// ── Button handlers ───────────────────────────────────────────────────────────

// Scrape JD
btnScrape.addEventListener("click", async () => {
  setLoading(btnScrape, true);
  try {
    const res = await sendToContent("SCRAPE_JD");
    if (res?.data) {
      renderJob(res.data);
      showToast(res.ok ? "JD scraped & parsed ✓" : "Scraped (offline parse)");
    } else {
      showToast("Nothing found — are you on a job page?");
    }
  } catch (err) {
    showToast("Content script not ready. Refresh the page.");
    console.error("SCRAPE_JD error:", err);
  } finally {
    setLoading(btnScrape, false);
  }
});

// Fill form
btnFill.addEventListener("click", async () => {
  setLoading(btnFill, true);
  try {
    const res = await sendToContent("FILL_FORM");
    const count = res?.filled ?? 0;
    fillBadge.textContent = `${count} field${count !== 1 ? "s" : ""}`;
    fillBadge.classList.toggle("show", count > 0);
    showToast(count > 0 ? `Filled ${count} field${count !== 1 ? "s" : ""} ✓` : "No matching fields found");
  } catch (err) {
    showToast("Could not fill form. Refresh the page.");
    console.error("FILL_FORM error:", err);
  } finally {
    setLoading(btnFill, false);
  }
});

// Generate cover letter
btnCover.addEventListener("click", async () => {
  if (!currentJob) return showToast("Scrape a JD first.");
  if (!apiOnline)  return showToast("API offline — start FastAPI :8000");

  setLoading(btnCover, true);
  coverSection.classList.remove("show");

  try {
    const res = await chrome.runtime.sendMessage({
      action:   "GENERATE_COVER_LETTER",
      company:  currentJob.company || "",
      jd_text:  currentJob.jd_text || "",
    });

    if (res?.ok && res.cover_letter) {
      coverBody.textContent = res.cover_letter;
      coverSection.classList.add("show");
      showToast("Cover letter ready ✓");

      // Auto-fill any cover letter textarea on the page
      try {
        await sendToContent("FILL_FORM");
      } catch { /* page may not have textarea */ }
    } else {
      showToast("Generation failed: " + (res?.error || "unknown error"));
    }
  } catch (err) {
    showToast("Error: " + err.message);
  } finally {
    setLoading(btnCover, false);
  }
});

// Download PDF
btnPdf.addEventListener("click", async () => {
  setLoading(btnPdf, true);
  try {
    const res = await chrome.runtime.sendMessage({ action: "DOWNLOAD_PDF" });
    if (res?.ok) showToast("PDF downloading…");
    else showToast("PDF failed: " + (res?.error || "check FastAPI"));
  } catch (err) {
    // Fallback: open in new tab
    chrome.tabs.create({ url: `${API_BASE}/pdf` });
  } finally {
    setTimeout(() => setLoading(btnPdf, false), 1200);
  }
});

// Copy cover letter
copyCover.addEventListener("click", async () => {
  if (!coverBody.textContent) return;
  await navigator.clipboard.writeText(coverBody.textContent);
  copyCover.textContent = "Copied!";
  setTimeout(() => (copyCover.textContent = "Copy"), 1800);
});

// Clear cache
btnClear.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "CLEAR_CACHE" });
  currentJob = null;
  jobInfo.style.display  = "none";
  noJobMsg.style.display = "block";
  noJobMsg.textContent   = "Cache cleared. Scrape a new JD.";
  coverSection.classList.remove("show");
  fillBadge.classList.remove("show");
  btnFill.disabled  = true;
  btnCover.disabled = true;
  showToast("Cache cleared");
});
