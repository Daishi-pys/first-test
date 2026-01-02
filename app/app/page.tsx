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
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Page() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // スマホ用ビュー切替
  const [activeView, setActiveView] = useState<"chat" | "insights">("chat");

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // load / persist
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      setConv(JSON.parse(raw));
    } else {
      setConv({ id: uid(), title: "対話", messages: [] });
    }
  }, []);

  useEffect(() => {
    if (conv) localStorage.setItem(LS_KEY, JSON.stringify(conv));
  }, [conv]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [conv?.messages?.length, loading]);

  const messages = conv?.messages ?? [];

  // 仮Insights
  const heuristicInsights = useMemo<Insights>(() => {
    const last = messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
    return {
      summary: last ? `最近のテーマ：${last.slice(0, 20)}…` : "—",
      direction: "（仮）方向性は未確定",
      nextSteps: ["モヤモヤを書き出す", "小さな一歩を決める"],
      questions: ["避けたい未来は？", "本当は何がしたい？"],
      confidence: messages.length ? 0.2 : 0,
      updatedAt: Date.now(),
    };
  }, [messages]);

  async function send() {
    if (!conv || !text.trim()) return;
    const userMsg: Msg = { id: uid(), role: "user", content: text, ts: Date.now() };
    setText("");
    setLoading(true);

    setConv(c => c && ({ ...c, messages: [...c.messages, userMsg] }));

    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg.content }),
    });
    const data = await res.json();

    setConv(c =>
      c && ({
        ...c,
        messages: [...c.messages, { id: uid(), role: "assistant", content: data.reply, ts: Date.now() }],
        insights: heuristicInsights,
      })
    );
    setLoading(false);
  }

  if (!conv) return null;

  return (
    <div style={styles.page}>
      <style>{css}</style>

      {/* Header */}
      <header style={styles.header}>
        <button style={styles.iconBtn} onClick={() => setMenuOpen(true)}>≡</button>
        <div style={styles.brand}>Coaching</div>
      </header>

      {/* Drawer */}
      {menuOpen && <div style={styles.backdrop} onClick={() => setMenuOpen(false)} />}
      <aside className={`drawer ${menuOpen ? "open" : ""}`}>
        <button style={menuItem} onClick={() => { setActiveView("chat"); setMenuOpen(false); }}>💬 チャット</button>
        <button style={menuItem} onClick={() => { setActiveView("insights"); setMenuOpen(false); }}>🧩 Insights</button>
      </aside>

      {/* Main */}
      <main className="grid">
        {/* Chat */}
        {(activeView === "chat" || window.innerWidth > 900) && (
          <section style={styles.card}>
            <div ref={scrollerRef} style={styles.messages}>
              {messages.map(m => (
                <div key={m.id} style={{ textAlign: m.role === "user" ? "right" : "left" }}>
                  <div style={styles.bubble}>{m.content}</div>
                </div>
              ))}
            </div>

            <div style={styles.composer}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="ここに入力…"
              />
              <button onClick={send}>送信</button>
            </div>
          </section>
        )}

        {/* Insights */}
        {(activeView === "insights" || window.innerWidth > 900) && (
          <aside style={styles.card}>
            <h3>Insights</h3>
            <p><b>Summary:</b> {conv.insights?.summary ?? "—"}</p>
            <p><b>Direction:</b> {conv.insights?.direction ?? "—"}</p>
            <p><b>Next:</b></p>
            <ul>{(conv.insights?.nextSteps ?? []).map((n, i) => <li key={i}>{n}</li>)}</ul>
          </aside>
        )}
      </main>
    </div>
  );
}

const css = `
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .drawer {
    position: fixed;
    left: 0;
    top: 0;
    width: 280px;
    height: 100vh;
    background: #fff;
    transform: translateX(-100%);
    transition: transform .2s;
  }
  .drawer.open {
    transform: translateX(0);
  }
}
`;

const styles: any = {
  page: { height: "100vh", display: "flex", flexDirection: "column" },
  header: { display: "flex", gap: 12, padding: 12, borderBottom: "1px solid #eee" },
  brand: { fontWeight: 900 },
  iconBtn: { fontSize: 18 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.3)" },
  card: { border: "1px solid #ddd", borderRadius: 12, padding: 12, minHeight: 0 },
  messages: { flex: 1, overflow: "auto" },
  bubble: { display: "inline-block", padding: 8, borderRadius: 8, background: "#f4f4f4", margin: 4 },
  composer: { display: "flex", gap: 8 },
};

const menuItem: React.CSSProperties = {
  padding: 12,
  border: "none",
  background: "#fff",
  textAlign: "left",
  fontWeight: 700,
};
