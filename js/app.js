// ============================================
// app.js - 主程式
// 畫面流程控制 + 翻牌遊戲核心邏輯（重構自原始版本）
// ============================================

// ---- 開發用設定 ----
// 上線前將此設為 false，即可隱藏遊戲畫面上的分數/關卡除錯資訊
const DEBUG_MODE = false;

// ---- 測試模式：可在不受真實日期限制的情況下，模擬「過了好幾天」 ----
// 上線前把 enabled 設為 false 即可完全關閉測試面板
const TEST_MODE = {
  enabled: false,
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
// 付費門檻 / 機構代碼
// ============================================

// 免費用戶（個人未訂閱、企業未啟用授權碼）最多只能玩到這一關
const FREE_LEVEL_CAP = 6;

// 機構代碼驗證：目前先用寫在程式裡的測試代碼，之後要換成查Supabase的正式代碼表
// ⚠️ 寫在前端程式碼裡的清單，任何人打開原始碼都看得到，正式機構上線前一定要換成後端驗證
const VALID_INSTITUTION_CODES = ["DEMO2026", "SEEYOU-TEST"];

async function isPremiumUnlocked() {
  const subscribed = await getAppState("is_subscribed", false);
  const enterpriseUnlocked = await getAppState("is_enterprise_unlocked", false);
  return subscribed || enterpriseUnlocked;
}

// 「訂閱」按鈕目前還沒接上StoreKit，先模擬解鎖成功，方便測試完整體驗
// 之後接Capacitor + StoreKit時，這裡要換成真正處理購買結果後才設定is_subscribed
async function handleSimulateSubscribe() {
  await setAppState("is_subscribed", true);
  alert(t("subscribeSimulatedMessage"));
}

async function handleSubmitInstitutionCode() {
  const input = document.getElementById("institution-code-input");
  const code = input.value.trim().toUpperCase();
  const feedbackEl = document.getElementById("institution-code-feedback");

  if (VALID_INSTITUTION_CODES.includes(code)) {
    await setAppState("is_enterprise_unlocked", true);
    await setAppState("enterprise_code", code);
    feedbackEl.textContent = t("institutionCodeSuccess");
    feedbackEl.classList.remove("hidden");
    setTimeout(() => showSettingsScreen(), 1000);
  } else {
    feedbackEl.textContent = t("institutionCodeError");
    feedbackEl.classList.remove("hidden");
  }
}

// ============================================
// 字體大小 / 語言偏好
// ============================================

const FONT_SIZE_MAP = { small: "87.5%", medium: "100%", large: "115%", xlarge: "130%" };

async function applyFontSizePreference() {
  const level = await getAppState("font_size_level", "medium");
  document.documentElement.style.fontSize = FONT_SIZE_MAP[level] || FONT_SIZE_MAP.medium;
}

async function handleSetFontSize(level) {
  await setAppState("font_size_level", level);
  await applyFontSizePreference();
  await showSettingsScreen();
}

// 語言偏好：有手動設定過就用設定的，否則用手機系統語言自動偵測(i18n.js的detectLocale)
async function applyLocalePreference() {
  const override = await getAppState("locale_override", null);
  if (override) setLocale(override);
}

async function handleSetLocale(locale) {
  await setAppState("locale_override", locale);
  setLocale(locale);
  applyTranslations();
  await showSettingsScreen();
}

// ============================================
// 關於 / 設定 / 機構代碼 / 聯繫 / 付費門檻 畫面
// ============================================

function showAboutScreen() {
  document.getElementById("about-title").textContent = t("aboutTitle");
  document.getElementById("about-body").textContent = t("aboutBody");
  document.getElementById("btn-about-back").textContent = t("backButton");
  document.getElementById("btn-about-back").onclick = () => showDashboard();
  showScreen("screen-about");
}

async function showSettingsScreen() {
  document.getElementById("settings-title").textContent = t("settingsTitle");
  document.getElementById("settings-fontsize-label").textContent = t("settingsFontSizeLabel");
  document.getElementById("settings-language-label").textContent = t("settingsLanguageLabel");

  const currentFontSize = await getAppState("font_size_level", "medium");
  const fontSizeOptions = document.getElementById("settings-fontsize-options");
  fontSizeOptions.innerHTML = "";
  [
    { level: "small", label: t("fontSizeSmall") },
    { level: "medium", label: t("fontSizeMedium") },
    { level: "large", label: t("fontSizeLarge") },
    { level: "xlarge", label: t("fontSizeXLarge") }
  ].forEach(opt => {
    const btn = document.createElement("button");
    btn.className = opt.level === currentFontSize ? "btn" : "btn btn-secondary";
    btn.textContent = opt.label;
    btn.onclick = () => handleSetFontSize(opt.level);
    fontSizeOptions.appendChild(btn);
  });

  const languageSelect = document.getElementById("settings-language-select");
  languageSelect.value = getLocale();
  languageSelect.onchange = (e) => handleSetLocale(e.target.value);

  document.getElementById("btn-institution-entry").textContent = t("institutionEntryButton");
  document.getElementById("btn-institution-entry").onclick = showInstitutionCodeScreen;

  const enterpriseUnlocked = await getAppState("is_enterprise_unlocked", false);
  const clearDataBtn = document.getElementById("btn-clear-all-data");
  if (enterpriseUnlocked) {
    clearDataBtn.style.display = "block";
    clearDataBtn.textContent = t("clearAllDataButton");
    clearDataBtn.onclick = async () => {
      if (confirm(t("clearAllDataConfirm1")) && confirm(t("clearAllDataConfirm2"))) {
        await testResetAllData();
        location.reload();
      }
    };
  } else {
    clearDataBtn.style.display = "none";
  }

  document.getElementById("btn-settings-back").textContent = t("backButton");
  document.getElementById("btn-settings-back").onclick = () => showDashboard();

  showScreen("screen-settings");
}

function showInstitutionCodeScreen() {
  document.getElementById("institution-code-title").textContent = t("institutionCodeTitle");
  document.getElementById("institution-code-input").placeholder = t("institutionCodePlaceholder");
  document.getElementById("institution-code-input").value = "";
  document.getElementById("institution-code-feedback").classList.add("hidden");
  document.getElementById("btn-submit-institution-code").textContent = t("confirmButton");
  document.getElementById("btn-submit-institution-code").onclick = handleSubmitInstitutionCode;
  document.getElementById("btn-institution-code-back").textContent = t("backButton");
  document.getElementById("btn-institution-code-back").onclick = () => showSettingsScreen();
  showScreen("screen-institution-code");
}

function showContactScreen() {
  document.getElementById("contact-title").textContent = t("contactTitle");
  document.getElementById("contact-body").textContent = t("contactBody");
  const emailLink = document.getElementById("contact-email-link");
  emailLink.textContent = t("contactEmailButton");
  emailLink.href = `mailto:${t("contactEmailAddress")}`;
  document.getElementById("btn-contact-back").textContent = t("backButton");
  document.getElementById("btn-contact-back").onclick = () => showDashboard();
  showScreen("screen-contact");
}

// 第7關起需要付費才能繼續，玩到第6關時觸發這個畫面
function showPaywallScreen(onContinue) {
  document.getElementById("paywall-title").textContent = t("paywallTitle");
  document.getElementById("paywall-body").textContent = t("paywallBody");
  document.getElementById("btn-paywall-subscribe").textContent = t("paywallSubscribeButton");
  document.getElementById("btn-paywall-subscribe").onclick = async () => {
    await handleSimulateSubscribe();
    onContinue();
  };
  document.getElementById("btn-paywall-later").textContent = t("paywallLaterButton");
  document.getElementById("btn-paywall-later").onclick = () => onContinue();
  showScreen("screen-paywall");
}


window.addEventListener("DOMContentLoaded", async () => {
  await applyLocalePreference();
  await applyFontSizePreference();
  applyTranslations();
  bindWelcomeEvents();

  // 補送之前因為沒網路/失敗而留在佇列裡的雲端同步紀錄
  flushSyncQueue();

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
  document.getElementById("streak-label").textContent = t("streakDaysShort");
  document.getElementById("album-label").textContent = t("familyAlbum");
  document.getElementById("memos-label").textContent = t("importantMemos");
  document.getElementById("btn-add-photo").textContent = t("addPhoto");
  document.getElementById("btn-manage-memos").textContent = t("manageMemosButton");
  document.getElementById("btn-share").textContent = t("shareButton");
  document.getElementById("btn-play-today").textContent = t("playTodayButton");
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
    photos: [appState.pendingPhotoBlob, null, null, null], // 最多4張，目前只有第1張
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
    card = { cardId, relation: "家人", photos: [appState.pendingPhotoBlob, null, null, null], hidden: false };
  } else {
    if (!card.photos) card.photos = [null, null, null, null];
    card.photos[1] = appState.pendingPhotoBlob;
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
    photos: [null, null, null, null],
    audioHint: null,
    hidden: true,
    isFallback: true,
    fallbackImage: fallback.photos[0]
  });
  await proceedOnboarding();
}

// ============================================
// 引導流程狀態機
// ============================================
// 上傳家人問候影片：每天過關時會播放這段影片
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function showVideoUploadScreen() {
  document.getElementById("video-upload-prompt").textContent = t("askUploadVideo");
  document.getElementById("video-upload-hint").textContent = t("videoUploadHint");
  document.getElementById("video-upload-feedback").classList.add("hidden");
  document.getElementById("btn-skip-video-upload").textContent = t("skipButton");
  document.getElementById("btn-skip-video-upload").onclick = handleSkipVideoUpload;

  const uploadArea = document.getElementById("video-upload-area");
  const fileInput = document.getElementById("video-file-input");
  fileInput.value = "";
  uploadArea.onclick = () => fileInput.click();
  fileInput.onchange = handleVideoFileSelected;

  showScreen("screen-video-upload");
}

async function handleVideoFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const feedbackEl = document.getElementById("video-upload-feedback");

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    feedbackEl.textContent = t("videoTooLargeError");
    feedbackEl.classList.remove("hidden");
    event.target.value = "";
    return;
  }

  feedbackEl.classList.add("hidden");

  const reader = new FileReader();
  reader.onload = async () => {
    await setAppState("family_video", reader.result);
    await proceedOnboarding();
  };
  reader.onerror = () => {
    feedbackEl.textContent = t("videoTooLargeError");
    feedbackEl.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function handleSkipVideoUpload() {
  await proceedOnboarding();
}

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
      const cards = (await getAllCards()).filter(c => !c.isFallback && c.photos && c.photos[0]);
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

    // 第3關完成 → 邀請上傳一段問候影片（每天過關時會播放）
    case "before_level_4":
      appState.onboardingStep = "video_upload_done";
      showVideoUploadScreen();
      return;

    // 影片上傳完（或跳過）→ 進第4關
    case "video_upload_done":
      appState.onboardingStep = "before_level_5";
      await playLevel(4, { onComplete: () => proceedOnboarding() });
      return;

    // 第4關完成 → 從只有1張照片的家人(B或C)隨機選一人補第2張
    case "before_level_5": {
      const allCards = (await getAllCards()).filter(c => !c.isFallback && c.photos && c.photos[0]);
      // 只有1張照片的家人（沒有第2張）
      const singlePhotoCards = allCards.filter(c => !c.photos[1]);
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
      await setAppState("current_base_level", 2);
      await setAppState("dashboard_hint_stage", "album");
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
        question: t("quizContactPhoneQuestion", { name }),
        answer: phone,
        hint: name,
        category: "contact_phone"
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
      // 裝飾牌：永遠正面朝上顯示App icon，不可點擊，不參與配對
      cardEl.classList.add("card-decorative");
      cardEl.style.backgroundImage = "url(icons/icon-512.png)";
      cardEl.style.backgroundSize = "cover";
      cardEl.style.backgroundPosition = "center";
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
  }, 600);
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
    if (mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm") || mediaUrl.startsWith("data:video/")) {
      const video = document.createElement("video");
      video.src = mediaUrl;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      video.setAttribute("webkit-playsinline", "true"); // 舊版iOS Safari需要
      // PWA環境有時候載入大型base64會失敗，改成fallback慶祝動畫而不是整個卡死
      video.onerror = () => {
        mediaContainer.innerHTML = '<div class="celebration-emoji">🎉</div>';
      };
      mediaContainer.appendChild(video);
      // 強制嘗試播放（PWA standalone模式有時候不會自動觸發autoplay）
      video.play().catch(() => {
        // 播放被瀏覽器拒絕（例如需要使用者手勢才能播），這時候有controls讓使用者自己按就好
      });
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
  const todayBonus = appState.todayBonusScore || 0;
  const todayScore = baseScore + todayBonus;
  const todayDateStr = getTodayDateString();
  const hasFailedGrade = appState.todayLevelResults.some(r => r.grade === 1);

  // 把今天的問答加分存起來，這樣明天回頭重建「昨天分數」時才能正確算進去
  // (原本這個加分只存在記憶體appState裡，從來沒有寫進資料庫，導致比較基準偏低)
  await setAppState(`bonus_${todayDateStr}`, todayBonus);

  // 取得前一天分數（用當天記錄的 grade 重新計算基本分，再加回當天存的問答加分）
  const lastDate = await getMostRecentLogDate(todayDateStr);
  let prevScore = null;
  if (lastDate) {
    const prevLogs = await getGameLogsByDate(lastDate);
    const prevResults = prevLogs.map(log => ({
      level: log.level,
      grade: typeof log.grade === "number" ? log.grade : 1 // 找不到grade的舊資料保守視為Grade 1
    }));
    const prevBonus = await getAppState(`bonus_${lastDate}`, 0);
    prevScore = calculateDailyScore(prevResults) + prevBonus;
  }

  const currentBaseLevel = await getAppState("current_base_level", 1);
  const currentStallCount = await getAppState("level_stall_count", 0);
  const { nextBaseLevel: rawNextBaseLevel, nextStallCount } = calculateNextDayStartLevel(
    todayScore, prevScore, currentBaseLevel, hasFailedGrade, currentStallCount
  );
  let nextBaseLevel = rawNextBaseLevel;

  // 第7關開始：若今天在某一關卡關/放棄，明天起始關卡不可超過該關（避免越級）
  if (appState.stuckAtLevel && nextBaseLevel > appState.stuckAtLevel) {
    nextBaseLevel = appState.stuckAtLevel;
  }

  await setAppState("current_base_level", nextBaseLevel);
  await setAppState("level_stall_count", nextStallCount);
  await setAppState("last_play_date", todayDateStr);
  appState.stuckAtLevel = null;

  // 把今天的分數結果送進雲端同步佇列(本機優先寫好，背景嘗試上傳，失敗不影響遊戲)
  queueDailyScoreSync({
    playDate: todayDateStr,
    score: todayScore,
    baseLevelAfter: nextBaseLevel,
    hadFailure: hasFailedGrade
  });

  // 第一次真正遊戲結束後，把主頁引導提示從「相冊」換成「重要記憶事項」
  const hintStage = await getAppState("dashboard_hint_stage", null);
  if (hintStage === "album") {
    await setAppState("dashboard_hint_stage", "memory");
  }

  // 顯示溫暖的結束訊息（不顯示失敗字眼），如果有上傳問候影片，今天全部通關才播放
  const videoResult = await getVideoToPlay();
  showCompleteOverlay(t("greatJobMessage"), videoResult.url, async () => {
    await showDashboard();
  });

  // 如果播的是預設影片（不是家人親自上傳的），在完成畫面下方顯示一個小提示
  if (!videoResult.isPersonal && videoResult.url) {
    const reminderBtn = document.createElement("button");
    reminderBtn.textContent = t("uploadPersonalVideoReminder");
    reminderBtn.className = "btn btn-secondary";
    reminderBtn.style.cssText = "font-size:1rem;margin-top:12px;";
    reminderBtn.onclick = () => {
      document.getElementById("screen-complete").classList.add("hidden");
      showVideoUploadScreen();
    };
    const completeScreen = document.getElementById("screen-complete");
    const continueBtn = document.getElementById("btn-continue");
    completeScreen.insertBefore(reminderBtn, continueBtn);
  }
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
function showDashboardSpotlight(targetElementId, message) {
  const target = document.getElementById(targetElementId);
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
  tooltip.classList.remove("hidden");

  // 先量出提示框實際高度，再決定放在目標的上方還是下方，避免目標太靠近畫面底部時看不到
  const tooltipHeight = tooltip.getBoundingClientRect().height;
  const spaceBelow = window.innerHeight - rect.bottom;
  const arrowEl = tooltip.querySelector(".album-hint-arrow");

  if (spaceBelow < tooltipHeight + padding * 2) {
    // 下面空間不夠，改放到目標上方，箭頭改成往下指
    tooltip.style.top = `${Math.max(16, rect.top - tooltipHeight - padding - 12)}px`;
    if (arrowEl) arrowEl.textContent = "↓";
  } else {
    tooltip.style.top = `${rect.bottom + padding + 12}px`;
    if (arrowEl) arrowEl.textContent = "↑";
  }
  tooltip.style.left = `${Math.max(16, rect.left)}px`;

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
// 主頁引導提示，分兩階段：
// 階段"album"：引導(第1-5關)結束後，框住家人相冊
// 階段"memory"：第一次「真正遊戲」結束後，換成框住重要記憶事項
// 兩階段都用同一組紅色虛線聚光燈元件，只是換目標跟文字
// ============================================
async function showStagedDashboardHint() {
  const stage = await getAppState("dashboard_hint_stage", null);
  if (stage === "album") {
    requestAnimationFrame(() => showDashboardSpotlight("album-dashboard-item", t("albumSpotlightCaption")));
  } else if (stage === "memory") {
    // 起始關卡指標到4之後，視為使用者已經熟悉介面，不再顯示這個提示
    const baseLevel = await getAppState("current_base_level", 1);
    if (baseLevel >= 4) {
      await setAppState("dashboard_hint_stage", "done");
      return;
    }
    requestAnimationFrame(() => showDashboardSpotlight("memos-dashboard-item", t("memorySpotlightCaption")));
  }
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
    const thumb = card.photos && card.photos[0];
    if (thumb) {
      const img = document.createElement("img");
      img.src = blobToURL(thumb);
      img.title = card.relation;
      albumGrid.appendChild(img);
    }
  });

  // 主頁引導提示分兩階段(album→memory)，實際呼叫移到最後面 showScreen 之後，
  // 等畫面真的可見了才量位置

  // 重要記憶事項
  const tasks = await getAllMemoryTasks();
  const memosList = document.getElementById("memos-list");
  memosList.innerHTML = "";
  tasks.forEach(task => {
    const p = document.createElement("p");
    p.textContent = `${task.hint}: ${task.answer}`;
    p.className = "memo-item-text";
    memosList.appendChild(p);
  });

  // 綁定按鈕
  document.getElementById("btn-add-photo").onclick = showManagePhotosScreen;
  document.getElementById("btn-manage-memos").onclick = handleManualAddMemo;
  document.getElementById("btn-about").onclick = showAboutScreen;
  document.getElementById("btn-settings").onclick = showSettingsScreen;
  document.getElementById("btn-contact").onclick = showContactScreen;

  document.getElementById("btn-share").onclick = handleShareInvite;
  document.getElementById("btn-play-today").onclick = startTodaySession;

  if (TEST_MODE.enabled) {
    await renderTestPanel();
  }

  showScreen("screen-dashboard");

  // 一定要等畫面真的顯示出來(從 display:none 變成可見)之後才能量到正確的位置，
  // 用 requestAnimationFrame 確保瀏覽器已經完成這次的版面配置(layout)
  await showStagedDashboardHint();
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
    dashboardScreen.appendChild(panel); // 放在最下面，方便測試時看畫面實際的感覺
  }

  const baseLevel = await getAppState("current_base_level", 1);
  const lastPlayDate = await getAppState("last_play_date", null);
  const onboardingDone = await getAppState("onboarding_done", false);
  const today = getTodayDateString();

  // 昨天(最近一次不是今天)的分數，方便確認晉降級的比較基準對不對
  const prevDate = await getMostRecentLogDate(today);
  let prevScoreText = "（無紀錄）";
  if (prevDate) {
    const prevLogs = await getGameLogsByDate(prevDate);
    const prevResults = prevLogs.map(log => ({ level: log.level, grade: typeof log.grade === "number" ? log.grade : 1 }));
    const prevBonus = await getAppState(`bonus_${prevDate}`, 0);
    const prevScore = calculateDailyScore(prevResults) + prevBonus;
    prevScoreText = `${prevScore.toFixed(1)} (${prevDate})`;
  }
  const stallCount = await getAppState("level_stall_count", 0);

  panel.innerHTML = `
    <div style="margin-bottom:8px;">
      🧪 測試模式　今天(虛擬): ${today}<br>
      上次遊玩日期: ${lastPlayDate || "（無）"}　起始關卡指標: ${baseLevel}<br>
      首刷引導完成: ${onboardingDone ? "是" : "否"}　昨天得分: ${prevScoreText}<br>
      連續未過次數: ${stallCount} / 2（累積到2才會降一關）
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <button id="test-advance-1" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E8A87C;color:#2C2C2A;font-weight:bold;">+1 天</button>
      <button id="test-advance-5" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E8A87C;color:#2C2C2A;font-weight:bold;">+5 天</button>
      <button id="test-reset" style="flex:1;min-width:90px;padding:10px;border:none;border-radius:8px;background:#E07A5F;color:#fff;font-weight:bold;">重置全部資料</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <span>手動設定起始關卡(1-10):</span>
      <input id="test-set-level-input" type="number" min="1" max="10" value="${baseLevel}" style="width:60px;padding:6px;border-radius:6px;border:none;color:#2C2C2A;">
      <button id="test-set-level-btn" style="flex:1;padding:8px;border:none;border-radius:8px;background:#B8D4C8;color:#2C2C2A;font-weight:bold;">套用</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span>測試語言:</span>
      <select id="test-locale-select" style="flex:1;padding:6px;border-radius:6px;color:#2C2C2A;">
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="ja">日本語</option>
      </select>
    </div>
  `;

  document.getElementById("test-locale-select").value = getLocale();

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
  document.getElementById("test-set-level-btn").onclick = async () => {
    let value = parseInt(document.getElementById("test-set-level-input").value, 10);
    if (isNaN(value)) return;
    value = Math.max(1, Math.min(10, value));
    await setAppState("current_base_level", value);
    await setAppState("level_stall_count", 0);
    await showDashboard();
  };
  document.getElementById("test-locale-select").onchange = async (e) => {
    setLocale(e.target.value);
    applyTranslations();
    await showDashboard();
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

    // 照片區：只顯示「已有的照片」+ 1個「+」新增格(滿4張就不再顯示+)
    const photosDiv = document.createElement("div");
    photosDiv.className = "person-photos";

    const filledCount = getPhotos(card).length;
    for (let i = 0; i < filledCount; i++) {
      photosDiv.appendChild(buildPhotoSlot(card, i));
    }
    if (filledCount < 4) {
      photosDiv.appendChild(buildPhotoSlot(card, filledCount)); // 這格是空的，會自動顯示成「+」
    }

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
function buildPhotoSlot(card, photoIndex) {
  const el = document.createElement("div");
  el.className = "person-photo";
  el.title = t("photoSlotLabel", { n: photoIndex + 1 });

  const imageData = card.photos && card.photos[photoIndex];

  if (imageData) {
    el.style.backgroundImage = `url(${blobToURL(imageData)})`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.classList.add("empty");
    el.textContent = "+";
  }

  el.onclick = () => triggerPhotoSlotUpload(card, photoIndex);

  return el;
}

// 點擊照片格子時，開啟檔案選擇並更新該欄位
function triggerPhotoSlotUpload(card, photoIndex) {
  const fileInput = document.getElementById("file-input");
  fileInput.value = "";

  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const base64 = await fileToBlob(file);
    if (!card.photos) card.photos = [null, null, null, null];
    card.photos[photoIndex] = base64;
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
    photos: [null, null, null, null],
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
  const fullLevelsToPlay = [];
  for (let i = 0; i < SCORING_CONFIG.dailyLevelCount; i++) {
    const lvl = Math.min(baseLevel + i, 10);
    fullLevelsToPlay.push(lvl);
  }

  // 免費用戶（個人未訂閱、企業未啟用授權碼）只能玩到第6關
  const premium = await isPremiumUnlocked();
  const levelsToPlay = premium ? fullLevelsToPlay : fullLevelsToPlay.filter(lvl => lvl <= FREE_LEVEL_CAP);
  appState.paywallPending = !premium && levelsToPlay.length < fullLevelsToPlay.length;

  const lastPlayDate = await getAppState("last_play_date", null);
  const isFirstDay = !lastPlayDate;

  appState.dailyLevelsToPlay = levelsToPlay;
  appState.isFirstDayOfPlay = isFirstDay;

  await playLevelSequence(levelsToPlay, 0);
}

// 依序播放關卡序列，並在指定關卡之間插入支線任務
async function playLevelSequence(levels, index) {
  if (index >= levels.length) {
    if (appState.paywallPending) {
      appState.paywallPending = false;
      showPaywallScreen(() => maybeShowRandomEndHint(() => endTodaySession(false)));
      return;
    }
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
  document.getElementById("quiz-hint-text").classList.add("hidden");
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
    document.getElementById("quiz-answer-input").value = task.answer || "";
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
// 5個固定分類，依序隨機問，問完(或選否/其他)就不再問，使用者可自行於儀表板手動新增
const ALL_MEMORY_CATEGORIES = ["medication", "doctor_visit", "birthday", "school", "transportation"];

const MEMORY_CATEGORY_TEXT = {
  medication: { ask: () => t("askHasMedication"), detail: () => t("askMedicationTime"), label: () => t("labelMedicationTime") },
  doctor_visit: { ask: () => t("askHasDoctorVisit"), detail: () => t("askDoctorVisitTime"), label: () => t("labelDoctorVisit") },
  birthday: { ask: (name) => t("askKnowsBirthday", { name }), detail: (name) => t("askBirthdayIs", { name }), label: (name) => t("labelBirthday", { name }) },
  school: { ask: (name) => t("askKnowsSchool", { name }), detail: (name) => t("askSchoolIs", { name }), label: (name) => t("labelSchool", { name }) }
};

async function markCategoryResolved(categoryId) {
  const resolved = await getAppState("resolved_categories", []);
  if (!resolved.includes(categoryId)) {
    resolved.push(categoryId);
    await setAppState("resolved_categories", resolved);
  }
}

async function maybeShowAddMemoScreen(onContinue) {
  const resolved = await getAppState("resolved_categories", []);
  const pending = ALL_MEMORY_CATEGORIES.filter(id => !resolved.includes(id));

  if (pending.length === 0) {
    onContinue();
    return;
  }

  const categoryId = pending[Math.floor(Math.random() * pending.length)];

  if (categoryId === "birthday" || categoryId === "school") {
    const realCards = (await getAllCards()).filter(c => !c.isFallback && getPhotos(c).length > 0);
    if (realCards.length === 0) {
      // 還沒有任何家人照片，這次先跳過、不標記完成，下次再抽到機會
      onContinue();
      return;
    }
    showFamilyPickerForCategory(categoryId, realCards, onContinue);
    return;
  }

  if (categoryId === "transportation") {
    showTransportationQuestion(onContinue);
    return;
  }

  showCategoryYesNo(categoryId, null, onContinue);
}

// 生日/學校類：先選要問哪位家人
function showFamilyPickerForCategory(categoryId, realCards, onContinue) {
  document.getElementById("category-task-title").textContent = t("selectFamilyMemberTitle");
  document.getElementById("category-task-question").textContent = "";
  const optionsEl = document.getElementById("category-task-options");
  optionsEl.innerHTML = "";

  realCards.forEach(card => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.textContent = card.relation;
    btn.onclick = () => showCategoryYesNo(categoryId, card.relation, onContinue);
    optionsEl.appendChild(btn);
  });

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn btn-skip";
  skipBtn.textContent = t("quizSkip");
  skipBtn.onclick = () => onContinue(); // 這次不選，不標記完成，下次再抽到機會
  optionsEl.appendChild(skipBtn);

  showScreen("screen-category-task");
}

// 是否題：是 → 進細節題；否 → 標記完成，以後不再問
function showCategoryYesNo(categoryId, targetName, onContinue) {
  const textDef = MEMORY_CATEGORY_TEXT[categoryId];
  document.getElementById("category-task-title").textContent = t("quizPromptTitle");
  document.getElementById("category-task-question").textContent = textDef.ask(targetName);
  const optionsEl = document.getElementById("category-task-options");
  optionsEl.innerHTML = "";

  const yesBtn = document.createElement("button");
  yesBtn.className = "btn";
  yesBtn.textContent = t("yesAnswer");
  yesBtn.onclick = () => showCategoryDetail(categoryId, targetName, onContinue);
  optionsEl.appendChild(yesBtn);

  const noBtn = document.createElement("button");
  noBtn.className = "btn btn-secondary";
  noBtn.textContent = t("noAnswer");
  noBtn.onclick = async () => {
    await markCategoryResolved(categoryId);
    onContinue();
  };
  optionsEl.appendChild(noBtn);

  showScreen("screen-category-task");
}

// 細節題：填寫實際答案，存成可被支線任務問答的記憶事項
function showCategoryDetail(categoryId, targetName, onContinue) {
  const textDef = MEMORY_CATEGORY_TEXT[categoryId];
  const questionText = textDef.detail(targetName);

  document.getElementById("category-task-title").textContent = t("quizPromptTitle");
  document.getElementById("category-task-question").textContent = questionText;
  const optionsEl = document.getElementById("category-task-options");
  optionsEl.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "input-field";
  optionsEl.appendChild(input);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = t("addMemoSave");
  saveBtn.onclick = async () => {
    const answer = input.value.trim();
    if (answer) {
      await addMemoryTask({ question: questionText, answer, hint: textDef.label(targetName), category: categoryId });
    }
    await markCategoryResolved(categoryId);
    onContinue();
  };
  optionsEl.appendChild(saveBtn);

  showScreen("screen-category-task");
  input.focus();
}

// 交通工具：三選一，開車/騎車與大眾運輸要再問細節，其他直接標記完成
function showTransportationQuestion(onContinue) {
  document.getElementById("category-task-title").textContent = t("quizPromptTitle");
  document.getElementById("category-task-question").textContent = t("askTransportMode");
  const optionsEl = document.getElementById("category-task-options");
  optionsEl.innerHTML = "";

  const driveBtn = document.createElement("button");
  driveBtn.className = "btn";
  driveBtn.textContent = t("transportDrive");
  driveBtn.onclick = () => showTransportationDetail("askVehiclePlate", onContinue);
  optionsEl.appendChild(driveBtn);

  const transitBtn = document.createElement("button");
  transitBtn.className = "btn";
  transitBtn.textContent = t("transportTransit");
  transitBtn.onclick = () => showTransportationDetail("askTransitRoute", onContinue);
  optionsEl.appendChild(transitBtn);

  const otherBtn = document.createElement("button");
  otherBtn.className = "btn btn-secondary";
  otherBtn.textContent = t("transportOther");
  otherBtn.onclick = async () => {
    await markCategoryResolved("transportation");
    onContinue();
  };
  optionsEl.appendChild(otherBtn);

  showScreen("screen-category-task");
}

function showTransportationDetail(questionKey, onContinue) {
  const questionText = t(questionKey);
  const labelKey = questionKey === "askVehiclePlate" ? "labelVehiclePlate" : "labelTransitRoute";
  document.getElementById("category-task-title").textContent = t("quizPromptTitle");
  document.getElementById("category-task-question").textContent = questionText;
  const optionsEl = document.getElementById("category-task-options");
  optionsEl.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "input-field";
  optionsEl.appendChild(input);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = t("addMemoSave");
  saveBtn.onclick = async () => {
    const answer = input.value.trim();
    if (answer) {
      await addMemoryTask({ question: questionText, answer, hint: t(labelKey), category: "transportation" });
    }
    await markCategoryResolved("transportation");
    onContinue();
  };
  optionsEl.appendChild(saveBtn);

  showScreen("screen-category-task");
  input.focus();
}

// 儀表板手動「新增/更新事項」：自由輸入問題/答案，跟分類問答是分開的兩條路
function handleManualAddMemo() {
  document.getElementById("add-memo-title").textContent = t("askAddNewMemo");
  document.getElementById("add-memo-question").placeholder = t("addMemoQuestionPlaceholder");
  document.getElementById("add-memo-answer").placeholder = t("addMemoAnswerPlaceholder");
  document.getElementById("add-memo-question").value = "";
  document.getElementById("add-memo-answer").value = "";
  document.getElementById("btn-save-new-memo").textContent = t("addMemoSave");
  document.getElementById("btn-skip-new-memo").textContent = t("backButton");

  document.getElementById("btn-save-new-memo").onclick = async () => {
    const question = document.getElementById("add-memo-question").value.trim();
    const answer = document.getElementById("add-memo-answer").value.trim();
    if (question && answer) {
      await addMemoryTask({ question, answer, hint: question, category: "custom" });
    }
    await showDashboard();
  };

  document.getElementById("btn-skip-new-memo").onclick = async () => {
    await showDashboard();
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
  const allCards = (await getAllCards()).filter(c => !c.isFallback && c.photos && c.photos[0]);
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
