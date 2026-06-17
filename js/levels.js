// ============================================
// 關卡設定 levels.js
// ============================================

const LEVEL_CONFIG = {
  1: { gridClass: "grid-2x2", type: "level_1" },
  2: { gridClass: "grid-2x2", type: "level_2" },
  3: { gridClass: "grid-2x3", type: "level_3" },
  4: { gridClass: "grid-2x3", type: "level_4" },
  5: { gridClass: "grid-3x3", type: "level_5" },
  6: { gridClass: "grid-3x3", type: "level_6" },
  7: { gridClass: "grid-3x4", type: "level_7", pairCount: 5, decoCount: 2 },
  8: { gridClass: "grid-3x4", type: "level_8", pairCount: 6, decoCount: 0 },
  9: { gridClass: "grid-4x4", type: "level_9", pairCount: 7, decoCount: 2 },
  10: { gridClass: "grid-4x4", type: "level_10", pairCount: 8, decoCount: 0 },
};

function getLevelWeight(level) {
  if (level <= 2) return 1.0;
  if (level <= 5) return 1.5;
  if (level <= 8) return 2.0;
  return 2.5;
}

function getClickThresholds(totalCards) {
  return {
    fastThreshold: Math.floor(totalCards * 1.8),
    normalThreshold: Math.floor(totalCards * 3.0),
    giveUpThreshold: Math.floor(totalCards * 4.0)
  };
}

function getTimeLimit(level) {
  if (level >= 9) return 180;
  if (level >= 7) return 150;
  if (level >= 4) return 120;
  return 90;
}

// ============================================
// 預設備用人物
// 其中3位是「雙照片」人物（current+past，可用於展示同一人新舊對比）
// 另外3位是「單照片」人物（只有 current），用來增加備用照片的多樣性，
// 避免家人照片不夠時，同一張備用照片在同一關裡被重複抽到。
//
// girl_longhair / grandma_floral / man_beard 這三個檔名/路徑是依你提供的名稱推測的
// (假設放在 avatars/ 資料夾，副檔名 .png)，如果實際路徑不同，改這裡三個字串即可。
// ============================================
const FALLBACK_PERSONS = [
  {
    cardId: "fallback_01",
    relation: "爺爺",
    imageCurrent: "avatars/grandpa_whitebeard.png",
    imagePast: "avatars/grandpa_orange_scarf.png"
  },
  {
    cardId: "fallback_02",
    relation: "女兒",
    imageCurrent: "avatars/daughter_curly.png",
    imagePast: "avatars/woman_beige_scarf.png"
  },
  {
    cardId: "fallback_03",
    relation: "兒子",
    imageCurrent: "avatars/young_son.png",
    imagePast: "avatars/boy_blackjacket.png"
  },
  {
    cardId: "fallback_04",
    relation: "孫女",
    imageCurrent: "avatars/girl_longhair.png",
    imagePast: null
  },
  {
    cardId: "fallback_05",
    relation: "奶奶",
    imageCurrent: "avatars/grandma_floral.png",
    imagePast: null
  },
  {
    cardId: "fallback_06",
    relation: "叔叔",
    imageCurrent: "avatars/man_beard.png",
    imagePast: null
  }
];

// 把所有備用人物拆成「照片池」，每張 current/past 各算一筆獨立照片
function buildFallbackPhotoPool() {
  const pool = [];
  FALLBACK_PERSONS.forEach(p => {
    if (p.imageCurrent) {
      pool.push({ cardId: p.cardId, relation: p.relation, image: p.imageCurrent, photoKey: `${p.cardId}_current` });
    }
    if (p.imagePast) {
      pool.push({ cardId: p.cardId, relation: p.relation, image: p.imagePast, photoKey: `${p.cardId}_past` });
    }
  });
  return pool;
}

// 抽一張「這次牌局還沒用過」的備用照片，回傳可直接丟進 makeEntry() 的卡片物件
// (統一放在 imageCurrent 欄位，呼叫端一律用 "current" 取用即可，不用管原始是current或past)
// usedPhotoKeys: 同一次 generateLevelDeck() 呼叫內共用的 Set，確保同一張照片不被選兩次
function drawFallbackPhoto(usedPhotoKeys) {
  let candidates = buildFallbackPhotoPool().filter(p => !usedPhotoKeys.has(p.photoKey));

  if (candidates.length === 0) {
    // 極端情況：這一關需要的備用照片數量超過了全部9張，才允許重複
    candidates = buildFallbackPhotoPool();
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  usedPhotoKeys.add(pick.photoKey);

  return {
    cardId: pick.cardId,
    relation: pick.relation,
    isFallback: true,
    imageCurrent: pick.image,
    imagePast: null
  };
}

// 抽一位「現在+以前都有照片」的備用人物，用於需要展示同一人新舊對比的關卡(例如第2關)
// 會把這個人的兩張照片都標記為已使用，避免之後又被單獨抽到造成重複
function drawDualFallbackPerson(usedPhotoKeys) {
  const dualPersons = FALLBACK_PERSONS.filter(p =>
    p.imageCurrent && p.imagePast &&
    !usedPhotoKeys.has(`${p.cardId}_current`) &&
    !usedPhotoKeys.has(`${p.cardId}_past`)
  );

  const pool = dualPersons.length > 0
    ? dualPersons
    : FALLBACK_PERSONS.filter(p => p.imageCurrent && p.imagePast);

  const p = pool[Math.floor(Math.random() * pool.length)];
  usedPhotoKeys.add(`${p.cardId}_current`);
  usedPhotoKeys.add(`${p.cardId}_past`);

  return {
    cardId: p.cardId,
    relation: p.relation,
    isFallback: true,
    imageCurrent: p.imageCurrent,
    imagePast: p.imagePast
  };
}

async function generateLevelDeck(level, availableCards) {
  const config = LEVEL_CONFIG[level];
  if (!config) throw new Error(`Unknown level: ${level}`);

  let realCards = availableCards
    .filter(c => !c.isFallback && c.imageCurrent)
    .sort((a, b) => a.cardId.localeCompare(b.cardId));

  // 這一關用過的備用照片紀錄，避免同一關裡同一張備用照片被抽兩次
  // (這是修正「同一張圖出現4次」的關鍵)
  const usedPhotoKeys = new Set();

  let deck = [];

  switch (config.type) {

    case "level_1": {
      const cardA = realCards.find(c => c.cardId === "card_slot_01") || realCards[0] || drawFallbackPhoto(usedPhotoKeys);
      const cardB = realCards.find(c => c.cardId === "card_slot_02") || realCards[1] || drawFallbackPhoto(usedPhotoKeys);
      deck.push(makeEntry(cardA, "current", "L1_A"));
      deck.push(makeEntry(cardA, "current", "L1_A"));
      deck.push(makeEntry(cardB, "current", "L1_B"));
      deck.push(makeEntry(cardB, "current", "L1_B"));
      break;
    }

    case "level_2": {
      let dualCard = realCards.find(c => c.imageCurrent && c.imagePast);
      if (!dualCard) {
        // 沒有真實的雙照片家人時，用一位「現在+以前都有照片」的備用人物代替
        dualCard = drawDualFallbackPerson(usedPhotoKeys);
      }
      deck.push(makeEntry(dualCard, "current", "L2_cur"));
      deck.push(makeEntry(dualCard, "current", "L2_cur"));
      deck.push(makeEntry(dualCard, "past",    "L2_past"));
      deck.push(makeEntry(dualCard, "past",    "L2_past"));
      break;
    }

    case "level_3": {
      let chosen = realCards.slice(0, 3);
      while (chosen.length < 3) chosen.push(drawFallbackPhoto(usedPhotoKeys));
      chosen.forEach((card, i) => {
        const hasTwo = card.imageCurrent && card.imagePast;
        const photoType = hasTwo ? (Math.random() < 0.5 ? "current" : "past") : "current";
        const key = `L3_p${i}`;
        deck.push(makeEntry(card, photoType, key));
        deck.push(makeEntry(card, photoType, key));
      });
      break;
    }

    case "level_4": {
      let dualCard = realCards.find(c => c.imageCurrent && c.imagePast) || realCards[0] || drawDualFallbackPerson(usedPhotoKeys);
      deck.push(makeEntry(dualCard, "current", "L4_cur"));
      deck.push(makeEntry(dualCard, "current", "L4_cur"));

      if (dualCard.imagePast) {
        deck.push(makeEntry(dualCard, "past", "L4_past"));
        deck.push(makeEntry(dualCard, "past", "L4_past"));
      } else {
        // 這位家人只有1張照片，借用一張不重複的備用照片頂替第二對
        const substitute = drawFallbackPhoto(usedPhotoKeys);
        deck.push(makeEntry(substitute, "current", "L4_sub"));
        deck.push(makeEntry(substitute, "current", "L4_sub"));
      }

      const others = realCards.filter(c => c.cardId !== dualCard.cardId);
      const otherCard = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : drawFallbackPhoto(usedPhotoKeys);
      deck.push(makeEntry(otherCard, "current", "L4_other"));
      deck.push(makeEntry(otherCard, "current", "L4_other"));
      break;
    }

    case "level_5": {
      const dualCards = realCards.filter(c => c.imageCurrent && c.imagePast);
      const cardA = dualCards[0] || realCards[0] || drawDualFallbackPerson(usedPhotoKeys);
      const cardB = dualCards[1] || realCards[1] || drawDualFallbackPerson(usedPhotoKeys);

      deck.push(makeEntry(cardA, "current", "L5_A_cur"));
      deck.push(makeEntry(cardA, "current", "L5_A_cur"));
      if (cardA.imagePast) {
        deck.push(makeEntry(cardA, "past", "L5_A_past"));
        deck.push(makeEntry(cardA, "past", "L5_A_past"));
      } else {
        const subA = drawFallbackPhoto(usedPhotoKeys);
        deck.push(makeEntry(subA, "current", "L5_A_sub"));
        deck.push(makeEntry(subA, "current", "L5_A_sub"));
      }

      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      if (cardB.imagePast) {
        deck.push(makeEntry(cardB, "past", "L5_B_past"));
        deck.push(makeEntry(cardB, "past", "L5_B_past"));
      } else {
        const subB = drawFallbackPhoto(usedPhotoKeys);
        deck.push(makeEntry(subB, "current", "L5_B_sub"));
        deck.push(makeEntry(subB, "current", "L5_B_sub"));
      }

      deck = shuffle(deck);
      // 在第5格（index 4）插入中間裝飾牌，不參與翻牌
      deck.splice(4, 0, makeDecoCard());
      break;
    }

    // ──────────────────────────────────────
    // 第6關：3x3(中間icon)，ABCD各1張(有兩張的擇一)，共4對
    // ──────────────────────────────────────
    case "level_6": {
      let chosen = realCards.slice(0, 4);
      while (chosen.length < 4) chosen.push(drawFallbackPhoto(usedPhotoKeys));

      chosen.forEach((card, i) => {
        const hasTwo = card.imageCurrent && card.imagePast;
        const photoType = hasTwo ? (Math.random() < 0.5 ? "current" : "past") : "current";
        const key = `L6_p${i}`;
        deck.push(makeEntry(card, photoType, key));
        deck.push(makeEntry(card, photoType, key));
      });

      deck = shuffle(deck);
      deck.splice(4, 0, makeDecoCard());
      break;
    }

    // ──────────────────────────────────────
    // 第7-10關：從「全部照片池」任選N對，再插入裝飾牌
    // ──────────────────────────────────────
    case "level_7":
    case "level_8":
    case "level_9":
    case "level_10": {
      const pool = buildPhotoPool(realCards);
      const chosenPhotos = pickRandom(pool, config.pairCount);

      // 萬一池子不夠大（真實照片不夠），用「不重複」的備用照片補滿
      while (chosenPhotos.length < config.pairCount) {
        const fb = drawFallbackPhoto(usedPhotoKeys);
        chosenPhotos.push({ card: fb, photoType: "current", key: `extra_fb_${chosenPhotos.length}` });
      }

      chosenPhotos.forEach((entry, i) => {
        const key = `${config.type}_p${i}`;
        deck.push(makeEntry(entry.card, entry.photoType, key));
        deck.push(makeEntry(entry.card, entry.photoType, key));
      });

      deck = shuffle(deck);

      // 插入裝飾牌（隨機位置）
      for (let d = 0; d < (config.decoCount || 0); d++) {
        const insertPos = Math.floor(Math.random() * (deck.length + 1));
        deck.splice(insertPos, 0, makeDecoCard());
      }
      break;
    }

    default:
      throw new Error(`Unhandled level type: ${config.type}`);
  }

  const typesAlreadyFinalized = ["level_5", "level_6", "level_7", "level_8", "level_9", "level_10"];
  if (!typesAlreadyFinalized.includes(config.type)) {
    deck = shuffle(deck);
  }

  return { deck, config };
}

// 建立「全部照片池」：每張真實照片(current+past都算)各算一筆，用於第7關以後的任選玩法
function buildPhotoPool(realCards) {
  const pool = [];
  realCards.forEach(card => {
    if (card.imageCurrent) pool.push({ card, photoType: "current", key: `${card.cardId}_current` });
    if (card.imagePast)    pool.push({ card, photoType: "past",    key: `${card.cardId}_past` });
  });
  return pool;
}

// 建立一張裝飾牌（顯示裝飾符號，不參與翻牌配對，不依賴外部圖檔，避免圖檔遺失時整張空白）
function makeDecoCard() {
  return {
    pairKey: `DECO_${Math.random().toString(36).slice(2)}`,
    cardId: "deco",
    displayType: "deco",
    isDecorative: true
  };
}

function makeEntry(card, photoType, pairKey) {
  const isFallback = !!card.isFallback;
  return {
    pairKey: pairKey,
    cardId: card.cardId,
    relation: card.relation,
    displayType: "photo",
    photoType: photoType,
    isFallback: isFallback,
    // fallback情況下，imageCurrent/imagePast本身就是檔案路徑字串
    fallbackImage: isFallback ? (photoType === "past" ? card.imagePast : card.imageCurrent) : null,
    imageBlob: isFallback ? null : (photoType === "past" ? card.imagePast : card.imageCurrent)
  };
}

function pickRandom(arr, n) {
  const copy = [...arr];
  shuffle(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
