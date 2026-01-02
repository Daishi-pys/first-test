"use client";

export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Coaching</div>
        <div style={styles.sub}>
          使う端末に合わせてビューを選んでください。
        </div>

        <div style={styles.grid}>
          <a href="/chat" style={{ ...styles.btn, ...styles.btnPrimary }}>
            📱 スマホ用（集中モード）
            <div style={styles.btnSub}>チャット中心・Insightsは別ビュー</div>
          </a>

          <a href="/dashboard" style={{ ...styles.btn, ...styles.btnSecondary }}>
            🖥️ PC用（ダッシュボード）
            <div style={styles.btnSub}>チャット＋Insightsを横並び</div>
          </a>
        </div>

        <div style={styles.note}>
          ※どちらも同じ会話データを使います（同じブラウザ内で共有）
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "#fff",
    color: "#111",
  },
  card: {
    width: "min(720px, 100%)",
    border: "1px solid #e6e6e6",
    borderRadius: 16,
    padding: 18,
  },
  title: { fontWeight: 950, fontSize: 22, marginBottom: 6 },
  sub: { color: "#666", marginBottom: 14, lineHeight: 1.5 },

  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },

  btn: {
    display: "block",
    padding: 14,
    borderRadius: 14,
    textDecoration: "none",
    border: "1px solid #ddd",
    fontWeight: 900,
    color: "#111",
  },
  btnPrimary: { background: "#111", color: "#fff", border: "1px solid #111" },
  btnSecondary: { background: "#fff" },

  btnSub: { marginTop: 6, fontWeight: 600, fontSize: 12, opacity: 0.9 },
  note: { marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.5 },
};
