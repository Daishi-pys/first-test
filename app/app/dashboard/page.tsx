"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; content: string; ts: number };

type Insights = {
  summary: string;
  direction: string;
  nextSteps: string[];
  questions: string[];
  confidence: number; // 0..1
  updatedAt: number;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
  insights?: Insights;
};

const LS_INDEX = "coach_index_v1"; // conversation list
const LS_CONV_PREFIX = "coach_conv_v1:"; // coach_conv_v1:<id>

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function guessTitle(messages: Msg[]) {
  const firstUser = messages.find(m => m.role === "user")?.content?.trim();
  if (!firstUser) return "新しい会話";
  return firstUser.slice(0, 16) + (firstUser.length > 16 ? "…" : "");
}

export default function Page() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDevJson, setShowDevJson] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);


  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // --- load or create conversation on mount
  useEffect(() => {
    const loadLatestOrCreate = () => {
      try {
        const rawIndex = localStorage.getItem(LS_INDEX);
        const index: { id: string; updatedAt: number; title: string }[] = rawIndex
          ? JSON.parse(rawIndex)
          : [];

        // pick latest
        const latest = index.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (latest?.id) {
          const raw = localStorage.getItem(LS_CONV_PREFIX + latest.id);
          if (raw) {
            setConv(JSON.parse(raw));
            return;
          }
        }
      } catch {}

      // create new
      const now = Date.now();
      const id = uid();
      const created: Conversation = {
        id,
        title: "新しい会話",
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      setConv(created);
    };

    loadLatestOrCreate();
  }, []);

  // --- persist conversation + index
  useEffect(() => {
    if (!conv) return;
    try {
      localStorage.setItem(LS_CONV_PREFIX + conv.id, JSON.stringify(conv));

      const rawIndex = localStorage.getItem(LS_INDEX);
      const index: { id: string; updatedAt: number; title: string }[] = rawIndex
        ? JSON.parse(rawIndex)
        : [];

      const next = [
        { id: conv.id, updatedAt: conv.updatedAt, title: conv.title },
        ...index.filter(x => x.id !== conv.id),
      ].slice(0, 50);

      localStorage.setItem(LS_INDEX, JSON.stringify(next));
    } catch {}
  }, [conv]);

  // auto-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conv?.messages?.length, loading]);

  const messages = conv?.messages ?? [];
  const insights = conv?.insights;

  // --- super-light "insights" (today: heuristic / placeholder)
  const heuristicInsights = useMemo<Insights>(() => {
    const userTexts = messages.filter(m => m.role === "user").map(m => m.content);
    const lastUser = userTexts[userTexts.length - 1] ?? "";
    const summary = userTexts.length
      ? `（仮）最近のテーマ：${lastUser.slice(0, 22)}${lastUser.length > 22 ? "…" : ""}`
      : "—";
    const direction = userTexts.length ? "（仮）方向性はまだ暫定" : "—";
    const nextSteps = userTexts.length
      ? ["5分：モヤモヤを3つ書く", "今日できる最小の一歩を1つ決める", "それを明日やる時間を確保する"]
      : ["—"];
    const questions = userTexts.length
      ? ["いま避けたい未来は？", "最近“少し良かった瞬間”は？"]
      : ["—"];
    return {
      summary,
      direction,
      nextSteps,
      questions,
      confidence: userTexts.length ? 0.2 : 0.0,
      updatedAt: Date.now(),
    };
  }, [messages]);

  async function send() {
    if (!conv) return;
    const t = text.trim();
    if (!t || loading) return;

    setErr(null);
    setText("");
    setLoading(true);

    const now = Date.now();
    const userMsg: Msg = { id: uid(), role: "user", content: t, ts: now };

    setConv(prev => {
      if (!prev) return prev;
      const nextMsgs = [...prev.messages, userMsg];
      const nextTitle = prev.messages.length === 0 ? guessTitle(nextMsgs) : prev.title;
      return { ...prev, messages: nextMsgs, title: nextTitle, updatedAt: now };
    });

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: t,
          // send last N messages as context to API (today: local context only)
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      const reply = String(data?.reply ?? "") || "（返答が空でした）";

      const aiMsg: Msg = { id: uid(), role: "assistant", content: reply, ts: Date.now() };

      setConv(prev => {
        if (!prev) return prev;
        return { ...prev, messages: [...prev.messages, aiMsg], updatedAt: Date.now() };
      });
    } catch {
      setErr("通信に失敗しました。もう一度試してください。");
      const aiMsg: Msg = { id: uid(), role: "assistant", content: "（エラー）通信に失敗しました。", ts: Date.now() };
      setConv(prev => (prev ? { ...prev, messages: [...prev.messages, aiMsg], updatedAt: Date.now() } : prev));
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    const now = Date.now();
    const id = uid();
    const created: Conversation = {
      id,
      title: "新しい会話",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setConv(created);
    setErr(null);
    setText("");
  }

  function clearConversation() {
    if (!conv) return;
    const ok = confirm("この会話の内容を消します（ブラウザ内の保存も削除）");
    if (!ok) return;
    try {
      localStorage.removeItem(LS_CONV_PREFIX + conv.id);
      const rawIndex = localStorage.getItem(LS_INDEX);
      const index: { id: string; updatedAt: number; title: string }[] = rawIndex ? JSON.parse(rawIndex) : [];
      localStorage.setItem(LS_INDEX, JSON.stringify(index.filter(x => x.id !== conv.id)));
    } catch {}
    newConversation();
  }

  function applyHeuristicInsights() {
    if (!conv) return;
    setConv(prev => (prev ? { ...prev, insights: heuristicInsights, updatedAt: Date.now() } : prev));
  }

  // placeholder button for "AI insights" (tomorrow we replace with real AI call)
  async function updateInsightsAI() {
    if (!conv) return;
    // today: use heuristic as “AI-like” update to finish UI
    applyHeuristicInsights();
  }

  if (!conv) {
    return <div style={{ padding: 16 }}>Loading...</div>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button
  onClick={() => setMenuOpen(true)}
  style={{
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  }}
  aria-label="menu"
>
  ≡
</button>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={styles.brand}>Coaching</div>
            <div style={styles.sub}>UI/UX day</div>
          </div>
          <div style={styles.sub2}>会話ID: <code>{conv.id}</code></div>
        </div>

        <div style={styles.headerActions}>
          <button onClick={newConversation} style={styles.btnSecondary}>＋ 新しい会話</button>
          <a href="/booking" style={styles.linkBtn}>面談予約</a>
          <button onClick={() => setShowDevJson(v => !v)} style={styles.btnSecondary}>
            {showDevJson ? "開発JSONを隠す" : "開発JSONを見る"}
          </button>
          <button onClick={clearConversation} style={styles.btnDanger}>この会話を削除</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Chat */}
        <section style={styles.chatCard}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>💬 {conv.title}</div>
            <div style={styles.smallMuted}>Enter送信 / Shift+Enter改行</div>
          </div>

          <div ref={scrollerRef} style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.empty}>
                まずは今の迷い・モヤモヤをそのまま書いてください。
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    ...(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                  }}
                >
                  <div style={styles.bubbleMeta}>
                    <span style={{ textTransform: "capitalize" }}>{m.role}</span>
                    <span>・{formatTime(m.ts)}</span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ ...styles.bubble, ...styles.bubbleAssistant }}>
                  <div style={styles.bubbleMeta}>assistant・送信中…</div>
                  <div>考え中…</div>
                </div>
              </div>
            )}
          </div>

          <div style={styles.composer}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ここに入力…"
              style={styles.textarea}
              rows={3}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />

            <div style={styles.composerBottom}>
              <div style={styles.smallMuted}>
                {err ? <span style={{ color: "#b42318" }}>{err}</span> : "コンテキストはブラウザ内に保存されます（今日は外部ログ保存しない）"}
              </div>
              <button onClick={send} disabled={loading || !text.trim()} style={styles.btnPrimary}>
                {loading ? "送信中…" : "送信"}
              </button>
            </div>
          </div>
        </section>

        {/* Insights */}
        <aside style={styles.insightsCard}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>🧩 Insights</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={updateInsightsAI} style={styles.btnSecondary}>Insights更新</button>
              <button onClick={applyHeuristicInsights} style={styles.btnSecondary}>仮Insights生成</button>
            </div>
          </div>

          <div style={styles.insightsBody}>
            <Card label="Summary" value={insights?.summary ?? "—"} />
            <Card label="Direction" value={insights?.direction ?? "—"} />
            <ListCard label="Next steps" items={insights?.nextSteps ?? ["—"]} />
            <ListCard label="Questions" items={insights?.questions ?? ["—"]} />
            <Card
              label="Confidence"
              value={insights ? `${Math.round(insights.confidence * 100)}%` : "—"}
            />
            <div style={styles.smallMuted}>
              {insights ? `updated: ${new Date(insights.updatedAt).toLocaleString()}` : "まだInsightsはありません（右上ボタンで生成）"}
            </div>

            {showDevJson && (
              <details style={styles.details} open>
                <summary style={styles.summary}>開発用JSON（将来はダッシュボード設計で置き換え）</summary>
                <pre style={styles.pre}>
{JSON.stringify({ conversation: { ...conv, insights: undefined }, insights: insights ?? null }, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </aside>
      </main>
      {/* Hamburger Menu Backdrop */}
{menuOpen && (
  <div
    onClick={() => setMenuOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 40,
    }}
  />
)}

{/* Hamburger Menu Drawer */}
<div
  style={{
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    width: 280,
    background: "#fff",
    borderRight: "1px solid #e6e6e6",
    zIndex: 50,
    transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
    transition: "transform 0.2s ease",
    display: "flex",
    flexDirection: "column",
  }}
>
  <div
    style={{
      padding: 12,
      borderBottom: "1px solid #eee",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "#fafafa",
    }}
  >
    <div style={{ fontWeight: 700 }}>メニュー</div>
    <button
      onClick={() => setMenuOpen(false)}
      style={{
        border: "none",
        background: "transparent",
        fontSize: 18,
        cursor: "pointer",
      }}
    >
      ✕
    </button>
  </div>

  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
    <button style={styles.btnSecondary} onClick={() => alert("設定は後で実装")}>
      ⚙ 設定
    </button>
    <button style={styles.btnSecondary} onClick={() => alert("ビュー切替は後で実装")}>
      🧭 ビュー切替
    </button>
    <button style={styles.btnDanger} onClick={clearConversation}>
      🗑 この会話を削除
    </button>
  </div>
</div>

    </div>

    
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.kv}>
      <div style={styles.kvLabel}>{label}</div>
      <div style={styles.kvValue}>{value}</div>
    </div>
  );
}

function ListCard({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={styles.kv}>
      <div style={styles.kvLabel}>{label}</div>
      <ul style={styles.ul}>
        {items.map((x, idx) => (
          <li key={idx} style={styles.li}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#111" },
  header: {
    padding: "14px 16px",
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontWeight: 800, fontSize: 18 },
  sub: { fontSize: 12, color: "#666" },
  sub2: { fontSize: 12, color: "#666", marginTop: 4 },
  headerActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  main: { flex: 1, display: "grid", gridTemplateColumns: "1.2fr 0.9fr", gap: 12, padding: 12, minHeight: 0 },

  chatCard: { border: "1px solid #e6e6e6", borderRadius: 14, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },
  insightsCard: { border: "1px solid #e6e6e6", borderRadius: 14, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },

  cardTitleRow: {
    padding: "12px 12px",
    borderBottom: "1px solid #f0f0f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    background: "#fafafa",
  },
  cardTitle: { fontWeight: 700 },

  messages: { flex: 1, overflow: "auto", padding: 12, background: "#fff" },
  empty: { color: "#666", padding: 12, border: "1px dashed #ddd", borderRadius: 12, background: "#fcfcfc" },

  bubble: { maxWidth: "85%", padding: "10px 12px", borderRadius: 14, border: "1px solid #e9e9e9" },
  bubbleUser: { background: "#e8f0ff" },
  bubbleAssistant: { background: "#fff" },
  bubbleMeta: { fontSize: 12, color: "#666", marginBottom: 6 },

  composer: { borderTop: "1px solid #f0f0f0", padding: 12, background: "#fafafa" },
  textarea: { width: "100%", resize: "none", borderRadius: 12, border: "1px solid #ddd", padding: 10, fontSize: 14, outline: "none", boxSizing: "border-box" },
  composerBottom: { marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  smallMuted: { fontSize: 12, color: "#666" },

  insightsBody: { padding: 12, overflow: "auto" },
  kv: { marginBottom: 14 },
  kvLabel: { fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 600 },
  kvValue: { fontSize: 14, lineHeight: 1.4 },
  ul: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 6, lineHeight: 1.4 },

  details: { marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 },
  summary: { cursor: "pointer", fontWeight: 600 },
  pre: { marginTop: 10, background: "#111", color: "#eee", padding: 12, borderRadius: 12, overflow: "auto", fontSize: 12 },

  btnPrimary: { padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 600 },
  btnSecondary: { padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 600 },
  btnDanger: { padding: "8px 10px", borderRadius: 12, border: "1px solid #f2c6c6", background: "#fff5f5", cursor: "pointer", fontWeight: 600, color: "#b42318" },
  linkBtn: { padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 600, textDecoration: "none", color: "#111", display: "inline-block" },
};
