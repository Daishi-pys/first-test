export default function Booking() {
  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1>📅 人間コーチ面談（仮）</h1>
      <p>今日はUI完成が目的なので、予約機能はまず導線だけ作ります。</p>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <ol>
          <li>面談希望日時を3つ用意</li>
          <li>フォーム or メールで送信</li>
          <li>確定後にオンライン面談</li>
        </ol>

        <a href="/">← チャットに戻る</a>
      </div>
    </div>
  );
}
