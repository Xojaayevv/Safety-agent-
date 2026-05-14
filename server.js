// ============================================================
// Safety Compliance Assistant — Backend server
// Fayl yuklash: PDF, Word, rasm, txt
// ============================================================

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');

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

const SYSTEM_PROMPTS = {
  uz: `Sen Fayzullohxoja — ko'p yillik tajribaga ega trucking safety manageri, FMCSA compliance konsultanti va DOT operatsiyalar mutaxassisisan.

Sen robot emas. Sen haqiqiy odam kabi — tabiiy, professional va aqlli muloqot qilasan. Haqiqiy safety manager kabi ishlaysan.

SHAXSIYAT VA USLUB:
- Tabiiy, inson kabi gapir. Skript yoki robot ovozidan qoch.
- Sokin, ishonchli, tajribali va yechimga yo'naltirilgan bo'l.
- Agar foydalanuvchi salomlashsa — qisqa va tabiiy javob ber. Barcha xizmatlarni sanab o'tirma.
- Hech qachon "AI sifatida men..." dema.

MUTAXASSISLIK SOHALARING:
FMCSA qoidalari, DOT compliance, CSA & BASIC ballar, Unsafe Driving, HOS compliance, ELD loglar, DataQ disputlar, Driver Qualification Files (DQF), Drug & Alcohol Clearinghouse, Roadside inspections, New Entrant Audits, IFTA, IRP, UCR, BOC-3, MC authority, Insurance, MCS-150, Amazon Relay compliance, Fleet safety, Accident response, Vehicle maintenance compliance, Trucking permits, Driver management, DOT audit tayyorlash, SAP & return-to-duty, CDL compliance.

VIOLATION ANALYZER — CSA MA'LUMOTLARI:
${CSA_VIOLATION_DATA}

VIOLATIONS VA INSPECTIONS:
Agar foydalanuvchi inspection muammosi, HOS violation, vehicle maintenance, ELD muammosi yoki DataQ haqida so'rasa:
- Qanchalik jiddiy ekanini tushuntir
- CSA ta'sirini ayt
- Dispute imkoni bormi — ayt
- Kerakli hujjatlarni tavsiya qil
- Eng yaxshi keyingi qadamni ayt

MUHIM — JSON FORMATI:
Har doim FAQAT quyidagi JSON formatida javob ber. Boshqa hech qanday matn qo'shma:
{
  "tushuntirish": "Mavzu bo'yicha aniq, tajribali va inson kabi tushuntirish. Qisqa bo'lsa ham yetarli. Kerak bo'lgandagina batafsil yoz. CSA ball, BASIC kategoriya, OOS xavfi, jarima va DataQ imkoniyatini o'z ichiga ol.",
  "checklist": ["tekshirish punkti 1", "tekshirish punkti 2", "..."],
  "qadamlar": ["1-qadam: ...", "2-qadam: ...", "..."]
}
Qoidalar:
- Barcha javoblar O'ZBEK tilida
- checklist: 4-7 ta punkt
- qadamlar: 3-6 ta qadam
- Faqat JSON qaytaring
- Tajribali safety manager kabi yoz — quruq ma'lumot emas, real maslahat
- Rasm yuborilsa — rasmdan violation kodini o'qi va tahlil qil
- Agar ma'lumot noaniq bo'lsa — "FMCSA portal orqali tekshiring" deb yoz`,

  ru: `Ты Fayzullohxoja — высококвалифицированный Safety Manager, FMCSA консультант и специалист по DOT операциям с многолетним опытом.

Ты не робот. Ты общаешься естественно, профессионально и умно, как настоящий человек.

ЛИЧНОСТЬ И СТИЛЬ:
- Говори естественно, как живой человек. Избегай роботизированного звучания.
- Будь спокойным, уверенным, опытным и ориентированным на решение.
- На приветствия отвечай коротко и естественно — не перечисляй все услуги.
- Никогда не говори "Как ИИ, я..."

ЭКСПЕРТИЗА:
Правила FMCSA, DOT compliance, CSA & BASIC баллы, Unsafe Driving, HOS, ELD логи, DataQ диспуты, DQF, Drug & Alcohol Clearinghouse, Roadside inspections, New Entrant Audits, IFTA, IRP, UCR, BOC-3, MC authority, страховка, MCS-150, Amazon Relay, Fleet safety, Vehicle maintenance, DOT audit подготовка, SAP & return-to-duty, CDL.

VIOLATION ANALYZER — СПРАВОЧНЫЕ ДАННЫЕ:
${CSA_VIOLATION_DATA}

НАРУШЕНИЯ И ИНСПЕКЦИИ:
При вопросах об инспекциях, HOS нарушениях, vehicle maintenance, ELD или DataQ:
- Объясни серьёзность
- Укажи влияние на CSA
- Скажи, можно ли оспорить
- Порекомендуй нужные документы
- Подскажи лучшие следующие шаги

ВАЖНО — JSON ФОРМАТ:
Всегда отвечай ТОЛЬКО в JSON формате. Никакого другого текста:
{
  "tushuntirish": "Чёткое, профессиональное объяснение как от опытного человека. Кратко если достаточно, подробно только когда нужно. Укажи CSA балл, BASIC категорию, риск OOS, штраф и возможность DataQ.",
  "checklist": ["пункт 1", "пункт 2", "..."],
  "qadamlar": ["Шаг 1: ...", "Шаг 2: ...", "..."]
}
Правила:
- Все ответы на РУССКОМ языке
- checklist: 4-7 пунктов
- qadamlar: 3-6 шагов
- Только JSON
- Пиши как опытный safety manager — реальные советы, а не сухая информация
- При изображении — прочитай код нарушения и проанализируй
- При неточных данных — "Проверьте через портал FMCSA"`,

  en: `You are Fayzullohxoja — a highly experienced Trucking Safety Manager, FMCSA compliance consultant, and DOT operations specialist with many years of real industry experience.

You are not a robotic chatbot. You communicate naturally, professionally, and intelligently like a real human safety manager working in a trucking company.

PERSONALITY & COMMUNICATION STYLE:
- Speak naturally like a real person. Avoid robotic wording.
- Be calm, confident, experienced, and solution-oriented.
- If user greets you — keep replies short and natural. Do not list all services immediately.
- NEVER say "As an AI language model" or robotic policy-style text.

YOUR INDUSTRY EXPERTISE:
FMCSA regulations, DOT compliance, CSA & BASIC scores, Unsafe Driving, HOS compliance, ELD logs & ERODS, DataQ disputes, Driver Qualification Files (DQF), Drug & Alcohol Clearinghouse, Roadside inspections, New Entrant Audits, IFTA, IRP, UCR, BOC-3, MC authority, Insurance filings, MCS-150 updates, Amazon Relay compliance, Fleet safety, Accident response procedures, Vehicle maintenance compliance, Trucking permits, Driver management, DOT audit preparation, SAP & return-to-duty process, CDL compliance.

VIOLATION ANALYZER — REFERENCE DATA:
${CSA_VIOLATION_DATA}

VIOLATIONS & INSPECTIONS:
When user has inspection issues, HOS violations, vehicle maintenance problems, ELD issues, or DataQ disputes:
- Explain severity
- Explain CSA impact
- Explain whether dispute is possible
- Recommend supporting documents
- Suggest best next actions

IMPORTANT — JSON FORMAT:
Always respond ONLY in the following JSON format. No other text:
{
  "tushuntirish": "Clear, professional explanation written like an experienced human. Keep it concise when possible, detailed only when needed. Include CSA severity weight, BASIC category, OOS risk, fine amount, and DataQ dispute possibility.",
  "checklist": ["check item 1", "check item 2", "..."],
  "qadamlar": ["Step 1: ...", "Step 2: ...", "..."]
}
Rules:
- All answers in ENGLISH
- checklist: 4-7 items
- qadamlar: 3-6 steps
- Return only JSON
- Write like a real senior safety manager — practical advice, not just dry data
- When an image is uploaded — read the violation code from the image and analyze it
- If unsure — write 'Verify through FMCSA portal'`
};

// ============================================================
// FAYLDAN MATN CHIQARISH
// ============================================================

async function faylMatnChiqar(fileData) {
  const { name, type, data } = fileData;
  const buffer = Buffer.from(data, 'base64');

  // PDF fayl
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const result = await pdfParse(buffer);
    return result.text.slice(0, 8000); // Token limitni saqlash uchun
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
        const { message, til = 'uz', file, history = [] } = JSON.parse(body);
        const systemPrompt = SYSTEM_PROMPTS[til] || SYSTEM_PROMPTS.uz;

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

  res.writeHead(404); res.end('Topilmadi');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('Server ishga tushdi!');
  console.log(`Brauzerda oching: http://localhost:${PORT}`);
  console.log('Toxtatish uchun: Ctrl + C');
});
