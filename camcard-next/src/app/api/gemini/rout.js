import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    // 1. 接收前端傳來的圖片與提示詞
    const payload = await req.json();
    
    // 2. 從「伺服器端」讀取金鑰 (這裡絕對不會洩漏給前端)
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "伺服器缺少 API 金鑰設定" }, { status: 500 });
    }

    const model = payload.model || "models/gemini-2.5-flash";

    // 3. 由伺服器向 Google 發送請求
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
       return NextResponse.json(data, { status: response.status });
    }

    // 4. 把結果傳回給前端網頁
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
