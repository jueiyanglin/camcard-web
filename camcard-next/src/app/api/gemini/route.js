import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const payload = await req.json();
    
    // 從 Vercel 環境變數讀取你的 Gemini API 金鑰
    const apiKey = process.env.GEMINI_API_KEY; 
    
    if (!apiKey) {
      return NextResponse.json({ error: "伺服器未設定 GEMINI_API_KEY 環境變數" }, { status: 500 });
    }

    // 取得前端指定的模型，若無則預設使用 gemini-2.5-flash
    const targetModel = payload.targetModel || "gemini-2.5-flash";
    delete payload.targetModel; // 移除前端附加的欄位，避免 Google API 報錯

    // 轉發請求給 Google Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
}