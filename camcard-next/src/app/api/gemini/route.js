import { NextResponse } from 'next/server';

// 🚀 【關鍵優化 1】：延長 Vercel Serverless Function 的執行時間限制
// Hobby 方案最高可設為 60 秒 (Pro 方案可更高)，避免 AI 還在算就被 Vercel 強制中斷
export const maxDuration = 60; 

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

    // 🚀 【關鍵優化 2】：將前端的連線狀態 (req.signal) 往下傳遞給 fetch
    // 如果前端因為等太久主動放棄 (AbortController)，後端也會立刻通知 Google 中止運算，不浪費額度
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: req.signal 
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    // 捕捉如果是因為前端中斷 (AbortError) 所引發的錯誤，不要當作一般 500 錯誤處理
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: "Client aborted the request" }, { status: 499 });
    }
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
}