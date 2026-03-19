// src/App.js — Final complete app
import React, { useRef, useState, useEffect } from "react";
import { motion, useInView, useScroll, useTransform, animate, useSpring } from "framer-motion";
import VoiceAgent from "./VoiceAgent";
import Dashboard  from "./Dashboard";

/* ── Helpers ─────────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity:0, y:40 },
  visible: (i=0) => ({ opacity:1, y:0, transition:{ duration:0.7, delay:i*0.1, ease:[0.22,1,0.36,1] } }),
};
const scaleIn = {
  hidden: { opacity:0, scale:0.88 },
  visible: (i=0) => ({ opacity:1, scale:1, transition:{ duration:0.55, delay:i*0.1, ease:[0.22,1,0.36,1] } }),
};

function Reveal({ children, delay=0, className="", variants=fadeUp }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true, margin:"-70px" });
  return (
    <motion.div ref={ref} className={className} variants={variants} custom={delay}
      initial="hidden" animate={inView ? "visible" : "hidden"}>
      {children}
    </motion.div>
  );
}

function Counter({ target, suffix="" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, target, { duration:1.8, ease:"easeOut", onUpdate:(v)=>setVal(Math.floor(v)) });
    return c.stop;
  }, [inView, target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

function MagneticBtn({ children, className, onClick }) {
  const ref = useRef(null);
  const x = useSpring(0, { stiffness:200, damping:18 });
  const y = useSpring(0, { stiffness:200, damping:18 });
  return (
    <motion.button ref={ref} style={{ x, y }}
      onMouseMove={e => {
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width/2) * 0.28);
        y.set((e.clientY - r.top - r.height/2) * 0.28);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      whileTap={{ scale:0.95 }} className={className} onClick={onClick}>
      {children}
    </motion.button>
  );
}

const WORDS = ["Plumbers.", "Clinics.", "Auto Shops.", "HVAC Teams.", "Dentists."];
function Typewriter() {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState("");
  const [del, setDel] = useState(false);
  useEffect(() => {
    const word = WORDS[idx]; let t;
    if (!del && shown.length < word.length)       t = setTimeout(() => setShown(word.slice(0,shown.length+1)), 80);
    else if (!del && shown.length === word.length) t = setTimeout(() => setDel(true), 1800);
    else if (del && shown.length > 0)              t = setTimeout(() => setShown(shown.slice(0,-1)), 45);
    else { setDel(false); setIdx(p=>(p+1)%WORDS.length); }
    return () => clearTimeout(t);
  }, [shown, del, idx]);
  return (
    <span className="text-purple-400">
      {shown}
      <motion.span className="inline-block w-0.5 h-9 bg-purple-400 ml-0.5 align-middle"
        animate={{ opacity:[1,0] }} transition={{ duration:0.5, repeat:Infinity, repeatType:"reverse" }} />
    </span>
  );
}

/* ── Data ─────────────────────────────────────────────────────── */
const features = [
  { icon:"📞", title:"Instant Call Pickup",      desc:"Answer every missed call in under 2 seconds with a natural AI voice — no IVR menus.", accent:true },
  { icon:"🎯", title:"Smart Lead Qualification", desc:"Capture name, service needed, urgency and budget so you know who to call back first." },
  { icon:"📅", title:"Auto Booking Links",       desc:"Send SMS/WhatsApp booking links while the caller is still on the line." },
  { icon:"📋", title:"CRM-Ready Summaries",      desc:"Structured notes for every call, ready to sync into your CRM automatically." },
  { icon:"🧠", title:"Caller Intent Detection",  desc:"Differentiate emergencies, new leads and casual inquiries with Gemini AI." },
  { icon:"🌐", title:"Multi-Language Support",   desc:"Handle callers in English + Telugu, Hindi, Tamil — builds local trust." },
];
const trust = [
  { num:"01", title:"2-Second AI Pickup",   sub:"No caller waits, no lead lost" },
  { num:"02", title:"Zero Setup Fee",       sub:"Live on your number in 1 day" },
  { num:"03", title:"Murf Falcon Voice",    sub:"Sub-130ms latency" },
  { num:"04", title:"24/7 Always On",       sub:"Nights, weekends, on-the-job" },
];
const cases = [
  { tag:"Plumbing",      title:"₹3.4L extra/month",      body:"5-truck company in Hyderabad recovered 37% of missed calls and filled slow weekdays." },
  { tag:"Dental Clinic", title:"2× new patient bookings", body:"AI receptionist handled after-hours inquiries and sent instant booking links." },
  { tag:"Auto Garage",   title:"−40% no-show rate",       body:"Automated reminders and rescheduling links sent directly from the call transcript." },
];
const particles = [
  {x:"7%",y:"18%",s:5,d:0,dur:4.5},{x:"87%",y:"14%",s:3,d:1.2,dur:5.2},
  {x:"14%",y:"68%",s:4,d:0.5,dur:3.8},{x:"77%",y:"63%",s:6,d:2,dur:6},
  {x:"50%",y:"82%",s:3,d:0.8,dur:4.2},{x:"34%",y:"9%",s:4,d:1.5,dur:5},
  {x:"64%",y:"38%",s:3,d:0.3,dur:4.8},{x:"91%",y:"48%",s:5,d:1.8,dur:3.5},
];

/* ═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("landing");
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target:heroRef, offset:["start start","end start"] });
  const glowY   = useTransform(scrollYProgress, [0,1], [0,130]);
  const glowOp  = useTransform(scrollYProgress, [0,0.65], [1,0]);
  const heroY   = useTransform(scrollYProgress, [0,1], [0,55]);

  return (
    <div style={{ fontFamily:"'Sora',sans-serif" }} className="min-h-screen bg-[#050015] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#050015}::-webkit-scrollbar-thumb{background:#a855f7;border-radius:4px}
        @keyframes glow{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}.glow-orb{animation:glow 4s ease-in-out infinite}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        .shimmer{background:linear-gradient(90deg,transparent 0%,rgba(168,85,247,.7) 50%,transparent 100%);background-size:200% auto;animation:shimmer 2.8s linear infinite}
        @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .marquee{animation:marquee 32s linear infinite}.marquee:hover{animation-play-state:paused}
        .nav-link{position:relative}.nav-link::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1px;background:#a855f7;transition:width .25s ease}.nav-link:hover::after{width:100%}
        @keyframes scan{0%{top:0%}100%{top:100%}}.scan{animation:scan 5s linear infinite}
      `}</style>

      {/* ── Navbar ──────────────────────────────────────────── */}
      <motion.header initial={{ y:-64, opacity:0 }} animate={{ y:0, opacity:1 }}
        transition={{ duration:0.65, ease:[0.22,1,0.36,1] }}
        className="sticky top-0 z-50 border-b border-white/5 bg-[#050015]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <motion.div className="flex items-center gap-2 cursor-pointer" onClick={()=>setTab("landing")}
            initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2 }}>
            <motion.div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-400"
              animate={{ rotate:360 }} transition={{ duration:12, repeat:Infinity, ease:"linear" }} />
            <span className="text-lg font-semibold tracking-tight">CallFlow<span className="text-purple-400">AI</span></span>
          </motion.div>

          {/* Desktop tab nav */}
          <nav className="hidden md:flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {[{id:"landing",label:"Home"},{id:"demo",label:"🎙️ Live Demo"},{id:"dashboard",label:"📊 Dashboard"}].map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-all duration-200 font-medium
                  ${tab===t.id ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>

          <motion.div className="flex items-center gap-3" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.4 }}>
            <MagneticBtn onClick={()=>setTab("demo")}
              className="hidden md:inline-flex text-sm px-4 py-2 rounded-md border border-white/20 text-gray-200 hover:bg-white/5 transition">
              Request Demo
            </MagneticBtn>
            <MagneticBtn onClick={()=>setTab("demo")}
              className="text-sm px-5 py-2 rounded-md bg-purple-600 hover:bg-purple-500 font-medium transition"
              style={{ boxShadow:"0 0 20px rgba(168,85,247,0.4)" }}>
              Get Started
            </MagneticBtn>
          </motion.div>
        </div>

        {/* Mobile tab bar */}
        <div className="md:hidden flex border-t border-white/5">
          {[{id:"landing",label:"Home"},{id:"demo",label:"🎙️ Demo"},{id:"dashboard",label:"📊 Leads"}].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex-1 py-2 text-xs font-medium transition
                ${tab===t.id ? "text-purple-400 border-b-2 border-purple-500" : "text-gray-500"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </motion.header>

      {/* ── Demo Tab ────────────────────────────────────────── */}
      {tab === "demo" && (
        <div className="max-w-2xl mx-auto px-4 py-12">
          <Reveal className="text-center mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-purple-400/70 mb-3">Real-Time Voice AI</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              Try Matthew. <span className="text-purple-400">Right Now.</span>
            </h2>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              Full voice loop: VAD mic → Gemini STT → Gemini Flash AI → Murf Falcon voice. Real leads saved to MongoDB.
            </p>
          </Reveal>
          <div className="rounded-3xl border border-white/10 bg-white/4 overflow-hidden">
            <VoiceAgent />
          </div>
        </div>
      )}

      {/* ── Dashboard Tab ───────────────────────────────────── */}
      {tab === "dashboard" && <Dashboard />}

      {/* ── Landing Tab ─────────────────────────────────────── */}
      {tab === "landing" && (
        <>
          {/* HERO */}
          <section ref={heroRef} id="home"
            className="relative flex flex-col items-center justify-center text-center pt-24 pb-44 px-6 overflow-hidden min-h-screen">
            {particles.map((p,i) => (
              <motion.div key={i} className="absolute rounded-full bg-purple-400/25 pointer-events-none"
                style={{ left:p.x, top:p.y, width:p.s, height:p.s }}
                animate={{ y:[0,-28,0], opacity:[0.2,0.6,0.2] }}
                transition={{ duration:p.dur, delay:p.d, repeat:Infinity, ease:"easeInOut" }} />
            ))}

            <motion.div aria-hidden className="glow-orb pointer-events-none absolute left-1/2 -translate-x-1/2 -top-16"
              style={{ width:860, height:560, y:glowY, opacity:glowOp,
                background:"radial-gradient(ellipse 72% 62% at 50% 10%, #7c3aed 0%, #4f0aad 26%, rgba(80,0,180,.14) 58%, transparent 78%)",
                filter:"blur(3px)" }} />
            <motion.div aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{ top:140, width:720, height:360, borderRadius:"50% 50% 0 0 / 100% 100% 0 0", border:"1px solid rgba(168,85,247,.22)" }}
              animate={{ boxShadow:["0 0 40px 2px rgba(168,85,247,.1)","0 0 90px 14px rgba(168,85,247,.28)","0 0 40px 2px rgba(168,85,247,.1)"] }}
              transition={{ duration:4, repeat:Infinity }} />

            <motion.div style={{ y:heroY }} className="relative z-10 max-w-3xl">
              <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
                className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-4 py-1.5 mb-7">
                <motion.span className="w-2 h-2 rounded-full bg-green-400"
                  animate={{ scale:[1,1.5,1] }} transition={{ duration:1.6, repeat:Infinity }} />
                <span className="text-xs text-purple-200 font-medium tracking-wide">Live AI Receptionist — Powered by Murf Falcon + Gemini</span>
              </motion.div>

              <div className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.06] tracking-tight mb-5">
                {"Never Lose Revenue".split(" ").map((w,i) => (
                  <motion.span key={i} className="inline-block mr-3"
                    initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay:0.15+i*0.1, duration:0.65, ease:[0.22,1,0.36,1] }}>{w}</motion.span>
                ))}
                <br />
                {"When You Miss a Call.".split(" ").map((w,i) => (
                  <motion.span key={i} className="inline-block mr-3"
                    initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay:0.55+i*0.1, duration:0.65, ease:[0.22,1,0.36,1] }}>{w}</motion.span>
                ))}
              </div>

              <motion.p className="text-xl sm:text-2xl font-semibold mb-5 h-11 flex items-center justify-center gap-3"
                initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.7 }}>
                <span className="text-gray-400 font-light text-base">Built for</span>
                <Typewriter />
              </motion.p>

              <motion.p className="text-gray-300 text-base sm:text-lg max-w-xl mx-auto mb-10 leading-relaxed font-light"
                initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.6 }}>
                CallFlowAI answers every missed call in 2 seconds with Murf AI voice, qualifies the lead with Gemini Flash, and saves it to your dashboard — automatically.
              </motion.p>

              <motion.div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14"
                initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.72 }}>
                <MagneticBtn onClick={()=>setTab("demo")}
                  className="relative overflow-hidden px-8 py-3.5 rounded-md bg-purple-600 text-sm font-semibold"
                  style={{ boxShadow:"0 0 30px rgba(168,85,247,0.5)" }}>
                  <motion.span className="relative z-10 flex items-center gap-2">
                    Try Live Demo
                    <motion.span animate={{ x:[0,3,0] }} transition={{ duration:1.4, repeat:Infinity }}>→</motion.span>
                  </motion.span>
                  <motion.div className="absolute inset-0 bg-white/20" initial={{ x:"-100%" }} whileHover={{ x:"100%" }} transition={{ duration:0.45 }} />
                </MagneticBtn>
                <MagneticBtn onClick={()=>setTab("dashboard")}
                  className="px-8 py-3.5 rounded-md border border-white/20 text-sm text-gray-100 hover:bg-white/5 transition">
                  View Dashboard 📊
                </MagneticBtn>
              </motion.div>

              <motion.div initial={{ opacity:0, y:24, scale:0.96 }} animate={{ opacity:1, y:0, scale:1 }}
                transition={{ delay:0.85 }}
                className="inline-flex flex-wrap items-center justify-center gap-6 rounded-xl border border-white/10 bg-black/50 backdrop-blur px-8 py-4">
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">Trusted by</p>
                  <p className="text-2xl font-bold">1,200+</p>
                  <p className="text-[10px] text-gray-500">local businesses</p>
                </div>
                <div className="w-px h-10 bg-white/10 hidden sm:block" />
                {["★ 4.9/5","⊕ Murf AI","✦ Gemini","⊕ MongoDB"].map((b,i) => (
                  <motion.span key={b} className="text-sm text-gray-300 font-medium"
                    initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.92+i*0.08 }}>{b}</motion.span>
                ))}
              </motion.div>
            </motion.div>
          </section>

          {/* FEATURES */}
          <section id="features" className="max-w-6xl mx-auto px-6 pb-28">
            <Reveal className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] text-purple-400/70 mb-3">What We Do</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                Innovating Follow-Ups. <span className="text-purple-400">Recovering Revenue.</span>
              </h2>
              <p className="text-sm text-gray-400 max-w-2xl mx-auto">AI receptionists that sound human, qualify every caller, and send a clean summary — in real time.</p>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f,i) => (
                <motion.div key={f.title} custom={i} variants={scaleIn}
                  initial="hidden" whileInView="visible" viewport={{ once:true, margin:"-60px" }}
                  whileHover={{ y:-6, scale:1.02, transition:{ type:"spring", stiffness:240, damping:18 } }}
                  className={`group relative rounded-2xl border p-6 flex flex-col gap-4 cursor-default overflow-hidden
                    ${f.accent ? "bg-purple-600 border-purple-400/60" : "bg-white/4 border-white/8 hover:border-purple-500/40"}`}
                  style={f.accent ? { boxShadow:"0 0 40px rgba(168,85,247,0.3)" } : {}}>
                  {!f.accent && (
                    <div className="absolute top-0 left-8 right-8 h-px shimmer rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  )}
                  <div className="flex items-start justify-between relative z-10">
                    <motion.div whileHover={{ rotate:[0,-10,10,0], scale:1.15 }} transition={{ duration:0.4 }}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${f.accent ? "bg-white/20" : "bg-purple-500/15"}`}>
                      {f.icon}
                    </motion.div>
                    <motion.span whileHover={{ x:2, y:-2 }}
                      className={`text-xs border rounded-full w-7 h-7 flex items-center justify-center transition
                        ${f.accent ? "border-white/30 text-white/70" : "border-white/10 text-gray-500 group-hover:border-purple-500/50 group-hover:text-purple-400"}`}>↗</motion.span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                    <p className={`text-sm leading-relaxed ${f.accent ? "text-white/80" : "text-gray-400"}`}>{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* TRUST BAND */}
          <section className="w-full py-20 px-6 relative overflow-hidden"
            style={{ background:"linear-gradient(135deg, #2d0b6b 0%, #1a0550 40%, #2d0b6b 100%)" }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage:"linear-gradient(rgba(168,85,247,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.05) 1px,transparent 1px)", backgroundSize:"60px 60px" }} />
            <div className="scan absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent pointer-events-none" />
            <div className="max-w-6xl mx-auto relative z-10">
              <Reveal className="text-center mb-3"><h2 className="text-2xl sm:text-3xl font-bold">Built on Trust. Driven by Results.</h2></Reveal>
              <Reveal delay={1} className="text-center mb-14"><p className="text-sm text-purple-200/70 max-w-xl mx-auto">Every missed call is a chance to earn a customer for life.</p></Reveal>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {trust.map((t,i) => (
                  <motion.div key={t.num} initial={{ opacity:0, x:-30 }} whileInView={{ opacity:1, x:0 }}
                    viewport={{ once:true }} transition={{ delay:i*0.12 }}
                    whileHover={{ y:-4 }}
                    className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur p-6 relative group cursor-default">
                    <motion.span className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full border border-white/20 text-white/40 text-xs"
                      whileHover={{ rotate:45 }}>↗</motion.span>
                    <p className="text-3xl font-bold text-white/25 mb-4">{t.num}</p>
                    <p className="font-semibold text-white text-base mb-1">{t.title}</p>
                    <p className="text-xs text-purple-200/60">{t.sub}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className="border-y border-white/8 py-16 px-6">
            <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
              {[{t:10,s:"k+",l:"Calls rescued / month"},{t:35,s:"%",l:"Avg lift in bookings"},{t:130,s:"ms",l:"Murf Falcon latency"},{t:24,s:"/7",l:"Always-on receptionist"}].map((s,i) => (
                <Reveal key={s.l} delay={i*0.3}>
                  <motion.div whileInView={{ scale:[0.85,1.04,1] }} viewport={{ once:true }} transition={{ duration:0.5, delay:i*0.1 }}>
                    <p className="text-3xl sm:text-4xl font-bold mb-2"><Counter target={s.t} suffix={s.s} /></p>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{s.l}</p>
                    <motion.div className="h-px bg-purple-500/50 mx-auto" initial={{ width:0 }}
                      whileInView={{ width:"55%" }} viewport={{ once:true }}
                      transition={{ duration:0.9, delay:i*0.1+0.3 }} />
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* CASES */}
          <section className="max-w-6xl mx-auto px-6 py-24">
            <Reveal className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Real Impact. <span className="text-purple-400">Proven Results.</span></h2>
              <p className="text-sm text-gray-400 max-w-xl mx-auto">Local businesses turning missed calls into revenue with CallFlowAI.</p>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {cases.map((c,i) => (
                <motion.div key={c.title} initial={{ opacity:0, y:30 }} whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true }} transition={{ delay:i*0.12 }}
                  whileHover={{ y:-8, scale:1.02, transition:{ type:"spring", stiffness:240, damping:18 } }}
                  className="rounded-2xl border border-white/8 bg-white/4 p-6 group cursor-default relative overflow-hidden">
                  <motion.div className="absolute inset-0 rounded-2xl pointer-events-none" initial={{ opacity:0 }} whileHover={{ opacity:1 }}
                    style={{ background:"radial-gradient(circle at 50% 0%, rgba(168,85,247,.13) 0%, transparent 70%)" }} />
                  <p className="text-[10px] uppercase tracking-[0.25em] text-purple-400 mb-3">{c.tag}</p>
                  <h3 className="text-xl font-bold mb-3 relative z-10">{c.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed relative z-10">{c.body}</p>
                  <motion.span className="mt-5 block text-xs text-purple-400 relative z-10" whileHover={{ x:4 }}>Read story →</motion.span>
                </motion.div>
              ))}
            </div>
            <Reveal className="flex justify-center">
              <MagneticBtn onClick={()=>setTab("dashboard")}
                className="relative overflow-hidden px-8 py-3 rounded-md bg-purple-600 text-sm font-semibold hover:bg-purple-500 transition"
                style={{ boxShadow:"0 0 20px rgba(168,85,247,0.4)" }}>
                View Live Dashboard →
              </MagneticBtn>
            </Reveal>
          </section>

          {/* PRICING CTA */}
          <section className="max-w-6xl mx-auto px-6 pb-24">
            <Reveal>
              <motion.div className="rounded-3xl border border-purple-500/30 p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
                style={{ background:"linear-gradient(135deg, rgba(88,28,220,.25) 0%, rgba(109,40,217,.12) 50%, rgba(79,20,180,.25) 100%)" }}>
                <motion.div className="absolute -right-32 -top-32 w-72 h-72 rounded-full border border-purple-500/10 pointer-events-none"
                  animate={{ rotate:360 }} transition={{ duration:22, repeat:Infinity, ease:"linear" }} />
                <div className="max-w-md relative z-10">
                  <h3 className="text-2xl sm:text-3xl font-bold mb-3">Start recovering missed calls in 1 day.</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">Murf Falcon voice + Gemini Flash AI + real-time lead dashboard — all set up in minutes.</p>
                </div>
                <div className="text-center md:text-right shrink-0 relative z-10">
                  <p className="text-xs uppercase tracking-widest text-purple-300 mb-1">From</p>
                  <motion.p className="text-4xl font-bold mb-1"
                    whileInView={{ scale:[0.88,1.06,1] }} viewport={{ once:true }}>₹4,999</motion.p>
                  <p className="text-xs text-gray-400 mb-4">/ month · No setup fee · Cancel anytime</p>
                  <MagneticBtn onClick={()=>setTab("demo")}
                    className="px-7 py-3 rounded-md bg-white text-black text-sm font-semibold hover:bg-gray-100 transition">
                    Try It Free →
                  </MagneticBtn>
                </div>
              </motion.div>
            </Reveal>
          </section>

          {/* FOOTER */}
          <footer className="border-t border-white/5 py-8 px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <motion.div className="w-5 h-5 rounded-full bg-purple-500/80"
                  animate={{ scale:[1,1.25,1] }} transition={{ duration:2, repeat:Infinity }} />
                <span className="font-semibold text-white">CallFlowAI</span>
                <span className="ml-2">© {new Date().getFullYear()} · Murf Falcon + Gemini Flash + MongoDB</span>
              </div>
              <div className="flex gap-6">
                {["Features","Demo","Dashboard"].map(l => (
                  <button key={l} onClick={()=>setTab(l.toLowerCase())} className="nav-link hover:text-gray-300 transition">{l}</button>
                ))}
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}