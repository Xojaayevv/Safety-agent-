// ============================================================
// Safety Compliance Assistant — Backend server
// Fayl yuklash: PDF, Word, rasm, txt
// ============================================================

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth  = require('mammoth');
const XLSX     = require('xlsx');

// === Groq API kaliti (muhit o'zgaruvchisidan o'qiladi) ===
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// === Har til uchun tizim ko'rsatmasi ===

// CSA Severity Weight ma'lumotlari (FMCSA CSA Points Guide July 2023)
const CSA_VIOLATION_DATA = `
FMCSA CSA SEVERITY WEIGHTS (July 2023 Points Guide):

UNSAFE DRIVING BASIC:
392.80(a) Texting while driving = 10pts | OOS: No | Fine: up to $16,000
392.82(a)(1) Hand-held cell phone = 10pts | OOS: No | Fine: up to $16,000
392.2R Reckless driving = 10pts | OOS: No | Fine: varies by state
392.2-SLLS4 Speeding 15+mph over = 10pts | OOS: No | Fine: $100-$500+
392.2-SLLS3 Speeding 11-14mph over = 7pts | OOS: No
392.2-SLLS2 Speeding 6-10mph over = 4pts | OOS: No
392.2FC Following too close = 5pts | OOS: No
392.16 No seatbelt (driver) = 7pts | OOS: No | Fine: up to $1,000
392.2IL Improper lane change = 5pts | OOS: No
392.2T Traffic control device violation = 5pts | OOS: No

HOS COMPLIANCE BASIC:
395.3(a)(1) 11-hour driving rule violation = 7pts | OOS: Yes (if 3+hrs over)
395.3(a)(2) 14-hour on-duty rule violation = 7pts | OOS: Yes (if 2+hrs over)
395.3(a)(3)(ii) 30-minute break violation = 7pts | OOS: Yes
395.3(b)(1) 60-hour/7-day rule violation = 7pts | OOS: Yes
395.3(b)(2) 70-hour/8-day rule violation = 7pts | OOS: Yes
395.8(e) False log / falsification = 7pts | OOS: No | Fine: up to $16,000
395.8(a) No log book = 5pts | OOS: No | Fine: up to $1,000
395.8(k)(2) Missing supporting documents (7 days) = 5pts | OOS: No
395.13(d) Driving after OOS order = 10pts | OOS: N/A | Fine: up to $16,000
395.1(h)(1) Exempt property carrier HOS = 4pts | OOS: No
395.8(f)(1) Incorrect log entries = 1pt | OOS: No

VEHICLE MAINTENANCE BASIC:
393.75(a) Flat/underinflated tire = 8pts | OOS: Yes | Fine: up to $16,000
393.75(a)(1) Tire with exposed ply/cord = 8pts | OOS: Yes
393.9(BRKLAMP) Inoperative brake lamp = 6pts | OOS: No
396.9(c)(2) Operating vehicle under OOS order = 10pts | OOS: N/A | Fine: up to $25,000
396.17(c) No annual vehicle inspection = 4pts | OOS: No | Fine: up to $1,000
393.47(e) Brake out of adjustment (2 axles) = 4pts | OOS: Yes
393.47(f) Brake out of adjustment (1 axle) = 2pts | OOS: Yes (if threshold met)
396.3(a)(1) Brakes in OOS condition = 2pts | OOS: Yes
393.9(HDLMP) Inoperative headlamp = 6pts | OOS: No
393.207(a) Steering out of adjustment = 8pts | OOS: Yes
393.9(TRLLMP) Inoperative tail/clearance lamp = 3pts | OOS: No
393.100(b) Unsecured load = 10pts | OOS: Yes | Fine: up to $16,000
393.102(b) Cargo securement violation = 7pts | OOS: Yes

DRIVER FITNESS BASIC:
383.23(a)(2) Operating without CDL = 8pts | OOS: Yes | Fine: up to $5,000
391.41(a)(1) No valid medical certificate = 1pt | OOS: No
391.11(b)(4) Not physically qualified to drive = 2pts | OOS: Yes
390.35(b)(MED) Fraudulent medical certificate = 10pts | OOS: Yes | Fine: up to $16,000
383.51(a) Driving with disqualified CDL = 10pts | OOS: Yes
391.15(a) Disqualified driver = 8pts | OOS: Yes
383.23(a)(1) Wrong class CDL for vehicle = 8pts | OOS: Yes

DRUG & ALCOHOL BASIC:
392.4(a) Drug use/possession = 10pts | OOS: Yes | Fine: up to $5,000+
390.3(e)(3) Clearinghouse prohibited driver = 10pts | OOS: Yes | Fine: up to $16,000
392.5(a)(1) Alcohol possession (open container) = 5pts | OOS: Yes
392.5(a)(2) Under influence of alcohol/drugs (DUI) = 5pts | OOS: Yes
392.5(b) Driver refuses alcohol test = 5pts | OOS: Yes

HAZARDOUS MATERIALS BASIC:
177.800(a) HM transport requirements = 5pts | OOS: No
172.600(a) No emergency response info = 2pts | OOS: No
173.24(a)(1) Package integrity failure = 6pts | OOS: Yes
177.823(a) Cargo tank inspection = 5pts | OOS: Yes
172.504(a) Placarding violation = 4pts | OOS: No | Fine: up to $84,467

DRIVER QUALIFICATION (DQ) BASIC:
391.21(b) Driver application incomplete = 1pt | OOS: No
391.27(a) No MVR inquiry = 1pt | OOS: No
391.51(b)(2) DQ file missing med cert = 1pt | OOS: No
391.11(a) Driver not qualified = 8pts | OOS: Yes
391.23(a)(1) No pre-employment check = 1pt | OOS: No

DATAQ DISPUTE: Any violation can be disputed via DataQ if: officer error, incorrect citation, not the carrier's vehicle, or dismissed in court.
OOS = Out of Service order. Driver cannot drive until corrected.
CSA points stay on record: Driver 3 years, Carrier 24 months for most violations.
`;

const SYSTEM_PROMPT = `You are Fayzullohxoja — a highly experienced Trucking Safety Manager, FMCSA compliance consultant, and DOT operations specialist with many years of real industry experience.

You are not a robot. You communicate naturally, professionally, and intelligently like a real human safety manager.

PERSONALITY & STYLE:
- Speak naturally like a real person. No robotic wording.
- Be calm, confident, experienced, and solution-oriented.
- If user greets you — reply short and natural. Do not list all services.
- NEVER say "As an AI..." or similar robotic phrases.

LANGUAGE RULE — CRITICAL:
Always detect the language the user is writing in and respond in THAT SAME language.
- If they write in Uzbek → respond in Uzbek
- If they write in Russian → respond in Russian
- If they write in English → respond in English
- Never switch languages unless the user switches first.

YOUR EXPERTISE:
FMCSA regulations, DOT compliance, CSA & BASIC scores, Unsafe Driving, HOS compliance, ELD logs & ERODS, DataQ disputes, Driver Qualification Files (DQF), Drug & Alcohol Clearinghouse, Roadside inspections, New Entrant Audits, IFTA, IRP, UCR, BOC-3, MC authority, Insurance filings, MCS-150, Amazon Relay compliance, Fleet safety, Accident response, Vehicle maintenance compliance, Trucking permits, Driver management, DOT audit preparation, SAP & return-to-duty, CDL compliance.

VIOLATION ANALYZER — REFERENCE DATA:
${CSA_VIOLATION_DATA}

VIOLATIONS & INSPECTIONS:
When user asks about inspection issues, HOS violations, vehicle maintenance, ELD, or DataQ:
- Explain the severity
- Explain CSA impact
- Say whether dispute is possible
- Recommend supporting documents
- Suggest best next steps

IMPORTANT — JSON FORMAT:
Always respond ONLY in the following JSON format. No other text outside JSON:
{
  "tushuntirish": "Clear, experienced, human-like explanation in the user's language. Concise if enough, detailed only when needed. Include CSA severity weight, BASIC category, OOS risk, fine amount, and DataQ dispute possibility if relevant."
}
Rules:
- Return only valid JSON — nothing else
- Write like a real senior safety manager — practical advice, not dry data
- When an image is uploaded — read the violation code from the image and analyze it
- If unsure — say to verify through the FMCSA portal (in user's language)`;

const DATAQ_PROMPT = `You are a professional FMCSA/DOT DataQ dispute assistant.

Your job is to review the uploaded inspection report and supporting evidence, identify the inspection number, inspection date, state, carrier information, driver name, vehicle/unit information, violation codes, and violation descriptions.

Then compare the violations with the uploaded proof documents and prepare a professional DataQ explanation letter.

Rules:
- Do not invent facts.
- Use only information found in uploaded documents or provided by the user.
- If evidence is missing, clearly say what is missing.
- Write in formal DataQ style.
- Explain why the violation should be removed, reassigned, or reviewed.
- Mention supporting documents by name.
- Keep the tone respectful, professional, and persuasive.

Output must include ALL of these sections:
1. Case Summary
2. Facts Found in Documents
3. Dispute Explanation
4. Supporting Evidence List
5. Final Request

Return ONLY valid JSON in this exact format:
{
  "tushuntirish": "The complete DataQ dispute letter with all 5 sections, formatted with clear section headers and line breaks."
}`;

const CARRIER_PROMPT = `You are an AI-powered FMCSA Carrier Lookup Assistant for a trucking safety and compliance platform.

Your task is to search and identify trucking carriers using USDOT Number, MC Number, or Company Name.

IMPORTANT: Use only your training data knowledge about FMCSA carriers. Never invent specific data. If you don't have reliable data for a specific carrier, say so clearly.

Always return ONLY valid JSON in this exact format:
{
  "found": true or false,
  "multiple": false,
  "matches": [],
  "company": {
    "name": "Legal company name or Unknown",
    "usdot": "DOT number or N/A",
    "mc": "MC number or N/A",
    "entity_type": "e.g. Carrier, Broker, etc.",
    "operating_status": "Active or Inactive or Unknown",
    "authority_status": "Active or Inactive or Revoked or Unknown",
    "insurance_status": "On File or Not on File or Unknown",
    "safety_rating": "Satisfactory or Conditional or Unsatisfactory or Not Rated",
    "power_units": "number or N/A",
    "drivers": "number or N/A",
    "mcs150_date": "date or N/A",
    "mcs150_mileage": "mileage or N/A",
    "address": "full address or N/A",
    "phone": "phone or N/A"
  },
  "warnings": ["any critical warnings like inactive authority, missing insurance, OOS orders"],
  "insight": "2-3 sentence professional AI analysis of this carrier's compliance status and any risk factors"
}

If multiple carriers match a name search, set "multiple": true and populate "matches" array with brief entries: [{"name":"...", "usdot":"...", "state":"..."}].
If not found, set "found": false and "company": null.`;

const FMCSA_API_KEY = process.env.FMCSA_API_KEY;

const IFTA_PROMPT = `You are an enterprise-grade AI IFTA Processing and Compliance Assistant built for U.S. trucking companies.

Your responsibility is to automatically process uploaded Fuel Reports, ELD Mileage Reports, Trip Reports, and IFTA Excel templates and generate accurate, audit-ready IFTA calculations.

IFTA CALCULATION RULES:
- Overall MPG = Total Miles ÷ Total Gallons
- Taxable Gallons per State = State Miles ÷ Overall MPG
- Tax Due per State = Taxable Gallons × State Fuel Tax Rate
- Tax Paid per State = Gallons Purchased in State × State Fuel Tax Rate
- Final Balance per State = Tax Due - Tax Paid (positive = owe, negative = credit/refund)

VALIDATION RULES:
- Never fabricate fuel gallons or state miles
- Only use data found in uploaded documents
- Flag MPG below 5.5 or above 8.5 as suspicious
- Detect duplicate fuel entries, missing jurisdictions, states with high miles but no fuel purchases
- Generate warnings for any suspicious patterns

Use current IFTA diesel tax rates for each state. If exact quarter rates are not available use the most recent known rates.

Always return ONLY valid JSON in this exact format:
{
  "quarter": "Q3 2024",
  "trucks": ["Unit 101", "Unit 102"],
  "total_miles": 45000,
  "total_gallons": 6617.5,
  "fleet_mpg": 6.80,
  "total_tax_due": 1234.56,
  "total_tax_paid": 1100.00,
  "balance": 134.56,
  "states": [
    {
      "state": "TX",
      "miles": 5000,
      "gallons_used": 735.294,
      "gallons_purchased": 600.0,
      "tax_rate": 0.2000,
      "tax_due": 147.06,
      "tax_paid": 120.00,
      "balance": 27.06
    }
  ],
  "warnings": ["Fleet MPG 9.2 is above normal range 5.5-8.5 — verify mileage data"],
  "summary": "2-3 sentence professional analysis of this IFTA filing and any key risk factors."
}

If critical data is missing to perform calculations, return:
{ "error": true, "summary": "Explain clearly what information is missing and what files are needed." }`;

// ============================================================
// FMCSA SAFER WEB SCRAPER (no API key needed)
// ============================================================

async function fetchSaferData(type, query) {
  try {
    const q = encodeURIComponent(query.trim());
    let url;
    if (type === 'dot')     url = `https://safer.fmcsa.dot.gov/query.asp?query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${q}`;
    else if (type === 'mc') url = `https://safer.fmcsa.dot.gov/query.asp?query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${q}`;
    else                    url = `https://safer.fmcsa.dot.gov/query.asp?query_type=queryCarrierSnapshot&query_param=NAME&query_string=${q}`;

    console.log('[SAFER] Fetching:', url);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    console.log('[SAFER] HTTP status:', resp.status);
    if (!resp.ok) return null;
    const html = await resp.text();
    console.log('[SAFER] HTML length:', html.length, '| snippet:', html.substring(200, 500).replace(/\s+/g,' '));
    return parseSaferHtml(html, type);
  } catch (err) {
    console.error('[SAFER] Fetch error:', err.message);
    return null;
  }
}

function parseSaferHtml(html, type) {
  if (!html || html.length < 500) return null;
  if (/no records found|0 records found|query returned 0/i.test(html)) return null;

  // Strip HTML tags and decode entities
  const strip = s => s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .trim();

  // Extract ALL td/th text in document order → build key-value pairs
  const cells = [];
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = cellRe.exec(html)) !== null) {
    const text = strip(m[1]);
    if (text && text.length < 200) cells.push(text);
  }

  console.log('[SAFER] Total cells:', cells.length, '| first 30:', JSON.stringify(cells.slice(0, 30)));

  if (cells.length < 4) return null;

  // Build lowercase key → value map (each cell is a key, next cell is its value)
  const kv = {};
  for (let i = 0; i < cells.length - 1; i++) {
    const key = cells[i].replace(/:$/, '').trim().toLowerCase();
    if (key.length > 1 && key.length < 60) kv[key] = cells[i + 1];
  }

  const get = (...keys) => {
    for (const k of keys) {
      const v = kv[k.toLowerCase()];
      if (v && v.trim() && v.trim() !== ':') return v.trim();
    }
    return 'N/A';
  };

  // For name search — detect multiple results
  if (type === 'name') {
    const dotLinks = [...html.matchAll(/query_param=USDOT&query_string=(\d+)/gi)];
    if (dotLinks.length > 1) {
      const matches = dotLinks.slice(0, 10).map(lm => {
        const dot = lm[1];
        const ctxStart = Math.max(0, lm.index - 200);
        const ctx = html.substring(ctxStart, lm.index + 200);
        const nm = strip(ctx.match(/<td[^>]*>([^<]{3,60})<\/td>/i)?.[1] || '');
        return { usdot: dot, name: nm || 'Unknown', state: '' };
      });
      return { multiple: true, matches };
    }
  }

  const name = get('legal name', 'dba name', 'carrier/broker name');
  if (name === 'N/A') {
    console.log('[SAFER] No company name found. kv keys:', Object.keys(kv).slice(0, 30));
    return null;
  }

  return {
    name,
    usdot:            get('usdot number', 'dot number', 'usdot'),
    mc:               get('mc/mx/ff number(s)', 'mc/mx/ff number', 'mc number', 'docket number(s)'),
    entity_type:      get('entity type'),
    operating_status: get('operating status'),
    authority_status: get('carrier operation', 'authority status', 'operating authority status'),
    insurance_status: get('bipd/cargo insurance', 'bipd insurance on file', 'insurance on file'),
    safety_rating:    get('safety rating', 'safety rating date'),
    power_units:      get('total power units', 'power units'),
    drivers:          get('total drivers', 'drivers'),
    mcs150_date:      get('mcs-150 form date', 'mcs-150 date'),
    mcs150_mileage:   get('mcs-150 mileage', 'mileage year'),
    address:          get('physical address', 'address'),
    phone:            get('phone', 'telephone')
  };
}

// ============================================================
// FAYLDAN MATN CHIQARISH
// ============================================================

async function faylMatnChiqar(fileData) {
  const { name, type, data } = fileData;
  const buffer = Buffer.from(data, 'base64');

  // PDF fayl
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.slice(0, 8000);
    } finally {
      await parser.destroy();
    }
  }

  // Word fayl (.docx)
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, 8000);
  }

  // Oddiy matn fayl
  if (type === 'text/plain' || name.endsWith('.txt')) {
    return buffer.toString('utf8').slice(0, 8000);
  }

  // CSV fayl
  if (type === 'text/csv' || name.endsWith('.csv')) {
    return buffer.toString('utf8').slice(0, 8000);
  }

  // Excel fayl (.xlsx, .xls)
  if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/vnd.ms-excel') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      text += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
    }
    return text.slice(0, 10000);
  }

  return null; // Rasm yoki noma'lum — alohida ko'rib chiqiladi
}

// ============================================================
// GROQ API GA SO'ROV YUBORISH
// ============================================================

async function groqSorov(messages) {
  const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  1500,
      temperature: 0.3,
      messages
    })
  });

  const apiData = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(apiData.error?.message || 'API xatosi');
  return apiData.choices[0].message.content.trim();
}

// Rasm uchun vision model
async function groqVisionSorov(messages) {
  const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      model:      'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1024,
      messages
    })
  });

  const apiData = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(apiData.error?.message || 'Vision API xatosi');
  return apiData.choices[0].message.content.trim();
}

// JSON javobni ajratib olish
function javobJsonQil(matn) {
  try {
    const tozaMatn = matn.replace(/```json|```/g, '').trim();
    return JSON.parse(tozaMatn);
  } catch {
    return { tushuntirish: matn, checklist: [], qadamlar: [] };
  }
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(async (req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // === index.html yuborish ===
  if (req.method === 'GET' && req.url === '/') {
    try {
      const content = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } catch { res.writeHead(500); res.end('index.html topilmadi'); }
    return;
  }

  // === logo.jpg yuborish ===
  if (req.method === 'GET' && req.url === '/logo.jpg') {
    try {
      const img = fs.readFileSync(path.join(__dirname, 'logo.jpg'));
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(img);
    } catch { res.writeHead(404); res.end('logo topilmadi'); }
    return;
  }

  // === Chat API ===
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, til = 'en', file, history = [] } = JSON.parse(body);
        const systemPrompt = SYSTEM_PROMPT;

        // Oxirgi 16 xabarni context sifatida olish (8 ta turn)
        const contextHistory = history.slice(-16).map(h => ({
          role: h.role,
          content: h.content
        }));

        let javobMatn;

        if (file) {
          const isRasm = file.type.startsWith('image/');

          if (isRasm) {
            // Rasm — vision model (history qo'shiladi)
            const dataUrl = `data:${file.type};base64,${file.data}`;
            const visionMessages = [
              { role: 'system', content: systemPrompt },
              ...contextHistory,
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: dataUrl } },
                  { type: 'text', text: message || 'Ushbu rasmni xavfsizlik nuqtai nazaridan tahlil qil.' }
                ]
              }
            ];
            javobMatn = await groqVisionSorov(visionMessages);
          } else {
            // PDF, Word yoki txt — matn chiqar va yuborish
            const faylMatn = await faylMatnChiqar(file);
            if (!faylMatn) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ xato: 'Bu fayl turi qo\'llab-quvvatlanmaydi.' }));
              return;
            }
            const userXabar = `Fayl nomi: ${file.name}\n\nFayl mazmuni:\n${faylMatn}\n\n${message || 'Ushbu hujjatni xavfsizlik nuqtai nazaridan tahlil qil.'}`;
            javobMatn = await groqSorov([
              { role: 'system', content: systemPrompt },
              ...contextHistory,
              { role: 'user', content: userXabar }
            ]);
          }

        } else {
          // Oddiy savol — history bilan
          javobMatn = await groqSorov([
            { role: 'system', content: systemPrompt },
            ...contextHistory,
            { role: 'user', content: message }
          ]);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(javobJsonQil(javobMatn)));

      } catch (err) {
        console.error('Xato:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ xato: err.message }));
      }
    });
    return;
  }

  // === Carrier Lookup API ===
  if (req.method === 'POST' && req.url === '/api/carrier') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { query, type } = JSON.parse(body); // type: 'dot' | 'mc' | 'name'
        let saferData = null;

        // 1. Try official FMCSA API if key available
        if (FMCSA_API_KEY) {
          try {
            let url;
            if (type === 'dot')      url = `https://api.fmcsa.dot.gov/carriers/${query.trim()}?webKey=${FMCSA_API_KEY}`;
            else if (type === 'mc')  url = `https://api.fmcsa.dot.gov/carriers/docket-number/${query.trim()}?webKey=${FMCSA_API_KEY}`;
            else                     url = `https://api.fmcsa.dot.gov/carriers/name/${encodeURIComponent(query.trim())}?webKey=${FMCSA_API_KEY}`;
            const fmcsaRes = await fetch(url);
            if (fmcsaRes.ok) saferData = await fmcsaRes.json();
          } catch (_) { /* fallback */ }
        }

        // 2. If no API key or API failed — scrape SAFER web
        if (!saferData) {
          saferData = await fetchSaferData(type, query);
        }

        const userMsg = saferData
          ? `Search type: ${type}\nQuery: ${query}\n\nReal FMCSA/SAFER data found:\n${JSON.stringify(saferData, null, 2)}\n\nProcess this into the required JSON format and add your AI insight.`
          : `Search type: ${type}\nQuery: ${query}\n\nNo carrier data found from FMCSA SAFER web. Return found:false.`;

        const javobMatn = await groqSorov([
          { role: 'system', content: CARRIER_PROMPT },
          { role: 'user', content: userMsg }
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(javobJsonQil(javobMatn)));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ xato: err.message }));
      }
    });
    return;
  }

  // === DataQ Letter API ===
  if (req.method === 'POST' && req.url === '/api/dataq') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { notes = '', files = [] } = JSON.parse(body);

        // Extract text from all uploaded files
        let combinedText = '';
        for (const f of files) {
          const text = await faylMatnChiqar(f);
          if (text) combinedText += `\n\n--- File: ${f.name} ---\n${text}`;
        }

        const userMsg = `Please review the following documents and generate a DataQ dispute letter.\n\nAdditional notes from user: ${notes || 'None'}\n\nUploaded documents:${combinedText || '\n(No documents uploaded)'}`;

        const javobMatn = await groqSorov([
          { role: 'system', content: DATAQ_PROMPT },
          { role: 'user', content: userMsg }
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(javobJsonQil(javobMatn)));
      } catch (err) {
        console.error('DataQ xato:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ xato: err.message }));
      }
    });
    return;
  }

  // === IFTA Processing API ===
  if (req.method === 'POST' && req.url === '/api/ifta') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { files = [] } = JSON.parse(body);
        let combinedText = '';
        for (const f of files) {
          const text = await faylMatnChiqar(f);
          if (text) combinedText += `\n\n=== File: ${f.name} ===\n${text}`;
          else combinedText += `\n\n=== File: ${f.name} (image/unsupported — describe contents if visible) ===`;
        }
        const userMsg = `Please process the following IFTA documents and generate a complete IFTA calculation report.\n\nUploaded files:${combinedText || '\n(No readable files — please upload PDF, Excel, CSV, or text files)'}`;
        const javobMatn = await groqSorov([
          { role: 'system', content: IFTA_PROMPT },
          { role: 'user', content: userMsg }
        ]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(javobJsonQil(javobMatn)));
      } catch (err) {
        console.error('IFTA xato:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ xato: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Topilmadi');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('Server ishga tushdi!');
  console.log(`Brauzerda oching: http://localhost:${PORT}`);
  console.log('Toxtatish uchun: Ctrl + C');
});
