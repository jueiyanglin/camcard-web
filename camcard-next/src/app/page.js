"use client"; 

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
 Search, Plus, Building2, Phone, Mail, Briefcase,
 Filter, Edit2, Trash2, X, ScanFace, Users, MapPin, UploadCloud, Loader2, Bot, Sparkles, Copy, Check, Smartphone, AlertTriangle, Database, Layers, Download, Upload, Image as ImageIcon, LogOut
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

// --- Firebase 初始化 ---
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

const rawAppId = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'camcard-web';
const appId = rawAppId.replace(/\//g, '_');

const isCanvasEnv = typeof window !== 'undefined' && window.__firebase_config;

const MODELS_TO_TRY = isCanvasEnv
 ? ["gemini-2.5-flash-preview-09-2025"]
 : ["gemini-2.5-flash", "gemini-3.1-flash"];

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
 400: "【請求無效】可能圖片格式不符或太大。",
 403: "【權限拒絕】請檢查 Vercel 環境變數金鑰。",
 404: "【模型不存在】API 路徑或模型名稱錯誤。",
 429: "【頻率受限】請稍候 1 分鐘再試。",
 500: "【伺服器錯誤】Vercel 或 Google 系統異常。",
 504: "【伺服器超時】辨識時間過長，請嘗試較小的圖片。",
 'UNRECOGNIZED': "【辨識失敗】無法提取資訊，請換一張清晰的照片。",
 'UNKNOWN': "【未知錯誤】連線發生異常。"
};

const getDetailedError = (status, serverMsg = "") => {
 const baseMsg = API_ERROR_MESSAGES[status] || API_ERROR_MESSAGES['UNKNOWN'];
 return `${baseMsg} (代碼: ${status || '無'} ${serverMsg})`;
};

// --- 優化的圖片壓縮函數 ---
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000; // 壓縮至 1000px 寬度，這對 OCR 來說已足夠
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
        // 使用 0.8 的品質轉為 JPEG Base64
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
    };
  });
};

async function callGeminiWithRetry(payload, retries = 2) {
  let lastError;
  for (const model of MODELS_TO_TRY) {
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒強行超時

      try {
        const fullPayload = { ...payload, targetModel: model };

        const response = await fetch(`/api/gemini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullPayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData.error?.message || errorData.error || "請求失敗");
          error.status = response.status;
          throw error;
        }
        
        return await response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        if (err.status === 404) break; // 換下一個模型
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000));
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
 const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
 const [emailDraft, setEmailDraft] = useState('');
 const [isDrafting, setIsDrafting] = useState(false);
 const [copied, setCopied] = useState(false);
 
 const importCsvRef = useRef(null);

 useEffect(() => {
   onAuthStateChanged(auth, async (currentUser) => {
     if (currentUser) {
       setUser(currentUser);
     } else {
       await signInAnonymously(auth).catch(() => setDbError("系統目前為唯讀模式"));
     }
   });
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
     setIsLoadingDB(false);
   });
   return () => unsubscribe();
 }, [user]);

 const filteredContacts = useMemo(() => {
   return contacts.filter(contact => {
     const name = String(contact.name || '').toLowerCase();
     const company = String(contact.company || '').toLowerCase();
     const search = searchTerm.toLowerCase();
     const matchSearch = name.includes(search) || company.includes(search);
     const matchIndustry = selectedIndustry === '全部' || (contact.industry || '其它') === selectedIndustry;
     return matchSearch && matchIndustry;
   });
 }, [contacts, searchTerm, selectedIndustry]);

 const handleSaveContact = async (formData) => {
   if (!user) return;
   try {
     const contactId = editingContact?.id || String(Date.now());
     const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId);
     await setDoc(docRef, { ...formData, id: contactId });
     setIsModalOpen(false);
     setEditingContact(null);
     setNotification("儲存成功！");
     setTimeout(() => setNotification(null), 3000);
   } catch (error) {
     setDbError(`儲存失敗: ${error.message}`);
   }
 };

 const handleDelete = async (id) => {
   if (!user || !window.confirm("確定刪除嗎？")) return;
   try {
     await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', String(id)));
     setNotification("已刪除");
     setTimeout(() => setNotification(null), 2000);
   } catch (error) {
     setDbError(`刪除失敗: ${error.message}`);
   }
 };

 const handleBatchScan = async (file, defaultIndustry) => {
   if (!file || !user) return;
   setIsBatchScanning(true);
   setDbError(null);
   try {
     const base64Data = await compressImage(file);
     const prompt = `請辨識圖片中所有的名片。回傳 JSON 陣列，物件欄位：name, title, email, company, address, phone, extension, mobile, industry, fullText。`;
     const payload = {
       contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }] }]
     };
     const result = await callGeminiWithRetry(payload);
     const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
     const extracted = JSON.parse(cleanJsonResponse(textResponse));
     if (extracted.length === 0) throw new Error("UNRECOGNIZED");
     
     for (const card of extracted) {
       const id = String(Date.now() + Math.random());
       await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', id), { ...card, id, industry: defaultIndustry === '自動判定' ? (card.industry || '其它') : defaultIndustry });
     }
     setNotification("批次辨識完成！");
     setIsBatchModalOpen(false);
   } catch (error) {
     setDbError(getDetailedError(error.status, error.message));
   } finally {
     setIsBatchScanning(false);
   }
 };

 if (isLoadingDB) return <div className="flex items-center justify-center h-screen bg-slate-900"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;

 return (
   <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
     {/* 側邊欄 */}
     <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex shadow-xl z-10">
       <div className="p-6 flex items-center gap-3 border-b border-slate-800">
         <div className="bg-blue-600 p-2 rounded-lg"><ScanFace className="text-white w-6 h-6" /></div>
         <h1 className="text-xl font-bold text-white">名片王 Pro</h1>
       </div>
       <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
         <button onClick={() => setSelectedIndustry('全部')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${selectedIndustry === '全部' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>
           <Users className="w-5 h-5" /><span>全部人脈</span>
         </button>
         {INDUSTRIES.slice(1).map(ind => (
           <button key={ind} onClick={() => setSelectedIndustry(ind)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm ${selectedIndustry === ind ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50'}`}>
             <span>{ind}</span>
           </button>
         ))}
       </nav>
     </aside>

     <main className="flex-1 flex flex-col h-full overflow-hidden relative">
       {dbError && (
         <div className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white px-6 py-4 text-sm flex items-center justify-between shadow-2xl">
           <div className="flex items-center gap-3"><AlertTriangle className="w-5 h-5" /><span>{dbError}</span></div>
           <button onClick={() => setDbError(null)}><X className="w-5 h-5" /></button>
         </div>
       )}
       {notification && (
         <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-full flex items-center gap-2 shadow-xl animate-bounce">
           <Check className="w-5 h-5" /><span>{notification}</span>
         </div>
       )}

       <header className="bg-white border-b px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
         <div className="relative w-full max-w-md">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
           <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl outline-none" />
         </div>
         <div className="flex gap-3">
           <button onClick={() => setIsBatchModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-md active:scale-95 transition-all"><Layers className="w-5 h-5" />批次掃描</button>
           <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-md active:scale-95 transition-all"><Plus className="w-5 h-5" />新增</button>
         </div>
       </header>

       <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
         <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
           {filteredContacts.map(contact => (
             <div key={contact.id} className="group relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg transition-all">
               <div className={`rounded-xl bg-gradient-to-br ${INDUSTRY_COLORS[contact.industry] || 'from-gray-700 to-gray-900'} p-5 text-white h-40 flex flex-col justify-between mb-4`}>
                 <div className="font-bold text-sm opacity-80">{contact.company}</div>
                 <div>
                   <div className="text-xl font-black">{contact.name}</div>
                   <div className="text-xs opacity-70">{contact.title}</div>
                 </div>
               </div>
               <div className="space-y-1 text-xs text-gray-500">
                 <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{contact.phone}</div>
                 <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{contact.email}</div>
               </div>
               <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                 <button onClick={() => { setEditingContact(contact); setIsModalOpen(true); }} className="bg-white/90 text-blue-600 p-2 rounded-full shadow-md"><Edit2 className="w-4 h-4" /></button>
                 <button onClick={() => handleDelete(contact.id)} className="bg-white/90 text-red-600 p-2 rounded-full shadow-md"><Trash2 className="w-4 h-4" /></button>
               </div>
             </div>
           ))}
         </div>
       </div>
     </main>

     {isModalOpen && <ContactModal contact={editingContact} onClose={() => { setIsModalOpen(false); setEditingContact(null); }} onSave={handleSaveContact} setDbError={setDbError} user={user} />}
     {isBatchModalOpen && <BatchScanModal onClose={() => setIsBatchModalOpen(false)} onScan={handleBatchScan} isScanning={isBatchScanning} />}
   </div>
 );
}

function ContactModal({ contact, onClose, onSave, setDbError, user }) {
 const [formData, setFormData] = useState(contact || { name: '', title: '', email: '', company: '', address: '', phone: '', extension: '', mobile: '', industry: '其它', photoUrl: '' });
 const [isOcrLoading, setIsOcrLoading] = useState(false);
 const [ocrStatus, setOcrStatus] = useState('');
 const fileInputRef = useRef(null);

 const handleOcr = async (e) => {
   const file = e.target.files[0];
   if (!file) return;
   
   setIsOcrLoading(true);
   setOcrStatus('正在壓縮並準備辨識...');
   setDbError(null);

   try {
     const base64Data = await compressImage(file);
     setOcrStatus('AI 辨識中 (請稍候)...');
     
     const prompt = `辨識此名片，回傳 JSON 物件：{name, title, email, company, address, phone, extension, mobile}。`;
     const payload = {
       contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }] }]
     };
    
     const result = await callGeminiWithRetry(payload);
     const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
     const data = JSON.parse(cleanJsonResponse(rawText));
     
     if (!data.name && !data.company) throw new Error("UNRECOGNIZED");
     
     setFormData(prev => ({ ...prev, ...data }));
     setOcrStatus('辨識成功！');
   } catch (error) {
     setDbError(getDetailedError(error.status, error.message));
   } finally {
     setIsOcrLoading(false);
     setOcrStatus('');
   }
 };

 return (
   <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
       <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
         <h3 className="font-bold">{contact ? '編輯' : '新增'}名片</h3>
         <button onClick={onClose}><X className="w-5 h-5" /></button>
       </div>
       <div className="p-6 overflow-y-auto space-y-6">
         {!contact && (
           <div className="space-y-2">
             <input type="file" accept="image/*" ref={fileInputRef} onChange={handleOcr} className="hidden" />
             <button type="button" onClick={() => fileInputRef.current.click()} disabled={isOcrLoading} className={`w-full py-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${isOcrLoading ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 hover:bg-blue-50 hover:border-blue-300'}`}>
               {isOcrLoading ? (
                 <>
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-2" />
                  <p className="text-blue-600 font-bold">{ocrStatus}</p>
                 </>
               ) : (
                 <>
                  <UploadCloud className="w-10 h-10 text-blue-400 mb-2" />
                  <p className="text-gray-600">上傳名片照片 (AI 自動填表)</p>
                 </>
               )}
             </button>
           </div>
         )}
         <form id="contactForm" onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="grid grid-cols-2 gap-4">
           <div className="col-span-2 sm:col-span-1 space-y-1">
             <label className="text-xs font-bold text-gray-500">姓名 *</label>
             <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
           </div>
           <div className="col-span-2 sm:col-span-1 space-y-1">
             <label className="text-xs font-bold text-gray-500">職稱</label>
             <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
           </div>
           <div className="col-span-2 space-y-1">
             <label className="text-xs font-bold text-gray-500">公司名稱 *</label>
             <input required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
           </div>
           <div className="col-span-2 sm:col-span-1 space-y-1">
             <label className="text-xs font-bold text-gray-500">電話</label>
             <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
           </div>
           <div className="col-span-2 sm:col-span-1 space-y-1">
             <label className="text-xs font-bold text-gray-500">電子信箱</label>
             <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
           </div>
           <div className="col-span-2 space-y-1">
             <label className="text-xs font-bold text-gray-500">產業分類</label>
             <select value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-white">
               {INDUSTRIES.filter(i => i !== '全部').map(ind => <option key={ind} value={ind}>{ind}</option>)}
             </select>
           </div>
         </form>
       </div>
       <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
         <button onClick={onClose} className="px-6 py-2 text-gray-500">取消</button>
         <button type="submit" form="contactForm" className="px-8 py-2 bg-blue-600 text-white rounded-xl shadow-lg">儲存</button>
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
     <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
       <div className="flex justify-between items-center mb-6">
         <h3 className="font-bold text-lg">批次名片掃描</h3>
         <button onClick={onClose}><X /></button>
       </div>
       <select value={ind} onChange={e => setInd(e.target.value)} className="w-full px-4 py-3 border rounded-xl mb-6">
         <option value="自動判定">🤖 AI 自動判定分類</option>
         {INDUSTRIES.filter(i => i !== '全部').map(i => <option key={i} value={i}>{i}</option>)}
       </select>
       <input type="file" ref={fileInput} onChange={e => onScan(e.target.files[0], ind)} className="hidden" />
       <button onClick={() => fileInput.current.click()} disabled={isScanning} className={`w-full py-16 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 ${isScanning ? 'bg-emerald-50 border-emerald-400' : 'bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300'}`}>
         {isScanning ? (
           <>
            <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
            <p className="text-emerald-600 font-bold text-center">正在辨識圖片中多張名片...<br/><span className="text-xs font-normal opacity-70">這可能需要 10-20 秒</span></p>
           </>
         ) : (
           <>
            <Layers className="w-12 h-12 text-emerald-400" />
            <p className="text-gray-600 font-medium">選取或拍攝含多張名片之照片</p>
           </>
         )}
       </button>
     </div>
   </div>
 );
}