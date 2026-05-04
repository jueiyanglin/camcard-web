"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, Building2, Phone, Mail, Briefcase,
  Edit2, Trash2, X, ScanFace, Users, MapPin, UploadCloud, 
  Loader2, Bot, Copy, Check, Smartphone, AlertTriangle, 
  Database, Layers, Download, Upload, Image as ImageIcon, LogOut, FileText, Menu
} from 'lucide-react';

// --- Firebase 雲端資料庫 ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

// 環境預設變數
const fallbackConfig = {
  apiKey: "AIzaSyANFxwo3cqAJmuxz59wvTOiFCZZFobFmzk",
  authDomain: "camcard-web.firebaseapp.com",
  projectId: "camcard-web",
  storageBucket: "camcard-web.firebasestorage.app",
  messagingSenderId: "894143261550",
  appId: "1:894143261550:web:a9f86cb9de16fae7b86f7f"
};

const getFirebaseConfig = () => {
  if (typeof window !== 'undefined' && window.__firebase_config) {
    try { return JSON.parse(window.__firebase_config); } catch (e) { return fallbackConfig; }
  }
  return fallbackConfig;
};

const app = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const appId = typeof window !== 'undefined' && window.__app_id 
  ? window.__app_id.replace(/\//g, '_') 
  : 'camcard-web';

// 環境提供的 API Key，供預覽測試使用
const apiKey = ""; 

const INDUSTRIES = ['全部', '中鋼集團', '中鋼客戶', '型鋼客戶', '鋼鐵同業', '協力商', '供應商', '政府及地方', '國外廠商', '休閒娛樂', '金融', '其它'];

// 🌟 新增：分類防呆過濾機制
const getValidIndustry = (ind) => {
  if (!ind) return '其它';
  const trimmedInd = String(ind).trim();
  // 如果分類在清單內，且不是「全部」，就採用該分類；否則強制歸為「其它」
  return (INDUSTRIES.includes(trimmedInd) && trimmedInd !== '全部') ? trimmedInd : '其它';
};

const INDUSTRY_COLORS = {
  '中鋼集團': 'from-blue-700 to-blue-900', '中鋼客戶': 'from-sky-700 to-sky-900',
  '型鋼客戶': 'from-cyan-700 to-cyan-900', '鋼鐵同業': 'from-zinc-700 to-zinc-900',
  '協力商': 'from-emerald-700 to-emerald-900', '供應商': 'from-teal-700 to-teal-900',
  '政府及地方': 'from-amber-700 to-amber-900', '國外廠商': 'from-orange-700 to-orange-900', '休閒娛樂': 'from-rose-700 to-rose-900',
  '金融': 'from-purple-700 to-purple-900', '其它': 'from-indigo-700 to-indigo-900'
};

const API_ERROR_MESSAGES = {
  400: "【請求無效】可能 API 金鑰不正確，或圖片格式錯誤。",
  403: "【權限拒絕】API 金鑰無效或受限。",
  404: "【模型不存在】指定的 AI 模型名稱錯誤。",
  429: "【頻率受限】請求過於頻繁，請稍候 1 分鐘再試。",
  500: "【伺服器錯誤】系統異常，請稍後再試。",
  503: "【系統繁忙】AI 模型目前全球大塞車，請稍等幾分鐘後再試。",
  'UNRECOGNIZED': "【辨識失敗】無法從圖片提取有效資訊，請確保圖片清晰。",
  'UNKNOWN': "【未知錯誤】發生了未預期的通訊問題。"
};

const getDetailedError = (status, serverMsg = "") => {
  if (status === null) return API_ERROR_MESSAGES[serverMsg] || API_ERROR_MESSAGES['UNKNOWN'];
  const baseMsg = API_ERROR_MESSAGES[status] || API_ERROR_MESSAGES['UNKNOWN'];
  if (status === 503) return baseMsg;
  return `${baseMsg} (代碼: ${status || '無'} ${serverMsg})`;
};

// 🌟 安全的動態載入 XLSX 套件，相容 Vercel 編譯環境
const loadXLSX = async () => {
  // 如果已經在全域變數中，直接回傳
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  
  return new Promise((resolve, reject) => {
    // 確保在瀏覽器環境執行
    if (typeof document === 'undefined') {
      return reject(new Error("XLSX can only be loaded in a browser environment"));
    }
    
    // 檢查是否已經有 script 正在載入
    const existingScript = document.getElementById('xlsx-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.XLSX));
      existingScript.addEventListener('error', () => reject(new Error("載入 Excel 處理套件失敗")));
      return;
    }

    const script = document.createElement('script');
    script.id = 'xlsx-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("載入 Excel 處理套件失敗"));
    document.head.appendChild(script);
  });
};

// 🌟 優化：壓縮圖片，降解析度與品質以節省頻寬與 Token
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // 從 1200 降為 800
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // 品質從 0.8 降為 0.6
        resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
      };
    };
  });
};

// 🌟 優化：阻斷盲目重試引發的「雪崩效應」
async function callGeminiWithRetry(payload, retries = 3) {
  let lastError;
  const model = "gemini-2.5-flash-preview-09-2025"; 

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error?.message || "網路請求失敗");
        error.status = response.status;
        
        // 關鍵修正：4xx 錯誤直接拋出，不再無效重試
        if ([400, 403, 404, 429].includes(response.status)) {
          error.isFatal = true; 
        }
        throw error;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
      if (err.isFatal) throw err; // 致命錯誤立刻中斷
      if (i === retries - 1) break; 
      const delay = 1500 * (i + 1); 
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError; 
}

function cleanJsonResponse(text) {
  if (!text) return "{}";
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  return match ? match[0] : text;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('全部');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleGoogleLogin = async () => {
    if (!auth) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showNotification("Google 登入成功！");
    } catch (error) { setDbError(`登入失敗: ${error.message}`); }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      await signInAnonymously(auth);
      showNotification("已登出，目前為訪客模式");
    } catch (error) { setDbError(`登出失敗: ${error.message}`); }
  };

  // 初始化與認證
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof window !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setDbError("認證初始化失敗: " + err.message);
        setIsLoadingDB(false);
      }
    };
    
    if (auth) {
      initAuth();
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    } else {
      setIsLoadingDB(false);
    }
  }, []);

  // 載入資料
  useEffect(() => {
    if (!user || !db) return;
    
    setIsLoadingDB(true);
    const contactsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'contacts');
    
    const unsubscribeSnapshot = onSnapshot(contactsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => Number(b.id) - Number(a.id));
      setContacts(data);
      setIsLoadingDB(false);
    }, (error) => {
      setDbError(`資料讀取失敗: ${error.message}`);
      setIsLoadingDB(false);
    });
    
    return () => unsubscribeSnapshot();
  }, [user]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const search = searchTerm.toLowerCase();
      return (String(contact.name || '').toLowerCase().includes(search) || 
              String(contact.company || '').toLowerCase().includes(search) ||
              String(contact.company2 || '').toLowerCase().includes(search)) &&
             (selectedIndustry === '全部' || (contact.industry || '其它') === selectedIndustry);
    });
  }, [contacts, searchTerm, selectedIndustry]);

  const handleSaveContact = async (formData) => {
    if (!user || !db) return;
    try {
      const contactId = editingContact?.id || String(Date.now());
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId);
      await setDoc(docRef, { ...formData, id: contactId });
      setIsModalOpen(false);
      setEditingContact(null);
      showNotification("聯絡人已儲存！");
    } catch (error) { setDbError(`儲存失敗: ${error.message}`); }
  };

  const handleDelete = async (id) => {
    if (!user || !db) return;
    // 使用客製化彈窗代替 window.confirm 以符合平台規範
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', String(id)));
      showNotification("名片已刪除");
    } catch (error) { setDbError(`刪除失敗: ${error.message}`); }
  };

  const exportToExcel = async () => {
    if (contacts.length === 0) return showNotification("目前沒有資料");
    
    try {
      showNotification("正在準備匯出...");
      const XLSX = await loadXLSX();
      
      if (!XLSX) {
          throw new Error("無法載入 Excel 處理模組，請檢查網路連線。");
      }

      const headers = [
        '姓名', '公司', '職稱', '電話', '手機', '公司地址', '電子信箱', 
        '公司2名稱', '公司2職稱', '公司2電話', '公司2手機', '公司2地址', '公司2電子信箱', 
        '產業', '備註', '名片全文字'
      ];
      const rows = contacts.map(c => [
        c.name || '', c.company || '', c.title || '', c.phone || '', c.mobile || '', c.address || '', c.email || '',
        c.company2 || '', c.title2 || '', c.phone2 || '', c.mobile2 || '', c.address2 || '', c.email2 || '',
        c.industry || '其它', c.note || '', c.fullText || ''
      ]);
      
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "人脈資料");
      XLSX.writeFile(wb, `名片王_Pro_匯出_${new Date().toLocaleDateString()}.xlsx`);
      
      showNotification("匯出成功！");
    } catch (error) {
      setDbError(error.message);
    }
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file || !user || !db) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsLoadingDB(true);
        const XLSX = await loadXLSX();

        if (!XLSX) {
            throw new Error("無法載入 Excel 處理模組，請檢查網路連線。");
        }

        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 將表格轉換為二維陣列 (header: 1 代表輸出純陣列)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rows.length < 2) {
          setIsLoadingDB(false);
          e.target.value = '';
          return;
        }

        let count = 0;
        
        // 從第 1 列開始跑迴圈（略過第 0 列標題）
        for (let i = 1; i < rows.length; i++) {
          const v = rows[i];
          if (!v || !v[0]) continue; // 略過沒有姓名的空白列
          
          const id = String(Date.now() + Math.random());
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', id), {
            id, 
            name: v[0] || '', company: v[1] || '', title: v[2] || '', phone: v[3] || '', mobile: v[4] || '', address: v[5] || '', email: v[6] || '',
            company2: v[7] || '', title2: v[8] || '', phone2: v[9] || '', mobile2: v[10] || '', address2: v[11] || '', email2: v[12] || '',
            industry: getValidIndustry(v[13]), note: v[14] || '', fullText: v[15] || ''
          });
          count++;
        }
        showNotification(`成功匯入 ${count} 筆資料！`);
      } catch (err) { 
        setDbError(`匯入失敗: ${err.message}`); 
      } finally { 
        setIsLoadingDB(false); 
        e.target.value = ''; 
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 🌟 優化：批次掃描精簡 Prompt 與開啟 json 模式
  const handleBatchScan = async (file, defaultIndustry) => {
    if (!file || !user || !db) return;
    setIsBatchScanning(true);
    setDbError(null);
    try {
      const base64Data = await compressImage(file);
      
      // 精簡英文 Prompt (加入 fullText 並要求保留換行)
      const prompt = `Extract all business cards from image. Return a JSON array of objects with exact keys: name, company, title, phone, mobile, address, email, company2, title2, phone2, mobile2, address2, email2, industry, fullText. For fullText, capture all raw text exactly as printed, preserving original layout and newlines using '\\n'. Use "" for missing fields. No markdown formatting.`;
      
      const payload = { 
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }] }],
        // 強制 JSON 模式 (防廢話)
        generationConfig: {
          responseMimeType: "application/json",
        }
      };
      
      const result = await callGeminiWithRetry(payload);
      const extracted = JSON.parse(cleanJsonResponse(result.candidates[0].content.parts[0].text));
      
      for (const card of extracted) {
        const id = String(Date.now() + Math.random());
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', id), { 
          ...card, id, industry: defaultIndustry === '自動判定' ? getValidIndustry(card.industry) : defaultIndustry 
        });
      }
      showNotification("批次辨識完成！");
      setIsBatchModalOpen(false);
    } catch (error) { setDbError(`辨識失敗: ${getDetailedError(error.status, error.message)}`); }
    finally { setIsBatchScanning(false); }
  };

  if (isLoadingDB) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 -right-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl"></div>
        </div>
        <div className="z-10 flex flex-col items-center animate-in fade-in duration-700">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-[2rem] shadow-2xl mb-8 relative">
            <div className="absolute inset-0 bg-white/20 rounded-[2rem] blur-xl -z-10 animate-pulse"></div>
            <img 
              src="/logo.png" 
              alt="App Logo" 
              className="w-20 h-20 object-contain drop-shadow-xl transform hover:scale-110 transition-transform" 
            />
          </div>
          <h1 className="text-4xl font-black text-white tracking-widest mb-3">名片王 <span className="text-blue-400">Pro</span></h1>
          <p className="text-slate-400 text-sm font-medium tracking-widest mb-16 uppercase">數位人脈管理系統</p>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-blue-500/80 text-xs font-bold tracking-widest animate-pulse">載入資料中...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[250] md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed md:relative z-[300] inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl md:shadow-xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg">
              <img 
                src="/logo.png" 
                alt="App Logo" 
                className="w-6 h-6 object-contain" 
              />
            </div>
            <h1 className="text-xl font-bold text-white tracking-wide">名片王 Pro</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-slate-400 hover:text-white rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <button onClick={() => { setSelectedIndustry('全部'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${selectedIndustry === '全部' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /><span>全部人脈</span>
          </button>
          {INDUSTRIES.slice(1).map(ind => (
            <button key={ind} onClick={() => { setSelectedIndustry(ind); setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors ${selectedIndustry === ind ? 'bg-slate-800 text-white shadow-sm' : 'hover:bg-slate-800/50'}`}>
              <span>{ind}</span>
              <span className="bg-slate-700/50 text-[10px] px-2 py-0.5 rounded-full">{contacts.filter(c => (c.industry || '其它') === ind).length}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 text-xs flex flex-col gap-3">
          <div className="flex items-center gap-2 text-slate-400 truncate bg-slate-800/50 p-2 rounded-lg">
            <div className={`w-2 h-2 rounded-full ${user && !user.isAnonymous ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
            <span className="truncate font-medium">{user?.email || '訪客模式'}</span>
          </div>
          {user?.isAnonymous ? (
            <button onClick={handleGoogleLogin} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 transition-colors">Google 登入</button>
          ) : (
            <button onClick={handleLogout} className="w-full py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">登出</button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative w-full">
        {dbError && (
          <div className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white px-6 py-4 text-sm flex items-center justify-between shadow-xl animate-in slide-in-from-top">
            <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" /><span>{String(dbError)}</span></div>
            <X className="w-5 h-5 cursor-pointer" onClick={() => setDbError(null)} />
          </div>
        )}
        {notification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce font-medium">
            <Check className="w-4 h-4" />{notification}
          </div>
        )}

        <header className="bg-white border-b px-4 py-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm z-10">
          <div className="flex w-full md:w-auto md:max-w-md items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-full flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="搜尋姓名、公司、產業..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={exportToExcel} className="flex-1 md:flex-none bg-white border text-gray-600 px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"><Download className="w-4 h-4"/>匯出</button>
            <label className="flex-1 md:flex-none bg-white border text-gray-600 px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-all cursor-pointer">
              <Upload className="w-4 h-4"/>匯入
              <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} className="hidden" />
            </label>
            <button onClick={() => setIsBatchModalOpen(true)} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:bg-emerald-700 transition-all"><Layers className="w-4 h-4"/>批次</button>
            <button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:bg-blue-700 transition-all"><Plus className="w-4 h-4"/>新增</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredContacts.map(contact => (
              <div key={contact.id} className="group relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg transition-all transform hover:-translate-y-1">
                <div className={`rounded-xl bg-gradient-to-br ${INDUSTRY_COLORS[contact.industry] || 'from-gray-700 to-gray-900'} p-5 text-white h-44 flex flex-col justify-between mb-4 shadow-sm relative overflow-hidden`}>
                  <div className="absolute -right-4 -bottom-4 opacity-10"><Building2 className="w-24 h-24" /></div>
                  <div className="z-10">
                    <div className="text-[10px] font-bold opacity-80 truncate uppercase tracking-widest">{contact.company || '未知公司'}</div>
                    {contact.company2 && <div className="text-[9px] opacity-60 truncate mt-0.5">& {contact.company2}</div>}
                  </div>
                  <div className="z-10">
                    <div className="text-xl font-black truncate">{contact.name || '未命名'}</div>
                    <div className="text-[10px] opacity-80 truncate font-medium mt-1">{contact.title || '無職稱'}</div>
                  </div>
                </div>
                <div className="space-y-2 text-[11px] text-gray-500 font-medium px-1">
                  <div className="flex items-center gap-2 truncate"><Phone className="w-3.5 h-3.5 text-blue-500" />{contact.phone || contact.mobile || '無號碼'}</div>
                  <div className="flex items-center gap-2 truncate"><Mail className="w-3.5 h-3.5 text-blue-500" />{contact.email || '無電子信箱'}</div>
                  <div className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" /><span className="line-clamp-1">{contact.address || '無地址資訊'}</span></div>
                </div>
                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button onClick={() => { setEditingContact(contact); setIsModalOpen(true); }} className="bg-white/90 text-blue-600 p-2 rounded-full shadow-md hover:bg-white"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(contact.id)} className="bg-white/90 text-red-600 p-2 rounded-full shadow-md hover:bg-white"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          {filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
              <ScanFace className="w-16 h-16 opacity-10 mb-4" />
              <p className="font-medium">找不到符合條件的名片</p>
            </div>
          )}
        </div>
      </main>

      {isModalOpen && <ContactModal contact={editingContact} onClose={() => { setIsModalOpen(false); setEditingContact(null); }} onSave={handleSaveContact} setDbError={setDbError} user={user} appId={appId} storage={storage} />}
      {isBatchModalOpen && <BatchScanModal onClose={() => setIsBatchModalOpen(false)} onScan={handleBatchScan} isScanning={isBatchScanning} />}
    </div>
  );
}

function ContactModal({ contact, onClose, onSave, setDbError, user, appId, storage }) {
  const [formData, setFormData] = useState(contact || {
    name: '', company: '', title: '', phone: '', mobile: '', address: '', email: '',
    company2: '', title2: '', phone2: '', mobile2: '', address2: '', email2: '',
    industry: '其它', note: '', fullText: '', photoUrl: ''
  });
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const fileInputRef = useRef(null);

  // 🌟 優化：單張掃描精簡 Prompt 與開啟 json 模式
  const handleOcr = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsOcrLoading(true);
    setOcrStatus('正在準備辨識...');
    try {
      const base64Data = await compressImage(file);
      setOcrStatus('AI 正在讀取資訊...');
      
      // 精簡英文 Prompt (加入 fullText 並要求保留換行)
      const prompt = `Extract business card info into JSON with exact keys: name, company, title, phone, mobile, address, email, company2, title2, phone2, mobile2, address2, email2, fullText. For fullText, capture all raw text exactly as printed, preserving original layout and newlines using '\\n'. Return empty string "" for missing fields. Do not include markdown.`;
      
      const payload = { 
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }] }],
        // 強制 JSON 模式
        generationConfig: {
          responseMimeType: "application/json",
        }
      };
      
      const result = await callGeminiWithRetry(payload);
      const data = JSON.parse(cleanJsonResponse(result.candidates[0].content.parts[0].text));
      
      let uploadedPhotoUrl = formData.photoUrl;
      if (user && storage) {
        setOcrStatus('正在存檔圖片 (超時將自動略過)...');
        try {
          const imageRef = ref(storage, `artifacts/${appId}/users/${user.uid}/images/${Date.now()}.jpg`);
          await Promise.race([
            uploadString(imageRef, base64Data, 'base64'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('儲存圖片超時，跳過存檔程序')), 5000))
          ]);
          uploadedPhotoUrl = await getDownloadURL(imageRef);
        } catch (storageErr) {
          console.warn('圖片上傳失敗或超時，已保留文字並略過圖片:', storageErr.message);
        }
      }
      setFormData(prev => ({ ...prev, ...data, photoUrl: uploadedPhotoUrl }));
      setOcrStatus('辨識成功！');
    } catch (err) { 
      setDbError(getDetailedError(err.status, err.message)); 
    } finally { 
      setIsOcrLoading(false); 
      setOcrStatus(''); 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-800">{contact ? '編輯名片' : '新增名片'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-8">
          {!contact && (
            <div className="space-y-2">
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleOcr} className="hidden" />
              <button onClick={() => fileInputRef.current.click()} disabled={isOcrLoading} className="w-full py-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center bg-gray-50 hover:bg-blue-50 transition-all group">
                {isOcrLoading ? (
                  <><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-2" /><p className="text-blue-600 font-bold">{ocrStatus}</p></>
                ) : (
                  <><UploadCloud className="w-10 h-10 text-blue-400 mb-2 group-hover:scale-110 transition-transform" /><p className="text-gray-600 font-bold">上傳照片 AI 自動填表</p></>
                )}
              </button>
            </div>
          )}
          
          <form id="contactForm" onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2 flex items-center gap-2 text-blue-600 font-bold border-b pb-1 text-sm"><Users className="w-4 h-4"/>基本資料</div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">姓名 *</label>
                <input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="姓名" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">公司 *</label>
                <input required value={formData.company || ''} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="公司名稱" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">職稱</label>
                <input value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="職稱" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">電話</label>
                <input value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="公司電話" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">手機</label>
                <input value={formData.mobile || ''} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="個人手機" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">公司地址</label>
                <input value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="詳細地址" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">電子信箱</label>
                <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="電子信箱" />
              </div>

              <div className="col-span-2 flex items-center gap-2 text-emerald-600 font-bold border-b pb-1 mt-4 text-sm"><Briefcase className="w-4 h-4"/>公司 2</div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">公司 2 名稱</label>
                <input value={formData.company2 || ''} onChange={e => setFormData({...formData, company2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二間公司名稱" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">職稱 2</label>
                <input value={formData.title2 || ''} onChange={e => setFormData({...formData, title2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二公司職稱" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">電話 2</label>
                <input value={formData.phone2 || ''} onChange={e => setFormData({...formData, phone2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二公司電話" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">手機 2</label>
                <input value={formData.mobile2 || ''} onChange={e => setFormData({...formData, mobile2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二公司手機" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">地址 2</label>
                <input value={formData.address2 || ''} onChange={e => setFormData({...formData, address2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二公司地址" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">電子信箱 2</label>
                <input type="email" value={formData.email2 || ''} onChange={e => setFormData({...formData, email2: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="第二公司電子信箱" />
              </div>

              <div className="col-span-2 flex items-center gap-2 text-gray-600 font-bold border-b pb-1 mt-4 text-sm"><FileText className="w-4 h-4"/>分類與備註</div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">名片全文字</label>
                <textarea rows="5" value={formData.fullText || ''} onChange={e => setFormData({...formData, fullText: e.target.value})} className="w-full px-4 py-2 bg-yellow-50 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-yellow-400 outline-none resize-none text-xs whitespace-pre-wrap" placeholder="AI 辨識出的名片原始完整文字..." />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">產業分類</label>
                <select value={formData.industry || '其它'} onChange={e => setFormData({...formData, industry: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl bg-white outline-none">
                  {INDUSTRIES.filter(i => i !== '全部').map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">備註</label>
                <textarea rows="3" value={formData.note || ''} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="補充資訊..." />
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 bg-gray-50 border-t flex justify-end gap-3 shadow-inner">
          <button onClick={onClose} className="px-6 py-2 text-gray-500 text-sm font-bold hover:bg-gray-200 rounded-xl transition-all">取消</button>
          <button type="submit" form="contactForm" className="px-10 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all">儲存名片</button>
        </div>
      </div>
    </div>
  );
}

function BatchScanModal({ onClose, onScan, isScanning }) {
  const [ind, setInd] = useState('自動判定');
  const fileInput = useRef(null);
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-xl text-gray-800">批次名片掃描</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-6">
          <select value={ind} onChange={e => setInd(e.target.value)} className="w-full px-4 py-3 border rounded-xl bg-gray-50 outline-none">
            <option value="自動判定">🤖 AI 自動判定分類</option>
            {INDUSTRIES.filter(i => i !== '全部').map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <input type="file" ref={fileInput} onChange={e => onScan(e.target.files[0], ind)} className="hidden" />
          <button onClick={() => fileInput.current.click()} disabled={isScanning} className="w-full py-16 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center bg-gray-50 hover:bg-emerald-50 transition-all">
            {isScanning ? (
              <><Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-2" /><p className="text-emerald-600 font-bold">AI 批次辨識中...</p></>
            ) : (
              <><Layers className="w-10 h-10 text-emerald-400 mb-2" /><p className="text-gray-600 font-bold">選取含多張名片之照片</p></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}