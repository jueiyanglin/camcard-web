"use client"; // 這告訴 Next.js 這是一個前端互動元件

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
 Search, Plus, Building2, Phone, Mail, Briefcase,
 Filter, Edit2, Trash2, X, ScanFace, Users, MapPin, UploadCloud, Loader2, Bot, Sparkles, Copy, Check, Smartphone, AlertTriangle, Database, Layers, Download, Upload, Image as ImageIcon, LogOut
} from 'lucide-react';


// --- Firebase 雲端資料庫安全初始化 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';


// 【部署必看】請將此處替換為您真實的 Firebase 專案設定
const fallbackConfig = {
 apiKey: "AIzaSyANFxwo3cqAJmuxz59wvTOiFCZZFobFmzk",
 authDomain: "camcard-web.firebaseapp.com",
 projectId: "camcard-web",
 storageBucket: "camcard-web.firebasestorage.app",
 messagingSenderId: "894143261550",
 appId: "1:894143261550:web:a9f86cb9de16fae7b86f7f"
};


const firebaseConfig = (typeof window !== 'undefined' && window.__firebase_config)
 ? JSON.parse(window.__firebase_config)
 : fallbackConfig;


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const USE_BACKEND_API = true;

// 確保即使 window 存在，但 __app_id 未定義時，也能正確套用 fallback
const rawAppId = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'camcard-web';
const appId = rawAppId.replace(/\//g, '_');


// --- Gemini API 設定 ---
// ⚠️ 注意：在此環境預覽時請保持空字串 ""。若要部署至 GitHub Pages，請務必填入您真正的 Gemini API Key！
//const apiKey = process.env.REACT_APP_GEMINI_API_KEY;


const isCanvasEnv = typeof window !== 'undefined' && window.__firebase_config;


// 自動模型降級機制 (Model Fallback)：
// 避免部分 API Key 的權限無法使用最新模型，系統將自動依序嘗試可用的 AI 視覺模型。
const MODELS_TO_TRY = isCanvasEnv
 ? ["gemini-2.5-flash-preview-09-2025"]
 : ["gemini-1.5-flash", "gemini-2.5-flash",  "gemini-2.5-flash-latest"];


const INDUSTRIES = ['全部', '中鋼集團', '中鋼客戶', '型鋼客戶', '鋼鐵同業', '協力商', '供應商', '政府及地方', '休閒娛樂', '金融', '其它'];


const INDUSTRY_COLORS = {
 '中鋼集團': 'from-blue-700 to-blue-900',
 '中鋼客戶': 'from-sky-700 to-sky-900',
 '型鋼客戶': 'from-cyan-700 to-cyan-900',
 '鋼鐵同業': 'from-zinc-700 to-zinc-900',
 '協力商': 'from-emerald-700 to-emerald-900',
 '供應商': 'from-teal-700 to-teal-900',
 '政府及地方': 'from-amber-700 to-amber-900',
 '休閒娛樂': 'from-rose-700 to-rose-900',
 '金融': 'from-purple-700 to-purple-900',
 '其它': 'from-indigo-700 to-indigo-900'
};


const API_ERROR_MESSAGES = {
 400: "【請求無效】可能 API 金鑰不正確，或圖片格式不符。",
 403: "【權限拒絕】API 金鑰無效或受限。若部署於 GitHub，請檢查程式碼中是否已填寫真實金鑰。",
 404: "【模型不存在】指定的 AI 模型名稱錯誤，請確認金鑰對應的專案是否支援該模型。",
 429: "【頻率受限】請求次數過於頻繁（超過免費額度），請稍候 1 分鐘。",
 500: "【伺服器錯誤】Google AI 系統異常，請稍後再試。",
 503: "【服務忙碌】AI 伺服器目前無法負擔請求，請稍後重試。",
 'UNRECOGNIZED': "【辨識失敗】無法在圖片中提取有效名片資訊。請確認圖片清晰且無嚴重反光。",
 'UNKNOWN': "【未知錯誤】發生了未預期的通訊問題。"
};


const getDetailedError = (status, serverMsg = "") => {
 if (status === null) {
   return API_ERROR_MESSAGES[serverMsg] || API_ERROR_MESSAGES['UNKNOWN'];
 }
 const baseMsg = API_ERROR_MESSAGES[status] || API_ERROR_MESSAGES['UNKNOWN'];
 const detail = serverMsg ? ` 細節: ${serverMsg}` : "";
 return `${baseMsg} (代碼: ${status || '無'}${detail})`;
};

async function callGeminiWithRetry(payload, retries = 3) {
 let lastError;
 for (const model of MODELS_TO_TRY) {
   for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); 

     try {
       const fullPayload = {
         ...payload,
         model: `models/${model}`
       };

      // 【關鍵修改】改為呼叫自己的 API，並且不需要帶上 API Key 了！
      const response = await fetch(`/api/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
        signal: controller.signal
      });

       if (!response.ok) {
         const errorData = await response.json().catch(() => ({}));
         const error = new Error(errorData.error?.message || "網路請求失敗");
         error.status = response.status;
        
         if (response.status === 404 || response.status === 400) {
           throw { type: 'MODEL_NOT_FOUND', error };
         }
         throw error;
       }
      
       return await response.json();
     } catch (err) {
       if (err.type === 'MODEL_NOT_FOUND') {
         lastError = err.error;
         break; // 換下一個 model
       }
      
       lastError = err;
       const retryableStatuses = [429, 500, 502, 503, 504];
       if (i === retries - 1 || !retryableStatuses.includes(err.status)) {
         throw err;
       }
       const delay = Math.pow(2, i) * 1000;
       await new Promise(resolve => setTimeout(resolve, delay));
     }
   }
 }
 throw lastError;
}


function cleanJsonResponse(text) {
 if (!text) return "{}";
 const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
 return match ? match[0] : text;
}


export default function BusinessCardApp() {
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


 const importCsvRef = useRef(null);


 const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
 const [draftingContact, setDraftingContact] = useState(null);
 const [emailDraft, setEmailDraft] = useState('');
 const [isDrafting, setIsDrafting] = useState(false);
 const [copied, setCopied] = useState(false);


 const handleGoogleLogin = async () => {
   try {
     const provider = new GoogleAuthProvider();
     await signInWithPopup(auth, provider);
     setNotification("Google 登入成功，資料已跨裝置同步！");
     setTimeout(() => setNotification(null), 3000);
   } catch (error) {
     setDbError(`Google 登入失敗: ${error.message}`);
   }
 };


 const handleLogout = async () => {
   try {
     await signOut(auth);
     // 登出後自動切換回訪客模式，維持網頁基本運作
     await signInAnonymously(auth);
     setNotification("已登出，目前為訪客模式");
     setTimeout(() => setNotification(null), 3000);
   } catch (error) {
     setDbError(`登出失敗: ${error.message}`);
   }
 };


 useEffect(() => {
   const initAuth = async () => {
     try {
       // 先檢查目前是否已經有登入狀態（例如從快取回來的 Google 帳號）
       // 如果沒有登入狀態，才嘗試匿名登入
       onAuthStateChanged(auth, async (currentUser) => {
         if (currentUser) {
           setUser(currentUser);
         } else {
           try {
             await signInAnonymously(auth);
           } catch (error) {
             // 如果匿名登入真的被限制了，我們在這邊捕捉它但不讓它當機
             console.warn("匿名登入受限，請點擊 Google 登入以使用功能");
             setDbError("目前為唯讀模式，請登入 Google 帳號以存取您的名片庫。");
           }
         }
       });
     } catch (error) {
       setDbError(`認證系統初始化失敗: ${error.message}`);
       setIsLoadingDB(false);
     }
   };
  
   initAuth();
 }, []);
  


 useEffect(() => {
   if (!user) return;
  
   const contactsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'contacts');
   const unsubscribe = onSnapshot(contactsRef, (snapshot) => {
     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
     data.sort((a, b) => Number(b.id) - Number(a.id));
     setContacts(data);
     setIsLoadingDB(false);
   }, (error) => {
     setDbError(`無法讀取資料: ${error.message}`);
     setIsLoadingDB(false);
   });
   return () => unsubscribe();
 }, [user]);


 const filteredContacts = useMemo(() => {
   return contacts.filter(contact => {
     const name = String(contact.name || '').toLowerCase();
     const company = String(contact.company || '').toLowerCase();
     const company2 = String(contact.company2 || '').toLowerCase();
     const title = String(contact.title || '').toLowerCase();
     const search = searchTerm.toLowerCase();


     const matchSearch = name.includes(search) || company.includes(search) || company2.includes(search) || title.includes(search);
     const matchIndustry = selectedIndustry === '全部' || (contact.industry || '其它') === selectedIndustry;
     return matchSearch && matchIndustry;
   });
 }, [contacts, searchTerm, selectedIndustry]);


 const showNotification = (msg) => {
   setNotification(msg);
   setTimeout(() => setNotification(null), 3000);
 };


 const handleSaveContact = async (formData) => {
   if (!user) return;
   try {
     const contactId = editingContact?.id || String(Date.now());
     const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId);
     await setDoc(docRef, { ...formData, id: contactId });
     setIsModalOpen(false);
     setEditingContact(null);
     showNotification("儲存成功！");
   } catch (error) {
     setDbError(`儲存失敗: ${error.message}`);
   }
 };


 const handleDelete = async (id) => {
   if (!user) return;
   try {
     await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', String(id)));
     showNotification("名片已刪除");
   } catch (error) {
     setDbError(`刪除失敗: ${error.message}`);
   }
 };


 const copyToClipboard = () => {
   if (!emailDraft) return;
   try {
     navigator.clipboard.writeText(emailDraft);
     setCopied(true);
     setTimeout(() => setCopied(false), 2000);
   } catch (err) {
     const textArea = document.createElement("textarea");
     textArea.value = emailDraft;
     document.body.appendChild(textArea);
     textArea.select();
     document.execCommand('copy');
     document.body.removeChild(textArea);
     setCopied(true);
     setTimeout(() => setCopied(false), 2000);
   }
 };


 const exportToCSV = () => {
   if (contacts.length === 0) return;
   const headers = ['姓名', '職稱', '電子信箱', '公司名稱', '公司電話', '分機', '手機', '公司地址', '公司名稱2', '公司電話2', '分機2', '手機2', '公司地址2', '產業分類', '備註', '名片全文字', '照片網址'];
   const rows = contacts.map(c => [
     c.name || '', c.title || '', c.email || '',
     c.company || '', c.phone || '', c.extension || '', c.mobile || '', c.address || '',
     c.company2 || '', c.phone2 || '', c.extension2 || '', c.mobile2 || '', c.address2 || '',
     c.industry || '', c.note || '', c.fullText || '', c.photoUrl || ''
   ]);
   const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))].join('\n');
   const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = `名片王_匯出_${new Date().toLocaleDateString()}.csv`;
   link.click();
   URL.revokeObjectURL(url);
 };


 const importFromCSV = (e) => {
   const file = e.target.files[0];
   if (!file || !user) return;
   const reader = new FileReader();
   reader.onload = async (event) => {
     try {
       setIsLoadingDB(true);
       const text = event.target.result;
       const rows = text.split('\n').map(row => row.split(',').map(cell => cell.replace(/^"|"$/g, '').trim()));
       if (rows.length < 2) return;
      
       let count = 0;
       for (let i = 1; i < rows.length; i++) {
         if (!rows[i][0]) continue;
         const contactId = String(Date.now() + i);
         await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId), {
           name: rows[i][0], title: rows[i][1], email: rows[i][2],
           company: rows[i][3], phone: rows[i][4], extension: rows[i][5], mobile: rows[i][6], address: rows[i][7],
           company2: rows[i][8], phone2: rows[i][9], extension2: rows[i][10], mobile2: rows[i][11], address2: rows[i][12],
           industry: INDUSTRIES.includes(rows[i][13]) ? rows[i][13] : '其它',
           note: rows[i][14] || '', fullText: rows[i][15] || '', photoUrl: rows[i][16] || '', id: contactId
         });
         count++;
       }
       showNotification(`成功匯入 ${count} 筆資料！`);
     } catch (err) {
       setDbError("匯入失敗，請確認 CSV 格式。");
     } finally {
       setIsLoadingDB(false);
     }
   };
   reader.readAsText(file);
   e.target.value = '';
 };


 const handleBatchScan = async (file, defaultIndustry) => {
   if (!file || !user) return;
   setIsBatchScanning(true);
   setDbError(null);
   try {
     const base64Data = await new Promise((resolve) => {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = () => resolve(reader.result.split(',')[1]);
     });


     const prompt = `請辨識圖片中所有的名片。回傳 JSON 陣列，每個物件包含以下欄位：name, title, email, company, address, phone, extension, mobile, company2, address2, phone2, extension2, mobile2, industry, fullText(名片上所有文字)。
     其中 industry 必須是：中鋼集團, 中鋼客戶, 型鋼客戶, 鋼鐵同業, 協力商, 供應商, 政府及地方, 休閒娛樂, 金融, 其它 之一。
     如果有第二家公司或職務，請填入結尾帶2的欄位。
     如果完全無法辨識或非文字圖片，請直接回傳空陣列 []。`;
    
     const payload = {
       contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
       generationConfig: {
         responseMimeType: "application/json",
         responseSchema: {
           type: "ARRAY", items: { type: "OBJECT", properties: {
             name: { type: "STRING" }, title: { type: "STRING" }, email: { type: "STRING" },
             company: { type: "STRING" }, address: { type: "STRING" }, phone: { type: "STRING" }, extension: { type: "STRING" }, mobile: { type: "STRING" },
             company2: { type: "STRING" }, address2: { type: "STRING" }, phone2: { type: "STRING" }, extension2: { type: "STRING" }, mobile2: { type: "STRING" },
             industry: { type: "STRING" }, fullText: { type: "STRING" }
           }}
         }
       }
     };


     const result = await callGeminiWithRetry(payload);
     const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
     const extracted = JSON.parse(cleanJsonResponse(textResponse));


     if (!Array.isArray(extracted) || extracted.length === 0) {
       const error = new Error("UNRECOGNIZED");
       error.isCustom = true;
       throw error;
     }


     let successCount = 0;
     for (const card of extracted) {
       if (!card.name && !card.company) continue;
       const id = String(Date.now() + Math.random());
       const ind = defaultIndustry === '自動判定' ? (INDUSTRIES.includes(card.industry) ? card.industry : '其它') : defaultIndustry;
       await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', id), { ...card, id, industry: ind });
       successCount++;
     }


     if (successCount === 0) {
       const error = new Error("UNRECOGNIZED");
       error.isCustom = true;
       throw error;
     }


     showNotification(`批次辨識成功！已匯入 ${successCount} 筆名片。`);
     setIsBatchModalOpen(false);
   } catch (error) {
     const errorMsg = error.isCustom ? getDetailedError(null, error.message) : getDetailedError(error.status, error.message);
     setDbError(`辨識失敗：${errorMsg}`);
   } finally {
     setIsBatchScanning(false);
   }
 };


 const handleGenerateEmail = async (contact) => {
   setDraftingContact(contact); setIsEmailModalOpen(true); setIsDrafting(true);
   setDbError(null);
   try {
     const prompt = `撰寫一封專業商務問候信給 ${contact.name} (${contact.title}, ${contact.company})。請使用繁體中文。`;
     const payload = { contents: [{ parts: [{ text: prompt }] }] };
     const result = await callGeminiWithRetry(payload);
     setEmailDraft(result.candidates[0].content.parts[0].text);
   } catch (error) {
     const errorMsg = getDetailedError(error.status, error.message);
     setEmailDraft(`擬稿失敗：${errorMsg}`);
   } finally {
     setIsDrafting(false);
   }
 };


 if (isLoadingDB) return <div className="flex items-center justify-center h-screen bg-slate-900"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;


 return (
   <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
     <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex shadow-xl z-10">
       <div className="p-6 flex items-center gap-3 border-b border-slate-800">
         <div className="bg-blue-600 p-2 rounded-lg"><ScanFace className="text-white w-6 h-6" /></div>
         <h1 className="text-xl font-bold text-white tracking-wide">名片王 Pro</h1>
       </div>
       <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
         <button onClick={() => setSelectedIndustry('全部')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${selectedIndustry === '全部' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>
           <Users className="w-5 h-5" /><span>全部人脈</span>
         </button>
         <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase">產業分類</div>
         {INDUSTRIES.slice(1).map(ind => (
           <button key={ind} onClick={() => setSelectedIndustry(ind)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors text-sm ${selectedIndustry === ind ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50'}`}>
             <span className="truncate pr-2">{ind}</span>
             <span className="bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">{contacts.filter(c => (c.industry || '其它') === ind).length}</span>
           </button>
         ))}
       </nav>
       <div className="p-4 border-t border-slate-800 text-xs flex flex-col gap-3">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-2 text-slate-400">
             <div className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
             {user?.isAnonymous ? '訪客模式' : <span className="truncate max-w-[150px] font-medium text-emerald-400">{user?.email || '已登入帳戶'}</span>}
           </div>
         </div>
         {user?.isAnonymous ? (
           <button onClick={handleGoogleLogin} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md">
             <svg className="w-4 h-4" viewBox="0 0 24 24">
               <path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" />
             </svg>
             Google 登入同步
           </button>
         ) : (
           <button onClick={handleLogout} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2">
             <LogOut className="w-4 h-4" /> 登出帳號
           </button>
         )}
       </div>
     </aside>


     <main className="flex-1 flex flex-col h-full overflow-hidden relative">
       {dbError && (
         <div className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white px-6 py-4 text-sm flex items-start justify-center gap-3 shadow-2xl animate-in slide-in-from-top">
           <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
           <div className="flex-1 font-medium leading-relaxed">{String(dbError)}</div>
           <button onClick={() => setDbError(null)} className="hover:bg-white/20 p-1 rounded transition-colors"><X className="w-5 h-5" /></button>
         </div>
       )}
       {notification && (
         <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-full flex items-center gap-2 shadow-xl animate-in fade-in slide-in-from-top-5">
           <Check className="w-5 h-5" /><span>{String(notification)}</span>
         </div>
       )}


       <header className="bg-white border-b px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm z-10">
         <div className="relative w-full max-w-md">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
           <input type="text" placeholder="搜尋姓名、公司..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none transition-all" />
         </div>
        
         <div className="flex items-center gap-3 w-full sm:w-auto">
           <button onClick={exportToCSV} title="匯出 CSV" className="p-2.5 bg-white border rounded-xl hover:bg-gray-50"><Download className="w-5 h-5" /></button>
           <input type="file" accept=".csv" ref={importCsvRef} onChange={importFromCSV} className="hidden" />
           <button onClick={() => importCsvRef.current?.click()} title="匯入 CSV" className="p-2.5 bg-white border rounded-xl hover:bg-gray-50"><Upload className="w-5 h-5" /></button>
           <button onClick={() => setIsBatchModalOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-all active:scale-95">
             <Layers className="w-5 h-5" /><span>批次掃描</span>
           </button>
           <button onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-all active:scale-95">
             <Plus className="w-5 h-5" /><span>新增</span>
           </button>
         </div>
       </header>


       <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-gray-50/50">
         {filteredContacts.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-64 text-gray-400 border border-dashed border-gray-200 rounded-3xl mt-10">
             <ScanFace className="w-12 h-12 mb-2 opacity-50" />
             <p>查無聯絡人資料</p>
           </div>
         ) : (
           <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
             {filteredContacts.map(contact => {
               const color = INDUSTRY_COLORS[contact.industry] || INDUSTRY_COLORS['其它'];
               return (
                 <div key={contact.id} className="group relative bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 hover:shadow-lg transition-all">
                   <div className={`rounded-xl bg-gradient-to-br ${color} p-6 text-white h-44 flex flex-col justify-between`}>
                     <div className="flex justify-between items-start">
                       <div className="font-bold text-lg opacity-90 line-clamp-1">{String(contact.company || '')}</div>
                       <div className="flex gap-2 items-center">
                         {contact.photoUrl && <ImageIcon className="w-4 h-4 text-white/80" title="附有照片" />}
                         <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] uppercase">{String(contact.industry || '其它')}</span>
                       </div>
                     </div>
                     <div>
                       <h2 className="text-2xl font-black">{String(contact.name || '')}</h2>
                       <p className="text-sm opacity-80">{String(contact.title || '')}</p>
                     </div>
                   </div>
                   <div className="p-4 space-y-1 text-sm text-gray-600">
                     <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" />{String(contact.phone || '')} {contact.extension && `(分機 ${contact.extension})`}</div>
                     <div className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-gray-400" />{String(contact.mobile || '')}</div>
                     <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{String(contact.email || '')}</div>
                     {contact.company2 && <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 text-emerald-600 font-medium"><Briefcase className="w-4 h-4" />{String(contact.company2)}</div>}
                   </div>
                   <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                     <button onClick={() => handleGenerateEmail(contact)} className="bg-white/90 text-purple-600 p-2 rounded-full shadow-md"><Bot className="w-4 h-4" /></button>
                     <button onClick={() => { setEditingContact(contact); setIsModalOpen(true); }} className="bg-white/90 text-blue-600 p-2 rounded-full shadow-md"><Edit2 className="w-4 h-4" /></button>
                     <button onClick={() => handleDelete(contact.id)} className="bg-white/90 text-red-600 p-2 rounded-full shadow-md"><Trash2 className="w-4 h-4" /></button>
                   </div>
                 </div>
               )
             })}
           </div>
         )}
       </div>
     </main>


     {isModalOpen && <ContactModal contact={editingContact} onClose={() => { setIsModalOpen(false); setEditingContact(null); }} onSave={handleSaveContact} setDbError={setDbError} user={user} appId={appId} storage={storage} />}
     {isBatchModalOpen && <BatchScanModal onClose={() => setIsBatchModalOpen(false)} onScan={handleBatchScan} isScanning={isBatchScanning} />}
     {isEmailModalOpen && (
       <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
           <div className="bg-purple-600 p-4 text-white flex justify-between items-center">
             <h3 className="font-bold flex items-center gap-2"><Bot className="w-5 h-5" /> AI 郵件助手</h3>
             <button onClick={() => setIsEmailModalOpen(false)}><X className="w-5 h-5" /></button>
           </div>
           <div className="p-6">
             {isDrafting ? <div className="py-12 flex flex-col items-center gap-4 text-purple-600"><Loader2 className="w-8 h-8 animate-spin" /><p>AI 正在構思文案...</p></div> : <div className="bg-slate-50 p-4 rounded-xl border border-gray-200 text-gray-700 whitespace-pre-wrap min-h-[200px] max-h-[400px] overflow-y-auto">{String(emailDraft || '')}</div>}
           </div>
           <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
             <button onClick={() => setIsEmailModalOpen(false)} className="px-4 py-2 text-gray-600">取消</button>
             <button onClick={copyToClipboard} className="bg-purple-600 text-white px-6 py-2 rounded-lg flex items-center gap-2">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? '已複製' : '複製全文'}</button>
           </div>
         </div>
       </div>
     )}
   </div>
 );
}


function ContactModal({ contact, onClose, onSave, setDbError, user, appId, storage }) {
 const [formData, setFormData] = useState(contact || {
   name: '', title: '', email: '',
   company: '', address: '', phone: '', extension: '', mobile: '',
   company2: '', address2: '', phone2: '', extension2: '', mobile2: '',
   industry: '中鋼集團', note: '', fullText: '', photoUrl: ''
 });
 const [isOcrLoading, setIsOcrLoading] = useState(false);
 const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
 const fileInputRef = useRef(null);
 const photoInputRef = useRef(null);


 const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };
  const handleOcr = async (e) => {
   const file = e.target.files[0];
   if (!file) return;
   setIsOcrLoading(true);
   setDbError(null);
   try {
     const base64Data = await new Promise(resolve => {
       const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result.split(',')[1]);
     });


     const prompt = `請辨識這張名片，提取資訊。如果圖片中沒有名片、字跡太模糊無法辨識、或是非文字圖片，請直接回傳空的物件 {}。如果有第二家公司或第二個職務，請填入結尾帶2的欄位。請務必在 fullText 欄位中記錄名片上所有的文字內容。`;
     const payload = {
       contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
       generationConfig: {
         responseMimeType: "application/json",
         responseSchema: {
           type: "OBJECT", properties: {
             name: { type: "STRING" }, title: { type: "STRING" }, email: { type: "STRING" },
             company: { type: "STRING" }, address: { type: "STRING" }, phone: { type: "STRING" }, extension: { type: "STRING" }, mobile: { type: "STRING" },
             company2: { type: "STRING" }, address2: { type: "STRING" }, phone2: { type: "STRING" }, extension2: { type: "STRING" }, mobile2: { type: "STRING" },
             fullText: { type: "STRING" }
           }
         }
       }
     };
    
     const result = await callGeminiWithRetry(payload);
     const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
     const data = JSON.parse(cleanJsonResponse(rawText));
    
     if (Object.keys(data).length === 0 || (!data.name && !data.company && !data.phone && !data.email)) {
       const error = new Error("UNRECOGNIZED");
       error.isCustom = true;
       throw error;
     }


     let uploadedPhotoUrl = formData.photoUrl;
     if (user && storage) {
       try {
         const imageRef = ref(storage, `artifacts/${appId}/users/${user.uid}/images/${Date.now()}.jpg`);
         await uploadString(imageRef, base64Data, 'base64');
         uploadedPhotoUrl = await getDownloadURL(imageRef);
       } catch (storageErr) {
         console.warn("Storage upload failed, skipping image save:", storageErr);
       }
     }


     setFormData(prev => ({ ...prev, ...data, photoUrl: uploadedPhotoUrl || prev.photoUrl }));
   } catch (error) {
     const errorMsg = error.isCustom ? getDetailedError(null, error.message) : getDetailedError(error.status, error.message);
     setDbError(`單張辨識失敗：${errorMsg}`);
   } finally {
     setIsOcrLoading(false);
     if (fileInputRef.current) fileInputRef.current.value = '';
   }
 };


 const handleManualPhotoUpload = async (e) => {
   const file = e.target.files[0];
   if (!file || !user || !storage) return;
   setIsUploadingPhoto(true);
   try {
     const base64Data = await new Promise(resolve => {
       const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result.split(',')[1]);
     });
     const imageRef = ref(storage, `artifacts/${appId}/users/${user.uid}/images/manual_${Date.now()}.jpg`);
     await uploadString(imageRef, base64Data, 'base64');
     const url = await getDownloadURL(imageRef);
     setFormData(prev => ({ ...prev, photoUrl: url }));
   } catch (err) {
     setDbError(`照片上傳失敗：${err.message} (請確認 Firebase Storage 已開啟並允許寫入)`);
   } finally {
     setIsUploadingPhoto(false);
     if (photoInputRef.current) photoInputRef.current.value = '';
   }
 };


 return (
   <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
       <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
         <h3 className="font-bold text-lg text-gray-800">{contact ? '編輯名片' : '新增名片'}</h3>
         <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
       </div>
       <div className="p-6 overflow-y-auto space-y-8 bg-white">
         {!contact && (
           <div className="space-y-3">
             <label className="text-sm font-semibold text-gray-700 block flex items-center gap-2"><ScanFace className="w-4 h-4 text-blue-500"/> AI 圖片快速辨識</label>
             <input type="file" accept="image/*" ref={fileInputRef} onChange={handleOcr} className="hidden" />
             <button type="button" onClick={() => fileInputRef.current.click()} disabled={isOcrLoading} className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all ${isOcrLoading ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm'}`}>
               {isOcrLoading ? <><Loader2 className="w-8 h-8 animate-spin text-blue-600" /><p className="text-blue-600 font-medium">AI 辨識中...</p></> : <><UploadCloud className="w-8 h-8 text-blue-400" /><div className="text-center"><p className="text-gray-600 font-medium">上傳名片照片 (AI 自動填表)</p><p className="text-xs text-gray-400 mt-1">辨識成功將自動保留原圖</p></div></>}
             </button>
           </div>
         )}
        
         <form id="contactForm" onSubmit={handleSubmit} className="space-y-6">
          
           {/* 基本資料 */}
           <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
             <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 border-b pb-2"><Users className="w-4 h-4 text-blue-500"/> 基本資料</h4>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">姓名 <span className="text-red-500">*</span></label><input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">職稱</label><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">電子信箱</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
             </div>
           </div>


           {/* 公司資料一 */}
           <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-4">
             <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 border-b border-blue-200 pb-2"><Building2 className="w-4 h-4 text-blue-600"/> 主公司資料</h4>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">公司名稱 <span className="text-red-500">*</span></label><input required type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">公司地址</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">公司電話</label><input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">分機</label><input type="text" value={formData.extension} onChange={e => setFormData({...formData, extension: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">手機</label><input type="text" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" /></div>
             </div>
           </div>


           {/* 公司資料二 */}
           <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-4">
             <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 border-b border-emerald-200 pb-2"><Briefcase className="w-4 h-4 text-emerald-600"/> 第二公司 / 兼職資料 (選填)</h4>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">公司名稱 2</label><input type="text" value={formData.company2} onChange={e => setFormData({...formData, company2: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" /></div>
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">公司地址 2</label><input type="text" value={formData.address2} onChange={e => setFormData({...formData, address2: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">公司電話 2</label><input type="text" value={formData.phone2} onChange={e => setFormData({...formData, phone2: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">分機 2</label><input type="text" value={formData.extension2} onChange={e => setFormData({...formData, extension2: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" /></div>
               <div className="space-y-1.5 col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">手機 2</label><input type="text" value={formData.mobile2} onChange={e => setFormData({...formData, mobile2: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" /></div>
             </div>
           </div>


           {/* 其他資訊與照片 */}
           <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
             <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 border-b pb-2"><Database className="w-4 h-4 text-gray-500"/> 附加資訊與照片</h4>
             <div className="grid grid-cols-1 gap-4">
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">產業分類</label><select value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500">
                 {INDUSTRIES.filter(i => i !== '全部').map(ind => <option key={ind} value={ind}>{ind}</option>)}
               </select></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">備註</label><textarea rows="2" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none" /></div>
               <div className="space-y-1.5"><label className="text-xs font-bold text-gray-500 uppercase">名片全文字 (AI 自動保留原圖文字)</label><textarea rows="3" value={formData.fullText} onChange={e => setFormData({...formData, fullText: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-yellow-50 text-gray-700 outline-none focus:ring-2 focus:ring-yellow-400 resize-none text-sm" placeholder="名片上的所有文字將被記錄在此..." /></div>
              
               <div className="space-y-2 mt-2">
                 <label className="text-xs font-bold text-gray-500 uppercase">名片照片</label>
                 <input type="file" accept="image/*" ref={photoInputRef} onChange={handleManualPhotoUpload} className="hidden" />
                 {formData.photoUrl ? (
                   <div className="relative group rounded-xl overflow-hidden border border-gray-200">
                     <img src={formData.photoUrl} alt="Business Card" className="w-full h-auto max-h-64 object-contain bg-gray-100" />
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button type="button" onClick={() => photoInputRef.current.click()} className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-gray-100">更換照片</button>
                        <button type="button" onClick={() => setFormData({...formData, photoUrl: ''})} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-red-600">移除</button>
                     </div>
                   </div>
                 ) : (
                   <button type="button" onClick={() => photoInputRef.current.click()} disabled={isUploadingPhoto} className="w-full py-4 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                     {isUploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin"/> : <ImageIcon className="w-5 h-5" />}
                     <span className="text-sm font-medium">{isUploadingPhoto ? '照片上傳中...' : '手動上傳名片照片'}</span>
                   </button>
                 )}
               </div>
             </div>
           </div>


         </form>
       </div>
       <div className="p-4 bg-gray-50 border-t flex justify-end gap-3 rounded-b-3xl">
         <button onClick={onClose} className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors">取消</button>
         <button type="submit" form="contactForm" className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-medium shadow-md shadow-blue-600/20 hover:bg-blue-700 transition-colors">儲存聯絡人</button>
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
     <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
       <div className="p-6 border-b flex justify-between items-center">
         <h3 className="font-bold text-lg">批次名片掃描</h3>
         <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
       </div>
       <div className="p-6 space-y-6">
         <div className="space-y-2">
           <label className="text-sm font-semibold text-gray-600">預設分類</label>
           <select value={ind} onChange={e => setInd(e.target.value)} className="w-full px-4 py-2 border rounded-xl bg-white">
             <option value="自動判定">🤖 由 AI 自動判定</option>
             {INDUSTRIES.filter(i => i !== '全部').map(i => <option key={i} value={i}>歸類為: {i}</option>)}
           </select>
         </div>
         <input type="file" ref={fileInput} onChange={e => onScan(e.target.files[0], ind)} className="hidden" />
         <button onClick={() => fileInput.current.click()} disabled={isScanning} className={`w-full py-12 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 transition-all ${isScanning ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'}`}>
           {isScanning ? (
             <>
               <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
               <p className="text-emerald-600 font-bold">AI 批次辨識中...</p>
             </>
           ) : (
             <>
               <Layers className="w-10 h-10 text-emerald-400" />
               <div className="text-center">
                 <p className="font-bold text-slate-700">選擇照片上傳</p>
                 <p className="text-xs text-slate-400 mt-1">支援一張照片內含多張名片</p>
               </div>
             </>
           )}
         </button>
       </div>
     </div>
   </div>
 );
}

