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

// 上傳順序設定：先收集2位家人各1張照片，再進入第1關
const UPLOAD_SEQUENCE = [
  { cardId: "card_slot_01", promptKey: "askUploadFirst", isSecondPhoto: false },
  { cardId: "card_slot_02", promptKey: "askUploadAnother", isSecondPhoto: false }
];

// Step 3: 開始上傳流程（第一張照片）
function startOnboardingStep3() {
  appState.onboardingStep = 3;
  appState.uploadSequenceIndex = 0;
  showUploadStep();
}

// 依照 UPLOAD_SEQUENCE 顯示對應的上傳畫面
async function showUploadStep() {
  const idx = appState.uploadSequenceIndex;
  const step = UPLOAD_SEQUENCE[idx];

  appState.pendingRelationCardId = step.cardId;
  appState.pendingIsSecondPhoto = step.isSecondPhoto;

  let promptText;
  if (step.promptKey === "askUploadSecondPhoto") {
    const card = await getCard(step.cardId);
    const name = card ? card.relation : "家人";
    promptText = t("askUploadSecondPhoto", { name });
  } else {
    promptText = t(step.promptKey);
  }

  setupUploadScreen(promptText);

  // 第二張照片時不需要再填關係名稱（沿用第一張的名字）
  if (step.isSecondPhoto) {
    document.getElementById("who-is-this-block").classList.add("force-hidden-name");
  } else {
    document.getElementById("who-is-this-block").classList.remove("force-hidden-name");
  }

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

  // 顯示處理中狀態，避免使用者誤以為卡住
  const areaEl = document.querySelector("#screen-upload .upload-area");
  areaEl.innerHTML = '<span class="upload-icon">⏳</span>';

  const base64 = await fileToBlob(file);

  // 顯示預覽
  areaEl.innerHTML = `<img src="${base64}" alt="preview">`;

  // 暫存這次上傳的照片
  appState.pendingPhotoBlob = base64;

  if (appState.pendingIsSecondPhoto) {
    // 第二張照片：不需要再問名字，直接儲存
    await saveSecondPhoto();
  } else {
    // 第一張照片：顯示「這是誰？」輸入框
    document.getElementById("who-is-this-block").classList.remove("hidden");
    document.getElementById("relation-input").value = "";
    document.getElementById("relation-input").focus();
    document.getElementById("btn-confirm-relation").onclick = handleConfirmRelation;
  }
}

// 確認關係名稱，存入 IndexedDB（用於第一張照片）
async function handleConfirmRelation() {
  const relationInput = document.getElementById("relation-input");
  const relationName = relationInput.value.trim();
  if (!relationName) return;

  const cardId = appState.pendingRelationCardId;

  const card = {
    cardId: cardId,
    relation: relationName,
    imageCurrent: appState.pendingPhotoBlob,
    imagePast: null,
    audioHint: null,
    hidden: false
  };

  await saveCard(card);
  appState.pendingPhotoBlob = null;

  await advanceUploadSequence();
}

// 儲存第二張照片（沿用既有的 relation 名稱）
async function saveSecondPhoto() {
  const cardId = appState.pendingRelationCardId;
  let card = await getCard(cardId);

  if (!card) {
    // 防呆：理論上不該發生，但若發生則建立一個暫時卡片
    card = { cardId, relation: "家人", imageCurrent: appState.pendingPhotoBlob, imagePast: null, hidden: false };
  } else {
    card.imagePast = appState.pendingPhotoBlob;
  }

  await saveCard(card);
  appState.pendingPhotoBlob = null;

  await advanceUploadSequence();
}

// 跳過上傳：使用備用人物補位
async function handleSkipUpload() {
  const cardId = appState.pendingRelationCardId;

  if (appState.pendingIsSecondPhoto) {
    // 跳過第二張照片：保留第一張即可，不用補fallback
    await advanceUploadSequence();
    return;
  }

  const fallbackIndex = (parseInt(cardId.replace(/\D/g, "")) - 1) % FALLBACK_PERSONS.length;
  const fallback = FALLBACK_PERSONS[fallbackIndex];

  const card = {
    cardId: cardId,
    relation: fallback.relation,
    imageCurrent: null,
    imagePast: null,
    audioHint: null,
    hidden: true,
    isFallback: true,
    fallbackEmoji: fallback.emoji,
    fallbackColor: fallback.color
  };

  await saveCard(card);
  await advanceUploadSequence();
}

// 推進到上傳序列的下一步，或進入第一關
async function advanceUploadSequence() {
  appState.uploadSequenceIndex++;

  if (appState.uploadSequenceIndex < UPLOAD_SEQUENCE.length) {
    await showUploadStep();
  } else {
    // 4張照片收集完畢，進入第1關
    appState.onboardingStep = 7;
    await playLevel(1, { onComplete: () => proceedOnboarding() });
  }
}

// 引導流程的步驟控制器（第1關之後的流程）
async function proceedOnboarding() {
  const step = appState.onboardingStep;

  switch (step) {
    case 7:
      // 第2關
      appState.onboardingStep = 8;
      await playLevel(2, { onComplete: () => proceedOnboarding() });
      return;

    case 8:
      // 第3關
      appState.onboardingStep = 9;
      await playLevel(3, { onComplete: () => proceedOnboarding() });
      return;

    case 9:
      // 第4關
      appState.onboardingStep = 10;
      await playLevel(4, { onComplete: () => proceedOnboarding() });
      return;

    case 10:
      // 第5關
      appState.onboardingStep = 11;
      await playLevel(5, { onComplete: () => proceedOnboarding() });
      return;

    case 11:
      // 記憶任務解鎖
      appState.onboardingStep = 12;
      showMemoryTaskScreen();
      return;

    case 12:
      // 第一天結束，播放過關動畫，進入主頁
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
  document.getElementById("btn-add-photo").onclick = showManagePhotosScreen;

  document.getElementById("btn-share").onclick = handleShareInvite;
  document.getElementById("btn-play-today").onclick = startTodaySession;

  showScreen("screen-dashboard");
}

// ============================================
// 管理家人照片畫面
// ============================================
async function showManagePhotosScreen() {
  document.getElementById("manage-photos-title").textContent = t("managePhotosTitle");
  document.getElementById("btn-add-new-person").textContent = t("addNewPerson");
  document.getElementById("btn-back-to-dashboard").textContent = t("backButton");

  await renderManagePhotosList();

  document.getElementById("btn-add-new-person").onclick = handleAddNewPerson;
  document.getElementById("btn-back-to-dashboard").onclick = async () => {
    await showDashboard();
  };

  showScreen("screen-manage-photos");
}

// 渲染家人照片列表
async function renderManagePhotosList() {
  const allCards = await getAllCards();
  // 只顯示非fallback的真實家人卡片
  const realCards = allCards.filter(c => !c.isFallback);

  const listEl = document.getElementById("manage-photos-list");
  listEl.innerHTML = "";

  realCards.forEach(card => {
    const row = document.createElement("div");
    row.className = "person-row";

    // 照片區（現在照片 + 第二張照片）
    const photosDiv = document.createElement("div");
    photosDiv.className = "person-photos";

    photosDiv.appendChild(buildPhotoSlot(card, "imageCurrent", t("currentPhotoLabel")));
    photosDiv.appendChild(buildPhotoSlot(card, "imagePast", t("secondPhotoLabel")));

    // 資訊區（姓名輸入框 + 刪除按鈕）
    const infoDiv = document.createElement("div");
    infoDiv.className = "person-info";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = card.relation || "";
    nameInput.placeholder = t("relationNamePlaceholder");
    nameInput.onchange = async () => {
      card.relation = nameInput.value.trim() || card.relation;
      await saveCard(card);
    };
    infoDiv.appendChild(nameInput);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-skip";
    deleteBtn.textContent = t("deletePersonButton");
    deleteBtn.style.marginTop = "8px";
    deleteBtn.onclick = async () => {
      if (confirm(t("confirmDeletePerson"))) {
        await deleteCard(card.cardId);
        await renderManagePhotosList();
      }
    };
    infoDiv.appendChild(deleteBtn);

    row.appendChild(photosDiv);
    row.appendChild(infoDiv);
    listEl.appendChild(row);
  });
}

// 建立單一照片格子（顯示現有照片，或顯示「新增」可點擊上傳）
function buildPhotoSlot(card, fieldName, label) {
  const el = document.createElement("div");
  el.className = "person-photo";
  el.title = label;

  const imageData = card[fieldName];

  if (imageData) {
    el.style.backgroundImage = `url(${blobToURL(imageData)})`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.classList.add("empty");
    el.textContent = "+";
  }

  el.onclick = () => triggerPhotoSlotUpload(card, fieldName);

  return el;
}

// 點擊照片格子時，開啟檔案選擇並更新該欄位
function triggerPhotoSlotUpload(card, fieldName) {
  const fileInput = document.getElementById("file-input");
  fileInput.value = "";

  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const base64 = await fileToBlob(file);
    card[fieldName] = base64;
    await saveCard(card);

    await renderManagePhotosList();
  };

  fileInput.click();
}

// 新增一位家人
async function handleAddNewPerson() {
  const allCards = await getAllCards();
  const realCards = allCards.filter(c => !c.isFallback);

  // 找出下一個可用的 cardId 編號
  let nextNum = 1;
  const existingNums = realCards
    .map(c => parseInt((c.cardId.match(/\d+/) || ["0"])[0]))
    .filter(n => !isNaN(n));
  if (existingNums.length > 0) {
    nextNum = Math.max(...existingNums) + 1;
  }

  const newCardId = `card_slot_${String(nextNum).padStart(2, "0")}`;

  const newCard = {
    cardId: newCardId,
    relation: t("relationNamePlaceholder"),
    imageCurrent: null,
    imagePast: null,
    audioHint: null,
    hidden: false
  };

  await saveCard(newCard);
  await renderManagePhotosList();
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
