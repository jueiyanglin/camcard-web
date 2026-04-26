import { NextResponse } from 'next/server';

// 備用模型清單（按優先順序排列）
const MODELS_TO_TRY = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash-latest"
];

export async function POST(req) {
  try {
    const payload = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: { message: "伺服器缺少 API 金鑰設定" } }, { status: 500 });
    }

    let lastResponseData = null;
    let lastStatus = 500;

    // 依序嘗試各個模型
    for (const model of MODELS_TO_TRY) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      // 如果成功，直接回傳給前端
      if (response.ok) {
        return NextResponse.json(data, { status: 200 }); 
      }

      // 記錄錯誤狀態
      lastStatus = response.status;
      lastResponseData = data;

      // 如果是 404 (模型找不到) 或 400 (模型不支援某些參數)，就換下一個模型試試看
      if (response.status === 404 || response.status === 400) {
        console.warn(`模型 ${model} 失敗，嘗試下一個...`);
        continue; 
      }
      
      // 如果是其他嚴重錯誤 (例如 403 權限不足, 429 額度用盡) 就直接中斷跳出
      break;
    }

    // 所有模型都失敗了，把最後一次的錯誤回傳給前端
    return NextResponse.json(lastResponseData, { status: lastStatus });

  } catch (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
}