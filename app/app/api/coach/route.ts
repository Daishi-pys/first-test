import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "");

  const reply =
    "（仮コーチ）\n" +
    "いま一番モヤモヤしているのは、どの場面ですか？\n" +
    "その場面で出てくる感情を、言葉で3つ挙げてください。\n\n" +
    `あなたの入力: 「${message}」`;

  return NextResponse.json({ reply });
}
