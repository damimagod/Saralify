/* Saralify shared data + helpers — standalone GitHub build.
   This build does not run inside Claude's artifact sandbox, so it uses
   real client-side services instead of Claude's own AI:
     - Translation: Google Translate's public "gtx" endpoint (free, no API
       key, works from any website). It's the same translator behind the
       Google Translate website/app, just called directly; it's unofficial
       and could change or get rate-limited, but is widely used this way.
     - Reading a photographed document: Tesseract.js, an open-source OCR
       engine that runs entirely in the browser (no server, no key).
   Quality is lower than a hosted-AI version, especially for messy photos,
   handwriting, or the least-common languages — see the two notes below. */
(function (global) {
  "use strict";

  var LANGUAGES = [
    { name: "Hindi", code: "hi", speech: "hi-IN" },
    { name: "Bengali", code: "bn", speech: "bn-IN" },
    { name: "Marathi", code: "mr", speech: "mr-IN" },
    { name: "Tamil", code: "ta", speech: "ta-IN" },
    { name: "Telugu", code: "te", speech: "te-IN" },
    { name: "Gujarati", code: "gu", speech: "gu-IN" },
    { name: "Kannada", code: "kn", speech: "kn-IN" },
    { name: "Malayalam", code: "ml", speech: "ml-IN" },
    { name: "Punjabi", code: "pa", speech: "pa-IN" },
    { name: "Odia", code: "or", speech: "or-IN" },
    { name: "Assamese", code: "as", speech: "as-IN" },
    { name: "Dogri", code: "doi", speech: "doi-IN" },
    { name: "Konkani", code: "gom", speech: "kok-IN" },
    { name: "Sanskrit", code: "sa", speech: "sa-IN" },
    { name: "Manipuri", code: "mni", speech: "mni-IN" },
    { name: "Mizo", code: "lus", speech: "lus-IN" },
    { name: "Khasi", code: "kha", speech: "kha-IN" },
    { name: "Nepali", code: "ne", speech: "ne-NP" },
    { name: "Urdu", code: "ur", speech: "ur-IN" }
  ];

  // Google Translate's language code for each entry above, where it
  // differs from our own `code` (Manipuri is "mni-Mtei" there). All 19
  // languages in this list are covered by Google Translate.
  var GOOGLE_CODE = {
    hi: "hi", bn: "bn", mr: "mr", ta: "ta", te: "te", gu: "gu", kn: "kn",
    ml: "ml", pa: "pa", or: "or", as: "as", doi: "doi", gom: "gom",
    sa: "sa", mni: "mni-Mtei", lus: "lus", kha: "kha", ne: "ne", ur: "ur"
  };

  var STORAGE_KEY = "saralify_lang";

  function getStoredLang() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.code && parsed.name) return parsed;
      return null;
    } catch (e) { return null; }
  }
  function setStoredLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lang)); } catch (e) {}
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findLanguage(languageName) {
    return LANGUAGES.find(function (l) { return l.name === languageName; });
  }

  // ---------- translation (Google Translate's public endpoint) ----------

  async function translateOne(text, googleCode) {
    if (!text || !text.trim()) return "";
    var url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
      encodeURIComponent(googleCode) + "&dt=t&q=" + encodeURIComponent(text);
    var res;
    try {
      res = await fetch(url);
    } catch (e) {
      var ne = new Error("network"); ne.code = "network"; throw ne;
    }
    if (!res.ok) {
      var he = new Error("translate-http-" + res.status); he.code = "network"; throw he;
    }
    var data = await res.json();
    var out = "";
    if (Array.isArray(data) && Array.isArray(data[0])) {
      data[0].forEach(function (seg) {
        if (seg && typeof seg[0] === "string") out += seg[0];
      });
    }
    return out || text;
  }

  function unsupportedError(languageName) {
    var e = new Error("lang-unsupported");
    e.code = "lang-unsupported";
    e.languageName = languageName;
    return e;
  }

  async function translateText(text, languageName) {
    var lang = findLanguage(languageName);
    var gcode = lang && GOOGLE_CODE[lang.code];
    if (!gcode) throw unsupportedError(languageName);
    return translateOne(text, gcode);
  }

  // Translates an ordered list of short strings. Each item is requested
  // individually (a handful at a time) rather than packed into one call,
  // because the translate endpoint gives no reliable way to split a joined
  // batch back into exactly the right pieces — this is slower but never
  // scrambles the results. A single item failing (network hiccup) falls
  // back to its original English text rather than failing the whole list.
  async function translateBatch(items, languageName) {
    if (!items.length) return [];
    var lang = findLanguage(languageName);
    var gcode = lang && GOOGLE_CODE[lang.code];
    if (!gcode) throw unsupportedError(languageName);

    var result = new Array(items.length);
    var next = 0;
    var concurrency = 5;
    async function worker() {
      while (next < items.length) {
        var idx = next++;
        try {
          var t = await translateOne(items[idx], gcode);
          result[idx] = t && t.trim() ? t : items[idx];
        } catch (e) {
          result[idx] = items[idx];
        }
      }
    }
    var workers = [];
    for (var w = 0; w < concurrency; w++) workers.push(worker());
    await Promise.all(workers);
    return result;
  }

  async function localizeStrings(stringsObj, languageName, cacheKey) {
    try {
      var raw = localStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var keys = Object.keys(stringsObj);
    var values = keys.map(function (k) { return stringsObj[k]; });
    var translatedArr = await translateBatch(values, languageName);
    var out = {};
    keys.forEach(function (k, i) { out[k] = translatedArr[i]; });
    try { localStorage.setItem(cacheKey, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function sampleErrorMessage(err) {
    if (err && err.code === "lang-unsupported") {
      return (err.languageName || "This language") +
        " isn't supported by the free translation service this build uses.";
    }
    if (err && err.code === "network") {
      return "Couldn't reach the translation service. Check your connection and try again.";
    }
    return "Something went wrong while translating. Please try again.";
  }

  // ---------- a small static glossary, used instead of AI-generated ----------
  // definitions on the photo-reading page (there is no AI here to invent
  // these per-document, so this is a fixed list of common banking/financial
  // terms likely to show up in Indian banking forms).
  var STATIC_GLOSSARY = [
    { term: "KYC", definition: "Know Your Customer — the identity and address checks banks must do before opening an account or starting a service." },
    { term: "PAN", definition: "Permanent Account Number — a 10-character ID from the Income Tax Department, used for most financial transactions." },
    { term: "Aadhaar", definition: "A 12-digit identity number issued by the Indian government, commonly used as proof of identity and address." },
    { term: "NACH", definition: "National Automated Clearing House — the system banks use to automatically debit recurring payments like EMIs." },
    { term: "EMI", definition: "Equated Monthly Installment — the fixed amount paid each month toward a loan." },
    { term: "IFSC", definition: "Indian Financial System Code — an 11-character code identifying a specific bank branch for transfers." },
    { term: "NEFT", definition: "National Electronic Funds Transfer — a system for sending money between bank accounts, usually settled in batches." },
    { term: "RTGS", definition: "Real Time Gross Settlement — a system for transferring money between accounts instantly, usually for larger amounts." },
    { term: "Nominee", definition: "The person named to receive the money in an account if the account holder passes away." },
    { term: "Fixed Deposit", definition: "A lump sum of money locked in with the bank for a set period to earn a fixed interest rate." },
    { term: "Recurring Deposit", definition: "A savings plan where a fixed amount is deposited every month and earns interest." },
    { term: "Demand Draft", definition: "A guaranteed payment instrument issued by a bank, used instead of a personal cheque." },
    { term: "Standing Instruction", definition: "A standing order given to a bank to make a regular payment automatically." },
    { term: "Overdraft", definition: "Permission from the bank to withdraw more money than is in the account, up to an agreed limit." },
    { term: "CIBIL score", definition: "A three-digit credit score used in India to judge how likely someone is to repay a loan." },
    { term: "Cheque", definition: "A written, signed instruction to a bank to pay a specific amount from the account." }
  ];

  // ---------- shared content ----------

  var FORMS = [
    { category: "Account opening & KYC", name: "Savings Account Opening Form",
      desc: "Used to open a new savings account. Includes personal details, address proof and the first deposit amount.",
      fields: ["Full name","Date of birth","Permanent address","Mobile number","Email address","PAN number","Aadhaar number","Initial deposit amount","Signature"] },
    { category: "Account opening & KYC", name: "KYC (Know Your Customer) Form",
      desc: "Confirms identity and address with proof documents, required before most banking services can start.",
      fields: ["Full name","Date of birth","Permanent address","Proof of identity type","Proof of address type","PAN number","Aadhaar number","Signature"] },
    { category: "Account opening & KYC", name: "Nomination Form",
      desc: "Names the person who will receive the money in the account if something happens to the account holder.",
      fields: ["Account number","Nominee's full name","Nominee's date of birth","Relationship with nominee","Nominee's address","Share of amount","Signature"] },
    { category: "Deposits & savings", name: "Fixed Deposit Opening Form",
      desc: "Locks in a lump sum of money for a set period to earn a fixed rate of interest.",
      fields: ["Account number","Deposit amount","Deposit period","Interest payout option","Maturity instructions","Nominee name","Signature"] },
    { category: "Deposits & savings", name: "Recurring Deposit Opening Form",
      desc: "Sets up a plan to deposit a fixed amount every month and earn interest on it.",
      fields: ["Account number","Monthly installment amount","Deposit period","Auto-debit account number","Nominee name","Signature"] },
    { category: "Deposits & savings", name: "Pay-in (Deposit) Slip",
      desc: "Filled out at the counter to deposit cash or cheques into an account.",
      fields: ["Account number","Account holder's name","Date","Cash amount","Cheque number, if any","Total amount","Depositor's signature"] },
    { category: "Deposits & savings", name: "Withdrawal Slip",
      desc: "Used to take out cash from a savings account at the branch counter.",
      fields: ["Account number","Account holder's name","Date","Amount in figures","Amount in words","Signature"] },
    { category: "Loans & credit", name: "Loan Application Form",
      desc: "Starts the process of applying for a personal, home, vehicle or business loan.",
      fields: ["Full name","Date of birth","Address","Loan type","Loan amount requested","Monthly income","Employer name","Existing loans, if any","Signature"] },
    { category: "Loans & credit", name: "NACH / Auto-Debit Mandate Form",
      desc: "Gives the bank permission to automatically deduct an EMI or other payment each month.",
      fields: ["Account number","Bank name and branch","Amount to be debited","Frequency","Start date","End date","Signature"] },
    { category: "Cards & payments", name: "Debit or Credit Card Application Form",
      desc: "Requests a new debit or credit card linked to an account.",
      fields: ["Full name","Account number","Card type requested","Mailing address","Mobile number","Signature"] },
    { category: "Cards & payments", name: "Cheque Book Request Form",
      desc: "Requests a new book of cheques for an account.",
      fields: ["Account number","Account holder's name","Number of cheque leaves requested","Delivery address","Signature"] },
    { category: "Cards & payments", name: "Demand Draft Request Form",
      desc: "Requests a demand draft, a guaranteed way to send a fixed amount of money through the bank.",
      fields: ["Applicant's name","Amount","Payable to, beneficiary name","Payable at, city or branch","Mode of payment","Signature"] },
    { category: "Service requests", name: "Address or Mobile Number Update Form",
      desc: "Updates the address, phone number or other contact details on file.",
      fields: ["Account number","Account holder's name","New address","New mobile number","Proof document type","Signature"] },
    { category: "Service requests", name: "Account Closure Form",
      desc: "Starts the process of closing a bank account.",
      fields: ["Account number","Account holder's name","Reason for closure","Mode of refund","Signature"] }
  ];
  var FORMS_ALL_LABEL = "All forms";

  var CATEGORY_ICONS = {
    "Account opening & KYC":
      '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/>' +
      '<path d="M5.5 16c.7-1.6 2-2.4 3-2.4s2.3.8 3 2.4M14 9.5h5M14 12.5h5M14 15.5h3"/>',
    "Deposits & savings":
      '<ellipse cx="12" cy="7" rx="7" ry="2.6"/>' +
      '<path d="M5 7v4.5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V7"/>' +
      '<path d="M5 11.5V16c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4.5"/>',
    "Loans & credit":
      '<circle cx="12" cy="12" r="9"/><path d="m8.5 15.5 7-7"/>' +
      '<circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/>' +
      '<circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
    "Cards & payments":
      '<rect x="2.5" y="5.5" width="19" height="13" rx="2.3"/>' +
      '<path d="M2.5 9.5h19"/><path d="M5.5 14.5h4"/>',
    "Service requests":
      '<path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"/>' +
      '<path d="m14.5 6.5 3 3"/>'
  };

  function formThumbnailSvg(f) {
    var lineCount = Math.min(6, Math.max(3, Math.round(f.fields.length / 1.6)));
    var lines = "";
    for (var i = 0; i < lineCount; i++) {
      var y = 34 + i * 10;
      var w = (i % 3 === 2) ? 44 : 58;
      lines += '<rect x="10" y="' + y + '" width="' + w + '" height="3" rx="1.5" class="ft-line"/>';
    }
    return (
      '<rect x="2" y="2" width="76" height="96" rx="4" class="ft-page"/>' +
      '<rect x="10" y="11" width="38" height="7" rx="2" class="ft-title"/>' +
      '<rect x="56" y="11" width="12" height="7" rx="2" class="ft-stamp"/>' +
      lines +
      '<path d="M44 87c4-6 9 6 13 0s7 5 11-1" class="ft-sign"/>'
    );
  }

  // ---------- voice playback availability ----------
  var _voicesPromise = null;
  function getVoices() {
    if (!("speechSynthesis" in global)) return Promise.resolve([]);
    if (_voicesPromise) return _voicesPromise;
    _voicesPromise = new Promise(function (resolve) {
      var existing = global.speechSynthesis.getVoices();
      if (existing && existing.length) return resolve(existing);
      var resolved = false;
      function done() {
        if (resolved) return;
        resolved = true;
        resolve(global.speechSynthesis.getVoices());
      }
      global.speechSynthesis.onvoiceschanged = done;
      setTimeout(done, 1200);
    });
    return _voicesPromise;
  }
  async function hasVoiceFor(bcp47) {
    if (!bcp47) return true;
    var voices = await getVoices();
    if (!voices || !voices.length) return false;
    var target = bcp47.toLowerCase();
    var base = target.split("-")[0];
    return voices.some(function (v) {
      var vl = (v.lang || "").toLowerCase();
      return vl === target || vl.split("-")[0] === base;
    });
  }

  var UI_INDEX = {
    tagline:"Photograph any banking form or statement. Saralify reads it in your browser and translates it into the language you pick.",
    step1Title:"Choose your language",
    step1Hint:"The document will be translated into this language once it's read. The page itself switches to this language too.",
    step2Title:"Photograph the document",
    step2Hint:"Fill the frame, keep it flat and well lit. Works best with clear printed text.",
    dzTitle:"Tap to take or upload a photo",
    dzSub:"JPG or PNG — read right in your browser, nothing is uploaded for this step",
    retake:"Retake",
    processBtn:"Read & translate",
    resultWhatTitle:"What it says",
    listenLabel:"Listen",
    copyLabel:"Copy",
    copiedLabel:"Copied",
    footerLead:"This is a working prototype.",
    footerRest:"This build runs fully in your browser: text recognition via Tesseract.js, translation via Google Translate's free public service. Quality is lower than a hosted-AI version, especially for messy photos or handwriting, and for the languages added to Google Translate more recently (Dogri, Konkani, Manipuri, Mizo, Sanskrit, Khasi). Voice playback depends on the voices installed on your device."
  };

  var UI_FORMS = {
    tagline:"Common banking forms, with the fields explained in plain words.",
    readingInLabel:"Showing forms in",
    categoryTitle:"Category",
    footerStrong:"Fourteen common Indian banking forms",
    footerRest:", grouped into five categories. Tap a form to see its fields translated and explained. The original English name is kept on every form so it is still easy to recognize at the counter.",
    fieldsHeading:"Fields in this form",
    showFields:"Show fields",
    hideFields:"Hide fields"
  };

  var UI_SPEAK = {
    tagline:"Speak or type any text. Saralify translates it and reads it aloud.",
    readingInLabel:"Reading in",
    textLabel:"Text",
    micLabel:"Speak instead of typing",
    translateSpeakLabel:"Translate & read aloud",
    readEnglishLabel:"Read English aloud",
    translationLabel:"Translation",
    replayLabel:"Replay",
    stopLabel:"Stop",
    copyLabel:"Copy",
    footerNote:"Translation runs through Google Translate's free public service; dictation and voice playback depend on this device and browser. Not every language has a voice or microphone everywhere; if nothing plays, the translated text above is still there to read."
  };

  function formsCacheKey(code) { return "saralify_forms_" + code; }
  function uiIndexCacheKey(code) { return "saralify_ui_" + code; }
  function uiFormsCacheKey(code) { return "saralify_ui_forms_" + code; }
  function uiSpeakCacheKey(code) { return "saralify_ui_speak_" + code; }

  async function translateForms(languageName, onProgress) {
    var catTexts = [FORMS_ALL_LABEL].concat(uniqueCategories());
    var nameTexts = FORMS.map(function (f) { return f.name; });
    var descTexts = FORMS.map(function (f) { return f.desc; });
    var cats = catTexts.slice(), names = nameTexts.slice(), descs = descTexts.slice();
    try {
      var head = await translateBatch(catTexts.concat(nameTexts, descTexts), languageName);
      cats = head.slice(0, catTexts.length);
      names = head.slice(catTexts.length, catTexts.length + nameTexts.length);
      descs = head.slice(catTexts.length + nameTexts.length);
    } catch (e) { /* keep English for these; fields below are independent */ }
    if (onProgress) onProgress(0.25);

    var fields = FORMS.map(function (f) { return f.fields.slice(); });
    var groupSize = 3;
    var groupCount = Math.ceil(FORMS.length / groupSize);
    for (var start = 0, gi = 0; start < FORMS.length; start += groupSize, gi++) {
      var group = FORMS.slice(start, start + groupSize);
      var flat = [], spans = [];
      group.forEach(function (f) { spans.push([flat.length, f.fields.length]); flat = flat.concat(f.fields); });
      try {
        var translatedFlat = await translateBatch(flat, languageName);
        spans.forEach(function (span, si) { fields[start + si] = translatedFlat.slice(span[0], span[0] + span[1]); });
      } catch (e) { /* this group's forms stay in English */ }
      if (onProgress) onProgress(0.25 + 0.75 * ((gi + 1) / groupCount));
    }

    return { categories: cats, names: names, descs: descs, fields: fields };
  }

  function uniqueCategories() {
    var order = [];
    FORMS.forEach(function (f) { if (order.indexOf(f.category) === -1) order.push(f.category); });
    return order;
  }

  async function preTranslateSite(lang) {
    var jobs = [
      (async function () {
        if (localStorage.getItem(uiFormsCacheKey(lang.code))) return;
        await localizeStrings(UI_FORMS, lang.name, uiFormsCacheKey(lang.code));
      })(),
      (async function () {
        if (localStorage.getItem(uiSpeakCacheKey(lang.code))) return;
        await localizeStrings(UI_SPEAK, lang.name, uiSpeakCacheKey(lang.code));
      })(),
      (async function () {
        var key = formsCacheKey(lang.code);
        if (localStorage.getItem(key)) return;
        var data = await translateForms(lang.name);
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
      })()
    ];
    var results = await Promise.allSettled(jobs);
    return results.every(function (r) { return r.status === "fulfilled"; });
  }

  global.Saralify = {
    LANGUAGES: LANGUAGES,
    STORAGE_KEY: STORAGE_KEY,
    getStoredLang: getStoredLang,
    setStoredLang: setStoredLang,
    escapeHtml: escapeHtml,
    escapeRe: escapeRe,
    translateText: translateText,
    translateBatch: translateBatch,
    localizeStrings: localizeStrings,
    translateForms: translateForms,
    sampleErrorMessage: sampleErrorMessage,
    STATIC_GLOSSARY: STATIC_GLOSSARY,
    FORMS: FORMS,
    FORMS_ALL_LABEL: FORMS_ALL_LABEL,
    CATEGORY_ICONS: CATEGORY_ICONS,
    formThumbnailSvg: formThumbnailSvg,
    getVoices: getVoices,
    hasVoiceFor: hasVoiceFor,
    uniqueCategories: uniqueCategories,
    UI_INDEX: UI_INDEX,
    UI_FORMS: UI_FORMS,
    UI_SPEAK: UI_SPEAK,
    formsCacheKey: formsCacheKey,
    uiIndexCacheKey: uiIndexCacheKey,
    uiFormsCacheKey: uiFormsCacheKey,
    uiSpeakCacheKey: uiSpeakCacheKey,
    preTranslateSite: preTranslateSite
  };
})(window);
