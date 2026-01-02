import { NextResponse } from "next/server";

type Msg = { role: "user" | "assistant"; content: string };

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

function toGeminiContents(history: Msg[], message: string) {
  // Geminiは role 構造が異なるので簡易に “会話テキスト”として渡す（まず動く優先）
  const lines = history.slice(-20).map((m) => `${m.role.toUpperCase()}: ${m.content}`);
  lines.push(`USER: ${message}`);
  const prompt =
    "You are a professional coaching AI. Ask one sharp question at a time. Be concise and supportive.\n\n" +
    lines.join("\n");

  return [{ role: "user", parts: [{ text: prompt }] }];
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

async function callGemini(history: Msg[], message: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  // modelはまず “flash-lite系” に寄せる（最安志向）。後で好みで変更OK
  const model = "gemini-3-flash-lite"; // もし存在しないと言われたら、そのログを貼って。すぐ直す。

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: toGeminiContents(history, message),
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
