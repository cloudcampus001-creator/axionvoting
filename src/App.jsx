import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase config ───────────────────────────────────────────────────────────
// Replace with your actual values from https://supabase.com/dashboard → Project Settings → API
const SUPABASE_URL = "https://vukhyrrbuvndzdefnwsb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9EyLJYa8g27-fbPXgPpKIw_Y9HUqu6p";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Default admin (hardcoded, not in DB) ─────────────────────────────────────
const ADMIN = { id: "admin", username: "Belac", password: "DJONX2010", role: "admin", name: "Administrator" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sessionStatus(s) {
  const now = Date.now();
  if (now < new Date(s.startTime).getTime()) return "upcoming";
  if (now > new Date(s.endTime).getTime()) return "closed";
  return "active";
}

function timeLeft(endTime) {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Map Supabase row → local session shape
function mapSession(row, votes = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    questions: row.questions || [],
    createdAt: row.created_at,
    votes: votes
      .filter(v => v.session_id === row.id)
      .map(v => ({
        userId: v.voter_id,
        userName: v.voter_name,
        answers: v.answers,
        votedAt: v.voted_at,
      })),
  };
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Fetch all data from Supabase
  const fetchData = useCallback(async () => {
    const [{ data: voters }, { data: sess }, { data: votes }] = await Promise.all([
      supabase.from("voters").select("*").order("created_at", { ascending: false }),
      supabase.from("sessions").select("*").order("created_at", { ascending: false }),
      supabase.from("votes").select("*"),
    ]);
    setUsers(voters || []);
    setSessions((sess || []).map(s => mapSession(s, votes || [])));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live countdown tick
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── CRUD operations ──────────────────────────────────────────────────────
  async function addUser(u) {
    const { error } = await supabase.from("voters").insert({
      name: u.name, username: u.username, password: u.password, department: u.department || null,
    });
    if (error) { alert("Error creating user: " + error.message); return; }
    await fetchData();
  }

  async function deleteUser(id) {
    await supabase.from("voters").delete().eq("id", id);
    await fetchData();
  }

  async function addSession(s) {
    const { error } = await supabase.from("sessions").insert({
      title: s.title,
      description: s.description || null,
      start_time: s.startTime,
      end_time: s.endTime,
      questions: s.questions,
    });
    if (error) { alert("Error creating session: " + error.message); return; }
    await fetchData();
  }

  async function deleteSession(id) {
    await supabase.from("sessions").delete().eq("id", id);
    await fetchData();
  }

  async function castVote(session, answers) {
    const { error } = await supabase.from("votes").insert({
      session_id: session.id,
      voter_id: currentUser.id,
      voter_name: currentUser.name,
      answers,
    });
    if (error) { alert("Error submitting vote: " + error.message); return; }
    await fetchData();
  }

  if (loading) return <Loader />;

  if (!currentUser) return (
    <Login users={users} onLogin={setCurrentUser} />
  );

  if (currentUser.role === "admin") return (
    <AdminDashboard
      users={users}
      sessions={sessions}
      onAddUser={addUser}
      onDeleteUser={deleteUser}
      onAddSession={addSession}
      onDeleteSession={deleteSession}
      onLogout={() => setCurrentUser(null)}
      tick={tick}
    />
  );

  return (
    <VoterDashboard
      user={currentUser}
      sessions={sessions}
      onCastVote={castVote}
      onRefresh={fetchData}
      onLogout={() => setCurrentUser(null)}
      tick={tick}
    />
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "20px" }}>
      <div style={{ width: "48px", height: "48px", border: "3px solid rgba(180,150,80,0.2)", borderTop: "3px solid #d4b87a", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#b49650", fontFamily: "Georgia,serif", fontSize: "13px", letterSpacing: "2px" }}>CONNECTING TO DATABASE...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════
function Login({ users, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  function handleLogin(e) {
    e.preventDefault();
    if (username === ADMIN.username && password === ADMIN.password) return onLogin(ADMIN);
    const voter = users.find(u => u.username === username && u.password === password);
    if (voter) return onLogin({ ...voter, role: "voter" });
    setError("Invalid credentials. Please try again.");
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0e1a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Georgia', serif",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #0c1a35 0%, transparent 60%)"
    }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: i % 2 === 0 ? "300px" : "200px", height: i % 2 === 0 ? "300px" : "200px",
            border: "1px solid rgba(180,150,80,0.08)", borderRadius: "50%",
            left: `${[10, 70, 40, 85, 20, 60][i]}%`, top: `${[20, 60, 80, 10, 50, 30][i]}%`,
            transform: "translate(-50%,-50%)",
            animation: `pulse ${3 + i * 0.7}s ease-in-out infinite alternate`
          }} />
        ))}
      </div>
      <style>{`
        @keyframes pulse { from{opacity:0.3;transform:translate(-50%,-50%) scale(1)} to{opacity:0.7;transform:translate(-50%,-50%) scale(1.1)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ width: "100%", maxWidth: "420px", padding: "0 24px", animation: shake ? "shake 0.5s ease" : "fadeUp 0.6s ease" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #b49650, #d4b87a)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(180,150,80,0.3)" }}>
            <span style={{ fontSize: "28px" }}>⚖</span>
          </div>
          <h1 style={{ color: "#d4b87a", fontSize: "28px", fontWeight: "normal", letterSpacing: "3px", margin: 0, textTransform: "uppercase" }}>AXION ENTERPRISE</h1>
          <p style={{ color: "#4a5568", fontSize: "13px", letterSpacing: "2px", marginTop: "8px" }}>SECURE VOTING PLATFORM</p>
        </div>
        <form onSubmit={handleLogin} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(180,150,80,0.2)", borderRadius: "12px", padding: "36px", backdropFilter: "blur(10px)" }}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", color: "#b49650", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px", textTransform: "uppercase" }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required
              style={{ width: "100%", background: "#111827", border: "1px solid rgba(180,150,80,0.25)", borderRadius: "8px", padding: "12px 16px", color: "#e5d5a3", fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "Georgia,serif" }} />
          </div>
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", color: "#b49650", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px", textTransform: "uppercase" }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: "100%", background: "#111827", border: "1px solid rgba(180,150,80,0.25)", borderRadius: "8px", padding: "12px 16px", color: "#e5d5a3", fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "Georgia,serif" }} />
          </div>
          {error && <p style={{ color: "#e57373", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>{error}</p>}
          <button type="submit" style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #b49650, #d4b87a)", border: "none", borderRadius: "8px", color: "#0a0e1a", fontFamily: "Georgia,serif", fontSize: "13px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>
            Sign In
          </button>
        </form>
        <p style={{ textAlign: "center", color: "#2d3748", fontSize: "12px", marginTop: "24px" }}>If fogotten your credentials <button 
  onClick={() => window.open("https://wa.me/654840542", "_blank")} 
  style={{ 
    background: "none", 
    border: "none", 
    color: "#b49650", 
    cursor: "pointer", 
    fontFamily: "Georgia,serif", 
    fontSize: "12px" 
  }}
>
  contact Belac
</button> </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ users, sessions, onAddUser, onDeleteUser, onAddSession, onDeleteSession, onLogout, tick }) {
  const [tab, setTab] = useState("sessions");
  const [subView, setSubView] = useState(null);

  const tabs = [{ id: "sessions", label: "Sessions", icon: "🗳" }, { id: "users", label: "Staff", icon: "👥" }];

  return (
    <div style={{ minHeight: "100vh", background: "#080c18", fontFamily: "'Georgia', serif", color: "#ccc" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .card-hover:hover { border-color: rgba(180,150,80,0.5) !important; transform: translateY(-2px); transition: all 0.2s; }
        .btn-gold { background: linear-gradient(135deg, #b49650, #d4b87a); color: #0a0e1a; border: none; border-radius: 8px; padding: 10px 20px; font-family: Georgia,serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; font-weight: bold; }
        .btn-ghost { background: transparent; border: 1px solid rgba(180,150,80,0.35); border-radius: 8px; padding: 10px 20px; font-family: Georgia,serif; font-size: 12px; letter-spacing: 1.5px; color: #b49650; cursor: pointer; text-transform: uppercase; }
        .btn-ghost:hover { background: rgba(180,150,80,0.1); }
        .btn-danger { background: transparent; border: 1px solid rgba(229,115,115,0.4); border-radius: 8px; padding: 8px 16px; font-family: Georgia,serif; font-size: 11px; color: #e57373; cursor: pointer; }
        .btn-danger:hover { background: rgba(229,115,115,0.1); }
      `}</style>
      <div style={{ borderBottom: "1px solid rgba(180,150,80,0.15)", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 0", marginRight: "16px" }}>
            <span style={{ fontSize: "20px" }}>⚖</span>
            <span style={{ color: "#d4b87a", letterSpacing: "3px", fontSize: "14px", textTransform: "uppercase" }}>VoxEnterprise</span>
          </div>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSubView(null); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "20px 4px", color: tab === t.id ? "#d4b87a" : "#4a5568", borderBottom: tab === t.id ? "2px solid #d4b87a" : "2px solid transparent", fontFamily: "Georgia,serif", fontSize: "13px", letterSpacing: "1.5px", textTransform: "uppercase" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#b49650", fontSize: "13px" }}>👤 Administrator</span>
          <button className="btn-ghost" onClick={onLogout} style={{ padding: "8px 16px", fontSize: "11px" }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
        {subView?.type === "create-session" && (
          <CreateSession onClose={() => setSubView(null)} onSave={async s => { await onAddSession(s); setSubView(null); }} />
        )}
        {subView?.type === "create-user" && (
          <CreateUser onClose={() => setSubView(null)} onSave={async u => { await onAddUser(u); setSubView(null); }} />
        )}
        {subView?.type === "results" && (
          <AdminResults session={subView.data} users={users} onClose={() => setSubView(null)} />
        )}

        {!subView && tab === "sessions" && (
          <SessionsTab sessions={sessions} onDeleteSession={onDeleteSession}
            onCreateSession={() => setSubView({ type: "create-session" })}
            onViewResults={s => setSubView({ type: "results", data: s })}
            tick={tick} />
        )}
        {!subView && tab === "users" && (
          <UsersTab users={users} onDeleteUser={onDeleteUser}
            onCreateUser={() => setSubView({ type: "create-user" })} />
        )}
      </div>
    </div>
  );
}

function SessionsTab({ sessions, onDeleteSession, onCreateSession, onViewResults, tick }) {
  const active = sessions.filter(s => sessionStatus(s) === "active");
  const upcoming = sessions.filter(s => sessionStatus(s) === "upcoming");
  const closed = sessions.filter(s => sessionStatus(s) === "closed");
  const groups = [
    { label: "🟢 Active", items: active, color: "#4caf50" },
    { label: "🕐 Upcoming", items: upcoming, color: "#ff9800" },
    { label: "✅ Closed", items: closed, color: "#607d8b" },
  ];

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "24px", letterSpacing: "1px" }}>Voting Sessions</h2>
          <p style={{ color: "#4a5568", margin: "6px 0 0", fontSize: "13px" }}>{sessions.length} sessions total</p>
        </div>
        <button className="btn-gold" onClick={onCreateSession}>+ New Session</button>
      </div>
      {sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#2d3748" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗳</div>
          <p>No sessions yet. Create your first voting session.</p>
        </div>
      )}
      {groups.map(g => g.items.length > 0 && (
        <div key={g.label} style={{ marginBottom: "32px" }}>
          <h3 style={{ color: g.color, fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px", borderBottom: `1px solid ${g.color}22`, paddingBottom: "8px" }}>{g.label}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
            {g.items.map(s => (
              <SessionCard key={s.id} session={s} statusColor={g.color}
                onViewResults={() => onViewResults(s)}
                onDelete={() => onDeleteSession(s.id)}
                tick={tick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionCard({ session, statusColor, onViewResults, onDelete, tick }) {
  const status = sessionStatus(session);
  return (
    <div className="card-hover" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", padding: "24px", transition: "all 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <h3 style={{ color: "#e5d5a3", margin: 0, fontSize: "16px", fontWeight: "normal" }}>{session.title}</h3>
        <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: statusColor, background: `${statusColor}18`, padding: "4px 10px", borderRadius: "20px" }}>{status}</span>
      </div>
      {session.description && <p style={{ color: "#4a5568", fontSize: "13px", margin: "0 0 14px" }}>{session.description}</p>}
      <div style={{ display: "flex", gap: "20px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: "#6b7280" }}><span style={{ color: "#9ca3af" }}>{session.questions?.length || 0}</span> questions</div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}><span style={{ color: "#9ca3af" }}>{session.votes?.length || 0}</span> voted</div>
        {status === "active" && <div style={{ fontSize: "12px", color: "#ff9800" }}>⏱ {timeLeft(session.endTime)}</div>}
      </div>
      <div style={{ fontSize: "11px", color: "#374151", marginBottom: "16px" }}>
        {new Date(session.startTime).toLocaleString()} → {new Date(session.endTime).toLocaleString()}
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button className="btn-ghost" onClick={onViewResults} style={{ flex: 1, padding: "8px", fontSize: "11px", textAlign: "center" }}>📊 Results</button>
        <button className="btn-danger" onClick={onDelete} style={{ padding: "8px 14px" }}>🗑</button>
      </div>
    </div>
  );
}

function AdminResults({ session, users, onClose }) {
  const [activeQ, setActiveQ] = useState(0);
  const questions = session.questions || [];
  const votes = session.votes || [];

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button className="btn-ghost" onClick={onClose} style={{ padding: "8px 14px", fontSize: "11px" }}>← Back</button>
        <div>
          <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "22px" }}>{session.title} — Results</h2>
          <p style={{ color: "#4a5568", margin: "4px 0 0", fontSize: "12px" }}>{votes.length} vote{votes.length !== 1 ? "s" : ""} · {sessionStatus(session)}</p>
        </div>
      </div>
      {votes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#374151", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(180,150,80,0.1)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
          <p>No votes have been cast yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(180,150,80,0.1)" }}>
              <p style={{ color: "#b49650", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: 0 }}>Question Results</p>
            </div>
            <div style={{ padding: "8px" }}>
              {questions.map((q, qi) => {
                const tally = {};
                q.options.forEach(o => tally[o.id] = 0);
                votes.forEach(v => {
                  const ans = v.answers?.find(a => a.questionId === q.id);
                  if (ans) tally[ans.optionId] = (tally[ans.optionId] || 0) + 1;
                });
                return (
                  <div key={q.id} style={{ padding: "14px 12px", borderRadius: "8px", cursor: "pointer", background: activeQ === qi ? "rgba(180,150,80,0.08)" : "transparent", marginBottom: "4px" }} onClick={() => setActiveQ(qi)}>
                    <p style={{ color: activeQ === qi ? "#d4b87a" : "#9ca3af", fontSize: "13px", margin: "0 0 10px" }}>Q{qi + 1}: {q.text}</p>
                    {q.options.map(o => (
                      <div key={o.id} style={{ marginBottom: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                          <span style={{ fontSize: "12px", color: "#6b7280" }}>{o.text}</span>
                          <span style={{ fontSize: "12px", color: "#9ca3af" }}>{tally[o.id] || 0}</span>
                        </div>
                        <div style={{ height: "4px", background: "#1f2937", borderRadius: "2px" }}>
                          <div style={{ height: "100%", borderRadius: "2px", background: "linear-gradient(90deg, #b49650, #d4b87a)", width: `${((tally[o.id] || 0) / votes.length) * 100}%`, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(180,150,80,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "14px" }}>🔍</span>
              <p style={{ color: "#b49650", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: 0 }}>Individual Votes (Admin Only)</p>
            </div>
            <div style={{ padding: "12px", maxHeight: "400px", overflowY: "auto" }}>
              {votes.map(v => {
                const q = questions[activeQ];
                const ans = v.answers?.find(a => a.questionId === q?.id);
                const opt = q?.options.find(o => o.id === ans?.optionId);
                return (
                  <div key={v.userId} style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ color: "#e5d5a3", fontSize: "13px", margin: "0 0 2px" }}>{v.userName}</p>
                        <p style={{ color: "#4a5568", fontSize: "11px", margin: 0 }}>Voted {new Date(v.votedAt).toLocaleString()}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ color: "#b49650", fontSize: "13px", margin: 0 }}>{opt?.text || "—"}</p>
                        <p style={{ color: "#374151", fontSize: "10px", margin: "2px 0 0" }}>for Q{activeQ + 1}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab({ users, onDeleteUser, onCreateUser }) {
  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "24px", letterSpacing: "1px" }}>Staff Accounts</h2>
          <p style={{ color: "#4a5568", margin: "6px 0 0", fontSize: "13px" }}>{users.length} voter accounts</p>
        </div>
        <button className="btn-gold" onClick={onCreateUser}>+ Add Staff Member</button>
      </div>
      {users.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#2d3748" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
          <p>No staff members yet.</p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
        {users.map(u => (
          <div key={u.id} className="card-hover" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", padding: "20px", transition: "all 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg, #1e3a5f, #2d4f6f)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d4b87a", fontSize: "16px", fontWeight: "bold", border: "1px solid rgba(180,150,80,0.3)" }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ color: "#e5d5a3", margin: 0, fontSize: "14px" }}>{u.name}</p>
                  <p style={{ color: "#4a5568", margin: "2px 0 0", fontSize: "12px" }}>@{u.username}</p>
                </div>
              </div>
              <button className="btn-danger" onClick={() => onDeleteUser(u.id)} style={{ padding: "6px 10px" }}>🗑</button>
            </div>
            {u.department && <p style={{ color: "#374151", fontSize: "12px", margin: "12px 0 0", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>🏢 {u.department}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateUser({ onSave, onClose }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", department: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const inputStyle = { width: "100%", background: "#111827", border: "1px solid rgba(180,150,80,0.25)", borderRadius: "8px", padding: "11px 14px", color: "#e5d5a3", fontSize: "14px", outline: "none", boxSizing: "border-box", fontFamily: "Georgia,serif" };
  const labelStyle = { display: "block", color: "#b49650", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px", textTransform: "uppercase" };

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: "500px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button className="btn-ghost" onClick={onClose} style={{ padding: "8px 14px", fontSize: "11px" }}>← Back</button>
        <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "22px" }}>Add Staff Member</h2>
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", padding: "28px" }}>
        <form onSubmit={submit}>
          {[
            { label: "Full Name", key: "name", required: true },
            { label: "Username", key: "username", required: true },
            { label: "Password", key: "password", required: true, type: "password" },
            { label: "Department (optional)", key: "department" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>{f.label}</label>
              <input type={f.type || "text"} value={form[f.key]} required={f.required}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={inputStyle} />
            </div>
          ))}
          <button type="submit" className="btn-gold" style={{ width: "100%", padding: "13px", opacity: saving ? 0.7 : 1 }} disabled={saving}>
            {saving ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CreateSession({ onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [questions, setQuestions] = useState([{ id: crypto.randomUUID(), text: "", options: [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }] }]);
  const [saving, setSaving] = useState(false);

  function addQuestion() { setQuestions(p => [...p, { id: crypto.randomUUID(), text: "", options: [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }] }]); }
  function removeQuestion(qid) { setQuestions(p => p.filter(q => q.id !== qid)); }
  function updateQuestion(qid, text) { setQuestions(p => p.map(q => q.id === qid ? { ...q, text } : q)); }
  function addOption(qid) { setQuestions(p => p.map(q => q.id === qid ? { ...q, options: [...q.options, { id: crypto.randomUUID(), text: "" }] } : q)); }
  function removeOption(qid, oid) { setQuestions(p => p.map(q => q.id === qid ? { ...q, options: q.options.filter(o => o.id !== oid) } : q)); }
  function updateOption(qid, oid, text) { setQuestions(p => p.map(q => q.id === qid ? { ...q, options: q.options.map(o => o.id === oid ? { ...o, text } : o) } : q)); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ title, description, startTime, endTime, questions });
    setSaving(false);
  }

  const inputStyle = { width: "100%", background: "#111827", border: "1px solid rgba(180,150,80,0.25)", borderRadius: "8px", padding: "11px 14px", color: "#e5d5a3", fontSize: "14px", outline: "none", boxSizing: "border-box", fontFamily: "Georgia,serif" };
  const labelStyle = { display: "block", color: "#b49650", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px", textTransform: "uppercase" };

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button className="btn-ghost" onClick={onClose} style={{ padding: "8px 14px", fontSize: "11px" }}>← Back</button>
        <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "22px" }}>New Voting Session</h2>
      </div>
      <form onSubmit={submit}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <h3 style={{ color: "#9ca3af", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 20px" }}>Session Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} placeholder="e.g. Q3 Budget Allocation Vote" />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} required style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ color: "#9ca3af", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: 0 }}>Questions & Options</h3>
            <button type="button" className="btn-ghost" onClick={addQuestion} style={{ padding: "8px 16px", fontSize: "11px" }}>+ Add Question</button>
          </div>
          {questions.map((q, qi) => (
            <div key={q.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.12)", borderRadius: "12px", padding: "20px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <label style={{ ...labelStyle, margin: 0 }}>Question {qi + 1}</label>
                {questions.length > 1 && <button type="button" className="btn-danger" onClick={() => removeQuestion(q.id)} style={{ padding: "4px 10px", fontSize: "11px" }}>Remove</button>}
              </div>
              <input value={q.text} onChange={e => updateQuestion(q.id, e.target.value)} required style={{ ...inputStyle, marginBottom: "16px" }} placeholder="Enter your question..." />
              <label style={{ ...labelStyle, color: "#6b7280" }}>Answer Options</label>
              {q.options.map((o, oi) => (
                <div key={o.id} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                  <span style={{ color: "#b49650", fontSize: "12px", width: "20px", textAlign: "center", flexShrink: 0 }}>{oi + 1}.</span>
                  <input value={o.text} onChange={e => updateOption(q.id, o.id, e.target.value)} required style={{ ...inputStyle, marginBottom: 0 }} placeholder={`Option ${oi + 1}`} />
                  {q.options.length > 2 && <button type="button" onClick={() => removeOption(q.id, o.id)} style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer", fontSize: "16px", padding: "4px" }}>✕</button>}
                </div>
              ))}
              <button type="button" onClick={() => addOption(q.id)} style={{ background: "none", border: "1px dashed rgba(180,150,80,0.3)", borderRadius: "6px", color: "#6b7280", cursor: "pointer", padding: "8px 16px", fontSize: "12px", marginTop: "4px", width: "100%" }}>+ Add Option</button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-gold" style={{ padding: "12px 32px", opacity: saving ? 0.7 : 1 }} disabled={saving}>
            {saving ? "Creating..." : "Create Session"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VOTER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function VoterDashboard({ user, sessions, onCastVote, onRefresh, onLogout, tick }) {
  const [view, setView] = useState(null);

  const activeSessions = sessions.filter(s => sessionStatus(s) === "active");
  const closedSessions = sessions.filter(s => sessionStatus(s) === "closed");
  const upcomingSessions = sessions.filter(s => sessionStatus(s) === "upcoming");
  const hasVoted = (s) => s.votes?.some(v => v.userId === user.id);

  // Get latest version of session from sessions array
  const getSession = (id) => sessions.find(s => s.id === id);

  return (
    <div style={{ minHeight: "100vh", background: "#080c18", fontFamily: "'Georgia', serif", color: "#ccc" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .card-hover:hover { border-color: rgba(180,150,80,0.4) !important; transform: translateY(-2px); }
        .btn-gold { background: linear-gradient(135deg, #b49650, #d4b87a); color: #0a0e1a; border: none; border-radius: 8px; padding: 10px 20px; font-family: Georgia,serif; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; font-weight: bold; }
        .btn-ghost { background: transparent; border: 1px solid rgba(180,150,80,0.35); border-radius: 8px; padding: 10px 20px; font-family: Georgia,serif; font-size: 12px; letter-spacing: 1.5px; color: #b49650; cursor: pointer; text-transform: uppercase; }
        .btn-ghost:hover { background: rgba(180,150,80,0.1); }
      `}</style>
      <div style={{ borderBottom: "1px solid rgba(180,150,80,0.15)", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "20px" }}>⚖</span>
          <span style={{ color: "#d4b87a", letterSpacing: "3px", fontSize: "14px", textTransform: "uppercase" }}>VoxEnterprise</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#b49650", fontSize: "13px" }}>👤 {user.name}</span>
          <button className="btn-ghost" onClick={onLogout} style={{ padding: "8px 16px", fontSize: "11px" }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
        {view?.type === "vote" && (
          <VoteForm session={getSession(view.sessionId)} user={user}
            onSubmit={async answers => { await onCastVote(getSession(view.sessionId), answers); setView(null); }}
            onBack={() => setView(null)} />
        )}
        {view?.type === "results" && (
          <VoterResults session={getSession(view.sessionId)} user={user} onBack={() => setView(null)} />
        )}

        {!view && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ marginBottom: "36px" }}>
              <h2 style={{ color: "#d4b87a", margin: "0 0 4px", fontWeight: "normal", fontSize: "24px", letterSpacing: "1px" }}>Welcome, {user.name}</h2>
              <p style={{ color: "#4a5568", margin: 0, fontSize: "13px" }}>Cast your votes and view results below.</p>
            </div>

            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ color: "#4caf50", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px", borderBottom: "1px solid #4caf5022", paddingBottom: "8px" }}>🟢 Active Sessions</h3>
              {activeSessions.length === 0 ? (
                <p style={{ color: "#2d3748", fontSize: "14px", padding: "24px", textAlign: "center", background: "rgba(255,255,255,0.01)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>No active sessions right now.</p>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {activeSessions.map(s => {
                    const voted = hasVoted(s);
                    return (
                      <div key={s.id} className="card-hover" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(76,175,80,0.2)", borderRadius: "12px", padding: "22px", transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                            <h3 style={{ color: "#e5d5a3", margin: 0, fontSize: "16px", fontWeight: "normal" }}>{s.title}</h3>
                            {voted && <span style={{ fontSize: "10px", color: "#4caf50", background: "#4caf5018", padding: "3px 8px", borderRadius: "20px", letterSpacing: "1px" }}>VOTED</span>}
                          </div>
                          {s.description && <p style={{ color: "#4a5568", fontSize: "13px", margin: "0 0 8px" }}>{s.description}</p>}
                          <p style={{ color: "#ff9800", fontSize: "12px", margin: 0 }}>⏱ Closes in {timeLeft(s.endTime)} · {s.votes?.length || 0} votes cast</p>
                        </div>
                        <div style={{ display: "flex", gap: "10px", marginLeft: "20px" }}>
                          {!voted && <button className="btn-gold" onClick={() => setView({ type: "vote", sessionId: s.id })}>Vote Now</button>}
                          <button className="btn-ghost" onClick={() => setView({ type: "results", sessionId: s.id })}>Results</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {upcomingSessions.length > 0 && (
              <div style={{ marginBottom: "32px" }}>
                <h3 style={{ color: "#ff9800", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px", borderBottom: "1px solid #ff980022", paddingBottom: "8px" }}>🕐 Upcoming Sessions</h3>
                <div style={{ display: "grid", gap: "14px" }}>
                  {upcomingSessions.map(s => (
                    <div key={s.id} style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,152,0,0.15)", borderRadius: "12px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ color: "#9ca3af", margin: "0 0 4px", fontSize: "15px", fontWeight: "normal" }}>{s.title}</h3>
                        <p style={{ color: "#374151", fontSize: "12px", margin: 0 }}>Opens {new Date(s.startTime).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {closedSessions.length > 0 && (
              <div>
                <h3 style={{ color: "#607d8b", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px", borderBottom: "1px solid #607d8b22", paddingBottom: "8px" }}>✅ Closed Sessions</h3>
                <div style={{ display: "grid", gap: "14px" }}>
                  {closedSessions.map(s => (
                    <div key={s.id} className="card-hover" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(96,125,139,0.2)", borderRadius: "12px", padding: "20px", transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ color: "#6b7280", margin: "0 0 4px", fontSize: "15px", fontWeight: "normal" }}>{s.title}</h3>
                        <p style={{ color: "#374151", fontSize: "12px", margin: 0 }}>Closed {new Date(s.endTime).toLocaleString()} · {s.votes?.length || 0} votes</p>
                      </div>
                      <button className="btn-ghost" onClick={() => setView({ type: "results", sessionId: s.id })}>View Results</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sessions.length === 0 && (
              <div style={{ textAlign: "center", padding: "100px 0", color: "#2d3748" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗳</div>
                <p>No voting sessions available yet. Check back later.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VoteForm({ session, user, onSubmit, onBack }) {
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const questions = session?.questions || [];

  if (!session) return null;

  function selectAnswer(questionId, optionId) {
    setAnswers(p => ({ ...p, [questionId]: optionId }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const ans = questions.map(q => ({ questionId: q.id, optionId: answers[q.id] }));
    await onSubmit(ans);
    setSubmitting(false);
  }

  const current = questions[step];
  const allAnswered = questions.every(q => answers[q.id]);

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: "8px 14px", fontSize: "11px" }}>← Back</button>
        <div>
          <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "22px" }}>{session.title}</h2>
          <p style={{ color: "#4a5568", margin: "4px 0 0", fontSize: "12px" }}>Question {step + 1} of {questions.length}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px" }}>
        {questions.map((q, i) => (
          <div key={q.id} onClick={() => setStep(i)} style={{ flex: 1, height: "4px", borderRadius: "2px", cursor: "pointer", background: i === step ? "#d4b87a" : answers[q.id] ? "#4caf50" : "#1f2937", transition: "background 0.3s" }} />
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "16px", padding: "32px", marginBottom: "20px" }}>
        <p style={{ color: "#e5d5a3", fontSize: "18px", fontWeight: "normal", margin: "0 0 28px", lineHeight: "1.5" }}>{current?.text}</p>
        <div style={{ display: "grid", gap: "10px" }}>
          {current?.options.map(o => {
            const selected = answers[current.id] === o.id;
            return (
              <button key={o.id} onClick={() => selectAnswer(current.id, o.id)}
                style={{ background: selected ? "rgba(180,150,80,0.15)" : "rgba(255,255,255,0.02)", border: selected ? "2px solid #d4b87a" : "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "16px 20px", color: selected ? "#d4b87a" : "#9ca3af", fontFamily: "Georgia,serif", fontSize: "14px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, border: selected ? "2px solid #d4b87a" : "2px solid #374151", background: selected ? "#d4b87a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                  {selected && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0a0e1a" }} />}
                </div>
                {o.text}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>← Previous</button>
        <div style={{ display: "flex", gap: "12px" }}>
          {step < questions.length - 1 ? (
            <button className="btn-gold" onClick={() => setStep(s => s + 1)} disabled={!answers[current?.id]} style={{ opacity: answers[current?.id] ? 1 : 0.5 }}>Next →</button>
          ) : (
            <button className="btn-gold" onClick={handleSubmit} disabled={!allAnswered || submitting} style={{ opacity: allAnswered && !submitting ? 1 : 0.5 }}>
              {submitting ? "Submitting..." : "✓ Submit Vote"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VoterResults({ session, user, onBack }) {
  if (!session) return null;
  const questions = session.questions || [];
  const votes = session.votes || [];
  const myVote = votes.find(v => v.userId === user.id);

  return (
    <div style={{ animation: "fadeUp 0.3s ease", maxWidth: "700px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: "8px 14px", fontSize: "11px" }}>← Back</button>
        <div>
          <h2 style={{ color: "#d4b87a", margin: 0, fontWeight: "normal", fontSize: "22px" }}>{session.title} — Results</h2>
          <p style={{ color: "#4a5568", margin: "4px 0 0", fontSize: "12px" }}>{votes.length} participant{votes.length !== 1 ? "s" : ""} · Results are anonymous</p>
        </div>
      </div>
      {votes.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#374151", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(180,150,80,0.1)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
          <p>No votes have been cast yet.</p>
        </div>
      )}
      {questions.map((q, qi) => {
        const tally = {};
        q.options.forEach(o => tally[o.id] = 0);
        votes.forEach(v => {
          const ans = v.answers?.find(a => a.questionId === q.id);
          if (ans) tally[ans.optionId] = (tally[ans.optionId] || 0) + 1;
        });
        const total = votes.length || 1;
        const myAns = myVote?.answers?.find(a => a.questionId === q.id);
        const winnerCount = Math.max(...Object.values(tally));
        const winnerOpt = q.options.find(o => tally[o.id] === winnerCount && winnerCount > 0);

        return (
          <div key={q.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(180,150,80,0.15)", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <h3 style={{ color: "#e5d5a3", margin: 0, fontSize: "16px", fontWeight: "normal" }}>
                <span style={{ color: "#b49650", fontSize: "12px", marginRight: "10px" }}>Q{qi + 1}</span>{q.text}
              </h3>
              {winnerOpt && votes.length > 0 && <span style={{ fontSize: "10px", color: "#4caf50", background: "#4caf5018", padding: "4px 10px", borderRadius: "20px", letterSpacing: "1px", flexShrink: 0, marginLeft: "10px" }}>🏆 {winnerOpt.text}</span>}
            </div>
            {q.options.map(o => {
              const count = tally[o.id] || 0;
              const pct = Math.round((count / total) * 100);
              const isMyChoice = myAns?.optionId === o.id;
              const isWinner = o.id === winnerOpt?.id && votes.length > 0;
              return (
                <div key={o.id} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", color: isMyChoice ? "#d4b87a" : "#9ca3af" }}>{o.text}</span>
                      {isMyChoice && <span style={{ fontSize: "9px", color: "#b49650", background: "rgba(180,150,80,0.15)", padding: "2px 7px", borderRadius: "10px" }}>Your vote</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "14px", color: isWinner ? "#4caf50" : "#6b7280", fontWeight: isWinner ? "bold" : "normal" }}>{pct}%</span>
                      <span style={{ fontSize: "11px", color: "#374151", marginLeft: "6px" }}>({count})</span>
                    </div>
                  </div>
                  <div style={{ height: "6px", background: "#1f2937", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", background: isWinner ? "linear-gradient(90deg, #4caf50, #66bb6a)" : isMyChoice ? "linear-gradient(90deg, #b49650, #d4b87a)" : "#2d3748", transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
