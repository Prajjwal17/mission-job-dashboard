/**
 * popup.js — Mission Job popup controller (v2 — executeScript architecture)
 *
 * No chrome.tabs.sendMessage / content script message passing.
 * All page interaction via chrome.scripting.executeScript() inline functions.
 * This bypasses "Receiving end does not exist" entirely.
 */

const API_BASE = "http://localhost:8000";

let currentJob = null;
let apiOnline  = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusDot    = document.getElementById("status-dot");
const noJobMsg     = document.getElementById("no-job-msg");
const jobInfo      = document.getElementById("job-info");
const jobCompany   = document.getElementById("job-company");
const jobRole      = document.getElementById("job-role");
const skillsRow    = document.getElementById("skills-row");
const btnScrape    = document.getElementById("btn-scrape");
const btnFill      = document.getElementById("btn-fill");
const btnCover     = document.getElementById("btn-cover");
const btnPdf       = document.getElementById("btn-pdf");
const btnClear     = document.getElementById("btn-clear");
const fillBadge    = document.getElementById("fill-badge");
const coverSection = document.getElementById("cover-section");
const coverBody    = document.getElementById("cover-body");
const copyCover    = document.getElementById("copy-cover");
const toast        = document.getElementById("toast");


// ── Utilities ─────────────────────────────────────────────────────────────────

function setLoading(btn, on) {
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

let _toastTimer;
function showToast(msg, dur = 2400) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove("show"), dur);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}


// ── Page functions (serialized into page via executeScript) ───────────────────

/** Runs IN the page context — scrapes JD from DOM. No external deps. */
function _pageScrapeFn() {
  const h = location.hostname;
  const q = s => document.querySelector(s)?.innerText?.trim() || "";
  const qAll = (...sels) => sels.map(q).find(Boolean) || "";

  let role = "", company = "", jd = "";

  if (h.includes("linkedin.com")) {
    role    = qAll(".jobs-unified-top-card__job-title h1", "h1.t-24", "h1");
    company = qAll(".jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name");
    jd      = qAll(".jobs-description__content", ".jobs-box__html-content");
  } else if (h.includes("lever.co")) {
    role    = qAll(".posting-headline h2", "h2", "h1");
    company = document.querySelector(".main-header-logo img")?.alt || "";
    jd      = qAll(".posting-description", "main");
  } else if (h.includes("greenhouse.io")) {
    role    = qAll("h1.app-title", "h1");
    company = document.title.split("|").slice(-1)[0]?.trim() || "";
    jd      = qAll("#content", ".job-post-content", "main");
  } else if (h.includes("workday") || h.includes("myworkdayjobs")) {
    role    = qAll("[data-automation-id='jobPostingHeader'] h2", "h2");
    company = document.title.split("|").slice(-1)[0]?.trim() || "";
    jd      = qAll("[data-automation-id='jobPostingDescription']", ".wd-text", "main");
  } else if (h.includes("hirist")) {
    role    = qAll("h1.jd-header-title", "h1");
    // Company sits in the meta line: "Connect2Talent • 1-5 Years • ₹8-16 LPA"
    company = qAll(".jd-header-comp-name", ".company-name", ".recruiter-company", ".comp-name");
    if (!company) {
      // Walk siblings of h1 for "CompanyName • X Yrs" pattern
      const h1 = document.querySelector("h1");
      let sib = h1?.nextElementSibling;
      for (let i = 0; i < 5 && sib; i++, sib = sib.nextElementSibling) {
        const t = sib.innerText || "";
        if (t.includes("•")) { company = t.split("•")[0].trim(); break; }
      }
    }
    jd = qAll(".job-description", ".jd-text", ".job-detail-body", ".inner-desc",
              ".jd-content", ".description-wrapper", ".description-section", "#jobDescription");
  } else if (h.includes("naukri.com")) {
    role    = qAll("h1.jd-header-title", "h1");
    company = qAll(".jd-header-comp-name a", ".comp-name a", ".jd-header-comp-name");
    jd      = qAll("#job_description", ".job-desc", ".dang-inner-html", ".jd-description");
  } else if (h.includes("ashbyhq")) {
    role    = qAll("h1");
    company = qAll(".ashby-job-posting-company-name") || document.title.split("|").slice(-1)[0]?.trim() || "";
    jd      = qAll(".ashby-application-form-container", ".job-posting-description", "main");
  } else if (h.includes("smartrecruiters")) {
    role    = qAll("h1.job-title", "h1");
    company = qAll(".company-name", ".employer-name");
    jd      = qAll(".job-description", ".content-wrapper", "main");
  } else if (h.includes("instahyre")) {
    role    = qAll("h1.job-title", ".job-position", "h1");
    company = qAll(".company-name", ".employer-name");
    jd      = qAll(".job-description", ".job-detail-description", "main");
  } else if (h.includes("foundit")) {
    role    = qAll("h1.job-title", ".jobTitle", "h1");
    company = qAll(".company-name", ".companyName");
    jd      = qAll(".job-description", ".jobDescription", "#JobDescription", "main");
  } else if (h.includes("shine.com")) {
    role    = qAll("h1.job-title", ".title", "h1");
    company = qAll(".company-name", ".comp-name");
    jd      = qAll(".job-description", ".description", "main");
  } else if (h.includes("internshala")) {
    role    = qAll("h1.profile-heading", ".profile", "h1");
    company = qAll(".company-name a", ".company_name", ".company");
    jd      = qAll(".internship_details", "#about_internship", "main");
  } else if (h.includes("job24x7") || h.includes("hyred") || h.includes("thejob.dev")) {
    role    = qAll("h1.job-title", "h1");
    company = qAll(".company-name", ".employer-name", ".org-name");
    jd      = qAll(".job-description", ".description", ".content", "main article", "main");
  } else {
    // Generic
    role    = qAll("h1");
    company = document.title.split(/[-|@·]/).slice(-1)[0]?.trim() || "";
    jd      = qAll("main", "article", "#job-description", ".job-description",
                   ".description", "#description", ".posting-content");
  }

  // Universal JD fallback — find largest text block
  if (!jd) {
    let best = "", bestLen = 0;
    for (const el of document.querySelectorAll("div, section, article")) {
      const cls = (el.className + " " + el.id).toLowerCase();
      if (/nav|header|footer|sidebar|menu|cookie|chat|modal/.test(cls)) continue;
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length < 15000 && el.children.length < 50) {
        best = t; bestLen = t.length;
      }
    }
    jd = best;
  }

  return {
    role:    role.trim().slice(0, 200),
    company: company.trim().slice(0, 100),
    jd_text: jd.trim().slice(0, 6000),
    url:     location.href,
  };
}

/** Runs IN the page context — fills form fields. Receives profile + field pattern strings. */
function _pageFillFn(profile, fieldPatterns) {
  // Rebuild RegExp from serialized strings
  const maps = fieldPatterns.map(([key, rxStrs]) => ({
    key,
    rxs: rxStrs.map(s => new RegExp(s, "i")),
  }));

  function matchKey(el) {
    const attrStr = [el.id, el.name, el.placeholder,
      el.getAttribute("aria-label"), el.getAttribute("data-automation-id")]
      .filter(Boolean).join(" ");
    for (const { key, rxs } of maps) {
      if (rxs.some(r => r.test(attrStr))) return key;
    }
    let label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    if (!label) label = el.closest("label") || el.parentElement?.querySelector("label");
    if (label) {
      const txt = label.textContent.trim();
      for (const { key, rxs } of maps) {
        if (rxs.some(r => r.test(txt))) return key;
      }
    }
    return null;
  }

  let filled = 0;
  const inputs = [...document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]), textarea"
  )];

  for (const el of inputs) {
    const key = matchKey(el);
    if (!key || !profile[key]) continue;
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value"
    )?.set;
    if (setter) setter.call(el, profile[key]); else el.value = profile[key];
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur",   { bubbles: true }));
    filled++;
  }

  for (const sel of document.querySelectorAll("select")) {
    const key = matchKey(sel);
    if (!key || !profile[key]) continue;
    const val = profile[key].toLowerCase();
    for (const opt of sel.options) {
      if (opt.text.toLowerCase().includes(val) || opt.value.toLowerCase().includes(val)) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
        break;
      }
    }
  }

  return filled;
}


// ── Candidate profile + field patterns (serialized for executeScript args) ────

const CANDIDATE = {
  first_name: "Prajjwal", last_name: "Pandey", full_name: "Prajjwal Pandey",
  email: "prajjwalp1707@gmail.com", phone: "+91-8173088447",
  linkedin: "https://linkedin.com/in/prajjwal-pandey",
  github: "https://github.com/Prajjwal17",
  portfolio: "https://github.com/Prajjwal17",
  city: "Vellore", state: "Tamil Nadu", country: "India", zip: "632014",
  university: "Vellore Institute of Technology",
  degree: "B.Tech Electronics and Communication Engineering",
  graduation_year: "2026", gpa: "8.2", experience_years: "2",
  current_company: "VIT Vellore (Final Year)",
  current_title: "AI Automation Engineer",
  notice_period: "Immediate", expected_ctc: "As per industry standards",
  current_ctc: "0", cover_letter: "",
};

// Field patterns as plain strings (RegExp not JSON-serializable)
const FIELD_PATTERNS = [
  ["first_name",       ["first[\\s_-]?name", "\\bfname\\b", "given[\\s_-]?name"]],
  ["last_name",        ["last[\\s_-]?name",  "\\blname\\b", "family[\\s_-]?name", "surname"]],
  ["full_name",        ["^name$", "full[\\s_-]?name", "your[\\s_-]?name", "applicant[\\s_-]?name"]],
  ["email",            ["e[\\s_-]?mail", "email[\\s_-]?address"]],
  ["phone",            ["phone", "mobile", "contact[\\s_-]?number", "\\btel\\b", "cell"]],
  ["linkedin",         ["linkedin", "linked[\\s_-]?in", "li[\\s_-]?profile"]],
  ["github",           ["github", "git[\\s_-]?hub"]],
  ["portfolio",        ["portfolio", "website", "personal[\\s_-]?url"]],
  ["city",             ["\\bcity\\b", "\\btown\\b"]],
  ["state",            ["\\bstate\\b", "province", "region"]],
  ["country",          ["\\bcountry\\b", "nation"]],
  ["zip",              ["zip", "postal", "pin[\\s_-]?code"]],
  ["university",       ["university", "college", "institution", "school"]],
  ["degree",           ["degree", "qualification", "education"]],
  ["graduation_year",  ["graduation[\\s_-]?year", "passing[\\s_-]?year", "year[\\s_-]?of[\\s_-]?grad"]],
  ["gpa",              ["\\bgpa\\b", "\\bcgpa\\b", "grade[\\s_-]?point"]],
  ["experience_years", ["years?[\\s_-]?of[\\s_-]?exp", "exp[\\s_-]?years", "total[\\s_-]?exp"]],
  ["current_company",  ["current[\\s_-]?company", "present[\\s_-]?employer", "current[\\s_-]?employer"]],
  ["current_title",    ["current[\\s_-]?title", "current[\\s_-]?role", "designation"]],
  ["notice_period",    ["notice[\\s_-]?period", "joining[\\s_-]?time", "availability"]],
  ["expected_ctc",     ["expected[\\s_-]?(ctc|salary|comp)", "desired[\\s_-]?salary"]],
  ["current_ctc",      ["current[\\s_-]?(ctc|salary|comp)", "present[\\s_-]?salary"]],
  ["cover_letter",     ["cover[\\s_-]?letter", "motivation[\\s_-]?letter", "why[\\s_-]?(do[\\s_-]?you|join)"]],
];


// ── Core actions ──────────────────────────────────────────────────────────────

async function scrapeJD() {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab");

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: _pageScrapeFn,
  });

  // Send to backend for AI parsing
  let parsed = result;
  try {
    const res = await fetch(`${API_BASE}/scrape-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (res.ok) parsed = await res.json();
  } catch { /* offline — use raw scrape */ }

  await chrome.storage.local.set({ current_job: parsed });
  return parsed;
}

async function fillForm(coverLetter = "") {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab");

  const profile = { ...CANDIDATE };
  if (coverLetter) profile.cover_letter = coverLetter;

  // Also pull cached cover letter
  const stored = await chrome.storage.local.get("cover_letter");
  if (stored.cover_letter && !profile.cover_letter) {
    profile.cover_letter = stored.cover_letter;
  }

  const [{ result: count }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: _pageFillFn,
    args: [profile, FIELD_PATTERNS],
  });

  return count;
}


// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const h = await res.json();
      apiOnline = true;
      statusDot.className = "status-dot online";
      statusDot.title = `API online · Ollama ${h.ollama ? "✓" : "✗ (run: ollama serve)"}`;
    } else throw new Error();
  } catch {
    statusDot.className = "status-dot offline";
    statusDot.title = "API offline — run: uvicorn api:app --port 8000";
  }

  const stored = await chrome.storage.local.get(["current_job", "cover_letter"]);
  if (stored.current_job) {
    renderJob(stored.current_job);
  } else {
    noJobMsg.textContent = "Click 'Scrape JD' on a job page.";
  }
  if (stored.cover_letter) {
    coverBody.textContent = stored.cover_letter;
    coverSection.classList.add("show");
  }
}

function renderJob(job) {
  currentJob = job;
  noJobMsg.style.display = "none";
  jobInfo.style.display  = "block";
  jobCompany.textContent = job.company || "Unknown company";
  jobRole.textContent    = job.role    || "Unknown role";
  skillsRow.innerHTML = "";
  for (const s of (job.required_skills || []).slice(0, 6)) {
    const p = document.createElement("span");
    p.className = "skill-pill"; p.textContent = s;
    skillsRow.appendChild(p);
  }
  btnFill.disabled  = false;
  btnCover.disabled = false;
}

init();


// ── Button handlers ───────────────────────────────────────────────────────────

btnScrape.addEventListener("click", async () => {
  setLoading(btnScrape, true);
  try {
    const job = await scrapeJD();
    renderJob(job);
    showToast(job.required_skills?.length ? "JD scraped & parsed ✓" : "Scraped (no API parse)");
  } catch (err) {
    showToast("Error: " + err.message);
    console.error("scrapeJD:", err);
  } finally {
    setLoading(btnScrape, false);
  }
});

btnFill.addEventListener("click", async () => {
  setLoading(btnFill, true);
  try {
    const count = await fillForm();
    fillBadge.textContent = `${count} field${count !== 1 ? "s" : ""}`;
    fillBadge.classList.toggle("show", count > 0);
    showToast(count > 0 ? `Filled ${count} field${count !== 1 ? "s" : ""} ✓` : "No matching fields found");
  } catch (err) {
    showToast("Error: " + err.message);
    console.error("fillForm:", err);
  } finally {
    setLoading(btnFill, false);
  }
});

btnCover.addEventListener("click", async () => {
  if (!currentJob) return showToast("Scrape a JD first.");
  if (!apiOnline)  return showToast("API offline — start FastAPI :8000");

  setLoading(btnCover, true);
  coverSection.classList.remove("show");
  try {
    const raw = await fetch(`${API_BASE}/tailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name:    currentJob.company || "",
        job_description: currentJob.jd_text || "",
        generate_star:   false,
      }),
    });
    if (!raw.ok) throw new Error(`HTTP ${raw.status}`);
    const res = await raw.json();

    if (res.cover_letter) {
      coverBody.textContent = res.cover_letter;
      coverSection.classList.add("show");
      await chrome.storage.local.set({ cover_letter: res.cover_letter });
      showToast("Cover letter ready ✓");
      // Auto-fill cover letter textarea
      try { await fillForm(res.cover_letter); } catch { /* no textarea */ }
    }
  } catch (err) {
    showToast("Error: " + err.message);
  } finally {
    setLoading(btnCover, false);
  }
});

btnPdf.addEventListener("click", async () => {
  setLoading(btnPdf, true);
  try {
    chrome.tabs.create({ url: `${API_BASE}/pdf` });
    showToast("Opening PDF…");
  } finally {
    setTimeout(() => setLoading(btnPdf, false), 1000);
  }
});

copyCover.addEventListener("click", async () => {
  if (!coverBody.textContent) return;
  await navigator.clipboard.writeText(coverBody.textContent);
  copyCover.textContent = "Copied!";
  setTimeout(() => (copyCover.textContent = "Copy"), 1800);
});

btnClear.addEventListener("click", async () => {
  await chrome.storage.local.remove(["current_job", "cover_letter"]);
  currentJob = null;
  jobInfo.style.display  = "none";
  noJobMsg.style.display = "block";
  noJobMsg.textContent   = "Cache cleared.";
  coverSection.classList.remove("show");
  fillBadge.classList.remove("show");
  btnFill.disabled = btnCover.disabled = true;
  showToast("Cache cleared");
});
