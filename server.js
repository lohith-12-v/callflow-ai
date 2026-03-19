// ─────────────────────────────────────────────────────────────────
//  CallFlowAI  —  Node.js Voice Agent  (FIXED v2)
//
//  Key fixes:
//  1. Deepgram: full mimeType passed in URL + header (codec preserved)
//  2. Deepgram: encoding=opus param added for webm/opus audio
//  3. Murf: correct api-key header, robust response parsing
//  4. WebSocket: greeting on connect, full per-session history
//
//  Run: node server.js
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const http      = require('http');
const { WebSocketServer } = require('ws');

const app    = express();
const server = http.createServer(app);

const DEEPGRAM_KEY = (process.env.DEEPGRAM_API_KEY || '').trim();
const GEMINI_KEY   = (process.env.GEMINI_API_KEY   || '').trim();
const MURF_KEY     = (process.env.MURF_API_KEY     || '').trim();
const MONGO_URI    = (process.env.MONGODB_URI      || '').trim();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));

// ── MongoDB ───────────────────────────────────────────────────────
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(e  => console.error('⚠️  MongoDB:', e.message));
}

const Call = mongoose.model('Call', new mongoose.Schema({
  phoneNumber:  { type: String, required: true },
  name:         { type: String },
  service:      { type: String },
  status:       { type: String, default: 'New' },
  conversation: [{ role: String, content: String }],
  notes:        { type: String },
}, { timestamps: true }));

// ─────────────────────────────────────────────────────────────────
//  STEP 1 — STT: Deepgram Nova-2  (FIXED)
//
//  Key fix: Deepgram needs the FULL mimeType including codec.
//  For audio/webm;codecs=opus we also pass encoding=opus in the URL.
// ─────────────────────────────────────────────────────────────────
async function transcribeAudio(audioBase64, mimeType = 'audio/webm') {
  if (!DEEPGRAM_KEY) {
    console.error('❌ DEEPGRAM_API_KEY not set in .env');
    return { text: null, error: 'DEEPGRAM_API_KEY missing — add it to .env' };
  }

  try {
    const buf = Buffer.from(audioBase64, 'base64');
    console.log(`\n📝 Transcribing: ${buf.length} bytes | type: ${mimeType}`);

    if (buf.length < 1000) {
      console.warn('⚠️  Audio too small — likely empty recording');
      return { text: null, error: 'Audio too short — speak for at least 1 second' };
    }

    const params = new URLSearchParams({
      model:        'nova-2',
      language:     'en-IN',
      smart_format: 'true',
      punctuate:    'true',
    });

    // Critical: add encoding hint for webm/opus — without this Deepgram may reject
    if (mimeType.includes('webm') || mimeType.includes('opus')) {
      params.set('encoding', 'opus');
    } else if (mimeType.includes('ogg')) {
      params.set('encoding', 'ogg_opus');
    }

    const url = `https://api.deepgram.com/v1/listen?${params}`;
    console.log(`📝 Deepgram URL: ${url}`);

    const r = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_KEY}`,
        'Content-Type':  mimeType,   // ← send FULL mime type including codec
      },
      body: buf,
    });

    const raw = await r.text();
    console.log(`📝 Deepgram ${r.status}:`, raw.slice(0, 300));

    if (!r.ok) {
      let errMsg = `Deepgram ${r.status}`;
      try { const j = JSON.parse(raw); errMsg = j.err_msg || j.message || errMsg; } catch {}
      return { text: null, error: errMsg };
    }

    const data       = JSON.parse(raw);
    const alt        = data?.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript?.trim();
    const confidence = alt?.confidence ?? 0;

    if (!transcript) {
      console.warn('⚠️  Deepgram returned no transcript');
      return { text: null, error: 'No speech detected — try speaking louder or closer to the mic' };
    }

    console.log(`✅ Transcript [${(confidence * 100).toFixed(0)}%]: "${transcript}"`);
    return { text: transcript, confidence };
  } catch (e) {
    console.error('❌ Deepgram exception:', e.message);
    return { text: null, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────
//  STEP 2 — BRAIN: Gemini 2.0 Flash
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Matthew, a warm professional AI voice receptionist for local service businesses in India.

You handle REAL missed calls. Have a natural conversation to:
1. Welcome the caller warmly
2. Understand what they need
3. Collect: name, service needed, urgency/timing
4. End with: "Please book at cal.com/demo and we will confirm shortly!"

STRICT RULES:
- 1-2 short sentences MAX — this is spoken audio
- Sound human and warm, NOT robotic or scripted
- Ask ONE thing per turn only
- React naturally to anything they say
- NEVER ask for info already given
- If urgent, acknowledge it immediately
- Vary language — never repeat same phrasing`;

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];

async function geminiReply(message, history) {
  if (!GEMINI_KEY) return fallback(message, history);

  const contents = [
    ...history.map(h => ({
      role:  h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 100, temperature: 0.9, topP: 0.95 },
          }),
        }
      );
      const raw = await r.text();
      console.log(`🤖 Gemini [${model}] ${r.status}:`, raw.slice(0, 100));
      if (!r.ok) continue;
      const reply = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) { console.log('✅ Gemini reply:', reply); return reply; }
    } catch (e) { console.warn(`Gemini [${model}]:`, e.message); }
  }
  return fallback(message, history);
}

function fallback(msg, history) {
  const t = history.filter(h => h.role === 'assistant').length;
  if (t === 0) return "Hi! I'm Matthew. May I know who I'm speaking with?";
  if (t === 1) return "Great! What service do you need help with today?";
  if (t === 2) return "Understood. How urgent is this, and when works best?";
  return "I've noted everything. Please book at cal.com/demo and we'll confirm shortly!";
}

// ─────────────────────────────────────────────────────────────────
//  STEP 3 — TTS: Murf Falcon  (FIXED)
// ─────────────────────────────────────────────────────────────────
async function getMurfAudio(text) {
  if (!MURF_KEY) {
    console.warn('⚠️  MURF_API_KEY not set — text only mode');
    return null;
  }

  console.log(`\n🎙️  Murf TTS: "${text.slice(0, 60)}…"`);

  try {
    const r = await fetch('https://api.murf.ai/v1/speech/generate', {
      method:  'POST',
      headers: {
        'api-key':      MURF_KEY,   // ← correct Murf header
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        voiceId:      'en-US-marcus',
        text,
        format:       'MP3',
        modelVersion: 'GEN2',
      }),
    });

    const raw = await r.text();
    console.log(`🎙️  Murf ${r.status}:`, raw.slice(0, 200));

    if (!r.ok) {
      console.error('❌ Murf error body:', raw);
      return null;
    }

    const d = JSON.parse(raw);

    // Case 1: base64 audio inline
    if (d.encodedAudio) {
      console.log('✅ Murf: got encodedAudio');
      return `data:audio/mp3;base64,${d.encodedAudio}`;
    }

    // Case 2: URL to download
    const url = d.audioFile || d.audio_url || d.audioUrl || d.url;
    if (url) {
      console.log('✅ Murf: downloading from', url);
      const dl  = await fetch(url);
      if (!dl.ok) { console.error('❌ Murf download failed', dl.status); return null; }
      const b64 = Buffer.from(await dl.arrayBuffer()).toString('base64');
      return `data:audio/mp3;base64,${b64}`;
    }

    console.error('❌ Murf: no audio in response. Keys:', Object.keys(d).join(', '));
    return null;
  } catch (e) {
    console.error('❌ Murf exception:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  WebSocket  →  ws://localhost:4000/ws/voice
// ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws/voice' });

wss.on('connection', (ws) => {
  console.log('\n🔌 WS client connected');
  const state = { phone: 'Demo', history: [] };
  const send  = (obj) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };

  // Auto-greeting
  (async () => {
    const greeting = "Hi there! You've reached the service line. I'm Matthew — how can I help you today?";
    send({ type: 'status', phase: 'thinking' });
    const audioUrl = await getMurfAudio(greeting);
    state.history.push({ role: 'assistant', content: greeting });
    send({ type: 'reply', text: greeting, audioUrl });
  })();

  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.phone) state.phone = msg.phone;

    if (msg.type === 'text') {
      const userText = (msg.data || '').trim();
      if (!userText) return;
      console.log(`\n💬 Text: "${userText}"`);
      send({ type: 'transcript', text: userText });
      send({ type: 'status', phase: 'thinking' });
      const reply = await geminiReply(userText, state.history);
      const audioUrl = await getMurfAudio(reply);
      state.history.push({ role: 'user', content: userText });
      state.history.push({ role: 'assistant', content: reply });
      await saveCall(state);
      send({ type: 'reply', text: reply, audioUrl });
    }

    if (msg.type === 'audio') {
      console.log(`\n🎤 Audio: ${(msg.data || '').length} chars base64 | ${msg.mimeType}`);
      send({ type: 'status', phase: 'transcribing' });
      const { text, error } = await transcribeAudio(msg.data, msg.mimeType || 'audio/webm');
      if (!text) {
        send({ type: 'error', message: error || 'Could not understand — try the text box instead' });
        send({ type: 'status', phase: 'idle' });
        return;
      }
      send({ type: 'transcript', text });
      send({ type: 'status', phase: 'thinking' });
      const reply = await geminiReply(text, state.history);
      const audioUrl = await getMurfAudio(reply);
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: reply });
      await saveCall(state);
      send({ type: 'reply', text: reply, audioUrl });
    }
  });

  ws.on('close', () => console.log('🔌 WS disconnected'));
  ws.on('error', (e) => console.error('WS error:', e.message));
});

async function saveCall(state) {
  if (!MONGO_URI) return;
  try {
    const turns = state.history.filter(h => h.role === 'assistant').length;
    const text  = state.history.map(h => h.content).join(' ');
    const nameM = text.match(/(?:i(?:'m| am)|this is|my name is)\s+([a-z]+)/i);
    const svcM  = text.match(/\b(plumb|hvac|dental|pipe|leak|ac|furnace|heat|cool|tooth|clinic|electric|carpet|auto|mechanic)\w*/i);
    await Call.findOneAndUpdate(
      { phoneNumber: state.phone },
      { $set: {
        conversation: state.history,
        status: turns >= 4 ? 'Qualified' : turns >= 2 ? 'In Progress' : 'New',
        ...(nameM && { name: nameM[1] }),
        ...(svcM  && { service: svcM[0] }),
      }},
      { upsert: true, new: true }
    );
  } catch (e) { console.error('MongoDB save:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  REST (kept for compatibility)
// ─────────────────────────────────────────────────────────────────
app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType = 'audio/webm' } = req.body;
  if (!audio) return res.status(400).json({ error: 'audio required' });
  res.json(await transcribeAudio(audio, mimeType));
});
app.post('/api/chat', async (req, res) => {
  const { message, phoneNumber = 'Demo', history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });
  const reply    = await geminiReply(message, history);
  const audioUrl = await getMurfAudio(reply);
  const newHist  = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
  const turns    = newHist.filter(h => h.role === 'assistant').length;
  await Call.findOneAndUpdate({ phoneNumber },
    { $set: { conversation: newHist, status: turns >= 4 ? 'Qualified' : turns >= 2 ? 'In Progress' : 'New' } },
    { upsert: true, new: true }).catch(() => {});
  res.json({ reply, audioUrl, history: newHist });
});
app.post('/api/tts', async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json({ audioUrl: await getMurfAudio(text) });
});
app.get('/api/calls', async (_req, res) => {
  try { res.json(await Call.find().sort({ createdAt: -1 }).limit(50)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/calls/stats', async (_req, res) => {
  try {
    const [total, inprog, qualified, today] = await Promise.all([
      Call.countDocuments(),
      Call.countDocuments({ status: 'In Progress' }),
      Call.countDocuments({ status: 'Qualified' }),
      Call.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
    ]);
    res.json({ total, inprog, qualified, today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/', (_req, res) => res.json({ ok: true, ws: 'ws://localhost:4000/ws/voice' }));

const PORT = Number((process.env.PORT || '4000').trim());
server.listen(PORT, () => {
  console.log(`\n🚀 CallFlowAI → http://localhost:${PORT}`);
  console.log(`🔌 WebSocket  → ws://localhost:${PORT}/ws/voice\n`);
  console.log(`   1. STT  : ${DEEPGRAM_KEY ? '✅ Deepgram Nova-2'  : '❌ DEEPGRAM_API_KEY missing'}`);
  console.log(`   2. BRAIN: ${GEMINI_KEY   ? '✅ Gemini 2.0 Flash' : '❌ GEMINI_API_KEY missing'}`);
  console.log(`   3. TTS  : ${MURF_KEY     ? '✅ Murf Falcon'      : '❌ MURF_API_KEY missing'}`);
  console.log(`   MongoDB : ${MONGO_URI    ? '✅'                  : '⚠️  MONGODB_URI not set (skipped)'}\n`);
});
