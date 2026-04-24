import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, Plus, Building2, Phone, Mail, Briefcase, 
  Filter, Edit2, Trash2, X, ScanFace, Users, MapPin, UploadCloud, Loader2, Bot, Sparkles, Copy, Check, Smartphone, AlertTriangle, Database, Layers, Download, Upload
} from 'lucide-react';

// --- Firebase 雲端資料庫安全初始化 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

let app = null, auth = null, db = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyANFxwo3cqAJmuxz59wvTOiFCZZFobFmzk",
  authDomain: "camcard-web.firebaseapp.com",
  projectId: "camcard-web",
  storageBucket: "camcard-web.firebasestorage.app",
  messagingSenderId: "894143261550",
  appId: "1:894143261550:web:a9f86cb9de16fae7b86f7f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- Gemini API 設定 ---
const apiKey = ""; // 系統環境會自動注入
const MODEL = "gemini-2.5-flash-preview-09-2025";

const INDUSTRIES = ['全部', '中鋼集團', '中鋼客戶', '型鋼客戶', '鋼鐵同業', '協力商', '供應商', '政府及地方', '休閒娛樂', '金融', '其它'];

// 依據產業分類定義專屬顏色對應表
const INDUSTRY_COLORS = {
  '中鋼集團': 'from-blue-700 to-blue-900',        // 中鋼藍
  '中鋼客戶': 'from-sky-700 to-sky-900',          // 天空藍
  '型鋼客戶': 'from-cyan-700 to-cyan-900',        // 亮青藍
  '鋼鐵同業': 'from-zinc-700 to-zinc-900',        // 金屬灰
  '協力商': 'from-emerald-700 to-emerald-900',    // 翡翠綠
  '供應商': 'from-teal-700 to-teal-900',          // 藍綠色
  '政府及地方': 'from-amber-700 to-amber-900',    // 莊重金黃
  '休閒娛樂': 'from-rose-700 to-rose-900',        // 玫瑰紅
  '金融': 'from-purple-700 to-purple-900',        // 財富紫
  '其它': 'from-indigo-700 to-indigo-900'         // 靛藍色
};

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

  // --- 批次掃描 State ---
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // --- CSV 匯入/匯出 Refs ---
  const importCsvRef = useRef(null);

  // --- AI 擬稿 Modal State ---
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [draftingContact, setDraftingContact] = useState(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- 1. 初始化使用者驗證 ---
  useEffect(() => {
    if (!auth) {
      setDbError("系統無法載入雲端服務設定。");
      setIsLoadingDB(false);
      return;
    }

    const initAuth = async () => {
      try {
        // 在這個環境中，系統會自動給予代表您身份的 __initial_auth_token
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // 如果分享給沒有登入的訪客，則給予暫時的匿名身份
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("雲端登入失敗:", error);
        setDbError(`認證失敗: ${error.message}`);
        setIsLoadingDB(false);
      }
    };
    
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && dbError) setDbError(null); 
    });
    return () => unsubscribe();
  }, []);

  // --- 2. 監聽雲端資料庫變更 (私有 User 資料夾) ---
  useEffect(() => {
    if (!user || !db) return;
    
    try {
      const contactsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'contacts');
      const unsubscribe = onSnapshot(contactsRef, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => Number(b.id) - Number(a.id));
        setContacts(data);
        setIsLoadingDB(false);
      }, (error) => {
        console.error("讀取資料失敗:", error);
        setDbError(`無法讀取資料: ${error.message}`);
        setIsLoadingDB(false);
      });
      return () => unsubscribe();
    } catch (error) {
      setDbError(`資料庫連線異常: ${error.message}`);
      setIsLoadingDB(false);
    }
  }, [user]);

  // 過濾聯絡人
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchSearch = (contact.name || '').includes(searchTerm) || 
                          (contact.company || '').includes(searchTerm) || 
                          (contact.title || '').includes(searchTerm);
      const matchIndustry = selectedIndustry === '全部' || (contact.industry || '其它') === selectedIndustry;
      return matchSearch && matchIndustry;
    });
  }, [contacts, searchTerm, selectedIndustry]);

  // 處理表單提交
  const handleSaveContact = async (formData) => {
    if (!user || !db) return;
    try {
      const contactId = editingContact && editingContact.id ? String(editingContact.id) : String(Date.now());
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId);
      
      const dataToSave = { ...formData, id: contactId };
      await setDoc(docRef, dataToSave);
      setIsModalOpen(false);
      setEditingContact(null);
    } catch (error) {
      console.error("儲存聯絡人失敗:", error);
      setDbError("儲存失敗，請確認網路連線與資料庫權限。");
      setTimeout(() => setDbError(null), 5000);
    }
  };

  // 處理刪除
  const handleDelete = async (id) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', String(id)));
    } catch (error) {
      console.error("刪除聯絡人失敗:", error);
      setDbError("刪除失敗，請確認網路連線。");
      setTimeout(() => setDbError(null), 5000);
    }
  };

  // --- 匯出資料為 CSV (Excel 支援) ---
  const exportToCSV = () => {
    if (contacts.length === 0) {
      setDbError("目前沒有名片可以匯出！");
      setTimeout(() => setDbError(null), 3000);
      return;
    }

    const headers = ['姓名', '職稱', '公司名稱', '公司電話', '分機', '手機', '電子信箱', '產業分類', '公司地址', '備註'];
    const rows = contacts.map(c => [
      c.name || '', c.title || '', c.company || '', c.phone || '',
      c.extension || '', c.mobile || '', c.email || '', c.industry || '',
      c.address || '', c.note || ''
    ]);

    const processRow = row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(processRow)].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `名片王_資料匯出_${new Date().toLocaleDateString().replace(/\//g, '')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- 從 CSV (Excel) 匯入資料 ---
  const importFromCSV = (e) => {
    const file = e.target.files[0];
    if (!file || !user || !db) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsLoadingDB(true);
        const text = event.target.result;
        const rows = [];
        let currentRow = [];
        let inQuotes = false;
        let currentVal = '';
        
        for (let i = 0; i < text.length; i++) {
          let char = text[i];
          let nextChar = text[i+1];
          if (char === '"' && inQuotes && nextChar === '"') { currentVal += '"'; i++; } 
          else if (char === '"') { inQuotes = !inQuotes; } 
          else if (char === ',' && !inQuotes) { currentRow.push(currentVal.trim()); currentVal = ''; } 
          else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentVal.trim());
            if (currentRow.some(val => val !== '')) rows.push(currentRow);
            currentRow = []; currentVal = '';
          } else { currentVal += char; }
        }
        if (currentVal || currentRow.length > 0) {
          currentRow.push(currentVal.trim());
          if (currentRow.some(val => val !== '')) rows.push(currentRow);
        }

        if (rows.length < 2) throw new Error("無效的檔案或沒有資料");

        const headers = rows[0].map(h => h.replace(/^\uFEFF/, '')); 
        const keyMap = { 
          '姓名': 'name', '職稱': 'title', '公司名稱': 'company', '公司電話': 'phone', 
          '分機': 'extension', '手機': 'mobile', '電子信箱': 'email', '產業分類': 'industry', 
          '公司地址': 'address', '備註': 'note' 
        };

        let savedCount = 0;
        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i];
          const contactData = {};
          headers.forEach((h, idx) => {
            const key = keyMap[h];
            if (key && rowData[idx] !== undefined) contactData[key] = rowData[idx];
          });

          if (contactData.name || contactData.company) {
            const contactId = String(Date.now() + i + Math.random().toString().slice(2, 6));
            await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId), {
              ...contactData,
              id: contactId,
              industry: INDUSTRIES.includes(contactData.industry) ? contactData.industry : '其它'
            });
            savedCount++;
          }
        }
        setNotification(`成功匯入 ${savedCount} 筆名片資料！`);
        setTimeout(() => setNotification(null), 5000);
      } catch (error) {
        console.error("匯入失敗:", error);
        setDbError("匯入失敗，請確認檔案是否為正確格式。");
        setTimeout(() => setDbError(null), 5000);
      } finally {
        setIsLoadingDB(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  // --- 處理批次掃描多張名片 (Batch Scan) ---
  const handleBatchScan = async (file, defaultIndustry) => {
    if (!file || !user || !db) return;

    setIsBatchScanning(true);
    setDbError(null);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const prompt = `請辨識這張圖片中的「所有」名片，並以 JSON 陣列 (Array) 格式回傳。
      每個陣列物件必須包含以下 key：name(姓名), title(職稱), company(公司名稱), phone(公司電話), extension(分機), mobile(手機), email(電子信箱), address(地址), industry(產業分類)。
      如果找不到該欄位請填入空字串 ""。
      industry 欄位請務必從以下分類中挑選最適合的填入：中鋼集團, 中鋼客戶, 型鋼客戶, 鋼鐵同業, 協力商, 供應商, 政府及地方, 休閒娛樂, 金融, 其它。`;

      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY", items: { type: "OBJECT", properties: {
              name: { type: "STRING" }, title: { type: "STRING" }, company: { type: "STRING" },
              phone: { type: "STRING" }, extension: { type: "STRING" }, mobile: { type: "STRING" },
              email: { type: "STRING" }, address: { type: "STRING" }, industry: { type: "STRING" }
            }}
          }
        }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
      });
      const result = await response.json();
      const extractedArray = JSON.parse(result.candidates[0].content.parts[0].text);

      if (Array.isArray(extractedArray) && extractedArray.length > 0) {
        let savedCount = 0;
        for (const card of extractedArray) {
          if (!card.name && !card.company) continue; 
          
          const contactId = String(Date.now() + Math.random().toString().slice(2, 8)); 
          const finalIndustry = defaultIndustry === '自動判定' ? (INDUSTRIES.includes(card.industry) ? card.industry : '其它') : defaultIndustry;

          const dataToSave = { ...card, id: contactId, industry: finalIndustry, note: '🤖 批次 AI 掃描自動匯入' };
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', contactId), dataToSave);
          savedCount++;
        }
        setNotification(`成功！AI 已自動為您匯入 ${savedCount} 張名片。`);
        setIsBatchModalOpen(false); 
        setTimeout(() => setNotification(null), 5000);
      } else {
        setDbError("未能從圖片中辨識出任何名片資料。");
        setTimeout(() => setDbError(null), 5000);
      }
    } catch (error) {
      console.error("批次辨識失敗:", error);
      setDbError("批次辨識失敗，請確認圖片格式或重試。");
      setTimeout(() => setDbError(null), 5000);
    } finally {
      setIsBatchScanning(false);
    }
  };

  // 開啟編輯/新增 Modal
  const openEditModal = (contact) => { setEditingContact(contact); setIsModalOpen(true); };
  const openNewModal = () => { setEditingContact(null); setIsModalOpen(true); };

  // --- Gemini API: AI 擬稿功能 ---
  const handleGenerateEmail = async (contact) => {
    setDraftingContact(contact); setIsEmailModalOpen(true); setIsDrafting(true); setEmailDraft(''); setCopied(false);
    try {
      const prompt = `你是一位專業的業務經理。請根據以下客戶資訊與備註，撰寫一封專業的繁體中文「業務跟進/問候郵件」。語氣需得體，符合台灣商務習慣。不需包含主旨，直接輸出信件內容。【客戶資訊】姓名：${contact.name} 職稱：${contact.title} 公司：${contact.company} 備註：${contact.note || '初次認識的感謝問候信'}`;
      const payload = { contents: [{ parts: [{ text: prompt }] }] };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      setEmailDraft(result.candidates[0].content.parts[0].text);
    } catch (error) {
      setEmailDraft("AI 擬稿發生錯誤，請稍後再試。");
    } finally {
      setIsDrafting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailDraft).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const textArea = document.createElement("textarea"); textArea.value = emailDraft; document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  if (user === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* --- 左側導覽列 --- */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 shrink-0">
          <div className="bg-blue-600 p-2 rounded-lg"><ScanFace className="text-white w-6 h-6" /></div>
          <h1 className="text-xl font-bold text-white tracking-wide">名片王 Pro</h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <button onClick={() => setSelectedIndustry('全部')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${selectedIndustry === '全部' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}>
            <Users className="w-5 h-5 shrink-0" /><span className="font-medium">全部人脈</span>
          </button>
          <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">產業分類</div>
          {INDUSTRIES.slice(1).map(ind => (
            <button key={ind} onClick={() => setSelectedIndustry(ind)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors text-sm ${selectedIndustry === ind ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 hover:text-white'}`}>
              <span className="truncate pr-2">{ind}</span>
              <span className="bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs shrink-0">{contacts.filter(c => (c.industry || '其它') === ind).length}</span>
            </button>
          ))}
        </nav>

        {/* 雲端狀態監控區 */}
        <div className="p-4 border-t border-slate-800 mt-auto shrink-0 relative group">
          <div className="text-[10px] text-slate-500 mb-2 flex items-center justify-between uppercase tracking-wider">
            <span className="flex items-center gap-1"><Database className="w-3 h-3" /> 雲端連線狀態</span>
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] font-medium text-emerald-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
              <span>Firebase 安全連線中</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between group mt-1 pt-1 border-t border-slate-700/50">
              <span>綁定 ID:</span><span className="truncate ml-2 text-blue-300 text-[10px]" title={user.uid}>{user.uid.substring(0,8)}...</span>
            </div>
          </div>
        </div>
      </aside>

      {/* --- 主要內容區 --- */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* 全局錯誤與成功提示 */}
        {dbError && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-red-500 text-white px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-md">
            <AlertTriangle className="w-4 h-4" /><span>{dbError}</span>
            <button onClick={() => setDbError(null)} className="ml-4 hover:bg-red-600 p-1 rounded"><X className="w-4 h-4" /></button>
          </div>
        )}
        {notification && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 text-sm font-bold rounded-full flex items-center justify-center gap-2 shadow-xl animate-in fade-in slide-in-from-top-5">
            <Check className="w-5 h-5" /><span>{notification}</span>
          </div>
        )}

        {/* 頂部搜尋與動作列 */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 z-10 shadow-sm">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="搜尋姓名、公司、職稱..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} className="md:hidden bg-white border border-gray-200 text-gray-700 py-2.5 px-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-200">
              {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
            
            <button onClick={exportToCSV} title="匯出為 Excel (CSV)" className="shrink-0 p-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"><Download className="w-5 h-5" /></button>
            <input type="file" accept=".csv" ref={importCsvRef} onChange={importFromCSV} className="hidden" />
            <button onClick={() => importCsvRef.current?.click()} title="從 Excel (CSV) 匯入" className="shrink-0 p-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"><Upload className="w-5 h-5" /></button>

            <button onClick={() => setIsBatchModalOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-md shadow-emerald-600/20">
              <Layers className="w-5 h-5" /><span className="hidden sm:inline">批次掃描</span>
            </button>
            <button onClick={openNewModal} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-md shadow-blue-600/20">
              <Plus className="w-5 h-5" /><span>新增單筆</span>
            </button>
          </div>
        </header>

        {/* 名片網格展示區 */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-gray-50/50">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {selectedIndustry === '全部' ? '所有人脈' : selectedIndustry}
              <span className="ml-3 text-sm font-normal text-gray-500 bg-gray-200 px-2.5 py-0.5 rounded-full">{filteredContacts.length} 筆</span>
            </h2>
          </div>

          {isLoadingDB ? (
            <div className="flex flex-col items-center justify-center h-64 text-blue-600">
              <Loader2 className="w-10 h-10 mb-4 animate-spin" /><p className="text-lg font-medium">正在連線並載入您的名片庫...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white border border-dashed border-gray-200 rounded-3xl p-8 shadow-sm">
              <ScanFace className="w-16 h-16 mb-4 opacity-50 text-blue-400" />
              <p className="text-xl font-bold mb-2 text-gray-600">專屬名片庫目前是空的</p>
              <p className="text-sm text-center max-w-md mb-6 text-gray-500">此空間為您的專屬加密資料庫。請點擊上方「新增單筆」或「批次掃描」開始建立您的專屬人脈庫。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredContacts.map(contact => {
                const cardColor = INDUSTRY_COLORS[contact.industry] || INDUSTRY_COLORS['其它'];
                return (
                <div key={contact.id} className="group relative bg-white rounded-2xl p-1.5 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100">
                  <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${cardColor} p-6 text-white h-48 flex flex-col justify-between shadow-inner`}>
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                    <div className="relative z-10 flex justify-between items-start">
                      <div><h3 className="font-bold text-lg opacity-90 tracking-wider flex items-center gap-2"><Building2 className="w-4 h-4 shrink-0" /><span className="line-clamp-1">{contact.company}</span></h3></div>
                      <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium border border-white/10 shrink-0 ml-2">{contact.industry || '其它'}</span>
                    </div>
                    <div className="relative z-10 mt-auto mb-4">
                      <h2 className="text-2xl font-black tracking-widest">{contact.name}</h2>
                      <p className="text-white/80 font-medium mt-1 truncate">{contact.title}</p>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-2">
                    <div className="flex items-center gap-3 text-sm text-gray-600"><Phone className="w-4 h-4 text-gray-400 shrink-0" /><span>{contact.phone || '未提供公司電話'}{contact.extension ? ` 分機: ${contact.extension}` : ''}</span></div>
                    <div className="flex items-center gap-3 text-sm text-gray-600"><Smartphone className="w-4 h-4 text-gray-400 shrink-0" /><span>{contact.mobile || '未提供手機'}</span></div>
                    <div className="flex items-center gap-3 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400 shrink-0" /><span className="truncate">{contact.email || '未提供信箱'}</span></div>
                    {contact.note && (<div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 line-clamp-1"><span className="font-semibold text-gray-700 mr-2">備註:</span>{contact.note}</div>)}
                  </div>

                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-20">
                    <button onClick={() => handleGenerateEmail(contact)} className="bg-white/90 backdrop-blur text-purple-600 p-2 rounded-full hover:bg-purple-50 shadow-lg transition-transform hover:scale-110" title="AI 自動擬稿"><Bot className="w-4 h-4" /></button>
                    <button onClick={() => openEditModal(contact)} className="bg-white/90 backdrop-blur text-blue-600 p-2 rounded-full hover:bg-white shadow-lg transition-transform hover:scale-110" title="編輯"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(contact.id)} className="bg-white/90 backdrop-blur text-red-600 p-2 rounded-full hover:bg-red-50 shadow-lg transition-transform hover:scale-110" title="刪除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </main>

      {/* --- 批次掃描 Modal --- */}
      {isBatchModalOpen && <BatchScanModal onClose={() => setIsBatchModalOpen(false)} onScan={handleBatchScan} isScanning={isBatchScanning} />}

      {/* --- 新增/編輯 Modal --- */}
      {isModalOpen && <ContactModal contact={editingContact} onClose={() => setIsModalOpen(false)} onSave={handleSaveContact} />}

      {/* --- AI 擬稿 Modal --- */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-200" /> Gemini AI 智能郵件擬稿</h3>
              <button type="button" onClick={() => setIsEmailModalOpen(false)} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-4">正在為 <span className="font-semibold text-gray-800">{draftingContact?.name}</span> ({draftingContact?.company}) 撰寫信件...</p>
              {isDrafting ? (
                <div className="flex flex-col items-center justify-center py-12 text-purple-600">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" /><p className="font-medium animate-pulse">AI 正在思考並撰寫內容...</p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 whitespace-pre-wrap text-gray-700 font-sans leading-relaxed min-h-[200px]">{emailDraft}</div>
              )}
            </div>
            <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setIsEmailModalOpen(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors">關閉</button>
              <button type="button" onClick={copyToClipboard} disabled={isDrafting || !emailDraft} className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? '已複製到剪貼簿' : '一鍵複製內容'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 獨立的批次掃描 Modal 元件
function BatchScanModal({ onClose, onScan, isScanning }) {
  const [defaultIndustry, setDefaultIndustry] = useState('自動判定');
  const fileInputRef = useRef(null);
  const handleFileChange = (e) => { const file = e.target.files[0]; if (file) onScan(file, defaultIndustry); };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-emerald-600" />批次掃描設定</h3>
          <button onClick={onClose} disabled={isScanning} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-600">1. 請選擇這批名片的預設分類</label>
            <select value={defaultIndustry} onChange={(e) => setDefaultIndustry(e.target.value)} disabled={isScanning} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
              <option value="自動判定">🤖 由 AI 自動判讀各別分類</option>
              {INDUSTRIES.filter(i => i !== '全部').map(ind => <option key={ind} value={ind}>強制歸類為：{ind}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">若選擇強制歸類，AI 辨識出的名片將全部套用該產業分類。</p>
          </div>
          <div className="space-y-2 pt-2">
            <label className="text-sm font-semibold text-gray-600">2. 上傳名片合照</label>
            <input type="file" accept=".jpg, .jpeg, .png" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isScanning} className={`w-full border-2 border-dashed ${isScanning ? 'border-emerald-300 bg-emerald-50 text-emerald-500' : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300'} rounded-xl p-6 flex flex-col items-center justify-center transition-colors`}>
              {isScanning ? (
                <><Loader2 className="w-8 h-8 mb-2 animate-spin text-emerald-500" /><span className="font-semibold text-emerald-600">AI 正在批次辨識中，請稍候...</span></>
              ) : (
                <><UploadCloud className="w-8 h-8 mb-2" /><span className="font-semibold">點擊選擇照片 (開始掃描)</span><span className="text-xs mt-1 opacity-70">請確保照片中的名片字體清晰</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 獨立的 Modal 元件
function ContactModal({ contact, onClose, onSave }) {
  const [formData, setFormData] = useState(contact || { name: '', title: '', company: '', email: '', phone: '', extension: '', mobile: '', address: '', industry: '中鋼集團', note: '' });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const fileInputRef = useRef(null);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleSubmit = async (e) => { e.preventDefault(); setIsSaving(true); await onSave(formData); setIsSaving(false); };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsExtracting(true); setOcrError('');
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = error => reject(error);
      });
      const prompt = `請辨識這張名片，並以 JSON 格式回傳。必須包含以下 key：name(姓名), title(職稱), company(公司名稱), phone(公司電話), extension(分機), mobile(手機), email(電子信箱), address(地址)。如果找不到該欄位請填入空字串 ""。如果有分機請獨立放入 extension，手機放入 mobile。不要回傳 markdown，純粹回傳 JSON。`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }], generationConfig: { responseMimeType: "application/json" } };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const extractedData = JSON.parse(result.candidates[0].content.parts[0].text);
      setFormData(prev => ({ ...prev, ...extractedData, extension: extractedData.extension || prev.extension, mobile: extractedData.mobile || prev.mobile }));
    } catch (error) {
      setOcrError("辨識失敗，請確認圖片格式或嘗試手動輸入。");
    } finally {
      setIsExtracting(false); if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {contact ? <Edit2 className="w-5 h-5 text-blue-600" /> : <ScanFace className="w-5 h-5 text-blue-600" />}
            {contact ? '編輯名片資訊' : '手動新增 / 掃描名片'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {ocrError && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between"><span>{ocrError}</span><button onClick={() => setOcrError('')} className="text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button></div>}
          {!contact && (
            <div className="mb-6">
              <input type="file" accept=".jpg, .jpeg, .png" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isExtracting} className={`w-full border-2 border-dashed ${isExtracting ? 'border-gray-300 bg-gray-50 text-gray-400' : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300'} rounded-xl p-6 flex flex-col items-center justify-center transition-colors`}>
                {isExtracting ? <><Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" /><span className="font-semibold text-blue-600">Gemini AI 正在辨識 JPG 名片中...</span></> : <><UploadCloud className="w-8 h-8 mb-2" /><span className="font-semibold">點擊上傳 JPG 名片照片 (AI 自動辨識)</span><span className="text-xs mt-1 opacity-70">支援 .jpg, .jpeg, .png 格式檔案</span></>}
              </button>
              <div className="flex items-center mt-6"><div className="flex-1 border-t border-gray-200"></div><span className="px-4 text-xs text-gray-400 uppercase tracking-widest font-semibold">或手動輸入</span><div className="flex-1 border-t border-gray-200"></div></div>
            </div>
          )}

          <form id="contactForm" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1"><label className="text-sm font-semibold text-gray-600">姓名</label><input required type="text" name="name" value={formData.name || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如: 張家豪" /></div>
              <div className="space-y-1"><label className="text-sm font-semibold text-gray-600">職稱</label><input required type="text" name="title" value={formData.title || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如: 採購部經理" /></div>
              <div className="space-y-1 md:col-span-2"><label className="text-sm font-semibold text-gray-600">公司名稱</label><input required type="text" name="company" value={formData.company || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如: 中龍鋼鐵" /></div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-600">公司電話 / 分機</label>
                <div className="flex gap-2">
                  <input type="text" name="phone" value={formData.phone || ''} onChange={handleChange} className="w-2/3 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="電話號碼" />
                  <input type="text" name="extension" value={formData.extension || ''} onChange={handleChange} className="w-1/3 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="分機" />
                </div>
              </div>
              <div className="space-y-1"><label className="text-sm font-semibold text-gray-600">行動電話 (手機)</label><input type="text" name="mobile" value={formData.mobile || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="例如: 0912-345-678" /></div>
              <div className="space-y-1"><label className="text-sm font-semibold text-gray-600">電子信箱</label><input type="email" name="email" value={formData.email || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-600">產業分類</label>
                <select name="industry" value={formData.industry || '中鋼集團'} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  {INDUSTRIES.filter(i => i !== '全部').map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-semibold text-gray-600">公司地址 (選填)</label><input type="text" name="address" value={formData.address || ''} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div className="space-y-1 md:col-span-2"><label className="text-sm font-semibold text-gray-600">背景備註 (CRM紀錄)</label><textarea name="note" value={formData.note || ''} onChange={handleChange} rows="3" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="例如: 2026/04 討論過二期建廠標案..."></textarea></div>
            </div>
          </form>
        </div>

        <div className="bg-slate-50 border-t border-gray-100 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-6 py-2 border border-gray-200 text-gray-600 bg-white rounded-lg hover:bg-gray-50 font-medium shadow-sm transition-colors disabled:opacity-50">返回主頁</button>
          <button type="submit" form="contactForm" disabled={isSaving} className="flex items-center justify-center min-w-[100px] px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md shadow-blue-600/20 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存資料'}
          </button>
        </div>
      </div>
    </div>
  );
}