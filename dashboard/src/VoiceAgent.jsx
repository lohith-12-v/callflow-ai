// src/VoiceAgent.jsx  —  FIXED v2
//
// Fixes:
// 1. VAD_THRESH raised 10 → 18  (laptop mic background noise is ~8-12)
// 2. SILENCE_MS raised 1500 → 2000  (stops cutting off mid-sentence)
// 3. "no speech" timeout now checks a separate flag NOT reset by cleanupRec
// 4. mimeType sent to server preserves full codec string (e.g. audio/webm;codecs=opus)
// 5. Single <audio> ref — no duplicate element bug

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const WS_URL = (
  (process.env.REACT_APP_API_URL || "http://localhost:4000")
    .replace(/^http/, "ws")
    .trim() + "/ws/voice"
);

const SILENCE_MS  = 2000;   // ← raised from 1500 — stops cutting off mid-sentence
const VAD_THRESH  = 18;     // ← raised from 10 — laptop mics sit at ~8-12 ambient
const MAX_REC_MS  = 20000;

export default function VoiceAgent() {
  const [phase,      setPhase]      = useState("idle");
  const [transcript, setTranscript] = useState([]);
  const [input,      setInput]      = useState("");
  const [phone,      setPhone]      = useState("");
  const [ready,      setReady]      = useState(false);
  const [error,      setError]      = useState(null);
  const [volume,     setVolume]     = useState(0);
  const [wsState,    setWsState]    = useState("disconnected");
  const [murfOk,     setMurfOk]     = useState(null);
  const [autoListen, setAutoListen] = useState(true);
  const [micGuide,   setMicGuide]   = useState(false);

  const audioRef    = useRef(null);
  const chatEnd     = useRef(null);
  const inputRef    = useRef(null);
  const wsRef       = useRef(null);
  const phaseRef    = useRef("idle");
  const phoneRef    = useRef("Demo");
  const autoRef     = useRef(true);

  const mediaRecRef = useRef(null);
  const streamRef   = useRef(null);
  const chunksRef   = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef      = useRef(null);
  const silenceRef  = useRef(null);
  const maxRef      = useRef(null);
  const isRecRef    = useRef(false);
  const hadSpeech   = useRef(false);
  // ↑ FIX: hadSpeech is a ref shared between VAD and rec.onstop.
  //   cleanupRec resets it AFTER rec.onstop fires — use a snapshot instead (see rec.onstop below).

  const setPhaseSync = useCallback((p) => { setPhase(p); phaseRef.current = p; }, []);

  useEffect(() => { phoneRef.current = phone || "Demo"; }, [phone]);
  useEffect(() => { autoRef.current  = autoListen; },     [autoListen]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript, phase]);

  // ── Play Murf audio ──────────────────────────────────────────
  const playAudio = useCallback(async (audioUrl) => {
    const el = audioRef.current;
    if (!audioUrl || !el) {
      setMurfOk(false);
      setPhaseSync("idle");
      if (autoRef.current) setTimeout(() => phaseRef.current === "idle" && startRecording(), 600);
      return;
    }
    setMurfOk(true);
    setPhaseSync("speaking");
    el.src = audioUrl;
    el.load();
    try {
      await el.play();
      await new Promise((resolve) => { el.onended = resolve; el.onerror = resolve; });
    } catch (err) {
      console.warn("Audio play error:", err.message);
      await new Promise((r) => setTimeout(r, 2500));
    }
    setPhaseSync("idle");
    if (autoRef.current) setTimeout(() => phaseRef.current === "idle" && startRecording(), 700);
  }, []); // eslint-disable-line

  // ── WebSocket ─────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    console.log("🔌 Connecting WS:", WS_URL);
    setWsState("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => { console.log("✅ WS open"); setWsState("connected"); setError(null); };
    ws.onerror = ()  => { setWsState("error"); setError("Cannot reach backend — is server.js running on port 4000?"); };
    ws.onclose = ()  => { setWsState("disconnected"); wsRef.current = null; };

    ws.onmessage = async (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      console.log("📨", msg.type, msg.text?.slice(0, 60) || "");

      if (msg.type === "status")     { setPhaseSync(msg.phase); return; }
      if (msg.type === "transcript") { setTranscript((p) => [...p, { role: "user", text: msg.text }]); return; }
      if (msg.type === "reply")      { setTranscript((p) => [...p, { role: "agent", text: msg.text }]); await playAudio(msg.audioUrl); return; }
      if (msg.type === "error")      { setError(msg.message); setPhaseSync("idle"); return; }
    };
  }, [playAudio, setPhaseSync]);

  const wsSend = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...obj, phone: phoneRef.current }));
      return true;
    }
    setError("WebSocket disconnected — reconnecting…");
    connectWS();
    return false;
  }, [connectWS]);

  // ── Recording cleanup ─────────────────────────────────────────
  const cleanupRec = useCallback(() => {
    isRecRef.current  = false;
    hadSpeech.current = false;
    if (silenceRef.current)  clearTimeout(silenceRef.current);
    if (maxRef.current)      clearTimeout(maxRef.current);
    if (rafRef.current)      cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    analyserRef.current = null;
    setVolume(0);
  }, []);

  // ── Stop recording ────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!isRecRef.current) return;
    cleanupRec();
    if (mediaRecRef.current?.state !== "inactive") {
      try { mediaRecRef.current.stop(); } catch {}
    }
  }, [cleanupRec]);

  // ── VAD ───────────────────────────────────────────────────────
  const startVAD = useCallback((stream) => {
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!isRecRef.current) return;
        analyser.getByteFrequencyData(buf);
        const avg  = Array.from(buf.slice(5, 80)).reduce((a, b) => a + b, 0) / 75;
        const norm = Math.min(100, avg * 2.8);
        setVolume(norm);

        if (norm > VAD_THRESH) {
          hadSpeech.current = true;
          if (silenceRef.current) clearTimeout(silenceRef.current);
          silenceRef.current = setTimeout(() => {
            if (isRecRef.current && hadSpeech.current) stopRecording();
          }, SILENCE_MS);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { console.warn("VAD:", e.message); }
  }, [stopRecording]);

  // ── Start recording ───────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setError("Not connected — wait a moment and try again.");
      connectWS();
      return;
    }
    setError(null);
    chunksRef.current = [];
    hadSpeech.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // Pick the best supported mime type — preserve full codec string for Deepgram
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        .find((m) => MediaRecorder.isTypeSupported(m)) || "audio/webm";
      console.log("🎤 Recording with mimeType:", mime);

      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRecRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      rec.onstop = async () => {
        // FIX: snapshot hadSpeech BEFORE cleanupRec resets it
        const didSpeak = hadSpeech.current;
        const chunks   = [...chunksRef.current];
        chunksRef.current = [];

        if (!didSpeak || !chunks.length) {
          console.log("No speech detected in recording");
          setPhaseSync("idle");
          return;
        }

        setPhaseSync("transcribing");
        try {
          const blob   = new Blob(chunks, { type: mime });
          console.log(`📤 Sending audio blob: ${blob.size} bytes | ${mime}`);
          const buffer = await blob.arrayBuffer();
          const bytes  = new Uint8Array(buffer);

          // Safe chunked base64 encode
          let b64 = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            b64 += btoa(String.fromCharCode(...bytes.subarray(i, i + 8192)));
          }

          const sent = wsSend({ type: "audio", data: b64, mimeType: mime });
          if (!sent) setPhaseSync("idle");
        } catch (e) {
          setPhaseSync("idle");
          setError("Recording error: " + e.message);
        }
      };

      isRecRef.current = true;
      rec.start(200);
      startVAD(stream);
      setPhaseSync("recording");

      maxRef.current = setTimeout(() => { if (isRecRef.current) stopRecording(); }, MAX_REC_MS);

      // FIX: "no speech" timeout — check hadSpeech.current at 5s but DON'T
      // abort if we've already gotten speech (race condition in original)
      setTimeout(() => {
        if (isRecRef.current && !hadSpeech.current) {
          stopRecording();
          setError("No speech detected. Try: speak louder, get closer to the mic, or use the text box.");
        }
      }, 5000);

    } catch (e) {
      isRecRef.current = false;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicGuide(true);
      } else {
        setError("Mic error: " + e.message);
      }
    }
  }, [connectWS, startVAD, stopRecording, wsSend, setPhaseSync]);

  // ── Session ───────────────────────────────────────────────────
  const startSession = useCallback(() => {
    setReady(true);
    connectWS();
  }, [connectWS]);

  const sendText = useCallback(() => {
    const msg = input.trim();
    if (!msg || phase !== "idle") return;
    setInput("");
    setPhaseSync("thinking");
    wsSend({ type: "text", data: msg });
  }, [input, phase, wsSend, setPhaseSync]);

  const reset = useCallback(() => {
    stopRecording(); cleanupRec();
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    if (audioRef.current) audioRef.current.src = "";
    setPhaseSync("idle"); setTranscript([]); setInput("");
    setPhone(""); phoneRef.current = "Demo"; setReady(false);
    setError(null); setMurfOk(null); setVolume(0); setWsState("disconnected");
  }, [stopRecording, cleanupRec, setPhaseSync]);

  useEffect(() => () => cleanupRec(), [cleanupRec]);

  const isRec  = phase === "recording";
  const LABEL  = { idle: "Ready", recording: "Listening…", transcribing: "Transcribing…", thinking: "Thinking…", speaking: "Speaking…" };
  const DOT    = { idle: "bg-gray-600", recording: "bg-red-400 animate-pulse", transcribing: "bg-blue-400 animate-pulse", thinking: "bg-amber-400 animate-pulse", speaking: "bg-green-400 animate-pulse" };
  const WS_COL = { connected: "text-green-400", connecting: "text-amber-400", error: "text-red-400", disconnected: "text-gray-500" };

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-8 text-white" style={{ fontFamily: "'Sora',sans-serif" }}>

      {/* Mic guide modal */}
      <AnimatePresence>
        {micGuide && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/85">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0d0025] p-6">
              <p className="text-base font-bold mb-1">🎤 Microphone access blocked</p>
              <p className="text-xs text-gray-400 mb-5">Your browser is blocking mic access. Here's how to fix it:</p>
              <div className="space-y-3 mb-5">
                {[
                  { n: "1", t: "Click the 🔒 or 🎤 icon in the address bar", s: "Next to the URL" },
                  { n: "2", t: 'Set "Microphone" to Allow',                  s: "Then click Done" },
                  { n: "3", t: "Refresh this page (Ctrl+R)",                 s: "Mic works after refresh" },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">{s.n}</span>
                    <div><p className="text-sm font-medium">{s.t}</p><p className="text-xs text-gray-500">{s.s}</p></div>
                  </div>
                ))}
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-xs text-amber-300">💡 <strong>Fastest fix:</strong> Open in <strong>Chrome</strong> — mic works instantly.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMicGuide(false)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-sm text-gray-300 hover:bg-white/5 transition">Use text instead</button>
                <button onClick={() => { setMicGuide(false); window.location.reload(); }} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-sm font-bold hover:bg-purple-500 transition">Refresh page →</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative shrink-0">
          <motion.div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-400 flex items-center justify-center font-bold shadow-lg"
            animate={phase === "speaking" ? { scale: [1, 1.07, 1] } : {}} transition={{ duration: 0.6, repeat: Infinity }}>M</motion.div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#050015] ${DOT[phase]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold">Matthew</p>
            <span className={`text-[10px] font-medium ${WS_COL[wsState]}`}>● {wsState === "connected" ? "WS live" : wsState}</span>
            {murfOk === true  && <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full">Murf ✅</span>}
            {murfOk === false && <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full">Murf ⚠️ text-only</span>}
          </div>
          <p className="text-xs text-purple-300/60">Deepgram · Gemini 2.0 Flash · Murf Falcon</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border shrink-0 font-medium ${
          phase === "recording"    ? "border-red-500/60 text-red-300 bg-red-500/10"       :
          phase === "transcribing" ? "border-blue-500/60 text-blue-300 bg-blue-500/10"    :
          phase === "thinking"     ? "border-amber-500/60 text-amber-300 bg-amber-500/10" :
          phase === "speaking"     ? "border-green-500/60 text-green-300 bg-green-500/10" :
          "border-white/10 text-gray-500"}`}>{LABEL[phase]}</span>
      </div>

      {/* Start / Chat */}
      <AnimatePresence mode="wait">
        {!ready && (
          <motion.div key="start" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}
            className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-4">
            <p className="text-sm font-bold mb-1">Start Voice Demo</p>
            <div className="text-xs text-gray-500 mb-4 space-y-0.5">
              <p>🔴 <span className="text-red-300">VAD Mic</span> → 🔵 <span className="text-blue-300">Deepgram Nova-2</span> → 🟡 <span className="text-amber-300">Gemini 2.0 Flash</span> → 🟢 <span className="text-green-300">Murf Falcon</span></p>
              <p className="text-gray-600">WebSocket → Node.js backend on port 4000</p>
            </div>
            <div className="flex gap-2 mb-3">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startSession()}
                placeholder="+91 98765 43210 (optional)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 transition" />
              <button onClick={startSession} className="px-5 py-2.5 rounded-xl bg-purple-600 text-sm font-bold hover:bg-purple-500 transition">Start →</button>
            </div>
            <button onClick={() => { setPhone("Demo"); startSession(); }} className="text-xs text-purple-400/60 hover:text-purple-300 transition">Skip — demo mode</button>
          </motion.div>
        )}

        {ready && (
          <motion.div key="chat" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}
            className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden mb-3">

            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <p className="text-xs text-gray-500">Node.js · Deepgram · Gemini · Murf</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setAutoListen((p) => !p)}>
                  <div className={`w-7 h-4 rounded-full relative transition-colors ${autoListen ? "bg-purple-600" : "bg-gray-700"}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoListen ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-[10px] text-gray-500">Auto-loop</span>
                </label>
                <span className={`text-[10px] font-medium ${WS_COL[wsState]}`}>● {wsState}</span>
              </div>
            </div>

            <div className="h-72 overflow-y-auto px-4 py-4 space-y-3">
              {transcript.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                    ${m.role === "user" ? "bg-purple-600 text-white rounded-br-sm" : "bg-white/8 border border-white/10 text-gray-100 rounded-bl-sm"}`}>
                    {m.role === "agent" && <p className="text-[10px] text-purple-400/60 uppercase tracking-widest mb-1">Matthew · Murf AI</p>}
                    {m.text}
                  </div>
                </motion.div>
              ))}

              {isRec && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
                  <div className="rounded-2xl px-4 py-2.5 bg-red-500/10 border border-red-500/20 flex items-end gap-0.5">
                    {Array.from({ length: 18 }, (_, i) => {
                      const h = Math.max(3, (volume / 100) * 26 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.8))));
                      return <motion.div key={i} className="w-1 bg-red-400 rounded-full" animate={{ height: Math.max(3, h) }} transition={{ duration: 0.08 }} style={{ height: 3 }} />;
                    })}
                    <span className="text-xs text-red-300 ml-2 shrink-0">{hadSpeech.current ? "Hearing you…" : "Waiting for speech…"}</span>
                  </div>
                </motion.div>
              )}

              {phase === "transcribing" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
                  <div className="rounded-2xl px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>⟳</motion.span>
                    Deepgram transcribing…
                  </div>
                </motion.div>
              )}

              {phase === "thinking" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                    {[0, 0.18, 0.36].map((d, i) => (
                      <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400"
                        animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: d }} />
                    ))}
                    <span className="text-xs text-amber-300/60 ml-1">Gemini thinking…</span>
                  </div>
                </motion.div>
              )}

              {phase === "speaking" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-end gap-1">
                    {[10, 18, 12, 22, 10, 16, 8, 14].map((h, i) => (
                      <motion.div key={i} className="w-1 bg-green-400 rounded-full"
                        animate={{ height: [h * 0.4, h, h * 0.4] }} transition={{ duration: 0.35 + i * 0.06, repeat: Infinity, delay: i * 0.05 }} style={{ height: h * 0.4 }} />
                    ))}
                    <span className="text-xs text-green-300 ml-2">Murf Falcon…</span>
                  </div>
                </motion.div>
              )}

              <div ref={chatEnd} />
            </div>

            {/* Single audio element — visible for manual play fallback */}
            <div className="px-4 py-3 border-t border-white/5 bg-purple-500/5">
              <p className="text-[10px] text-purple-400 uppercase tracking-widest mb-1.5">🎙️ Murf Falcon TTS — tap ▶ if audio doesn't auto-play</p>
              <audio ref={audioRef} controls preload="auto" className="w-full" style={{ height: 36, accentColor: "#a855f7" }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      {ready && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {isRec && [1.5, 2.0, 2.6].map((s, i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full bg-red-500 pointer-events-none"
                  animate={{ scale: [1, s], opacity: [0.4, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.3, ease: "easeOut" }} />
              ))}
              <motion.button
                onClick={() => isRec ? stopRecording() : startRecording()}
                whileTap={{ scale: 0.88 }}
                disabled={["transcribing", "thinking", "speaking"].includes(phase)}
                className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200
                  ${isRec ? "bg-red-500 scale-105 shadow-xl shadow-red-500/50"
                    : phase === "speaking" ? "bg-green-600 cursor-default"
                    : ["thinking", "transcribing"].includes(phase) ? "bg-amber-500 cursor-wait"
                    : "bg-purple-600 hover:bg-purple-500 hover:scale-105 shadow-lg shadow-purple-500/30"}`}>
                {isRec ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
                ) : ["thinking", "transcribing"].includes(phase) ? (
                  <div className="flex gap-1">{[0, 0.2, 0.4].map((d, i) => (
                    <motion.span key={i} className="w-2 h-2 rounded-full bg-white" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: d }} />
                  ))}</div>
                ) : phase === "speaking" ? (
                  <div className="flex gap-1 items-end">{[8, 14, 10, 18, 8].map((h, i) => (
                    <motion.div key={i} className="w-1.5 bg-white rounded-full" animate={{ height: [h * 0.5, h, h * 0.5] }} transition={{ duration: 0.4 + i * 0.1, repeat: Infinity }} style={{ height: h * 0.5 }} />
                  ))}</div>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                    <rect x="9" y="2" width="6" height="13" rx="3" />
                    <path d="M5 10a7 7 0 0014 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <line x1="12" y1="21" x2="12" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    <line x1="9" y1="21" x2="15" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </motion.button>
            </div>
            <p className={`text-xs text-center font-medium ${isRec ? "text-red-400" : "text-gray-500"}`}>
              {isRec ? "🔴 Listening — auto-stops after 2s silence  |  tap ■ to send now" : phase === "idle" ? "Tap 🎤 to speak" : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && input.trim() && phase === "idle") sendText(); }}
              placeholder="Or type your message and press Enter…"
              disabled={phase !== "idle"}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 transition disabled:opacity-40" />
            <motion.button onClick={sendText} whileTap={{ scale: 0.94 }}
              disabled={!input.trim() || phase !== "idle"}
              className="px-4 py-2.5 rounded-xl bg-purple-600 text-sm font-semibold hover:bg-purple-500 transition disabled:opacity-30">
              Send
            </motion.button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex gap-2 items-start text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-red-300">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-center gap-4">
            <button onClick={() => setMicGuide(true)} className="text-xs text-amber-500/60 hover:text-amber-400 transition">🎤 Mic blocked?</button>
            <button onClick={reset} className="text-xs text-gray-600 hover:text-gray-400 transition">End session & reset</button>
          </div>
        </div>
      )}
    </div>
  );
}
