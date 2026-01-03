import { NextResponse } from "next/server";

type Msg = { role: "user" | "assistant"; content: string };

export const COACH_SYSTEM_SHORT = `
あなたは「人生・意思決定・自己理解」を支援するAIコーチ。
正解を与えない。思考を代替しない。断定しない。命令しない（「〜すべき」禁止）。
過度な励まし禁止。価値観の押し付け禁止。医療/法律/投資などの専門判断禁止。
使命は「問い→整理→収束→決断→行動」を支え、ユーザーが自分の意思で決めて一歩踏み出せる状態を作ること。

【思考フェーズ（内部で分類し明示しない）】
毎ターン、ユーザー状態を次のいずれかに分類し、強度を調整する：
Exploration / Clarification / Convergence / Commitment

- Exploration：選択肢を広げる。問いはWhy/What/If。行動は思考・観察のみ。決めに行かない。
- Clarification：価値観/制約/判断軸を言語化。前進を要約し、違いを構造化してよい（結論は出さない）。
- Convergence：ギアを上げる。選択肢を2→1へ近づける再整理、暫定評価（「今の条件だけで言えば」）と仮決め提案は可。断定は不可。方向は示してよい。
- Commitment：新しい問いは禁止。決断を引き受けられる形に言語化し、撤回可能で小さく短期限の“一歩目”を選択肢として提示してよい（強制しない）。

【返答の必須構造（日本語・長文禁止）】
1) 共感・受容（1〜2文。評価/同意/否定をしない）
2) 状況の再整理（要約＋構造化。推測は断定しない）
3) フェーズ依存：
   - Exploration/Clarification/Convergence：問い（1〜2問。抽象論禁止。行動/選択/判断に繋げる）
   - Commitment：問い禁止。収束コメント（覚悟/理由/引き受けを言語化）
4) 小さな次アクション（フェーズに合うレベルで。強制しない。短く）

【Insights抽出前提】
比喩を避け、目標/価値観/制約/判断軸/次の一歩として切り出せる表現を使う。
行き詰まったら問いを減らし整理を厚くする。迷いが長い場合はConvergenceへ入る勇気を持つ。
`.trim();

export const COACH_PRELUDE_MID = `
【固定前提（要約）】
- 使命：問い→整理→収束→決断→行動まで支える（正解は出さない）
- 禁止：断定/命令/正解提示/説教/過度な励まし/価値観の押し付け/専門判断
- 内部フェーズ：探索→整理→収束→決断（決断では新しい問いを出さない）
- 返答：共感(1-2文)→整理→(問い1-2/収束コメント)→次アクション。長文禁止。
- Insights抽出：目標/価値観/制約/判断軸/次の一歩として切り出せる言い方をする。
`.trim();

/**
 * 将来キャッシュに移行したい場合:
 * - cachedContentName を渡す（例: "cachedContents/abc123"）
 * - そうすると PRELUDE を入れずに cachedContent を参照する設計
 */
function toGeminiContents(history: Msg[], message: string, opts?: { cachedContentName?: string | null }) {
  const cachedContentName = opts?.cachedContentName ?? null;

  // 直近履歴（roleを保持して Gemini形式へ）
  const recent = history.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // 無料枠モード: キャッシュがない場合だけ、固定PRELUDEを先頭に1つ差し込む
  const prelude = cachedContentName
    ? []
    : [
        {
          role: "user" as const,
          parts: [{ text: COACH_PRELUDE_MID }],
        },
      ];

  // 毎回のユーザー入力（短い出力条件もここに付与）
  // ※ systemInstruction 側に詳細ルールがあるので、ここは最小限にする
  const userTurn = {
    role: "user" as const,
    parts: [
      {
        text: `（出力条件：日本語／4ブロック／問い最大2／長文禁止）\n${message}`,
      },
    ],
  };

  return [...prelude, ...recent, userTurn];
}

async function callGemini(
  history: Msg[],
  message: string,
  opts?: {
    // 将来キャッシュへ移行するための拡張
    cachedContentName?: string | null; // "cachedContents/..." or null
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  },
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  //const model = opts?.model ?? "gemini-2.5-flash-lite";
  const model = opts?.model ?? "gemini-2.5-pro";
  //const temperature = opts?.temperature ?? 0.5;
  //const maxOutputTokens = opts?.maxOutputTokens ?? 350; // コーチ返答を短めに固定

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // リクエストボディ組み立て（cachedContentがあれば付与）
  const body: any = {
    systemInstruction: { parts: [{ text: COACH_SYSTEM_SHORT }] },
    contents: toGeminiContents(history, message, { cachedContentName: opts?.cachedContentName ?? null }),
    // generationConfig は「指定するときだけ」付ける（空オブジェクト送信を避ける）
  };

  // generationConfig を使う時だけON（今はコメントアウト運用のままでOK）
  // body.generationConfig = { temperature, maxOutputTokens };

  if (opts?.cachedContentName) {
    body.cachedContent = opts.cachedContentName;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : "";
}

function toOpenAIMessages(history: Msg[], message: string) {
  // systemは最小。明日以降ここを“コーチング品質”で育てる
  return [
    {
      role: "system",
      content:
        "You are a professional coaching AI. Ask one sharp question at a time. Be concise and supportive.",
    },
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
}

async function callOpenAI(history: Msg[], message: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: toOpenAIMessages(history, message),
      temperature: 0.7,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = String(body?.message ?? "");
    const history = (body?.history ?? []) as Msg[];

    const provider = (process.env.PROVIDER ?? "gemini").toLowerCase();
    const reply =
      provider === "openai"
        ? await callOpenAI(history, message)
        : await callGemini(history, message);

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json(
      { reply: `（エラー）${e?.message ?? String(e)}` },
      { status: 200 }
    );
  }
}
