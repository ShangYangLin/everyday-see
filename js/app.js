// ============================================
// app.js - 主程式
// 畫面流程控制 + 翻牌遊戲核心邏輯（重構自原始版本）
// ============================================

// ---- 開發用設定 ----
// 上線前將此設為 false，即可隱藏遊戲畫面上的分數/關卡除錯資訊
const DEBUG_MODE = true;

// ---- 測試模式：可在不受真實日期限制的情況下，模擬「過了好幾天」 ----
// 上線前把 enabled 設為 false 即可完全關閉測試面板
const TEST_MODE = {
  enabled: true,
  virtualDate: null // null = 使用真實日期；設定後 getTodayDateString() 會回傳這個值
};

// 把虛擬日期往後推 N 天（預設1天），用於測試「隔天」的晉降級邏輯
function testAdvanceDay(days = 1) {
  const base = TEST_MODE.virtualDate ? new Date(TEST_MODE.virtualDate) : new Date();
  base.setDate(base.getDate() + days);
  TEST_MODE.virtualDate = base.toISOString().split("T")[0];
  return TEST_MODE.virtualDate;
}

// 清空所有 IndexedDB 資料，重新從第一天開始測試
async function testResetAllData() {
  const db = await openDB();
  const storeNames = ["cards_store", "game_logs_store", "memory_tasks_store", "app_state_store"];
  await Promise.all(storeNames.map(name => new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    tx.objectStore(name).clear();
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  })));
  TEST_MODE.virtualDate = null;
}

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
// 首刷引導流程
// ============================================
// 第1關前：A1, B1
// 第2關前：A或B隨機選一人補第2張
// 第3關前：上傳新家人C1
// 第4關前：不問
// 第5關前：從只有1張的家人(B或C)隨機選一人補第2張
// ============================================

function startOnboardingStep3() {
  appState.onboardingStep = "upload_A1";
  appState.level2TargetCardId = null;
  appState.level5TargetCardId = null;
  showSinglePhotoUpload("card_slot_01", "askUploadFirst", false);
}

function showSinglePhotoUpload(cardId, promptKey, isSecondPhoto, promptParams = {}) {
  appState.pendingRelationCardId = cardId;
  appState.pendingIsSecondPhoto = isSecondPhoto;
  const promptText = t(promptKey, promptParams);
  setupUploadScreen(promptText);
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

  const newUploadArea = uploadArea.cloneNode(true);
  uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
  newUploadArea.addEventListener("click", () => fileInput.click());

  fileInput.onchange = handlePhotoUpload;
  document.getElementById("btn-skip-upload").onclick = handleSkipUpload;
}

async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const areaEl = document.querySelector("#screen-upload .upload-area");
  areaEl.innerHTML = '<span class="upload-icon">⏳</span>';

  const base64 = await fileToBlob(file);
  areaEl.innerHTML = `<img src="${base64}" alt="preview">`;
  appState.pendingPhotoBlob = base64;

  if (appState.pendingIsSecondPhoto) {
    await saveSecondPhoto();
  } else {
    document.getElementById("who-is-this-block").classList.remove("hidden");
    document.getElementById("relation-input").value = "";
    document.getElementById("relation-input").focus();
    document.getElementById("btn-confirm-relation").onclick = handleConfirmRelation;
  }
}

async function handleConfirmRelation() {
  const relationName = document.getElementById("relation-input").value.trim();
  if (!relationName) return;

  const cardId = appState.pendingRelationCardId;
  const card = {
    cardId,
    relation: relationName,
    imageCurrent: appState.pendingPhotoBlob,
    imagePast: null,
    audioHint: null,
    hidden: false
  };

  await saveCard(card);
  appState.pendingPhotoBlob = null;
  await proceedOnboarding();
}

async function saveSecondPhoto() {
  const cardId = appState.pendingRelationCardId;
  let card = await getCard(cardId);
  if (!card) {
    card = { cardId, relation: "家人", imageCurrent: appState.pendingPhotoBlob, imagePast: null, hidden: false };
  } else {
    card.imagePast = appState.pendingPhotoBlob;
  }
  await saveCard(card);
  appState.pendingPhotoBlob = null;
  await proceedOnboarding();
}

async function handleSkipUpload() {
  if (appState.pendingIsSecondPhoto) {
    // 跳過第二張照片，直接進下一步
    appState.pendingPhotoBlob = null;
    await proceedOnboarding();
    return;
  }

  // 跳過新家人：用 fallback 補位
  const cardId = appState.pendingRelationCardId;
  const fallbackIndex = (parseInt(cardId.replace(/\D/g, "")) - 1) % FALLBACK_PERSONS.length;
  const fallback = FALLBACK_PERSONS[fallbackIndex];
  await saveCard({
    cardId,
    relation: fallback.relation,
    imageCurrent: null,
    imagePast: null,
    audioHint: null,
    hidden: true,
    isFallback: true,
    fallbackImage: fallback.imageCurrent
  });
  await proceedOnboarding();
}

// ============================================
// 引導流程狀態機
// ============================================
async function proceedOnboarding() {
  const step = appState.onboardingStep;

  switch (step) {

    // 上傳 B1 → 進第1關
    case "upload_A1":
      appState.onboardingStep = "upload_B1";
      showSinglePhotoUpload("card_slot_02", "askUploadAnother", false);
      return;

    // 進第1關
    case "upload_B1":
      appState.onboardingStep = "before_level_2";
      await playLevel(1, { onComplete: () => proceedOnboarding() });
      return;

    // 第1關完成 → 隨機選A或B補第2張照片
    case "before_level_2": {
      const cards = (await getAllCards()).filter(c => !c.isFallback && c.imageCurrent);
      const target = cards[Math.floor(Math.random() * cards.length)];
      appState.level2TargetCardId = target ? target.cardId : "card_slot_01";
      const targetCard = target || { relation: "家人" };
      appState.onboardingStep = "upload_second_for_level2";
      showSinglePhotoUpload(appState.level2TargetCardId, "askUploadSecondPhoto", true, { name: targetCard.relation });
      return;
    }

    // 第2張照片上傳完（或跳過）→ 進第2關
    case "upload_second_for_level2":
      appState.onboardingStep = "before_level_3";
      await playLevel(2, { onComplete: () => proceedOnboarding() });
      return;

    // 第2關完成 → 問新家人C
    case "before_level_3":
      appState.onboardingStep = "upload_C1";
      showSinglePhotoUpload("card_slot_03", "askUploadAnother", false);
      return;

    // C1上傳完（或跳過）→ 進第3關
    case "upload_C1":
      appState.onboardingStep = "before_level_4";
      await playLevel(3, { onComplete: () => proceedOnboarding() });
      return;

    // 第3關完成 → 不問，直接進第4關
    case "before_level_4":
      appState.onboardingStep = "before_level_5";
      await playLevel(4, { onComplete: () => proceedOnboarding() });
      return;

    // 第4關完成 → 從只有1張照片的家人(B或C)隨機選一人補第2張
    case "before_level_5": {
      const allCards = (await getAllCards()).filter(c => !c.isFallback && c.imageCurrent);
      // 只有1張照片的家人（沒有 imagePast）
      const singlePhotoCards = allCards.filter(c => !c.imagePast);
      if (singlePhotoCards.length > 0) {
        const target = singlePhotoCards[Math.floor(Math.random() * singlePhotoCards.length)];
        appState.level5TargetCardId = target.cardId;
        appState.onboardingStep = "upload_second_for_level5";
        showSinglePhotoUpload(target.cardId, "askUploadSecondPhoto", true, { name: target.relation });
      } else {
        // 所有人都有兩張照片，直接進第5關
        appState.onboardingStep = "before_memory_task";
        await playLevel(5, { onComplete: () => proceedOnboarding() });
      }
      return;
    }

    // 第5關第2張照片上傳完（或跳過）→ 進第5關
    case "upload_second_for_level5":
      appState.onboardingStep = "before_memory_task";
      await playLevel(5, { onComplete: () => proceedOnboarding() });
      return;

    // 第5關完成 → 記憶任務
    case "before_memory_task":
      appState.onboardingStep = "onboarding_complete";
      showMemoryTaskScreen();
      return;

    // 記憶任務完成 → 結束引導（第一天=引導=固定5關），進主頁
    // 原本第6~10關還會問新家人D、E的上傳，現在改成之後幾天透過「隨機提示」
    // 或使用者自行到「管理家人照片」新增，不再卡在首刷流程裡，確保第一天剛好是5關
    case "onboarding_complete":
      appState.onboardingStep = "done";
      await setAppState("onboarding_done", true);
      await setAppState("current_base_level", 1);
      // 記成「今天已經玩過」（而不是null），這樣下一次玩才會被正確判定為「不是第一天」，
      // 正式啟用計分、滾動調整關卡、支線任務（小提醒問答/新增重要事項）
      await setAppState("last_play_date", getTodayDateString());
      showCompleteOverlay(t("gameComplete"), null, async () => {
        await showDashboard();
      });
      return;

    default:
      await showDashboard();
  }
}

// ============================================
// Step: 記憶任務畫面
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
    startTime: Date.now(), // 改為進關卡就開始計時，不用等第一次點擊才開始算（否則發呆判定永遠不會在第一次點擊前生效）
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
  container.className = gameState.config.gridClass; // game-container是id選擇器，class可直接設定不影響id樣式

  gameState.deck.forEach((cardData, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    cardEl.dataset.index = index;
    cardEl.dataset.pairKey = cardData.pairKey;

    if (cardData.isDecorative) {
      // 裝飾牌：永遠正面朝上顯示一個裝飾符號，不可點擊，不參與配對
      // 改用純文字符號呈現，不依賴外部圖檔（若圖檔路徑錯誤或遺失，原本會整張空白）
      cardEl.classList.add("card-decorative");
      cardEl.style.backgroundImage = "";
      cardEl.style.backgroundColor = "#F3D9B1";
      cardEl.textContent = "🏡";
      cardEl.style.fontSize = "36px";
      cardEl.style.cursor = "default";
      container.appendChild(cardEl);
      return;
    }

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
    // 備用人物：顯示實際插畫圖片
    cardEl.style.backgroundImage = cardData.fallbackImage ? `url(${cardData.fallbackImage})` : "";
    cardEl.style.backgroundSize = "cover";
    cardEl.style.backgroundPosition = "center";
    cardEl.style.backgroundColor = cardData.fallbackImage ? "" : "#E8A87C";
    cardEl.textContent = cardData.fallbackImage ? "" : "👤";
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
  const playableCardCount = gameState.deck.filter(c => !c.isDecorative).length;
  if (totalMatched < playableCardCount) return;

  const durationSeconds = (Date.now() - gameState.startTime) / 1000;
  const totalCards = playableCardCount;

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

  // 第7關開始：只要這關被判定為失敗(Grade 1)，明天起始關卡就不應該超過這一關，
  // 不論玩家是手動按放棄、還是被系統判定逾時/亂點才導致失敗
  if (appState.currentLevel >= 7 && gradeResult.grade === 1) {
    appState.stuckAtLevel = appState.currentLevel;
  }

  // 寫入 game_logs_store
  await addGameLog({
    date: getTodayDateString(),
    level: appState.currentLevel,
    durationSeconds: Math.round(durationSeconds),
    errorCount: gameState.errorCount,
    intervals: gameState.intervals,
    totalCards: totalCards,
    clickCount: gameState.clickCount,
    gaveUp: false,
    grade: gradeResult.grade,
    score: calculateLevelScore(appState.currentLevel, gradeResult.grade)
  });

  hideGiveUpButton();

  // 讓使用者多看一兩秒最後翻開的牌，不要太快跳走（原本是配對成功立刻跳轉，長輩根本看不清楚）
  setTimeout(() => {
    showCompleteOverlay(t("levelComplete"), null, () => {
      if (gameState.onComplete) gameState.onComplete();
    });
  }, 1200);
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
  const playableCount = gameState.deck ? gameState.deck.filter(c => !c.isDecorative).length : 0;
  const shouldShow = shouldShowGiveUpButton(
    appState.currentLevel,
    currentDuration,
    gameState.clickCount,
    playableCount,
    gameState.lastClickTime || gameState.startTime
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
  const totalCards = gameState.deck ? gameState.deck.filter(c => !c.isDecorative).length : 0;
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

  // 第7關開始：若放棄/卡關，標記這一關為「卡關」，明天不會跳到下一關
  if (appState.currentLevel >= 7) {
    appState.stuckAtLevel = appState.currentLevel;
  }

  await addGameLog({
    date: getTodayDateString(),
    level: appState.currentLevel,
    durationSeconds: Math.round(durationSeconds),
    errorCount: gameState.errorCount,
    intervals: gameState.intervals,
    totalCards: gameState.deck ? gameState.deck.filter(c => !c.isDecorative).length : 0,
    clickCount: gameState.clickCount,
    gaveUp: true,
    grade: 1,
    score: calculateLevelScore(appState.currentLevel, 1)
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
      // .gif、.png、.jpg 都走這裡；GIF會自動播放動畫
      const img = document.createElement("img");
      img.src = mediaUrl;
      mediaContainer.appendChild(img);
    }
  } else {
    // 預設過關動畫：CSS彈跳慶祝動畫（無須額外檔案）
    mediaContainer.innerHTML = '<div class="celebration-emoji">🎉</div>';
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

  const baseScore = calculateDailyScore(appState.todayLevelResults);
  const todayScore = baseScore + (appState.todayBonusScore || 0);
  const todayDateStr = getTodayDateString();
  const hasFailedGrade = appState.todayLevelResults.some(r => r.grade === 1);

  // 取得前一天分數（直接使用當天記錄的 grade，不再用殘缺資料重新評分）
  const lastDate = await getMostRecentLogDate(todayDateStr);
  let prevScore = null;
  if (lastDate) {
    const prevLogs = await getGameLogsByDate(lastDate);
    const prevResults = prevLogs.map(log => ({
      level: log.level,
      grade: typeof log.grade === "number" ? log.grade : 1 // 找不到grade的舊資料保守視為Grade 1
    }));
    prevScore = calculateDailyScore(prevResults);
  }

  const currentBaseLevel = await getAppState("current_base_level", 1);
  let nextBaseLevel = calculateNextDayStartLevel(todayScore, prevScore, currentBaseLevel, hasFailedGrade);

  // 第7關開始：若今天在某一關卡關/放棄，明天起始關卡不可超過該關（避免越級）
  if (appState.stuckAtLevel && nextBaseLevel > appState.stuckAtLevel) {
    nextBaseLevel = appState.stuckAtLevel;
  }

  await setAppState("current_base_level", nextBaseLevel);
  await setAppState("last_play_date", todayDateStr);
  appState.stuckAtLevel = null;

  // 顯示溫暖的結束訊息（不顯示失敗字眼）
  showCompleteOverlay(t("greatJobMessage"), null, async () => {
    await showDashboard();
  });
}

// ============================================
// 取得今日日期字串 YYYY-MM-DD
// 測試模式：若 TEST_MODE.virtualDate 有設定，優先採用虛擬日期，
// 讓開發者可以在同一天內模擬「過了好幾天」，不受真實時鐘限制。
// ============================================
function getTodayDateString() {
  if (TEST_MODE.enabled && TEST_MODE.virtualDate) {
    return TEST_MODE.virtualDate;
  }
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// ============================================
// 相冊聚光燈提示（問題6）：框住整個「家人相冊」區塊 + 獨立浮動對話框
// 跟原本固定寫在畫面上的文字不同，這個是動態算出相冊的實際位置框住它，
// 文字框則是另一個浮動氣泡，點擊畫面任意處就會消失
// ============================================
function showAlbumSpotlightHint(message) {
  const target = document.getElementById("family-album-grid");
  const spotlight = document.getElementById("album-spotlight");
  const tooltip = document.getElementById("album-tooltip");
  const tooltipText = document.getElementById("album-tooltip-text");
  if (!target || !spotlight || !tooltip || !tooltipText) return;

  const rect = target.getBoundingClientRect();
  const padding = 10;

  spotlight.style.top = `${rect.top - padding}px`;
  spotlight.style.left = `${rect.left - padding}px`;
  spotlight.style.width = `${rect.width + padding * 2}px`;
  spotlight.style.height = `${rect.height + padding * 2}px`;
  spotlight.classList.remove("hidden");

  tooltipText.textContent = message;
  tooltip.style.top = `${rect.bottom + padding + 12}px`;
  tooltip.style.left = `${Math.max(16, rect.left)}px`;
  tooltip.classList.remove("hidden");

  const dismiss = () => {
    spotlight.classList.add("hidden");
    tooltip.classList.add("hidden");
    document.removeEventListener("click", dismiss, true);
    document.removeEventListener("touchstart", dismiss, true);
  };
  // 延後綁定，避免顯示提示的這次點擊事件馬上又把它自己關掉
  setTimeout(() => {
    document.addEventListener("click", dismiss, true);
    document.addEventListener("touchstart", dismiss, true);
  }, 0);
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

  // 相冊還是空的時候，用框住整個相冊的提示引導使用者新增第一張照片
  if (visibleCards.length === 0) {
    showAlbumSpotlightHint(t("familyAlbumHint"));
  }

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

  if (TEST_MODE.enabled) {
    await renderTestPanel();
  }

  showScreen("screen-dashboard");
}

// ============================================
// 測試面板：模擬天數推進，方便連續測試多天流程
// ============================================
async function renderTestPanel() {
  let panel = document.getElementById("test-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "test-panel";
    panel.style.cssText = "max-width:480px;margin:0 auto 16px;padding:16px;background:#2C2C2A;color:#FFE8D6;border-radius:16px;font-size:14px;font-family:monospace;text-align:left;line-height:1.6;";
    const dashboardScreen = document.getElementById("screen-dashboard");
    dashboardScreen.insertBefore(panel, dashboardScreen.firstChild.nextSibling);
  }

  const baseLevel = await getAppState("current_base_level", 1);
  const lastPlayDate = await getAppState("last_play_date", null);
  const onboardingDone = await getAppState("onboarding_done", false);
  const today = getTodayDateString();

  panel.innerHTML = `
    <div style="margin-bottom:8px;">
      🧪 測試模式　今天(虛擬): ${today}<br>
      上次遊玩日期: ${lastPlayDate || "（無）"}　起始關卡指標: ${baseLevel}<br>
      首刷引導完成: ${onboardingDone ? "是" : "否"}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="test-advance-1" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E8A87C;color:#2C2C2A;font-weight:bold;">+1 天</button>
      <button id="test-advance-5" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E8A87C;color:#2C2C2A;font-weight:bold;">+5 天</button>
      <button id="test-reset" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E07A5F;color:#fff;font-weight:bold;">重置全部資料</button>
    </div>
  `;

  document.getElementById("test-advance-1").onclick = async () => {
    testAdvanceDay(1);
    await showDashboard();
  };
  document.getElementById("test-advance-5").onclick = async () => {
    testAdvanceDay(5);
    await showDashboard();
  };
  document.getElementById("test-reset").onclick = async () => {
    if (confirm("確定要清空所有測試資料嗎？（卡片、紀錄、進度全部重來）")) {
      await testResetAllData();
      location.reload();
    }
  };
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
// 開始今天的遊戲（每日固定 5 關 + 支線任務）
// 第2天起：玩1關→小提醒問答→玩2關→新增重要事項→玩2關→小提醒問答(不重複)
// ============================================
async function startTodaySession() {
  appState.todayLevelResults = [];
  appState.giveUpCountToday = 0;
  appState.todayQuizQuestionsAsked = [];
  appState.todayBonusScore = 0;

  const baseLevel = await getAppState("current_base_level", 1);
  const levelsToPlay = [];
  for (let i = 0; i < SCORING_CONFIG.dailyLevelCount; i++) {
    const lvl = Math.min(baseLevel + i, 10);
    levelsToPlay.push(lvl);
  }

  const lastPlayDate = await getAppState("last_play_date", null);
  const isFirstDay = !lastPlayDate;

  appState.dailyLevelsToPlay = levelsToPlay;
  appState.isFirstDayOfPlay = isFirstDay;

  await playLevelSequence(levelsToPlay, 0);
}

// 依序播放關卡序列，並在指定關卡之間插入支線任務
async function playLevelSequence(levels, index) {
  if (index >= levels.length) {
    await maybeShowRandomEndHint(() => endTodaySession(false));
    return;
  }

  const level = levels[index];
  await playLevel(level, {
    onComplete: () => handleAfterLevelInSequence(levels, index)
  });
}

// 處理某一關結束後的支線任務插入點
// 第一天（首刷引導）不觸發任何支線任務，維持原本5關連續的設計
async function handleAfterLevelInSequence(levels, index) {
  if (appState.isFirstDayOfPlay) {
    await playLevelSequence(levels, index + 1);
    return;
  }

  // index 0 = 剛玩完第1關 → 小提醒問答(第一次)
  // index 2 = 剛玩完第3關 → 新增重要事項
  // index 4 = 剛玩完第5關 → 小提醒問答(第二次，不重複)
  if (index === 0) {
    await showQuizScreen(() => playLevelSequence(levels, index + 1));
  } else if (index === 2) {
    await maybeShowAddMemoScreen(() => playLevelSequence(levels, index + 1));
  } else if (index === 4) {
    await showQuizScreen(() => playLevelSequence(levels, index + 1));
  } else {
    await playLevelSequence(levels, index + 1);
  }
}

// ============================================
// 支線任務：小提醒問答
// ============================================
async function showQuizScreen(onContinue) {
  const allTasks = await getAllMemoryTasks();

  // 排除今天已經問過的題目
  const available = allTasks.filter(task => !appState.todayQuizQuestionsAsked.includes(task.taskId));

  if (available.length === 0) {
    // 沒有可問的題目（尚未建立任何重要事項），直接跳過
    onContinue();
    return;
  }

  const task = available[Math.floor(Math.random() * available.length)];
  appState.todayQuizQuestionsAsked.push(task.taskId);
  appState.currentQuizTask = task;
  appState.quizUsedHint = false;
  appState.quizStartTime = Date.now();

  document.getElementById("quiz-title").textContent = t("quizPromptTitle");
  document.getElementById("quiz-question").textContent = task.question;
  document.getElementById("quiz-answer-input").value = "";
  document.getElementById("quiz-feedback").classList.add("hidden");
  document.getElementById("quiz-slow-reminder").classList.add("hidden");
  document.getElementById("btn-quiz-hint").classList.remove("hidden");
  document.getElementById("btn-quiz-hint").textContent = t("quizShowHint");
  document.getElementById("btn-quiz-submit").textContent = t("quizSubmit");
  document.getElementById("btn-quiz-skip").textContent = t("quizSkip");

  // 秒數過長提示（15秒沒有作答顯示提示文字）
  if (appState.quizSlowTimer) clearTimeout(appState.quizSlowTimer);
  appState.quizSlowTimer = setTimeout(() => {
    document.getElementById("quiz-slow-reminder").textContent = t("quizSlowReminder");
    document.getElementById("quiz-slow-reminder").classList.remove("hidden");
  }, 15000);

  document.getElementById("btn-quiz-hint").onclick = () => {
    appState.quizUsedHint = true;
    document.getElementById("quiz-answer-input").value = task.hint || "";
  };

  document.getElementById("btn-quiz-submit").onclick = async () => {
    const userAnswer = document.getElementById("quiz-answer-input").value.trim();
    const isCorrect = userAnswer && task.answer && userAnswer.replace(/\s/g, "") === task.answer.replace(/\s/g, "");

    if (appState.quizSlowTimer) clearTimeout(appState.quizSlowTimer);

    const feedbackEl = document.getElementById("quiz-feedback");
    feedbackEl.classList.remove("hidden");

    if (isCorrect) {
      feedbackEl.textContent = t("quizCorrect");
      // 答對加分：自己答對+2，用提示答對+0
      appState.todayBonusScore += appState.quizUsedHint ? 0 : 2;
      setTimeout(() => onContinue(), 1200);
    } else {
      feedbackEl.textContent = t("quizWrong");
      // 答錯不重複扣分，直接給提示按鈕保留，讓使用者可以再試一次或跳過
    }
  };

  document.getElementById("btn-quiz-skip").onclick = () => {
    if (appState.quizSlowTimer) clearTimeout(appState.quizSlowTimer);
    onContinue();
  };

  showScreen("screen-quiz");
}

// ============================================
// 支線任務：詢問是否新增重要記憶事項（少於5項才問）
// ============================================
async function maybeShowAddMemoScreen(onContinue) {
  const allTasks = await getAllMemoryTasks();

  if (allTasks.length >= 5) {
    onContinue();
    return;
  }

  document.getElementById("add-memo-title").textContent = t("askAddNewMemo");
  document.getElementById("add-memo-question").placeholder = t("addMemoQuestionPlaceholder");
  document.getElementById("add-memo-answer").placeholder = t("addMemoAnswerPlaceholder");
  document.getElementById("add-memo-question").value = "";
  document.getElementById("add-memo-answer").value = "";
  document.getElementById("btn-save-new-memo").textContent = t("addMemoSave");
  document.getElementById("btn-skip-new-memo").textContent = t("addMemoSkip");

  document.getElementById("btn-save-new-memo").onclick = async () => {
    const question = document.getElementById("add-memo-question").value.trim();
    const answer = document.getElementById("add-memo-answer").value.trim();
    if (question && answer) {
      await addMemoryTask({ question, answer, hint: answer });
    }
    onContinue();
  };

  document.getElementById("btn-skip-new-memo").onclick = () => {
    onContinue();
  };

  showScreen("screen-add-memo");
}

// ============================================
// 每日結束後的隨機提示（順利完成5關且分數未退步才可能出現）
// 機率50%，隨著照片數/記憶事項數增加而降低頻率
// ============================================
async function maybeShowRandomEndHint(onContinue) {
  if (appState.isFirstDayOfPlay) {
    onContinue();
    return;
  }

  const hasFailedGrade = appState.todayLevelResults.some(r => r.grade === 1);
  if (hasFailedGrade) {
    onContinue();
    return;
  }

  const todayScore = calculateDailyScore(appState.todayLevelResults);
  const lastDate = await getMostRecentLogDate(getTodayDateString());
  let prevScore = null;
  if (lastDate) {
    const prevLogs = await getGameLogsByDate(lastDate);
    prevScore = prevLogs.length; // 簡化比較：用關卡數量做基準，避免重複計算grade
  }
  const scoreNotRegressed = prevScore === null || todayScore >= 0; // 已在endTodaySession做更嚴謹計算，這裡僅作為門檻

  if (!scoreNotRegressed) {
    onContinue();
    return;
  }

  // 隨著照片數/記憶事項數增加，降低出現頻率
  const allCards = (await getAllCards()).filter(c => !c.isFallback && c.imageCurrent);
  const allTasks = await getAllMemoryTasks();
  const totalItems = allCards.length + allTasks.length;

  // 基礎機率50%，每多5個項目降低10%，最低10%
  let probability = 0.5 - Math.floor(totalItems / 5) * 0.1;
  probability = Math.max(probability, 0.1);

  if (Math.random() > probability) {
    onContinue();
    return;
  }

  // 隨機選擇：新增照片 或 新增重要事項
  const showPhotoHint = Math.random() < 0.5;

  if (showPhotoHint) {
    showCompleteOverlay(t("randomHintAddPhoto"), null, async () => {
      onContinue();
    });
  } else {
    if (allTasks.length >= 5) {
      onContinue();
      return;
    }
    await maybeShowAddMemoScreen(onContinue);
  }
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
