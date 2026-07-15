// ============================================
// IndexedDB 資料層 db.js
// 三個倉庫：cards_store / game_logs_store / memory_tasks_store
// ============================================

const DB_NAME = "everyday_see_db";
const DB_VERSION = 2;

let dbInstance = null;

// 開啟（或建立）資料庫
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 倉庫一：cards_store - 主鍵 cardId
      if (!db.objectStoreNames.contains("cards_store")) {
        const cardsStore = db.createObjectStore("cards_store", { keyPath: "cardId" });
        cardsStore.createIndex("relation", "relation", { unique: false });
        cardsStore.createIndex("hidden", "hidden", { unique: false });
      }

      // 倉庫二：game_logs_store - 主鍵 logId 自動遞增
      if (!db.objectStoreNames.contains("game_logs_store")) {
        const logsStore = db.createObjectStore("game_logs_store", {
          keyPath: "logId",
          autoIncrement: true
        });
        logsStore.createIndex("date", "date", { unique: false });
        logsStore.createIndex("level", "level", { unique: false });
      }

      // 倉庫三：memory_tasks_store - 主鍵 taskId 自動遞增
      if (!db.objectStoreNames.contains("memory_tasks_store")) {
        db.createObjectStore("memory_tasks_store", {
          keyPath: "taskId",
          autoIncrement: true
        });
      }

      // 倉庫四：app_state_store - 存全域狀態 (key-value)
      if (!db.objectStoreNames.contains("app_state_store")) {
        db.createObjectStore("app_state_store", { keyPath: "key" });
      }

      // 倉庫五：sync_queue_store - 待同步到雲端的紀錄（離線/失敗時留著，之後重試）
      if (!db.objectStoreNames.contains("sync_queue_store")) {
        const syncStore = db.createObjectStore("sync_queue_store", { keyPath: "syncId" });
        syncStore.createIndex("uploaded", "uploaded", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// ============================================
// cards_store 操作
// ============================================

// 新增或更新一張卡片（家人照片）
// card = { cardId, relation, photos: [圖片1, 圖片2, 圖片3, 圖片4] (每格可為null), audioHint (可選), hidden (bool) }
async function saveCard(card) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cards_store", "readwrite");
    const store = tx.objectStore("cards_store");
    const request = store.put(card);
    request.onsuccess = () => resolve(card);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得單張卡片
async function getCard(cardId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cards_store", "readonly");
    const store = tx.objectStore("cards_store");
    const request = store.get(cardId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得所有卡片
async function getAllCards() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cards_store", "readonly");
    const store = tx.objectStore("cards_store");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得所有「未隱藏」的卡片（用於相冊顯示）
async function getVisibleCards() {
  const all = await getAllCards();
  return all.filter(c => !c.hidden);
}

// 刪除卡片
async function deleteCard(cardId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cards_store", "readwrite");
    const store = tx.objectStore("cards_store");
    const request = store.delete(cardId);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// game_logs_store 操作
// ============================================

// 新增一筆遊戲紀錄
// log = { date, level, durationSeconds, errorCount, intervals: [], grade, score }
async function addGameLog(log) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("game_logs_store", "readwrite");
    const store = tx.objectStore("game_logs_store");
    const request = store.add(log);
    request.onsuccess = () => resolve(request.result); // 回傳 logId
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得所有遊戲紀錄
async function getAllGameLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("game_logs_store", "readonly");
    const store = tx.objectStore("game_logs_store");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得某一天的所有紀錄
async function getGameLogsByDate(dateStr) {
  const all = await getAllGameLogs();
  return all.filter(log => log.date === dateStr);
}

// 取得最近一天有紀錄的日期（不是今天）
async function getMostRecentLogDate(excludeDate) {
  const all = await getAllGameLogs();
  const dates = [...new Set(all.map(l => l.date))].filter(d => d !== excludeDate);
  dates.sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// ============================================
// memory_tasks_store 操作
// ============================================

// 新增一筆重要記憶任務
// task = { question, answer, hint }
async function addMemoryTask(task) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("memory_tasks_store", "readwrite");
    const store = tx.objectStore("memory_tasks_store");
    const request = store.add(task);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得所有記憶任務
async function getAllMemoryTasks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("memory_tasks_store", "readonly");
    const store = tx.objectStore("memory_tasks_store");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 更新記憶任務
async function updateMemoryTask(task) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("memory_tasks_store", "readwrite");
    const store = tx.objectStore("memory_tasks_store");
    const request = store.put(task);
    request.onsuccess = () => resolve(task);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// app_state_store 操作（存全域狀態，例如目前關卡進度）
// ============================================

// 儲存一個 key-value 狀態
async function setAppState(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app_state_store", "readwrite");
    const store = tx.objectStore("app_state_store");
    const request = store.put({ key, value });
    request.onsuccess = () => resolve(value);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得一個 key 的值
async function getAppState(key, defaultValue = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app_state_store", "readonly");
    const store = tx.objectStore("app_state_store");
    const request = store.get(key);
    request.onsuccess = () => {
      resolve(request.result ? request.result.value : defaultValue);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// sync_queue_store 操作
// ============================================

// 加入一筆待同步紀錄
async function addToSyncQueue(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue_store", "readwrite");
    const store = tx.objectStore("sync_queue_store");
    const request = store.put(entry);
    request.onsuccess = () => resolve(entry);
    request.onerror = (e) => reject(e.target.error);
  });
}

// 取得所有「還沒上傳成功」的紀錄
async function getPendingSyncItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue_store", "readonly");
    const store = tx.objectStore("sync_queue_store");
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).filter(item => !item.uploaded));
    request.onerror = (e) => reject(e.target.error);
  });
}

// 標記某筆紀錄已經上傳成功
async function markSyncItemUploaded(syncId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue_store", "readwrite");
    const store = tx.objectStore("sync_queue_store");
    const getRequest = store.get(syncId);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        resolve(false);
        return;
      }
      item.uploaded = true;
      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = (e) => reject(e.target.error);
    };
    getRequest.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// 工具函式
// ============================================

// 將 base64字串 轉換成可顯示的圖片來源 (直接可用於 img.src 或 background-image)
function blobToURL(base64String) {
  if (!base64String) return null;
  return base64String; // base64 data URL 本身就可以直接當作 src
}

// 將圖片檔案 (File) 縮圖壓縮後轉成 base64字串再存入 IndexedDB
// 原始相機照片通常好幾MB，未經處理直接存的話：
// 1. 同時渲染多張在卡牌上容易解碼失敗/渲染不出來（看起來像白卡）
// 2. IndexedDB容量很快被撐爆（尤其現在每人最多4張）
// 所以統一縮到最長邊1000px、JPEG品質0.82再存
async function fileToBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = (e) => reject(e);
      img.src = reader.result;
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}
