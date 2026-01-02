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

type IndexItem = { id: string; updatedAt: number; title: string };

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

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export default function Page() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDevJson, setShowDevJson] = useState(false);

  // mobile drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // --- load index + latest conversation
  useEffect(() => {
    const load = () => {
      const idx = safeJsonParse<IndexItem[]>(localStorage.getItem(LS_INDEX), []);
      idx.sort((a, b) => b.updatedAt - a.updatedAt);
      setIndex(idx);

      const latest = idx[0];
      if (latest?.id) {
        const raw = localStorage.getItem(LS_CONV_PREFIX + latest.id);
        if (raw) {
          setConv(JSON.parse(raw));
          return;
        }
      }
      // create new
      const now = Date.now();
      const id = uid();
      const created: Conversation = { id, title: "新しい会話", createdAt: now, updatedAt: now, messages: [] };
      setConv(created);
    };

    load();
  }, []);

  // --- persist conversation + refresh index
  useEffect(() => {
    if (!conv) return;
    try {
      localStorage.setItem(LS_CONV_PREFIX + conv.id, JSON.stringify(conv));

      const rawIndex = localStorage.getItem(LS_INDEX);
      const idx: IndexItem[] = rawIndex ? JSON.parse(rawIndex) : [];

      const next: IndexItem[] = [
        { id: conv.id, updatedAt: conv.updatedAt, title: conv.title },
        ...idx.filter(x => x.id !== conv.id),
      ].slice(0, 100);

      localStorage.setItem(LS_INDEX, JSON.stringify(next));
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      setIndex(next);
    } catch {}
  }, [conv]);

  // auto-scroll on new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conv?.messages?.length, loading]);

  const messages = conv?.messages ?? [];
  const insights = conv?.insights;

  // --- lightweight insights (today: heuristic)
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
    const questions = userTexts.length ? ["いま避けたい未来は？", "最近“少し良かった瞬間”は？"] : ["—"];
    return { summary, direction, nextSteps, questions, confidence: userTexts.length ? 0.2 : 0.0, updatedAt: Date.now() };
  }, [messages]);

  function loadConversation(id: string) {
    const raw = localStorage.getItem(LS_CONV_PREFIX + id);
    if (!raw) return;
    try {
      setConv(JSON.parse(raw));
      setErr(null);
      setText("");
      setDrawerOpen(false);
    } catch {}
  }

  function newConversation() {
    const now = Date.now();
    const id = uid();
    const created: Conversation = { id, title: "新しい会話", createdAt: now, updatedAt: now, messages: [] };
    setConv(created);
    setErr(null);
    setText("");
    setDrawerOpen(false);
  }

  function deleteConversation(id: string) {
    const ok = confirm("この会話を削除しますか？（ブラウザ内保存も削除）");
    if (!ok) return;
    try {
      localStorage.removeItem(LS_CONV_PREFIX + id);
      const idx = safeJsonParse<IndexItem[]>(localStorage.getItem(LS_INDEX), []);
      const next = idx.filter(x => x.id !== id);
      localStorage.setItem(LS_INDEX, JSON.stringify(next));
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      setIndex(next);

      // if current deleted -> open latest or new
      if (conv?.id === id) {
        const latest = next[0];
        if (latest?.id) loadConversation(latest.id);
        else newConversation();
      }
    } catch {}
  }

  function applyHeuristicInsights() {
    if (!conv) return;
    setConv(prev => (prev ? { ...prev, insights: heuristicInsights, updatedAt: Date.now() } : prev));
  }

  async function updateInsightsAI() {
    // today: keep UI only
    applyHeuristicInsights();
  }

  async function send() {
    if (!conv) return;
    const t = text.trim();
    if (!t || loading) return;

    setErr(null);
    setText("");
    setLoading(true);

    const now = Date.now();
    const userMsg: Msg = { id: uid(), role: "user", content: t, ts: now };

    // optimistic update
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
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      const reply = String(data?.reply ?? "") || "（返答が空でした）";
      const aiMsg: Msg = { id: uid(), role: "assistant", content: reply, ts: Date.now() };

      setConv(prev => (prev ? { ...prev, messages: [...prev.messages, aiMsg], updatedAt: Date.now() } : prev));
    } catch {
      setErr("通信に失敗しました。もう一度試してください。");
      const aiMsg: Msg = { id: uid(), role: "assistant", content: "（エラー）通信に失敗しました。", ts: Date.now() };
      setConv(prev => (prev ? { ...prev, messages: [...prev.messages, aiMsg], updatedAt: Date.now() } : prev));
    } finally {
      setLoading(false);
    }
  }

  if (!conv) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={styles.page}>
      {/* responsive CSS */}
      <style>{css}</style>

      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={styles.iconBtn}
            aria-label="menu"
            title="会話一覧"
          >
            ≡
          </button>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={styles.brand}>Coaching</div>
              <div style={styles.sub}>UI/UX day</div>
            </div>
            <div style={styles.sub2}>
              会話: <b>{conv.title}</b> / <span style={{ color: "#666" }}><code>{conv.id}</code></span>
            </div>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button onClick={newConversation} style={styles.btnSecondary}>＋ 新しい会話</button>
          <a href="/booking" style={styles.linkBtn}>面談予約</a>
          <button onClick={() => setShowDevJson(v => !v)} style={styles.btnSecondary}>
            {showDevJson ? "開発JSONを隠す" : "開発JSONを見る"}
          </button>
        </div>
      </header>

      {/* drawer (mobile & desktop) */}
      <div className={`drawerBackdrop ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div style={styles.drawerHeader}>
          <div style={{ fontWeight: 800 }}>会話一覧</div>
          <button onClick={() => setDrawerOpen(false)} style={styles.iconBtn} aria-label="close">✕</button>
        </div>

        <div style={styles.drawerBody}>
          <button onClick={newConversation} style={{ ...styles.btnSecondary, width: "100%" }}>
            ＋ 新しい会話
          </button>

          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            最新順（ブラウザ保存）
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {index.length === 0 && <div style={styles.smallMuted}>まだ会話がありません</div>}

            {index.map((item) => (
              <div
                key={item.id}
                style={{
                  ...styles.convRow,
                  ...(item.id === conv.id ? styles.convRowActive : {}),
                }}
              >
                <button
                  onClick={() => loadConversation(item.id)}
                  style={styles.convRowMain}
                  title={item.title}
                >
                  <div style={{ fontWeight: 700, textAlign: "left" }}>{item.title || "（無題）"}</div>
                  <div style={styles.smallMuted}>
                    {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </button>

                <button
                  onClick={() => deleteConversation(item.id)}
                  style={styles.convRowDel}
                  aria-label="delete"
                  title="削除"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="mainGrid">
        {/* Chat */}
        <section style={styles.chatCard}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>💬 チャット</div>
            <div style={styles.smallMuted}>Enter送信 / Shift+Enter改行</div>
          </div>

          <div ref={scrollerRef} style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.empty}>まずは今の迷い・モヤモヤをそのまま書いてください。</div>
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
                <div style={{ ...styles.bubble, ...(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant) }}>
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
                {err ? <span style={{ color: "#b42318" }}>{err}</span> : "コンテキストはブラウザ内に保存（今日は外部ログ保存しない）"}
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={updateInsightsAI} style={styles.btnSecondary}>Insights更新</button>
              <button onClick={applyHeuristicInsights} style={styles.btnSecondary}>仮Insights生成</button>
            </div>
          </div>

          <div style={styles.insightsBody}>
            <Card label="Summary" value={insights?.summary ?? "—"} />
            <Card label="Direction" value={insights?.direction ?? "—"} />
            <ListCard label="Next steps" items={insights?.nextSteps ?? ["—"]} />
            <ListCard label="Questions" items={insights?.questions ?? ["—"]} />
            <Card label="Confidence" value={insights ? `${Math.round(insights.confidence * 100)}%` : "—"} />
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

const css = `
/* responsive grid: desktop = 2 columns, mobile = 1 column */
.mainGrid {
  flex: 1;
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 12px;
  padding: 12px;
  min-height: 0;
}
@media (max-width: 900px) {
  .mainGrid { grid-template-columns: 1fr; }
}

/* drawer */
.drawerBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
  z-index: 40;
}
.drawerBackdrop.open {
  opacity: 1;
  pointer-events: auto;
}
.drawer {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: min(360px, 92vw);
  background: #fff;
  border-right: 1px solid #e6e6e6;
  transform: translateX(-102%);
  transition: transform 180ms ease;
  z-index: 50;
  display: flex;
  flex-direction: column;
}
.drawer.open { transform: translateX(0); }
`;

const styles: Record<string, React.CSSProperties> = {
  page: { height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#111" },

  header: {
    padding: "12px 14px",
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontWeight: 900, fontSize: 18 },
  sub: { fontSize: 12, color: "#666" },
  sub2: { fontSize: 12, color: "#666", marginTop: 4 },
  headerActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },

  iconBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    lineHeight: 1,
  },

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
  cardTitle: { fontWeight: 800 },

  messages: { flex: 1, overflow: "auto", padding: 12, background: "#fff" },
  empty: { color: "#666", padding: 12, border: "1px dashed #ddd", borderRadius: 12, background: "#fcfcfc" },

  bubble: { maxWidth: "85%", padding: "10px 12px", borderRadius: 14, border: "1px solid #e9e9e9" },
  bubbleUser: { background: "#e8f0ff" },
  bubbleAssistant: { background: "#fff" },
  bubbleMeta: { fontSize: 12, color: "#666", marginBottom: 6 },

  composer: { borderTop: "1px solid #f0f0f0", padding: 12, background: "#fafafa" },
  textarea: { width: "100%", resize: "none", borderRadius: 12, border: "1px solid #ddd", padding: 10, fontSize: 14, outline: "none", boxSizing: "border-box" },
  composerBottom: { marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },

  insightsBody: { padding: 12, overflow: "auto" },
  kv: { marginBottom: 14 },
  kvLabel: { fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 700 },
  kvValue: { fontSize: 14, lineHeight: 1.4 },
  ul: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 6, lineHeight: 1.4 },

  details: { marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 },
  summary: { cursor: "pointer", fontWeight: 700 },
  pre: { marginTop: 10, background: "#111", color: "#eee", padding: 12, borderRadius: 12, overflow: "auto", fontSize: 12 },

  smallMuted: { fontSize: 12, color: "#666" },

  btnPrimary: { padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 700 },
  btnSecondary: { padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 700 },
  btnDanger: { padding: "8px 10px", borderRadius: 12, border: "1px solid #f2c6c6", background: "#fff5f5", cursor: "pointer", fontWeight: 700, color: "#b42318" },
  linkBtn: { padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 700, textDecoration: "none", color: "#111", display: "inline-block" },

  drawerHeader: {
    padding: 12,
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: "#fafafa",
  },
  drawerBody: { padding: 12, overflow: "auto" },

  convRow: {
    display: "flex",
    alignItems: "stretch",
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff",
  },
  convRowActive: { borderColor: "#111" },
  convRowMain: {
    flex: 1,
    padding: 10,
    background: "#fff",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  convRowDel: {
    width: 44,
    border: "none",
    borderLeft: "1px solid #eee",
    background: "#fff",
    cursor: "pointer",
    fontSize: 16,
  },
};
