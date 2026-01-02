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

export default function DashboardPage() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // load
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      setConv(JSON.parse(raw));
    } else {
      setConv({ id: uid(), title: "対話", messages: [] });
    }
  }, []);

  // persist
  useEffect(() => {
    if (conv) localStorage.setItem(LS_KEY, JSON.stringify(conv));
  }, [conv]);

  // autoscroll
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [conv?.messages?.length, loading]);

  const messages = conv?.messages ?? [];

  // 仮Insights（明日AI抽出に差し替え）
  const heuristicInsights = useMemo<Insights>(() => {
    const userTexts = messages.filter(m => m.role === "user").map(m => m.content);
    const last = userTexts[userTexts.length - 1] ?? "";
    return {
      summary: userTexts.length ? `最近のテーマ：${last.slice(0, 28)}${last.length > 28 ? "…" : ""}` : "—",
      direction: userTexts.length ? "（仮）方向性はまだ暫定" : "—",
      nextSteps: userTexts.length ? ["重要だが避けていることを1つ書く", "今日できる最小の一歩を決める"] : ["—"],
      questions: userTexts.length ? ["避けたい未来は？", "何を選べば後悔が少ない？"] : ["—"],
      confidence: userTexts.length ? 0.25 : 0.0,
      updatedAt: Date.now(),
    };
  }, [messages]);

  function applyHeuristicInsights() {
    if (!conv) return;
    setConv(prev => (prev ? { ...prev, insights: heuristicInsights } : prev));
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
      setTimeout(() => applyHeuristicInsights(), 0);
    } catch {
      setErr("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!conv) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>Coaching</div>
          <div style={styles.sub}>Dashboard（PC専用）</div>
        </div>
        <a href="/chat" style={styles.link}>スマホUIを見る</a>
      </header>

      <main style={styles.grid}>
        {/* Chat */}
        <section style={styles.chat}>
          <div style={styles.sectionTitle}>💬 チャット</div>

          <div ref={scrollerRef} style={styles.messages}>
            {messages.map(m => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div style={{ ...styles.bubble, ...(m.role === "user" ? styles.user : styles.assistant) }}>
                  <div style={styles.meta}>
                    {m.role}・{formatTime(m.ts)}
                  </div>
                  <div>{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.composer}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="ここに入力…"
              rows={3}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button onClick={send} disabled={loading || !text.trim()}>
              送信
            </button>
            {err && <div style={styles.err}>{err}</div>}
          </div>
        </section>

        {/* Insights */}
        <aside style={styles.insights}>
          <div style={styles.sectionTitle}>🧩 Insights</div>

          <Block label="Summary" value={conv.insights?.summary ?? "—"} />
          <Block label="Direction" value={conv.insights?.direction ?? "—"} />
          <ListBlock label="Next steps" items={conv.insights?.nextSteps ?? ["—"]} />
          <ListBlock label="Questions" items={conv.insights?.questions ?? ["—"]} />

          <div style={styles.small}>
            {conv.insights
              ? `updated: ${new Date(conv.insights.updatedAt).toLocaleString()}`
              : "まだInsightsはありません"}
          </div>

          <button style={styles.secondaryBtn} onClick={applyHeuristicInsights}>
            仮Insights更新
          </button>
        </aside>
      </main>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.block}>
      <div style={styles.label}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={styles.block}>
      <div style={styles.label}>{label}</div>
      <ul>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { height: "100vh", display: "flex", flexDirection: "column" },

  header: {
    padding: 16,
    borderBottom: "1px solid #e6e6e6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontWeight: 900, fontSize: 18 },
  sub: { fontSize: 12, color: "#666" },
  link: { fontSize: 12, textDecoration: "underline" },

  grid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1.2fr 0.9fr",
    gap: 16,
    padding: 16,
    minHeight: 0,
  },

  chat: {
    border: "1px solid #ddd",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  insights: {
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 16,
    overflow: "auto",
  },

  sectionTitle: { fontWeight: 900, marginBottom: 12 },

  messages: { flex: 1, overflow: "auto", padding: 12 },

  bubble: {
    maxWidth: "80%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #eee",
  },
  user: { background: "#e8f0ff" },
  assistant: { background: "#fff" },
  meta: { fontSize: 12, color: "#666", marginBottom: 6 },

  composer: {
    borderTop: "1px solid #eee",
    padding: 12,
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },

  block: { marginBottom: 14 },
  label: { fontSize: 12, color: "#666", fontWeight: 900, marginBottom: 6 },
  small: { fontSize: 12, color: "#666", marginTop: 12 },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 8,
  },

  err: { color: "#b42318", fontSize: 12, marginTop: 6 },
};
