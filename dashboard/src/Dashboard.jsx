// src/Dashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").trim();

const STATUS_STYLE = {
  New:         "bg-gray-500/20  text-gray-300  border-gray-500/30",
  "In Progress":"bg-blue-500/20  text-blue-300  border-blue-500/30",
  Qualified:   "bg-green-500/20 text-green-300 border-green-500/30",
  Booked:      "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(date).toLocaleDateString("en-IN");
}

function StatCard({ label, value, color, delay }) {
  return (
    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
      transition={{ delay }}
      className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </motion.div>
  );
}

export default function Dashboard() {
  const [calls,    setCalls]    = useState([]);
  const [stats,    setStats]    = useState({ total:0, inprog:0, qualified:0, today:0 });
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${API_BASE}/api/calls`),
        fetch(`${API_BASE}/api/calls/stats`),
      ]);
      if (!cr.ok || !sr.ok) throw new Error("Backend unreachable");
      const [calls, stats] = await Promise.all([cr.json(), sr.json()]);
      setCalls(calls);
      setStats(stats);
      setLastSync(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 6000);
    return () => clearInterval(iv);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#050015] text-white px-4 py-8 max-w-6xl mx-auto"
      style={{ fontFamily:"'Sora',sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">
            CallFlow<span className="text-purple-400">AI</span> — Live Dashboard
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            {lastSync ? `Last sync ${timeAgo(lastSync)}` : "Connecting…"} · Auto-refreshes every 6s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <motion.span className="w-2 h-2 rounded-full bg-green-400"
              animate={{ scale:[1,1.4,1] }} transition={{ duration:2, repeat:Infinity }} />
            <span className="text-xs text-gray-400">Live</span>
          </div>
          <button onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Leads"   value={stats.total}     color="text-white"       delay={0}    />
        <StatCard label="Today"         value={stats.today}     color="text-purple-300"  delay={0.08} />
        <StatCard label="In Progress"   value={stats.inprog}    color="text-blue-300"    delay={0.16} />
        <StatCard label="Qualified"     value={stats.qualified} color="text-green-300"   delay={0.24} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
          ⚠️ {error} — is your backend running on port 4000?
        </div>
      )}

      {/* Main grid */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Call list */}
        <div className="lg:col-span-3 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Recent Leads</p>

          {loading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-white/4 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && calls.length === 0 && !error && (
            <div className="rounded-2xl border border-white/8 bg-white/4 px-6 py-12 text-center">
              <p className="text-4xl mb-3">📞</p>
              <p className="text-sm text-gray-400">No leads yet.</p>
              <p className="text-xs text-gray-600 mt-1">Start a voice demo to see leads appear here in real time.</p>
            </div>
          )}

          <AnimatePresence>
            {calls.map((call, i) => (
              <motion.div key={call._id}
                initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelected(selected?._id === call._id ? null : call)}
                className={`rounded-xl border px-4 py-3.5 cursor-pointer transition-all
                  ${selected?._id === call._id
                    ? "border-purple-500/60 bg-purple-500/10"
                    : "border-white/8 bg-white/4 hover:border-white/20 hover:bg-white/6"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-600/40 border border-purple-500/30 flex items-center justify-center text-xs font-semibold shrink-0">
                      {call.name && call.name !== "Unknown"
                        ? call.name.slice(0,2).toUpperCase() : "?"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">
                        {call.name && call.name !== "Unknown" ? call.name : call.phoneNumber}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {call.service || "Service unknown"} · {timeAgo(call.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[call.status] || STATUS_STYLE.New}`}>
                    {call.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Conversation</p>

          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                className="rounded-2xl border border-white/8 bg-white/4 px-6 py-12 text-center">
                <p className="text-3xl mb-3">💬</p>
                <p className="text-sm text-gray-500">Click a lead to see the full conversation.</p>
              </motion.div>
            ) : (
              <motion.div key={selected._id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden">

                {/* Lead header */}
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{selected.name || "Unknown"}</p>
                    <p className="text-xs text-gray-500">{selected.phoneNumber}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status] || STATUS_STYLE.New}`}>
                    {selected.status}
                  </span>
                </div>

                {/* Service tag */}
                {selected.service && (
                  <div className="px-4 py-2 border-b border-white/5 text-xs">
                    <span className="text-purple-300">🔧 {selected.service}</span>
                  </div>
                )}

                {/* Conversation */}
                <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-2">
                  {(selected.conversation || []).length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4">No conversation turns yet.</p>
                  ) : (
                    selected.conversation.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed
                          ${msg.role === "user"
                            ? "bg-purple-600/70 text-white rounded-br-sm"
                            : "bg-white/8 text-gray-200 rounded-bl-sm"}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Timestamp */}
                <div className="px-4 py-2.5 border-t border-white/5">
                  <p className="text-[10px] text-gray-600">
                    {new Date(selected.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
