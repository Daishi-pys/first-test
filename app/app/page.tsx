"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string; ts: number };

const LS_KEY = "coaching_ui_history_v2";

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function Page() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  // save
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  // auto-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, loading]);

  const insights = useMemo(() => {
    const userTexts = history.filter(m => m.role === "user").map(m => m.content);
    return {
      version: "draft-v1",
      hypotheses: userTexts.length ? ["（仮）会話から仮説を抽出する領域"] : [],
      direction: userTexts.length ? "（仮）方向性は暫定" : "",
      next_steps: userTexts.length ? ["（仮）5分：今日のモヤモヤを3つ箇条書き"] : [],
      questions: userTexts.length ? ["いま避けたい未来は？", "最近少し良かった瞬間は？"] : [],
      confidence: { overall: 0.1 },
    };
  }, [history]);

  async function send() {
    const t = text.trim();
    if (!t || loading) return;

    setError(null);

    const userMsg: Msg = { role: "user", content: t, ts: Date.now() };
    setHistory(prev => [...prev, userMsg]);
    setText("");
    setLoading(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, history: history.slice(-20) }),
      });

      const data = await res.json().catch(() => ({}));
      const replyText = String(data?.reply ?? "");

      const assistantMsg: Msg = {
        role: "assistant",
        content: replyText || "（返答が空でした）",
        ts: Date.now(),
      };
      setHistory(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      setError("通信に失敗しました。もう一度試してください。");
      const assistantMsg: Msg = {
        role: "assistant",
        content: "（エラー）通信に失敗しました。",
        ts: Date.now(),
      };
      setHistory(prev => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    setError(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }

  function exportJson() {
    const payload = { exported_at: new Date().toISOString(), history, insights };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coaching_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={styles.brand}>Coaching</div>
          <div style={styles.sub}>UIプロトタイプ（改善しやすい土台）</div>
        </div>

        <div style={styles.headerActions}>
          <a href="/booking" style={styles.linkBtn}>面談予約</a>
          <button onClick={exportJson} style={styles.btnSecondary}>JSON出力</button>
          <button onClick={reset} style={styles.btnDanger}>履歴リセット</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Chat */}
        <section style={styles.chatCard}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>💬 チャット</div>
            <div style={styles.smallMuted}>
              Enter送信 / Shift+Enter改行
            </div>
          </div>

          <div ref={scrollerRef} style={styles.messages}>
            {history.length === 0 && (
              <div style={styles.empty}>
                まずは今の迷い・モヤモヤをそのまま書いてください。
              </div>
            )}

            {history.map((m, i) => (
              <div
                key={i}
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
                {error ? <span style={{ color: "#b42318" }}>{error}</span> : "※ 今日はUIを整える日。AIは後で差し替えOK。"}
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
            <div style={styles.cardTitle}>🧩 Insights（仮）</div>
            <div style={styles.smallMuted}>後でAI抽出に置換</div>
          </div>

          <div style={styles.insightsBody}>
            <div style={styles.kv}>
              <div style={styles.kvLabel}>Direction</div>
              <div style={styles.kvValue}>{insights.direction || "—"}</div>
            </div>

            <div style={styles.kv}>
              <div style={styles.kvLabel}>Next steps</div>
              <ul style={styles.ul}>
                {(insights.next_steps?.length ? insights.next_steps : ["—"]).map((x: string, idx: number) => (
                  <li key={idx} style={styles.li}>{x}</li>
                ))}
              </ul>
            </div>

            <div style={styles.kv}>
              <div style={styles.kvLabel}>Questions</div>
              <ul style={styles.ul}>
                {(insights.questions?.length ? insights.questions : ["—"]).map((x: string, idx: number) => (
                  <li key={idx} style={styles.li}>{x}</li>
                ))}
              </ul>
            </div>

            <details style={styles.details}>
              <summary style={styles.summary}>生JSONを見る</summary>
              <pre style={styles.pre}>{JSON.stringify(insights, null, 2)}</pre>
            </details>
          </div>
        </aside>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
  },
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
  headerActions: { display: "flex", gap: 8, alignItems: "center" },
  main: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1.25fr 0.9fr",
    gap: 12,
    padding: 12,
    minHeight: 0,
  },
  chatCard: {
    border: "1px solid #e6e6e6",
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  insightsCard: {
    border: "1px solid #e6e6e6",
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
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
  messages: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    background: "#fff",
  },
  empty: { color: "#666", padding: 12, border: "1px dashed #ddd", borderRadius: 12, background: "#fcfcfc" },
  bubble: {
    maxWidth: "85%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e9e9e9",
  },
  bubbleUser: { background: "#e8f0ff" },
  bubbleAssistant: { background: "#fff" },
  bubbleMeta: { fontSize: 12, color: "#666", marginBottom: 6 },
  composer: {
    borderTop: "1px solid #f0f0f0",
    padding: 12,
    background: "#fafafa",
  },
  textarea: {
    width: "100%",
    resize: "none",
    borderRadius: 12,
    border: "1px solid #ddd",
    padding: 10,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  composerBottom: {
    marginTop: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  smallMuted: { fontSize: 12, color: "#666" },
  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnSecondary: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnDanger: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #f2c6c6",
    background: "#fff5f5",
    cursor: "pointer",
    fontWeight: 600,
    color: "#b42318",
  },
  linkBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    textDecoration: "none",
    color: "#111",
    display: "inline-block",
  },
  insightsBody: { padding: 12, overflow: "auto" },
  kv: { marginBottom: 14 },
  kvLabel: { fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 600 },
  kvValue: { fontSize: 14, lineHeight: 1.4 },
  ul: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 6, lineHeight: 1.4 },
  details: { marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 },
  summary: { cursor: "pointer", fontWeight: 600 },
  pre: {
    marginTop: 10,
    background: "#111",
    color: "#eee",
    padding: 12,
    borderRadius: 12,
    overflow: "auto",
    fontSize: 12,
  },
};
