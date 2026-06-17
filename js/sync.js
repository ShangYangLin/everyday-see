// ============================================
// 雲端同步 sync.js
// 原則：本機優先、背景同步。
// endTodaySession() 算完今天分數後，先寫進本機的待同步佇列(IndexedDB)，
// 再嘗試呼叫 Supabase 把這筆資料送出去；沒有網路或送失敗都不影響遊戲本身，
// 紀錄會留在佇列裡，下次開APP會自動重試。
// ============================================

const SUPABASE_URL = "https://aygmjghdqcgjkcqmlqqg.supabase.co";
const SUPABASE_KEY = "sb_publishable_5Ri5WcljJxO2Zd6ZHzPk_A_z6__6dzM";

// 取得(或建立)這個裝置的識別碼
// 目前還沒有登入系統，先用裝置自己產生、存在本機的隨機ID代替「使用者」的概念，
// 之後如果要做家屬登入/跨裝置查看，這裡會是最先需要升級成真帳號系統的地方
async function getDeviceId() {
  let id = await getAppState("device_id", null);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await setAppState("device_id", id);
  }
  return id;
}

// 把「今天的分數結果」加進待同步佇列，並馬上嘗試送一次
// record = { playDate, score, baseLevelAfter, hadFailure }
async function queueDailyScoreSync(record) {
  try {
    const deviceId = await getDeviceId();
    const entry = {
      syncId: `${record.playDate}_${Date.now()}`,
      payload: {
        device_id: deviceId,
        play_date: record.playDate,
        score: record.score,
        base_level_after: record.baseLevelAfter,
        had_failure: record.hadFailure
      },
      uploaded: false,
      createdAt: Date.now()
    };
    await addToSyncQueue(entry);
  } catch (e) {
    // 連寫進本機佇列都失敗的話，就放棄這筆雲端同步，但完全不能影響遊戲本身繼續進行
    console.warn("加入同步佇列失敗", e);
    return;
  }

  // 不等它完成，背景嘗試送出去即可
  flushSyncQueue();
}

// 嘗試把佇列裡所有「還沒上傳成功」的紀錄送到 Supabase
// 在 DOMContentLoaded 時呼叫一次（補送之前失敗的），queueDailyScoreSync 裡也會呼叫一次
async function flushSyncQueue() {
  let pending;
  try {
    pending = await getPendingSyncItems();
  } catch (e) {
    console.warn("讀取同步佇列失敗", e);
    return;
  }

  for (const item of pending) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/daily_scores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(item.payload)
      });

      if (response.ok) {
        await markSyncItemUploaded(item.syncId);
      } else {
        // 伺服器有回應但拒絕了(例如資料格式不對)，先停止這輪，避免每筆都重複失敗
        console.warn("雲端同步被伺服器拒絕，留著之後重試", response.status);
        break;
      }
    } catch (e) {
      // 通常是沒有網路，留著佇列裡，之後重試；先停止這輪，省得浪費時間逐筆嘗試
      console.warn("雲端同步失敗(可能沒有網路)，留著之後重試", e);
      break;
    }
  }
}
