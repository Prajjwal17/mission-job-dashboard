/**
 * mappings.js — Candidate profile + fuzzy field matching
 * Injected before content.js on all supported ATS pages.
 */

// ── Candidate data ────────────────────────────────────────────────────────────
const CANDIDATE = {
  first_name:       "Prajjwal",
  last_name:        "Pandey",
  full_name:        "Prajjwal Pandey",
  email:            "prajjwalp1707@gmail.com",
  phone:            "+91-8173088447",
  linkedin:         "https://linkedin.com/in/prajjwal-pandey",
  github:           "https://github.com/Prajjwal17",
  portfolio:        "https://github.com/Prajjwal17",
  city:             "Vellore",
  state:            "Tamil Nadu",
  country:          "India",
  zip:              "632014",
  university:       "Vellore Institute of Technology",
  degree:           "B.Tech Electronics and Communication Engineering",
  graduation_year:  "2026",
  gpa:              "8.2",
  experience_years: "2",
  current_company:  "VIT Vellore (Final Year)",
  current_title:    "AI Automation Engineer",
  notice_period:    "Immediate / 0 days",
  expected_ctc:     "As per industry standards",
  current_ctc:      "0",
  cover_letter:     "",   // populated at runtime from chrome.storage
};

// ── Field → regex patterns ────────────────────────────────────────────────────
const FIELD_MAPS = [
  { key: "first_name",       rx: [/first[\s_-]?name/i, /\bfname\b/i, /given[\s_-]?name/i] },
  { key: "last_name",        rx: [/last[\s_-]?name/i,  /\blname\b/i, /family[\s_-]?name/i, /surname/i] },
  { key: "full_name",        rx: [/^name$/i, /full[\s_-]?name/i, /your[\s_-]?name/i, /applicant[\s_-]?name/i] },
  { key: "email",            rx: [/e[\s_-]?mail/i, /email[\s_-]?address/i] },
  { key: "phone",            rx: [/phone/i, /mobile/i, /contact[\s_-]?number/i, /\btel\b/i, /cell/i] },
  { key: "linkedin",         rx: [/linkedin/i, /linked[\s_-]?in[\s_-]?url/i, /li[\s_-]?profile/i] },
  { key: "github",           rx: [/github/i, /git[\s_-]?hub[\s_-]?url/i] },
  { key: "portfolio",        rx: [/portfolio/i, /website/i, /personal[\s_-]?url/i] },
  { key: "city",             rx: [/\bcity\b/i, /\btown\b/i] },
  { key: "state",            rx: [/\bstate\b/i, /province/i, /region/i] },
  { key: "country",          rx: [/\bcountry\b/i, /nation/i] },
  { key: "zip",              rx: [/zip/i, /postal/i, /pin[\s_-]?code/i] },
  { key: "university",       rx: [/university/i, /college/i, /institution/i, /school/i] },
  { key: "degree",           rx: [/degree/i, /qualification/i, /education/i] },
  { key: "graduation_year",  rx: [/graduation[\s_-]?year/i, /passing[\s_-]?year/i, /year[\s_-]?of[\s_-]?grad/i] },
  { key: "gpa",              rx: [/\bgpa\b/i, /\bcgpa\b/i, /grade[\s_-]?point/i] },
  { key: "experience_years", rx: [/years?[\s_-]?of[\s_-]?exp/i, /exp[\s_-]?years/i, /total[\s_-]?exp/i, /work[\s_-]?exp/i] },
  { key: "current_company",  rx: [/current[\s_-]?company/i, /present[\s_-]?employer/i, /current[\s_-]?employer/i] },
  { key: "current_title",    rx: [/current[\s_-]?title/i, /current[\s_-]?role/i, /current[\s_-]?position/i, /designation/i] },
  { key: "notice_period",    rx: [/notice[\s_-]?period/i, /joining[\s_-]?time/i, /availability/i, /start[\s_-]?date/i] },
  { key: "expected_ctc",     rx: [/expected[\s_-]?(ctc|salary|comp)/i, /desired[\s_-]?salary/i, /salary[\s_-]?expected/i] },
  { key: "current_ctc",      rx: [/current[\s_-]?(ctc|salary|comp)/i, /present[\s_-]?salary/i] },
  { key: "cover_letter",     rx: [/cover[\s_-]?letter/i, /motivation[\s_-]?letter/i, /why[\s_-]?(do[\s_-]?you|join)/i] },
];

/**
 * fuzzyMatch(el) → candidate key string | null
 * Checks: id, name, placeholder, aria-label, data-* attrs, then nearby <label>.
 */
function fuzzyMatch(el) {
  // Build search string from element attributes
  const attrStr = [
    el.id,
    el.name,
    el.placeholder,
    el.getAttribute("aria-label"),
    el.getAttribute("aria-labelledby"),
    el.getAttribute("data-field-id"),
    el.getAttribute("data-automation-id"),
    el.getAttribute("data-testid"),
  ].filter(Boolean).join(" ");

  for (const { key, rx } of FIELD_MAPS) {
    if (rx.some(r => r.test(attrStr))) return key;
  }

  // Check nearest <label>
  let label = null;
  if (el.id) label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  if (!label) label = el.closest("label") || el.parentElement?.querySelector("label");
  if (label) {
    const txt = label.textContent.trim();
    for (const { key, rx } of FIELD_MAPS) {
      if (rx.some(r => r.test(txt))) return key;
    }
  }

  return null;
}
