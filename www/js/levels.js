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
  9: { gridClass: "grid-3x5", type: "level_9", pairCount: 7, decoCount: 1 },
  10: { gridClass: "grid-3x6", type: "level_10", pairCount: 8, decoCount: 2 },
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
// 卡片照片存取小工具
// 真實家人卡片跟備用人物卡片現在統一用 photos 陣列（最多4張，可有null空格）
// ============================================

// 取得某張卡片「實際有圖的照片」清單(去掉null)
function getPhotos(card) {
  return (card.photos || []).filter(Boolean);
}

// 這張卡片是否有2張以上不同照片(可以做「新舊對比」類的關卡)
function hasMultiplePhotos(card) {
  return getPhotos(card).length >= 2;
}

// 隨機挑這張卡片的其中一張照片
function pickRandomPhoto(card) {
  const photos = getPhotos(card);
  if (photos.length === 0) return null;
  return photos[Math.floor(Math.random() * photos.length)];
}

// ============================================
// 預設備用人物
// 其中3位是「多張照片」人物（可用於展示同一人新舊對比），另外3位只有1張照片，
// 用來增加備用照片的多樣性，避免家人照片不夠時同一張備用照片被重複抽到。
//
// girl_longhair / grandma_floral / man_beard 這三個檔名/路徑是依使用者提供的名稱推測的
// (假設放在 avatars/ 資料夾，副檔名 .png)。
// ============================================
const FALLBACK_PERSONS = [
  {
    cardId: "fallback_01",
    relation: "爺爺",
    photos: ["avatars/grandpa_whitebeard.png", "avatars/grandpa_orange_scarf.png"]
  },
  {
    cardId: "fallback_02",
    relation: "女兒",
    photos: ["avatars/daughter_curly.png", "avatars/woman_beige_scarf.png"]
  },
  {
    cardId: "fallback_03",
    relation: "兒子",
    photos: ["avatars/young_son.png", "avatars/boy_blackjacket.png"]
  },
  {
    cardId: "fallback_04",
    relation: "孫女",
    photos: ["avatars/girl_longhair.png"]
  },
  {
    cardId: "fallback_05",
    relation: "奶奶",
    photos: ["avatars/grandma_floral.png"]
  },
  {
    cardId: "fallback_06",
    relation: "叔叔",
    photos: ["avatars/man_beard.png"]
  }
];

// 把所有備用人物拆成「照片池」，每一張照片各算一筆獨立項目
function buildFallbackPhotoPool() {
  const pool = [];
  FALLBACK_PERSONS.forEach(p => {
    getPhotos(p).forEach((photo, idx) => {
      pool.push({ cardId: p.cardId, relation: p.relation, image: photo, photoKey: `${p.cardId}_${idx}` });
    });
  });
  return pool;
}

// 抽一張「這次牌局還沒用過」的備用照片，回傳可直接丟進 makeEntry() 的卡片物件
// usedPhotoKeys: 同一次 generateLevelDeck() 呼叫內共用的 Set，確保同一張照片不被選兩次
function drawFallbackPhoto(usedPhotoKeys) {
  let candidates = buildFallbackPhotoPool().filter(p => !usedPhotoKeys.has(p.photoKey));

  if (candidates.length === 0) {
    // 極端情況：這一關需要的備用照片數量超過了全部備用照片總數，才允許重複
    candidates = buildFallbackPhotoPool();
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  usedPhotoKeys.add(pick.photoKey);

  return {
    cardId: pick.cardId,
    relation: pick.relation,
    isFallback: true,
    photos: [pick.image]
  };
}

// 抽一位「有2張以上照片」的備用人物，用於需要展示同一人新舊對比的關卡(例如第2關)
// 會把這個人用到的照片都標記為已使用，避免之後又被單獨抽到造成重複
function drawDualFallbackPerson(usedPhotoKeys) {
  const dualPersons = FALLBACK_PERSONS.filter(p => {
    if (!hasMultiplePhotos(p)) return false;
    const photos = getPhotos(p);
    return photos.every((_, idx) => !usedPhotoKeys.has(`${p.cardId}_${idx}`));
  });

  const pool = dualPersons.length > 0 ? dualPersons : FALLBACK_PERSONS.filter(hasMultiplePhotos);
  const p = pool[Math.floor(Math.random() * pool.length)];

  getPhotos(p).forEach((_, idx) => usedPhotoKeys.add(`${p.cardId}_${idx}`));

  return {
    cardId: p.cardId,
    relation: p.relation,
    isFallback: true,
    photos: [...p.photos]
  };
}

async function generateLevelDeck(level, availableCards) {
  const config = LEVEL_CONFIG[level];
  if (!config) throw new Error(`Unknown level: ${level}`);

  let realCards = availableCards
    .filter(c => !c.isFallback && getPhotos(c).length > 0)
    .sort((a, b) => a.cardId.localeCompare(b.cardId));

  // 這一關用過的備用照片紀錄，避免同一關裡同一張備用照片被抽兩次
  const usedPhotoKeys = new Set();

  let deck = [];

  switch (config.type) {

    case "level_1": {
      const cardA = realCards.find(c => c.cardId === "card_slot_01") || realCards[0] || drawFallbackPhoto(usedPhotoKeys);
      const remainingForB = realCards.filter(c => c.cardId !== cardA.cardId);
      const cardB = remainingForB.find(c => c.cardId === "card_slot_02") || remainingForB[0] || drawFallbackPhoto(usedPhotoKeys);
      deck.push(makeEntry(cardA, pickRandomPhoto(cardA), "L1_A"));
      deck.push(makeEntry(cardA, pickRandomPhoto(cardA), "L1_A"));
      deck.push(makeEntry(cardB, pickRandomPhoto(cardB), "L1_B"));
      deck.push(makeEntry(cardB, pickRandomPhoto(cardB), "L1_B"));
      break;
    }

    case "level_2": {
      let dualCard = realCards.find(hasMultiplePhotos);
      if (!dualCard) {
        // 沒有真實的多照片家人時，用一位「有多張照片」的備用人物代替
        dualCard = drawDualFallbackPerson(usedPhotoKeys);
      }
      const photos = getPhotos(dualCard);
      deck.push(makeEntry(dualCard, photos[0], "L2_p0"));
      deck.push(makeEntry(dualCard, photos[0], "L2_p0"));
      deck.push(makeEntry(dualCard, photos[1], "L2_p1"));
      deck.push(makeEntry(dualCard, photos[1], "L2_p1"));
      break;
    }

    case "level_3": {
      let chosen = realCards.slice(0, 3);
      while (chosen.length < 3) chosen.push(drawFallbackPhoto(usedPhotoKeys));
      chosen.forEach((card, i) => {
        const photo = pickRandomPhoto(card);
        const key = `L3_p${i}`;
        deck.push(makeEntry(card, photo, key));
        deck.push(makeEntry(card, photo, key));
      });
      break;
    }

    case "level_4": {
      let dualCard = realCards.find(hasMultiplePhotos) || realCards[0] || drawDualFallbackPerson(usedPhotoKeys);
      const dualPhotos = getPhotos(dualCard);
      deck.push(makeEntry(dualCard, dualPhotos[0], "L4_cur"));
      deck.push(makeEntry(dualCard, dualPhotos[0], "L4_cur"));

      if (dualPhotos.length >= 2) {
        deck.push(makeEntry(dualCard, dualPhotos[1], "L4_past"));
        deck.push(makeEntry(dualCard, dualPhotos[1], "L4_past"));
      } else {
        // 這位家人只有1張照片，借用一張不重複的備用照片頂替第二對
        const substitute = drawFallbackPhoto(usedPhotoKeys);
        const subPhoto = pickRandomPhoto(substitute);
        deck.push(makeEntry(substitute, subPhoto, "L4_sub"));
        deck.push(makeEntry(substitute, subPhoto, "L4_sub"));
      }

      const others = realCards.filter(c => c.cardId !== dualCard.cardId);
      const otherCard = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : drawFallbackPhoto(usedPhotoKeys);
      const otherPhoto = pickRandomPhoto(otherCard);
      deck.push(makeEntry(otherCard, otherPhoto, "L4_other"));
      deck.push(makeEntry(otherCard, otherPhoto, "L4_other"));
      break;
    }

    case "level_5": {
      const dualCards = realCards.filter(hasMultiplePhotos);
      const cardA = dualCards[0] || realCards[0] || drawDualFallbackPerson(usedPhotoKeys);

      // cardB一定要排除掉cardA選中的那個人，避免兩個變數選到同一個人造成4張一樣的照片
      const dualCardsExcludingA = dualCards.filter(c => c.cardId !== cardA.cardId);
      const realCardsExcludingA = realCards.filter(c => c.cardId !== cardA.cardId);
      const cardB = dualCardsExcludingA[0] || realCardsExcludingA[0] || drawDualFallbackPerson(usedPhotoKeys);

      const photosA = getPhotos(cardA);
      deck.push(makeEntry(cardA, photosA[0], "L5_A_cur"));
      deck.push(makeEntry(cardA, photosA[0], "L5_A_cur"));
      if (photosA.length >= 2) {
        deck.push(makeEntry(cardA, photosA[1], "L5_A_past"));
        deck.push(makeEntry(cardA, photosA[1], "L5_A_past"));
      } else {
        const subA = drawFallbackPhoto(usedPhotoKeys);
        const subAPhoto = pickRandomPhoto(subA);
        deck.push(makeEntry(subA, subAPhoto, "L5_A_sub"));
        deck.push(makeEntry(subA, subAPhoto, "L5_A_sub"));
      }

      const photosB = getPhotos(cardB);
      deck.push(makeEntry(cardB, photosB[0], "L5_B_cur"));
      deck.push(makeEntry(cardB, photosB[0], "L5_B_cur"));
      if (photosB.length >= 2) {
        deck.push(makeEntry(cardB, photosB[1], "L5_B_past"));
        deck.push(makeEntry(cardB, photosB[1], "L5_B_past"));
      } else {
        const subB = drawFallbackPhoto(usedPhotoKeys);
        const subBPhoto = pickRandomPhoto(subB);
        deck.push(makeEntry(subB, subBPhoto, "L5_B_sub"));
        deck.push(makeEntry(subB, subBPhoto, "L5_B_sub"));
      }

      deck = shuffle(deck);
      // 在第5格（index 4）插入中間裝飾牌，不參與翻牌
      deck.splice(4, 0, makeDecoCard());
      break;
    }

    // ──────────────────────────────────────
    // 第6關：3x3(中間icon)，ABCD各1張，共4對
    // ──────────────────────────────────────
    case "level_6": {
      let chosen = realCards.slice(0, 4);
      while (chosen.length < 4) chosen.push(drawFallbackPhoto(usedPhotoKeys));

      chosen.forEach((card, i) => {
        const photo = pickRandomPhoto(card);
        const key = `L6_p${i}`;
        deck.push(makeEntry(card, photo, key));
        deck.push(makeEntry(card, photo, key));
      });

      deck = shuffle(deck);
      deck.splice(4, 0, makeDecoCard());
      break;
    }

    // ──────────────────────────────────────
    // 第7-10關：從「全部照片池」任選N對，再插入裝飾牌
    // 現在每人最多4張照片，池子自然也跟著變大，變化更多
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
        chosenPhotos.push({ card: fb, photo: pickRandomPhoto(fb), key: `extra_fb_${chosenPhotos.length}` });
      }

      chosenPhotos.forEach((entry, i) => {
        const key = `${config.type}_p${i}`;
        deck.push(makeEntry(entry.card, entry.photo, key));
        deck.push(makeEntry(entry.card, entry.photo, key));
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

// 建立「全部照片池」：每位家人的每一張照片(最多4張)各算一筆，用於第7關以後的任選玩法
function buildPhotoPool(realCards) {
  const pool = [];
  realCards.forEach(card => {
    getPhotos(card).forEach((photo, idx) => {
      pool.push({ card, photo, key: `${card.cardId}_${idx}` });
    });
  });
  return pool;
}

// 建立一張裝飾牌（顯示App icon，不參與翻牌配對）
function makeDecoCard() {
  return {
    pairKey: `DECO_${Math.random().toString(36).slice(2)}`,
    cardId: "deco",
    displayType: "deco",
    isDecorative: true
  };
}

function makeEntry(card, photo, pairKey) {
  const isFallback = !!card.isFallback;
  return {
    pairKey: pairKey,
    cardId: card.cardId,
    relation: card.relation,
    displayType: "photo",
    isFallback: isFallback,
    // fallback情況下，photo本身就是檔案路徑字串；真實照片則是base64字串
    fallbackImage: isFallback ? photo : null,
    imageBlob: isFallback ? null : photo
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
