// ============================================
// 計分演算法 scoring.js
// 與遊戲 UI 完全解耦，未來調整門檻只改這個檔案
// ============================================

// ============================================
// 可調整參數區（場域驗證後最容易調整的地方）
// ============================================
const SCORING_CONFIG = {
  // 嚴重遲疑判定：連續多少秒沒有點擊，視為發呆
  hesitationSeconds: 15,

  // 一般流暢思考的間隔上限（Grade 3 用）
  fastIntervalMax: 4,

  // 一般過關的間隔上限（Grade 2 用）
  normalIntervalMax: 15,

  // 每日固定關卡數
  dailyLevelCount: 5,

  // 起始關卡指標上限：到了這個關卡指標之後就不再往上爬，改成看分數有沒有持續成長
  maxBaseLevel: 6,

  // 晉級判定（已到頂時使用）：今天分數 >= 昨天分數 * 此倍率，視為「過」
  promoteMultiplier: 1.1,

  // 連續幾次「不過」才會真的降一關（沒有累積到這個次數，只是維持原關卡，不會立刻降）
  stallLimitBeforeDemote: 2,

  // 連續兩次觸發放棄按鈕，當天遊戲提前結束
  maxGiveUpPerDay: 2
};

// ============================================
// 單關表現評級 (Performance Grade)
// 輸入: { totalCards, clickCount, intervals: [秒...], gaveUp: bool, durationSeconds, level }
// 輸出: { grade: 1|2|3, reason: string }
// ============================================
function evaluateLevelGrade(stats) {
  const { totalCards, clickCount, intervals, gaveUp, durationSeconds, level } = stats;

  const thresholds = getClickThresholds(totalCards);
  const timeLimit = getTimeLimit(level);

  // 檢查是否有嚴重遲疑（連續超過 hesitationSeconds 秒沒點擊）
  const hasSevereHesitation = intervals.some(sec => sec > SCORING_CONFIG.hesitationSeconds);

  // 檢查是否亂點爆量
  const isClickOverflow = clickCount > thresholds.giveUpThreshold;

  // 檢查是否超時
  const isTimeOverflow = durationSeconds > timeLimit;

  // ---- Grade 1: 失敗/放棄 ----
  if (gaveUp || hasSevereHesitation || isClickOverflow || isTimeOverflow) {
    let reason = "failed";
    if (gaveUp) reason = "gave_up";
    else if (hasSevereHesitation) reason = "severe_hesitation";
    else if (isClickOverflow) reason = "click_overflow";
    else if (isTimeOverflow) reason = "time_overflow";

    return { grade: 1, reason };
  }

  // ---- Grade 3: 快速過關 ----
  const allIntervalsUnderFast = intervals.every(sec => sec < SCORING_CONFIG.fastIntervalMax);
  if (clickCount <= thresholds.fastThreshold && allIntervalsUnderFast) {
    return { grade: 3, reason: "fast_clear" };
  }

  // ---- Grade 2: 一般過關 ----
  // 點擊次數在 1.8~3.0 倍之間，或間隔在 4~15秒之間
  if (clickCount <= thresholds.normalThreshold) {
    return { grade: 2, reason: "normal_clear" };
  }

  // 其餘情況視為一般過關（保守判定，避免邊界情況誤判為失敗）
  return { grade: 2, reason: "normal_clear_edge" };
}

// ============================================
// 計算單關積分 = Grade × 該關權重
// ============================================
function calculateLevelScore(level, grade) {
  const weight = getLevelWeight(level);
  return grade * weight;
}

// ============================================
// 計算當日總分 S = Σ(該關 Grade × 該關權重)
// levelResults: [{ level, grade }, ...]
// ============================================
function calculateDailyScore(levelResults) {
  return levelResults.reduce((sum, r) => {
    return sum + calculateLevelScore(r.level, r.grade);
  }, 0);
}

// ============================================
// 隔日起始關卡判定邏輯（V2，依你確認的規則重寫）
//
// todayScore: 今天總分
// prevScore: 昨天總分 (若無紀錄則為 null)
// currentBaseLevel: 今天的起始關卡指標
// hasFailedGrade: 今天是否有任何一關是 Grade 1
// stallCount: 目前累積的「不過」次數（需要持久化保存，跨天延續）
//
// 規則：
// 1. 還沒到頂(currentBaseLevel < maxBaseLevel)：
//    今天「沒有任何一關失敗」就直接晉一關，stallCount歸零。
//    今天「有失敗」則維持原關卡不降，但stallCount+1；
//    累積到 stallLimitBeforeDemote 次才真的降一關，降完stallCount歸零。
// 2. 已經到頂(currentBaseLevel === maxBaseLevel)：
//    改成看分數成長，今天分數 >= 昨天分數 * promoteMultiplier 才算「過」(維持在頂，stallCount歸零)。
//    沒有達標算「不過」，stallCount+1；累積到 stallLimitBeforeDemote 次才降一關。
//    （沒有昨天分數可比的極端情況，先當作「過」，避免一到頂就被誤降）
//
// 降級之後，回到「還沒到頂」狀態，就會重新套用規則1，只要打好就能再爬上去。
//
// 回傳 { nextBaseLevel, nextStallCount }，呼叫端要把這兩個值都存起來
// ============================================
function calculateNextDayStartLevel(todayScore, prevScore, currentBaseLevel, hasFailedGrade, stallCount = 0) {
  let nextBaseLevel = currentBaseLevel;
  let nextStallCount = stallCount;

  if (currentBaseLevel < SCORING_CONFIG.maxBaseLevel) {
    if (!hasFailedGrade) {
      nextBaseLevel = currentBaseLevel + 1;
      nextStallCount = 0;
    } else {
      nextStallCount = stallCount + 1;
      if (nextStallCount >= SCORING_CONFIG.stallLimitBeforeDemote) {
        nextBaseLevel = currentBaseLevel - 1;
        nextStallCount = 0;
      }
    }
  } else {
    const passed = prevScore === null || todayScore >= prevScore * SCORING_CONFIG.promoteMultiplier;
    if (passed) {
      nextStallCount = 0;
    } else {
      nextStallCount = stallCount + 1;
      if (nextStallCount >= SCORING_CONFIG.stallLimitBeforeDemote) {
        nextBaseLevel = currentBaseLevel - 1;
        nextStallCount = 0;
      }
    }
  }

  // 邊界防禦
  if (nextBaseLevel < 1) nextBaseLevel = 1;
  if (nextBaseLevel > SCORING_CONFIG.maxBaseLevel) nextBaseLevel = SCORING_CONFIG.maxBaseLevel;

  return { nextBaseLevel, nextStallCount };
}

// ============================================
// 判斷今天是否應該觸發雲端警示 (V3 用，V1先記錄標記)
// 連續兩天綜合錯誤率高於門檻 -> trigger_alert: true
// ============================================
function shouldTriggerAlert(todayHasFailedGrade, yesterdayHasFailedGrade) {
  return todayHasFailedGrade && yesterdayHasFailedGrade;
}

// ============================================
// 即時防呆檢查：遊玩過程中是否該顯示「放棄/休息一下」按鈕
// 從第 7 關開始才檢查 (依企劃書)
// 輸入目前狀態，回傳 true/false
// ============================================
function shouldShowGiveUpButton(level, currentDurationSeconds, currentClickCount, totalCards, lastClickTimestamp) {
  if (level < 7) return false;

  const timeLimit = getTimeLimit(level);
  const thresholds = getClickThresholds(totalCards);

  const timeExceeded = currentDurationSeconds > timeLimit;
  const clicksExceeded = currentClickCount > thresholds.giveUpThreshold;

  let hesitationExceeded = false;
  if (lastClickTimestamp) {
    const secondsSinceLastClick = (Date.now() - lastClickTimestamp) / 1000;
    hesitationExceeded = secondsSinceLastClick > SCORING_CONFIG.hesitationSeconds;
  }

  return timeExceeded || clicksExceeded || hesitationExceeded;
}
