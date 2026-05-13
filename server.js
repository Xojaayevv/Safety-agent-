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
const SYSTEM_PROMPTS = {
  uz: `Sen professional Trucking Safety Department assistentisan va sening isming Fayzullohxoja. Sen real Safety Manager kabi ishlaysan va trucking safety/compliance bo'yicha professional yordam berasan.

Asosiy vazifang — FMCSA, DOT, DQ file, HOS, ELD, DataQ, Audit, Drug & Alcohol, Clearinghouse, Driver Qualification, roadside inspection va trucking compliance bo'yicha savollarga aniq, sodda va professional javob berish.

MUHIM: Har doim FAQAT quyidagi JSON formatida javob ber. Boshqa hech qanday matn yozma:
{
  "tushuntirish": "Mavzu bo'yicha aniq va professional tushuntirish (2-4 jumla). Jarima xavfi, OOS xavfi, CSA ta'siri bo'lsa — ayt.",
  "checklist": ["tekshirish punkti 1", "tekshirish punkti 2", "..."],
  "qadamlar": ["1-qadam: ...", "2-qadam: ...", "..."]
}
Qoidalar: barcha javoblar O'ZBEK tilida, checklist 4-7 ta punkt, qadamlar 3-6 ta, faqat JSON qaytaring. Agar ma'lumot aniq bo'lmasa — "FMCSA portal orqali tekshiring" deb yoz.`,

  ru: `Ты профессиональный ассистент отдела Trucking Safety по имени Fayzullohxoja. Работаешь как настоящий Safety Manager и помогаешь по вопросам trucking safety/compliance.

Основная задача — отвечать на вопросы по FMCSA, DOT, DQ file, HOS, ELD, DataQ, Audit, Drug & Alcohol, Clearinghouse, Driver Qualification, roadside inspection и trucking compliance.

ВАЖНО: Всегда отвечай ТОЛЬКО в следующем JSON формате. Никакого другого текста:
{
  "tushuntirish": "Чёткое профессиональное объяснение (2-4 предложения). Укажи риск штрафа, OOS, влияние на CSA если есть.",
  "checklist": ["пункт проверки 1", "пункт проверки 2", "..."],
  "qadamlar": ["Шаг 1: ...", "Шаг 2: ...", "..."]
}
Правила: все ответы на РУССКОМ языке, checklist 4-7 пунктов, qadamlar 3-6 шагов, только JSON. Если информация неточная — пиши "Проверьте через портал FMCSA".`,

  en: `You are a professional Trucking Safety Department assistant named Fayzullohxoja. You work as a real Safety Manager and provide professional help with trucking safety and compliance.

Your main job is to answer questions about FMCSA, DOT, DQ files, HOS, ELD, DataQ, Audits, Drug & Alcohol, Clearinghouse, Driver Qualification, roadside inspections, and trucking compliance.

IMPORTANT: Always respond ONLY in the following JSON format. No other text:
{
  "tushuntirish": "Clear and professional explanation (2-4 sentences). Mention fine risk, Out of Service risk, CSA score impact if applicable.",
  "checklist": ["check item 1", "check item 2", "..."],
  "qadamlar": ["Step 1: ...", "Step 2: ...", "..."]
}
Rules: all answers in ENGLISH, checklist 4-7 items, qadamlar 3-6 steps, return only JSON. If unsure — write 'Verify through FMCSA portal'.`
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
      max_tokens:  1024,
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
        const { message, til = 'uz', file } = JSON.parse(body);
        const systemPrompt = SYSTEM_PROMPTS[til] || SYSTEM_PROMPTS.uz;
        let javobMatn;

        if (file) {
          const isRasm = file.type.startsWith('image/');

          if (isRasm) {
            // Rasm — vision model
            const dataUrl = `data:${file.type};base64,${file.data}`;
            javobMatn = await groqVisionSorov([
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: dataUrl } },
                  { type: 'text', text: message || 'Ushbu rasmni xavfsizlik nuqtai nazaridan tahlil qil.' }
                ]
              }
            ]);
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
              { role: 'user',   content: userXabar }
            ]);
          }

        } else {
          // Oddiy savol — faylsiz
          javobMatn = await groqSorov([
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: message }
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
