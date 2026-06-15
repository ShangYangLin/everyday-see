// ============================================
// app.js - 主程式
// 畫面流程控制 + 翻牌遊戲核心邏輯（重構自原始版本）
// ============================================

// ---- 開發用設定 ----
// 上線前將此設為 false，即可隱藏遊戲畫面上的分數/關卡除錯資訊
const DEBUG_MODE = true;

// ---- 全域狀態 ----
let appState = {
  onboardingStep: 0,        // 目前在引導流程的第幾步
  pendingRelationCardId: null, // 等待填寫關係的卡片ID
  currentLevel: 1,
  todayLevelResults: [],     // 今天每關的 {level, grade}
  giveUpCountToday: 0
};

// ---- 翻牌遊戲執行時狀態 ----
let gameState = {
  deck: [],
  config: null,
  firstCard: null,
  secondCard: null,
  clickCount: 0,
  errorCount: 0,
  intervals: [],
  lastClickTime: null,
  startTime: null,
  lockBoard: false
};

// ============================================
// 初始化
// ============================================
window.addEventListener("DOMContentLoaded", async () => {
  applyTranslations();
  bindWelcomeEvents();

  // 檢查是否已完成首刷引導
  const onboardingDone = await getAppState("onboarding_done", false);
  if (onboardingDone) {
    await showDashboard();
  } else {
    showScreen("screen-welcome");
  }
});

// 套用語系文案到畫面上
function applyTranslations() {
  document.getElementById("welcome-title").textContent = t("welcomeTitle");
  document.getElementById("welcome-subtitle").textContent = t("welcomeSubtitle");
  document.getElementById("btn-start").textContent = t("welcomeStart");

  document.getElementById("upload-prompt").textContent = t("askUploadFirst");
  document.getElementById("who-is-this-label").textContent = t("askWhoIsThis");
  document.getElementById("btn-confirm-relation").textContent = t("confirmButton");
  document.getElementById("btn-skip-upload").textContent = t("skipButton");

  document.getElementById("btn-giveup").textContent = t("giveUpButton");

  document.getElementById("dashboard-title").textContent = t("appName");
  document.getElementById("streak-label").textContent = t("streakDays");
  document.getElementById("album-label").textContent = t("familyAlbum");
  document.getElementById("memos-label").textContent = t("importantMemos");
  document.getElementById("btn-add-photo").textContent = t("addPhoto");
  document.getElementById("btn-share").textContent = t("shareButton");
}

// ============================================
// 畫面切換工具
// ============================================
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(el => el.classList.add("hidden"));
  document.getElementById(screenId).classList.remove("hidden");
}

// ============================================
// Step 1-2: 歡迎畫面
// ============================================
function bindWelcomeEvents() {
  document.getElementById("btn-start").addEventListener("click", () => {
    startOnboardingStep3();
  });
}

// ============================================
// 首刷引導流程 (Step 3-13)
// ============================================

// Step 3: 第一次上傳照片
function startOnboardingStep3() {
  appState.onboardingStep = 3;
  appState.pendingRelationCardId = "card_slot_01";
  setupUploadScreen(t("askUploadFirst"));
  showScreen("screen-upload");
}

function setupUploadScreen(promptText) {
  document.getElementById("upload-prompt").textContent = promptText;
  document.getElementById("who-is-this-block").classList.add("hidden");
  document.getElementById("btn-skip-upload").classList.remove("hidden");

  const uploadArea = document.getElementById("upload-area");
  uploadArea.innerHTML = '<span class="upload-icon">📷</span>';

  const fileInput = document.getElementById("file-input");
  fileInput.value = "";

  // 重新綁定事件（避免重複綁定）
  const newUploadArea = uploadArea.cloneNode(true);
  uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
  newUploadArea.addEventListener("click", () => fileInput.click());

  fileInput.onchange = handlePhotoUpload;

  document.getElementById("btn-skip-upload").onclick = handleSkipUpload;
}

// 處理照片上傳
async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const blob = await fileToBlob(file);
  const url = blobToURL(blob);

  // 顯示預覽
  const areaEl = document.querySelector("#screen-upload .upload-area");
  areaEl.innerHTML = `<img src="${url}" alt="preview">`;

  // 暫存這次上傳的照片，等使用者填寫關係後存入 DB
  appState.pendingPhotoBlob = blob;

  // 顯示「這是誰？」輸入框
  document.getElementById("who-is-this-block").classList.remove("hidden");
  document.getElementById("relation-input").value = "";
  document.getElementById("relation-input").focus();

  document.getElementById("btn-confirm-relation").onclick = handleConfirmRelation;
}

// 確認關係名稱，存入 IndexedDB
async function handleConfirmRelation() {
  const relationInput = document.getElementById("relation-input");
  const relationName = relationInput.value.trim();
  if (!relationName) return;

  const cardId = appState.pendingRelationCardId;

  // 取得現有卡片（如果有的話，可能是要新增第二張照片）
  let card = await getCard(cardId);

  if (!card) {
    card = {
      cardId: cardId,
      relation: relationName,
      imageCurrent: appState.pendingPhotoBlob,
      imagePast: null,
      audioHint: null,
      hidden: false
    };
  } else {
    // 已存在，這是第二張照片（imagePast 或 imageCurrent2）
    if (!card.imageCurrent) {
      card.imageCurrent = appState.pendingPhotoBlob;
    } else {
      card.imagePast = appState.pendingPhotoBlob;
    }
    card.relation = relationName;
  }

  await saveCard(card);
  appState.pendingPhotoBlob = null;

  await proceedOnboarding();
}

// 跳過上傳：使用備用人物補位
async function handleSkipUpload() {
  const cardId = appState.pendingRelationCardId;
  const fallbackIndex = (parseInt(cardId.replace(/\D/g, "")) - 1) % FALLBACK_PERSONS.length;
  const fallback = FALLBACK_PERSONS[fallbackIndex];

  const card = {
    cardId: cardId,
    relation: fallback.relation,
    imageCurrent: null, // fallback 用 emoji，不需要 Blob
    imagePast: null,
    audioHint: null,
    hidden: true, // 隱藏在相冊中，但遊戲仍會使用
    isFallback: true,
    fallbackEmoji: fallback.emoji,
    fallbackColor: fallback.color
  };

  await saveCard(card);
  await proceedOnboarding();
}

// 引導流程的步驟控制器
// 依照企劃書 Step 3-13 的線性順序往下走
async function proceedOnboarding() {
  const step = appState.onboardingStep;

  switch (step) {
    case 3:
      // Step 4: 第一關 (2x2)
      appState.onboardingStep = 4;
      await playLevel(1, { onComplete: () => proceedOnboarding() });
      return;

    case 4:
      // Step 5: 引導增強1 - 請再上傳一張同一人的不同照片
      appState.onboardingStep = 5;
      const cards1 = await getAllCards();
      const targetCard = cards1.find(c => c.cardId === "card_slot_01");
      const targetName = targetCard ? targetCard.relation : "家人";
      appState.pendingRelationCardId = "card_slot_01";
      setupUploadScreen(t("askUploadSecondPhoto", { name: targetName }));
      showScreen("screen-upload");
      return;

    case 5:
      // Step 6: 第二關 (2x2)
      appState.onboardingStep = 6;
      await playLevel(2, { onComplete: () => proceedOnboarding() });
      return;

    case 6:
      // Step 7: 上傳核心2 - 第三位家人
      appState.onboardingStep = 7;
      appState.pendingRelationCardId = "card_slot_02";
      setupUploadScreen(t("askUploadAnother"));
      showScreen("screen-upload");
      return;

    case 7:
      // Step 8: 第三關 (3x2)
      appState.onboardingStep = 8;
      await playLevel(3, { onComplete: () => proceedOnboarding() });
      return;

    case 8:
      // Step 9: 第四關 (3x2)
      appState.onboardingStep = 9;
      await playLevel(4, { onComplete: () => proceedOnboarding() });
      return;

    case 9:
      // Step 10: 引導增強2
      appState.onboardingStep = 10;
      appState.pendingRelationCardId = "card_slot_03";
      const cards2 = await getAllCards();
      const target2 = cards2.find(c => c.cardId === "card_slot_02");
      const target2Name = target2 ? target2.relation : "家人";
      setupUploadScreen(t("askUploadSecondPhoto", { name: target2Name }));
      showScreen("screen-upload");
      return;

    case 10:
      // Step 11: 第五關 (4x2)
      appState.onboardingStep = 11;
      await playLevel(5, { onComplete: () => proceedOnboarding() });
      return;

    case 11:
      // Step 12: 記憶任務解鎖
      appState.onboardingStep = 12;
      showMemoryTaskScreen();
      return;

    case 12:
      // Step 13: 第一天結束，播放過關動畫，進入主頁
      appState.onboardingStep = 13;
      await setAppState("onboarding_done", true);
      await setAppState("current_base_level", 1);
      await setAppState("last_play_date", null);
      showCompleteOverlay(t("gameComplete"), null, async () => {
        await showDashboard();
      });
      return;

    default:
      await showDashboard();
  }
}

// ============================================
// Step 12: 記憶任務畫面
// ============================================
function showMemoryTaskScreen() {
  document.getElementById("memory-task-title").textContent = t("memoryTaskTitle");
  document.getElementById("memory-task-question").textContent = t("memoryTaskQuestion");
  document.getElementById("memory-task-name").placeholder = t("memoryTaskNamePlaceholder");
  document.getElementById("memory-task-phone").placeholder = t("memoryTaskPhonePlaceholder");
  document.getElementById("btn-save-memory-task").textContent = t("memoryTaskSave");

  document.getElementById("memory-task-name").value = "";
  document.getElementById("memory-task-phone").value = "";

  document.getElementById("btn-save-memory-task").onclick = async () => {
    const name = document.getElementById("memory-task-name").value.trim();
    const phone = document.getElementById("memory-task-phone").value.trim();

    if (name && phone) {
      await addMemoryTask({
        question: t("memoryTaskQuestion"),
        answer: phone,
        hint: name
      });
    }

    await proceedOnboarding();
  };

  showScreen("screen-memory-task");
}

// ============================================
// 翻牌遊戲核心邏輯
// 重構自原始 JS 版本，改為參數化、資料來源來自 IndexedDB
// ============================================

// 開始一個關卡
// options.onComplete: 過關後的callback
async function playLevel(level, options = {}) {
  appState.currentLevel = level;

  const allCards = await getAllCards();
  const { deck, config } = await generateLevelDeck(level, allCards);

  // 重置遊戲狀態
  gameState = {
    deck,
    config,
    firstCard: null,
    secondCard: null,
    clickCount: 0,
    errorCount: 0,
    intervals: [],
    lastClickTime: null,
    startTime: null,
    lockBoard: false,
    onComplete: options.onComplete
  };

  renderGameBoard();
  showScreen("screen-game");

  // 顯示放棄按鈕（依等級決定是否需要監控）
  setupGiveUpButton(level);

  await updateDebugBar();
}

// 渲染遊戲畫面
function renderGameBoard() {
  const container = document.getElementById("game-container");
  container.innerHTML = "";
  container.className = gameState.config.gridClass;

  gameState.deck.forEach((cardData, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    cardEl.dataset.index = index;
    cardEl.dataset.pairKey = cardData.pairKey;

    // 背面樣式（預設顯示）
    applyCardBackStyle(cardEl);

    cardEl.addEventListener("click", () => handleCardClick(cardEl, cardData, index));
    container.appendChild(cardEl);
  });
}

// 套用卡牌背面樣式
function applyCardBackStyle(cardEl) {
  cardEl.style.backgroundImage = "";
  cardEl.style.backgroundColor = "#E8A87C";
  cardEl.textContent = "❀";
  cardEl.classList.remove("matched", "text-card");
}

// 套用卡牌正面樣式（翻開後顯示內容）
function applyCardFrontStyle(cardEl, cardData) {
  cardEl.textContent = "";

  if (cardData.displayType === "text") {
    // 文字卡：顯示關係名稱
    cardEl.classList.add("text-card");
    cardEl.textContent = cardData.relation;
    cardEl.style.backgroundColor = "#B8D4C8";
    cardEl.style.backgroundImage = "";
  } else if (cardData.isFallback) {
    // 備用人物：顯示 emoji
    cardEl.style.backgroundColor = cardData.fallbackColor || "#E8A87C";
    cardEl.style.backgroundImage = "";
    cardEl.textContent = cardData.fallbackEmoji || "👤";
    cardEl.style.fontSize = "48px";
  } else if (cardData.imageBlob) {
    // 真實照片
    const url = blobToURL(cardData.imageBlob);
    cardEl.style.backgroundImage = `url(${url})`;
    cardEl.style.backgroundColor = "";
  } else {
    // 沒有照片資料時的保底顯示
    cardEl.style.backgroundColor = "#D9C9B8";
    cardEl.textContent = cardData.relation || "?";
  }
}

// 處理卡片點擊（核心配對邏輯，重構自原版）
function handleCardClick(cardEl, cardData, index) {
  if (gameState.lockBoard) return;
  if (cardEl.classList.contains("matched")) return;
  if (gameState.firstCard && cardEl === gameState.firstCard.el) return;

  // 記錄時間間隔
  const now = Date.now();
  if (gameState.startTime === null) {
    gameState.startTime = now;
  }
  if (gameState.lastClickTime !== null) {
    const intervalSec = (now - gameState.lastClickTime) / 1000;
    gameState.intervals.push(intervalSec);
  }
  gameState.lastClickTime = now;
  gameState.clickCount++;

  // 翻開卡片
  applyCardFrontStyle(cardEl, cardData);

  if (!gameState.firstCard) {
    gameState.firstCard = { el: cardEl, data: cardData };
  } else if (!gameState.secondCard) {
    gameState.secondCard = { el: cardEl, data: cardData };
    gameState.lockBoard = true;

    const isMatch = gameState.firstCard.data.pairKey === gameState.secondCard.data.pairKey;

    if (isMatch) {
      gameState.firstCard.el.classList.add("matched");
      gameState.secondCard.el.classList.add("matched");
      gameState.firstCard = null;
      gameState.secondCard = null;
      gameState.lockBoard = false;

      checkLevelComplete();
    } else {
      gameState.errorCount++;
      setTimeout(() => {
        applyCardBackStyle(gameState.firstCard.el);
        applyCardBackStyle(gameState.secondCard.el);
        gameState.firstCard = null;
        gameState.secondCard = null;
        gameState.lockBoard = false;
      }, 700); // 給長輩多一點時間看清楚（原版是350ms，這裡放慢）
    }
  }

  // 即時檢查是否該顯示放棄按鈕
  updateGiveUpButtonVisibility();
  updateDebugBar();
}

// 檢查關卡是否完成
async function checkLevelComplete() {
  const totalMatched = document.querySelectorAll("#game-container .card.matched").length;
  if (totalMatched < gameState.deck.length) return;

  const durationSeconds = (Date.now() - gameState.startTime) / 1000;
  const totalCards = gameState.deck.length;

  const gradeResult = evaluateLevelGrade({
    totalCards,
    clickCount: gameState.clickCount,
    intervals: gameState.intervals,
    gaveUp: false,
    durationSeconds,
    level: appState.currentLevel
  });

  // 記錄這關結果
  appState.todayLevelResults.push({ level: appState.currentLevel, grade: gradeResult.grade });

  // 寫入 game_logs_store
  await addGameLog({
    date: getTodayDateString(),
    level: appState.currentLevel,
    durationSeconds: Math.round(durationSeconds),
    errorCount: gameState.errorCount,
    intervals: gameState.intervals
  });

  hideGiveUpButton();

  // 顯示過關畫面
  showCompleteOverlay(t("levelComplete"), null, () => {
    if (gameState.onComplete) gameState.onComplete();
  });
}

// ============================================
// 放棄按鈕控制
// ============================================
let giveUpCheckInterval = null;

function setupGiveUpButton(level) {
  hideGiveUpButton();

  const btn = document.getElementById("btn-giveup");
  btn.textContent = t("giveUpButton");
  btn.onclick = () => handleGiveUp();

  // 每秒檢查一次是否該顯示放棄按鈕（嚴重遲疑判定需要即時偵測）
  giveUpCheckInterval = setInterval(() => {
    updateGiveUpButtonVisibility();
    updateDebugBar();
  }, 1000);
}

function updateGiveUpButtonVisibility() {
  if (!gameState.config) return;

  const currentDuration = gameState.startTime ? (Date.now() - gameState.startTime) / 1000 : 0;
  const shouldShow = shouldShowGiveUpButton(
    appState.currentLevel,
    currentDuration,
    gameState.clickCount,
    gameState.deck.length,
    gameState.lastClickTime
  );

  const btn = document.getElementById("btn-giveup");
  btn.style.display = shouldShow ? "block" : "none";
}

function hideGiveUpButton() {
  if (giveUpCheckInterval) {
    clearInterval(giveUpCheckInterval);
    giveUpCheckInterval = null;
  }
  document.getElementById("btn-giveup").style.display = "none";
}

// ============================================
// 開發用 Debug 資訊條
// 顯示：目前關卡 / 起始關卡指標 / 點擊次數 / 預估Grade / 累計時間
// 上線前將 DEBUG_MODE 設為 false 即可隱藏
// ============================================
async function updateDebugBar() {
  const bar = document.getElementById("debug-bar");
  if (!bar) return;

  if (!DEBUG_MODE) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");

  const baseLevel = await getAppState("current_base_level", 1);
  const totalCards = gameState.deck ? gameState.deck.length : 0;
  const durationSeconds = gameState.startTime
    ? Math.round((Date.now() - gameState.startTime) / 1000)
    : 0;

  // 即時預估目前的 Grade（用目前已發生的點擊與時間去判斷）
  let estimatedGrade = "-";
  if (totalCards > 0) {
    const result = evaluateLevelGrade({
      totalCards,
      clickCount: gameState.clickCount,
      intervals: gameState.intervals,
      gaveUp: false,
      durationSeconds,
      level: appState.currentLevel
    });
    estimatedGrade = `Grade ${result.grade} (${result.reason})`;
  }

  const weight = getLevelWeight(appState.currentLevel);
  const thresholds = getClickThresholds(totalCards);

  const todayScoreSoFar = calculateDailyScore(appState.todayLevelResults);

  bar.textContent =
    `關卡 Level: ${appState.currentLevel} / 10 (今日起始關卡指標: ${baseLevel})\n` +
    `卡牌數: ${totalCards}　點擊次數: ${gameState.clickCount}　錯誤次數: ${gameState.errorCount}\n` +
    `經過時間: ${durationSeconds}s　權重 W: ${weight}\n` +
    `門檻 → 快速:${thresholds.fastThreshold} / 一般:${thresholds.normalThreshold} / 放棄:${thresholds.giveUpThreshold}\n` +
    `即時預估: ${estimatedGrade}\n` +
    `今日累計分數: ${todayScoreSoFar.toFixed(1)}　放棄次數: ${appState.giveUpCountToday}`;
}

// 處理使用者點擊放棄按鈕
async function handleGiveUp() {
  hideGiveUpButton();

  appState.giveUpCountToday++;

  const durationSeconds = gameState.startTime ? (Date.now() - gameState.startTime) / 1000 : 0;

  // 記錄為 Grade 1
  appState.todayLevelResults.push({ level: appState.currentLevel, grade: 1 });

  await addGameLog({
    date: getTodayDateString(),
    level: appState.currentLevel,
    durationSeconds: Math.round(durationSeconds),
    errorCount: gameState.errorCount,
    intervals: gameState.intervals,
    gaveUp: true
  });

  // 連續觸發兩次，當天遊戲立刻提前結束
  if (appState.giveUpCountToday >= SCORING_CONFIG.maxGiveUpPerDay) {
    await endTodaySession(true);
  } else {
    // 否則繼續下一關（若有 onComplete）
    if (gameState.onComplete) gameState.onComplete();
    else await showDashboard();
  }
}

// ============================================
// 過關/完成 全螢幕訊息
// ============================================
function showCompleteOverlay(title, mediaUrl, onContinue) {
  document.getElementById("complete-title").textContent = title;

  const mediaContainer = document.getElementById("complete-media");
  mediaContainer.innerHTML = "";

  if (mediaUrl) {
    if (mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm")) {
      const video = document.createElement("video");
      video.src = mediaUrl;
      video.autoplay = true;
      video.controls = false;
      mediaContainer.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = mediaUrl;
      mediaContainer.appendChild(img);
    }
  } else {
    // 預設過關動畫：簡單的 emoji 慶祝
    mediaContainer.innerHTML = '<div style="font-size: 80px; text-align:center;">🎉</div>';
  }

  document.getElementById("btn-continue").textContent = t("confirmButton");
  document.getElementById("btn-continue").onclick = () => {
    document.getElementById("screen-complete").classList.add("hidden");
    onContinue();
  };

  showScreen("screen-complete");
}

// ============================================
// 結束今天的遊戲
// ============================================
async function endTodaySession(early = false) {
  hideGiveUpButton();

  const todayScore = calculateDailyScore(appState.todayLevelResults);
  const todayDateStr = getTodayDateString();
  const hasFailedGrade = appState.todayLevelResults.some(r => r.grade === 1);

  // 取得前一天分數
  const lastDate = await getMostRecentLogDate(todayDateStr);
  let prevScore = null;
  if (lastDate) {
    const prevLogs = await getGameLogsByDate(lastDate);
    const prevResults = prevLogs.map(log => ({
      level: log.level,
      grade: log.gaveUp ? 1 : evaluateLevelGrade({
        totalCards: 0, // 簡化：歷史資料無法重算總卡數，這裡僅用於演示
        clickCount: 0,
        intervals: log.intervals || [],
        gaveUp: !!log.gaveUp,
        durationSeconds: log.durationSeconds,
        level: log.level
      }).grade
    }));
    prevScore = calculateDailyScore(prevResults);
  }

  const currentBaseLevel = await getAppState("current_base_level", 1);
  const nextBaseLevel = calculateNextDayStartLevel(todayScore, prevScore, currentBaseLevel, hasFailedGrade);

  await setAppState("current_base_level", nextBaseLevel);
  await setAppState("last_play_date", todayDateStr);

  // 顯示溫暖的結束訊息（不顯示失敗字眼）
  showCompleteOverlay(t("greatJobMessage"), null, async () => {
    await showDashboard();
  });
}

// ============================================
// 取得今日日期字串 YYYY-MM-DD
// ============================================
function getTodayDateString() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// ============================================
// 主頁面 / 儀表板
// ============================================
async function showDashboard() {
  // 連續訓練天數
  const allLogs = await getAllGameLogs();
  const playedDates = [...new Set(allLogs.map(l => l.date))].sort();
  const streak = calculateStreak(playedDates);
  document.getElementById("streak-value").textContent = streak;

  // 家人卡片蒐集冊
  const visibleCards = await getVisibleCards();
  const albumGrid = document.getElementById("family-album-grid");
  albumGrid.innerHTML = "";
  visibleCards.forEach(card => {
    if (card.imageCurrent) {
      const img = document.createElement("img");
      img.src = blobToURL(card.imageCurrent);
      img.title = card.relation;
      albumGrid.appendChild(img);
    }
  });

  // 重要記憶事項
  const tasks = await getAllMemoryTasks();
  const memosList = document.getElementById("memos-list");
  memosList.innerHTML = "";
  tasks.forEach(task => {
    const p = document.createElement("p");
    p.textContent = `${task.hint}: ${task.answer}`;
    p.style.fontSize = "20px";
    memosList.appendChild(p);
  });

  // 綁定按鈕
  document.getElementById("btn-add-photo").onclick = () => {
    alert("新增照片功能將在後續版本實作");
  };

  document.getElementById("btn-share").onclick = handleShareInvite;
  document.getElementById("btn-play-today").onclick = startTodaySession;

  showScreen("screen-dashboard");
}

// 計算連續天數
function calculateStreak(sortedDates) {
  if (sortedDates.length === 0) return 0;

  let streak = 1;
  for (let i = sortedDates.length - 1; i > 0; i--) {
    const curr = new Date(sortedDates[i]);
    const prev = new Date(sortedDates[i - 1]);
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ============================================
// 開始今天的遊戲（每日固定 5 關）
// ============================================
async function startTodaySession() {
  appState.todayLevelResults = [];
  appState.giveUpCountToday = 0;

  const baseLevel = await getAppState("current_base_level", 1);
  const levelsToPlay = [];
  for (let i = 0; i < SCORING_CONFIG.dailyLevelCount; i++) {
    const lvl = Math.min(baseLevel + i, 10);
    levelsToPlay.push(lvl);
  }

  await playLevelSequence(levelsToPlay, 0);
}

// 依序播放關卡序列
async function playLevelSequence(levels, index) {
  if (index >= levels.length) {
    await endTodaySession(false);
    return;
  }

  const level = levels[index];
  await playLevel(level, {
    onComplete: () => playLevelSequence(levels, index + 1)
  });
}

// ============================================
// 分享邀請（Web Share API）
// ============================================
async function handleShareInvite() {
  const shareData = {
    title: t("appName"),
    text: t("inviteShareDesc"),
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      console.log("Share cancelled or failed:", err);
    }
  } else {
    // 降級方案：複製連結
    alert(t("inviteShareDesc") + "\n" + window.location.href);
  }
}
