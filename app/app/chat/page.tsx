"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; content: string; ts: number };

type Insights = {
  summary: string;
  direction: string;
  nextSteps: string[];
  questions: string[];
  confidence: number;
  updatedAt: number;
};

type Conversation = {
  id: string;
  title: string;
  messages: Msg[];
  insights?: Insights;
};

const LS_KEY = "coach_single_conv_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ChatPage() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"chat" | "insights">("chat");

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        setConv(JSON.parse(raw));
        return;
      }
    } catch {}
    setConv({ id: uid(), title: "対話", messages: [] });
  }, []);

  // persist
  useEffect(() => {
    if (!conv) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(conv));
    } catch {}
  }, [conv]);

  // autoscroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conv?.messages?.length, loading, view]);

  const messages = conv?.messages ?? [];

  // 仮Insights（明日AI抽出に差し替え）
  const heuristicInsights = useMemo<Insights>(() => {
    const userTexts = messages.filter(m => m.role === "user").map(m => m.content);
    const last = userTexts[userTexts.length - 1] ?? "";
    return {
      summary: userTexts.length ? `最近のテーマ：${last.slice(0, 22)}${last.length > 22 ? "…" : ""}` : "—",
      direction: userTexts.length ? "（仮）方向性はまだ暫定" : "—",
      nextSteps: userTexts.length ? ["モヤモヤを3つ書く", "最小の一歩を1つ決める"] : ["—"],
      questions: userTexts.length ? ["避けたい未来は？", "本当は何がしたい？"] : ["—"],
      confidence: userTexts.length ? 0.2 : 0.0,
      updatedAt: Date.now(),
    };
  }, [messages]);

  function applyHeuristicInsights() {
    if (!conv) return;
    setConv(prev => (prev ? { ...prev, insights: heuristicInsights } : prev));
  }

  function resetConversation() {
    const ok = confirm("今の対話をリセットしますか？（ブラウザ保存も上書きされます）");
    if (!ok) return;
    setConv({ id: uid(), title: "対話", messages: [] });
    setText("");
    setErr(null);
    setMenuOpen(false);
    setView("chat");
  }

  async function send() {
    if (!conv) return;
    const t = text.trim();
    if (!t || loading) return;

    setErr(null);
    setText("");
    setLoading(true);

    const userMsg: Msg = { id: uid(), role: "user", content: t, ts: Date.now() };
    setConv(prev => (prev ? { ...prev, messages: [...prev.messages, userMsg] } : prev));

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

      setConv(prev => (prev ? { ...prev, messages: [...prev.messages, aiMsg] } : prev));
      // とりあえず仮Insightsを更新
      setTimeout(() => applyHeuristicInsights(), 0);
    } catch {
      setErr("通信に失敗しました。もう一度試してください。");
      const aiMsg: Msg = { id: uid(), role: "assistant", content: "（エラー）通信に失敗しました。", ts: Date.now() };
      setConv(prev => (prev ? { ...prev, messages: [...prev.messages, aiMsg] } : prev));
    } finally {
      setLoading(false);
    }
  }

  if (!conv) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={styles.page}>
      <style>{css}</style>

      {/* Top bar */}
      <header style={styles.topbar}>
        <button style={styles.iconBtn} onClick={() => setMenuOpen(true)} aria-label="menu">≡</button>
        <div style={styles.title}>Coaching</div>
        <div style={{ width: 38 }} />
      </header>

      {/* Drawer backdrop */}
      <div className={`backdrop ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
      {/* Drawer */}
      <aside className={`drawer ${menuOpen ? "open" : ""}`}>
        <div style={styles.drawerHeader}>
          <div style={{ fontWeight: 900 }}>メニュー</div>
          <button style={styles.iconBtn} onClick={() => setMenuOpen(false)} aria-label="close">✕</button>
        </div>

        <div style={styles.drawerBody}>
          <button
            style={styles.menuItem}
            onClick={() => { setView("chat"); setMenuOpen(false); }}
          >
            💬 チャット
          </button>

          <button
            style={styles.menuItem}
            onClick={() => { applyHeuristicInsights(); setView("insights"); setMenuOpen(false); }}
          >
            🧩 Insights
          </button>

          <button style={styles.menuItem} onClick={resetConversation}>
            🔄 リセット
          </button>

          <button
            style={styles.menuItem}
            onClick={() => { alert("設定は後で追加"); setMenuOpen(false); }}
          >
            ⚙ 設定（後で）
          </button>

          <div style={styles.note}>
            スマホは「集中モード」<br />
            Insightsは別ビュー
          </div>
        </div>
      </aside>

      {/* Content */}
      <main style={styles.content}>
        {view === "chat" ? (
          <section style={styles.chatArea}>
            <div ref={scrollerRef} style={styles.messages}>
              {messages.length === 0 && (
                <div style={styles.empty}>
                  まずは今の迷い・モヤモヤをそのまま書いてください。
                </div>
              )}

              {messages.map(m => (
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
          </section>
        ) : (
          <section style={styles.insightsArea}>
            <div style={styles.insTitleRow}>
              <div style={{ fontWeight: 900 }}>🧩 Insights</div>
              <button
                style={styles.btnSecondary}
                onClick={() => applyHeuristicInsights()}
              >
                更新
              </button>
            </div>

            <div style={styles.card}>
              <div style={styles.label}>Summary</div>
              <div style={styles.value}>{conv.insights?.summary ?? "—"}</div>
            </div>

            <div style={styles.card}>
              <div style={styles.label}>Direction</div>
              <div style={styles.value}>{conv.insights?.direction ?? "—"}</div>
            </div>

            <div style={styles.card}>
              <div style={styles.label}>Next steps</div>
              <ul style={styles.ul}>
                {(conv.insights?.nextSteps ?? ["—"]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div style={styles.card}>
              <div style={styles.label}>Questions</div>
              <ul style={styles.ul}>
                {(conv.insights?.questions ?? ["—"]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div style={styles.note}>
              {conv.insights ? `updated: ${new Date(conv.insights.updatedAt).toLocaleString()}` : "—"}
            </div>

            <button style={styles.btnPrimary} onClick={() => setView("chat")}>
              チャットに戻る
            </button>
          </section>
        )}
      </main>

      {/* Bottom fixed composer (chat only) */}
      {view === "chat" && (
        <div style={styles.composer}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ここに入力…"
            style={styles.textarea}
            rows={2}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button style={styles.sendBtn} onClick={send} disabled={loading || !text.trim()}>
            送信
          </button>
          {err && <div style={styles.err}>{err}</div>}
        </div>
      )}
    </div>
  );
}

const css = `
/* mobile-first: this page is smartphone-optimized */
.backdrop{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
  z-index: 40;
}
.backdrop.open{
  opacity: 1;
  pointer-events: auto;
}
.drawer{
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
.drawer.open{
  transform: translateX(0);
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
  },

  topbar: {
    height: 52,
    padding: "0 12px",
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#fff",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  title: { fontWeight: 950, fontSize: 16 },

  drawerHeader: {
    padding: 12,
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#fafafa",
  },
  drawerBody: { padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  menuItem: {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    fontWeight: 900,
  },

  content: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },

  chatArea: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  messages: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    paddingBottom: 120, // composer分の余白（固定入力欄に被らない）
  },
  empty: {
    color: "#666",
    padding: 12,
    border: "1px dashed #ddd",
    borderRadius: 14,
    background: "#fcfcfc",
  },

  bubble: {
    maxWidth: "88%",
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid #eee",
  },
  bubbleUser: { background: "#e8f0ff" },
  bubbleAssistant: { background: "#fff" },
  bubbleMeta: { fontSize: 12, color: "#666", marginBottom: 6 },

  composer: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    borderTop: "1px solid #e6e6e6",
    background: "#fafafa",
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    zIndex: 20,
    flexWrap: "wrap",
  },
  textarea: {
    flex: 1,
    minWidth: 180,
    borderRadius: 14,
    border: "1px solid #ddd",
    padding: 10,
    fontSize: 16,
    outline: "none",
    resize: "none",
  },
  sendBtn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  err: { width: "100%", color: "#b42318", fontSize: 12, marginTop: 6 },

  insightsArea: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  insTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  card: { border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" },
  label: { fontSize: 12, color: "#666", fontWeight: 900, marginBottom: 6 },
  value: { fontSize: 14, lineHeight: 1.5 },
  ul: { margin: 0, paddingLeft: 18 },

  btnPrimary: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 6,
  },
  btnSecondary: {
    padding: "8px 10px",
    borderRadius: 14,
    border: "1px solid #ddd",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },

  note: { fontSize: 12, color: "#666", lineHeight: 1.5 },
};
