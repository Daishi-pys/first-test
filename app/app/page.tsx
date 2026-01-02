"use client";

import { useEffect, useMemo, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; ts: number };

const LS_KEY = "coaching_ui_history_v1";

export default function Page() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  const insights = useMemo(() => {
    const userTexts = history.filter(m => m.role === "user").map(m => m.content);
    return {
      values: [],
      strengths: [],
      constraints: [],
      hypotheses: userTexts.length ? ["（仮）会話から仮説を抽出する領域"] : [],
      direction: userTexts.length ? "（仮）方向性は暫定" : "",
      next_steps: userTexts.length ? ["（仮）5分：今日のモヤモヤを3つ箇条書き"] : [],
      questions: userTexts.length ? ["いま避けたい未来は？", "最近少し良かった瞬間は？"] : [],
      confidence: [{ overall: 0.1 }],
    };
  }, [history]);

  async function send() {
    const t = text.trim();
    if (!t || loading) return;

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
      const data = await res.json();
      const assistantMsg: Msg = { role: "assistant", content: data.reply ?? "（エラー）", ts: Date.now() };
      setHistory(prev => [...prev, assistantMsg]);
    } catch {
      const assistantMsg: Msg = { role: "assistant", content: "通信に失敗しました（仮）", ts: Date.now() };
      setHistory(prev => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    try { localStorage.removeItem(LS_KEY); } catch {}
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, padding: 16, height: "100vh", boxSizing: "border-box" }}>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>💬 Coaching Chat（UI完成優先の仮版）</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/booking" style={{ textDecoration: "none" }}>面談予約 →</a>
            <button onClick={reset} style={{ padding: "6px 10px" }}>履歴リセット</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", marginTop: 12, padding: 8, background: "#fafafa", borderRadius: 10 }}>
          {history.length === 0 && (
            <div style={{ color: "#666" }}>
              まずは今の迷い・モヤモヤをそのまま書いてください。
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%",
                padding: "10px 12px",
                borderRadius: 12,
                background: m.role === "user" ? "#e8f0ff" : "#fff",
                border: "1px solid #e5e5e5",
                whiteSpace: "pre-wrap"
              }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{m.role}</div>
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="ここに入力（Enterで送信）"
            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            disabled={loading}
          />
          <button onClick={send} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10 }}>
            {loading ? "送信中…" : "送信"}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          ※今日はUI完成が目的。AI応答は仮（/api/coach）。あとで本物のAI・DB・認証に差し替えます。
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: 0 }}>🧩 Insights（仮）</h2>
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          会話からの抽出/要約は、後でAIに置き換えます（UIだけ先に固める）。
        </div>

        <pre style={{
          marginTop: 12,
          flex: 1,
          overflow: "auto",
          background: "#111",
          color: "#eee",
          padding: 12,
          borderRadius: 10,
          fontSize: 12
        }}>
          {JSON.stringify(insights, null, 2)}
        </pre>

        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify({ history, insights }, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `coaching_export_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{ padding: "10px 12px", borderRadius: 10 }}
        >
          JSONをダウンロード
        </button>
      </div>
    </div>
  );
}
