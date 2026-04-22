/**
 * content.js — Mission Job content script (Manifest v3)
 * Runs on LinkedIn / Workday / Lever / Greenhouse / Ashby / SmartRecruiters
 *
 * Responsibilities:
 *   1. scrapeJD()        — extract job title + description text from page
 *   2. detectFields()    — find all fillable form inputs + fuzzy-match them
 *   3. fillForm(data)    — set values on matched inputs, trigger React/Vue events
 *   4. Message handler   — listens for commands from popup.js via chrome.runtime
 */

const API_BASE = "http://localhost:8000";

// ── 1. JD Scraping ────────────────────────────────────────────────────────────

function scrapeJD() {
  const result = { company: "", role: "", jd_text: "", url: location.href };

  // LinkedIn Easy Apply
  if (location.hostname.includes("linkedin.com")) {
    result.role    = _text(".jobs-unified-top-card__job-title, h1.t-24") || "";
    result.company = _text(".jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name") || "";
    result.jd_text = _text(".jobs-description__content, .jobs-box__html-content") || "";
  }

  // Lever
  else if (location.hostname.includes("lever.co")) {
    result.role    = _text(".posting-headline h2") || _text("h2") || "";
    result.company = _text(".main-header-logo img")
      ? document.querySelector(".main-header-logo img")?.alt || ""
      : _text(".posting-categories .sort-by-team") || "";
    result.jd_text = _text(".posting-description") || "";
  }

  // Greenhouse
  else if (location.hostname.includes("greenhouse.io")) {
    result.role    = _text("h1.app-title") || _text("h1") || "";
    result.company = document.title.split("|").slice(-1)[0]?.trim() || "";
    result.jd_text = _text("#content") || _text(".job-post-content") || "";
  }

  // Workday / myworkdayjobs
  else if (location.hostname.includes("workday.com") || location.hostname.includes("myworkdayjobs.com")) {
    result.role    = _text("[data-automation-id='jobPostingHeader'] h2, h2[data-automation-id]") || _text("h2") || "";
    result.company = document.title.split("|").slice(-1)[0]?.trim() || "";
    result.jd_text = _text("[data-automation-id='jobPostingDescription'], .wd-text") || "";
  }

  // Ashby
  else if (location.hostname.includes("ashbyhq.com")) {
    result.role    = _text("h1") || "";
    result.company = _text(".ashby-job-posting-company-name") || document.title.split("|").slice(-1)[0]?.trim() || "";
    result.jd_text = _text(".ashby-application-form-container, .job-posting-description") || "";
  }

  // Naukri
  else if (location.hostname.includes("naukri.com")) {
    result.role    = _text("h1.jd-header-title, .jd-header-title, h1") || "";
    result.company = _text(".jd-header-comp-name a, .comp-name a, .jd-header-comp-name") || "";
    result.jd_text = _text("#job_description, .job-desc, .dang-inner-html, .jd-description") || "";
  }

  // Hirist (hirist.tech / hirist.com)
  else if (location.hostname.includes("hirist")) {
    result.role = _text("h1") || "";

    // Company: hirist shows "CompanyName • X Years • ₹ Range • City" as a <p>/<div> under h1
    // Try dedicated selectors first, then parse the meta line
    result.company = _text([
      ".jd-header-comp-name", ".company-name", ".job-company-name",
      ".comp-name", ".recruiter-company", ".jd-company",
      "a[href*='/company/']",
    ].join(", ")) || "";

    if (!result.company) {
      // Parse the "Connect2Talent • 1 - 5 Years • ₹8-16 LPA • Bangalore" meta line
      const h1 = document.querySelector("h1");
      if (h1) {
        // Grab the next sibling element — usually a <p> or <div> with the meta
        let sibling = h1.nextElementSibling;
        while (sibling && !sibling.innerText?.includes("•")) sibling = sibling.nextElementSibling;
        if (sibling) result.company = sibling.innerText.split("•")[0].trim();
      }
    }

    if (!result.company) {
      // Last resort: scan all <p> and <div> for one containing "• Years •" pattern
      for (const el of document.querySelectorAll("p, div, span")) {
        const t = el.innerText || "";
        if (/•\s*\d.*(years?|yrs?)/i.test(t) && el.children.length < 4) {
          result.company = t.split("•")[0].trim();
          break;
        }
      }
    }

    result.jd_text = _text([
      ".job-description", ".jd-text", ".job-detail-body",
      ".description-section", "#jobDescription", ".inner-desc",
      ".jd-content", ".description-wrapper", ".desc-content",
      ".job-detail", "section.description", ".posting-description",
    ].join(", ")) || "";
  }

  // Job24x7
  else if (location.hostname.includes("job24x7")) {
    result.role    = _text("h1.job-title, .job-header h1, h1") || "";
    result.company = _text(".company-name, .employer-name, h2.company") || "";
    result.jd_text = _text(".job-description, .job-details, .description") || "";
  }

  // Hyred (hyred.io)
  else if (location.hostname.includes("hyred")) {
    result.role    = _text("h1.role-title, .job-title, h1") || "";
    result.company = _text(".company-name, .org-name, .employer") || "";
    result.jd_text = _text(".job-description, .role-description, .about-role") || "";
  }

  // thejob.dev
  else if (location.hostname.includes("thejob.dev")) {
    result.role    = _text("h1.job-title, h1.title, h1") || "";
    result.company = _text(".company, .employer, .org-name, h2") || "";
    result.jd_text = _text(".job-description, .description, .content, main article") || "";
  }

  // Instahyre
  else if (location.hostname.includes("instahyre")) {
    result.role    = _text("h1.job-title, .job-position, h1") || "";
    result.company = _text(".company-name, .employer-name") || "";
    result.jd_text = _text(".job-description, .job-detail-description, .jd-content") || "";
  }

  // Foundit (formerly Monster India)
  else if (location.hostname.includes("foundit")) {
    result.role    = _text("h1.job-title, .jobTitle, h1") || "";
    result.company = _text(".company-name, .companyName, .comp-name") || "";
    result.jd_text = _text(".job-description, .jobDescription, #JobDescription") || "";
  }

  // Shine
  else if (location.hostname.includes("shine.com")) {
    result.role    = _text("h1.job-title, .title, h1") || "";
    result.company = _text(".company-name, .comp-name") || "";
    result.jd_text = _text(".job-description, .description, .job-detail") || "";
  }

  // Internshala
  else if (location.hostname.includes("internshala")) {
    result.role    = _text("h1.profile-heading, .profile, h1") || "";
    result.company = _text(".company-name a, .company_name, .company") || "";
    result.jd_text = _text(".internship_details, .job-description, #about_internship") || "";
  }

  // Generic fallback (works surprisingly well on most job boards)
  else {
    result.role    = _text("h1") || document.title || "";
    result.company = document.title.split(/[-|@·]/).slice(-1)[0]?.trim() || "";
    result.jd_text = _text([
      "main", "article", "#job-description", ".job-description",
      ".description", "#description", ".job-details", ".posting-content",
    ].join(", ")) || "";
  }

  // Universal fallback — if platform scraper got no JD text, grab largest text block on page
  if (!result.jd_text) {
    const candidates = [...document.querySelectorAll("div, section, article")];
    let best = null, bestLen = 0;
    for (const el of candidates) {
      // Skip nav/header/footer/script areas
      const tag = el.tagName.toLowerCase();
      const cls = (el.className + " " + el.id).toLowerCase();
      if (/nav|header|footer|sidebar|menu|cookie|chat|modal/.test(cls)) continue;
      const t = (el.innerText || "").trim();
      if (t.length > bestLen && t.length < 15000 && el.children.length < 50) {
        best = t; bestLen = t.length;
      }
    }
    if (best) result.jd_text = best;
  }

  // Trim
  result.jd_text = result.jd_text.slice(0, 6000).trim();
  result.role    = result.role.trim();
  result.company = result.company.trim();

  return result;
}

function _text(selector) {
  const el = document.querySelector(selector);
  return el ? el.innerText || el.textContent : null;
}


// ── 2. Field Detection ────────────────────────────────────────────────────────

function detectFields() {
  const inputs = [
    ...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file])"),
    ...document.querySelectorAll("textarea"),
    ...document.querySelectorAll("select"),
  ];

  const detected = [];
  for (const el of inputs) {
    const key = fuzzyMatch(el);  // from mappings.js
    if (key) {
      detected.push({
        key,
        tag:         el.tagName.toLowerCase(),
        type:        el.type || "text",
        id:          el.id,
        name:        el.name,
        placeholder: el.placeholder,
      });
    }
  }
  return detected;
}


// ── 3. Form Fill ──────────────────────────────────────────────────────────────

/**
 * Fill all matched form fields with candidate profile values.
 * Handles React synthetic events (Workday uses React internally).
 */
async function fillForm(profile) {
  // Merge cached cover letter into profile
  const stored = await chrome.storage.local.get("cover_letter");
  if (stored.cover_letter) profile.cover_letter = stored.cover_letter;

  const inputs = [
    ...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file])"),
    ...document.querySelectorAll("textarea"),
  ];

  let filled = 0;
  for (const el of inputs) {
    const key = fuzzyMatch(el);
    if (!key || !profile[key]) continue;

    const value = profile[key];

    // Native input value setter (bypasses React's controlled component lock)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Fire events React/Vue/Angular listen to
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur",   { bubbles: true }));
    filled++;
  }

  // Handle <select> dropdowns (country, state, etc.)
  const selects = document.querySelectorAll("select");
  for (const sel of selects) {
    const key = fuzzyMatch(sel);
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


// ── 4. Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.action) {

      case "PING":
        sendResponse({ ok: true });
        break;

      case "SCRAPE_JD": {
        const jd = scrapeJD();
        // POST to backend for structured parsing
        try {
          const res = await fetch(`${API_BASE}/scrape-job`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(jd),
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const parsed = await res.json();
          // Cache parsed JD
          await chrome.storage.local.set({ current_job: parsed });
          sendResponse({ ok: true, data: parsed });
        } catch (err) {
          // Fallback: return raw scrape without AI parsing
          await chrome.storage.local.set({ current_job: jd });
          sendResponse({ ok: false, data: jd, error: err.message });
        }
        break;
      }

      case "DETECT_FIELDS": {
        const fields = detectFields();
        sendResponse({ ok: true, fields });
        break;
      }

      case "FILL_FORM": {
        const profile = { ...CANDIDATE, ...(msg.overrides || {}) };
        const count = await fillForm(profile);
        sendResponse({ ok: true, filled: count });
        break;
      }

      default:
        sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
    }
  })();

  return true; // keep message channel open for async response
});

// Signal to popup that content script is ready
chrome.runtime.sendMessage({ action: "CONTENT_READY", url: location.href }).catch(() => {});
