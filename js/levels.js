// ============================================
// 關卡設定 levels.js
// 對應企劃書 12 張卡牌以內、10 關動態派牌邏輯
// ============================================

// 關卡基本規格表
// gridClass 對應 CSS 的網格樣式
// pairCount = 需要的「對數」
// requiredCardCount = 照片庫至少需要幾組照片才能玩這關
const LEVEL_CONFIG = {
  1: { gridClass: "grid-2x2", pairCount: 2, requiredCardCount: 2, type: "photo_four_initial" },
  2: { gridClass: "grid-3x2", pairCount: 3, requiredCardCount: 2, type: "photo" },
  3: { gridClass: "grid-3x2", pairCount: 3, requiredCardCount: 3, type: "photo" },
  4: { gridClass: "grid-3x2", pairCount: 3, requiredCardCount: 3, type: "photo_mixed_dual" },
  5: { gridClass: "grid-4x2", pairCount: 4, requiredCardCount: 4, type: "photo" },
  6: { gridClass: "grid-4x2", pairCount: 4, requiredCardCount: 6, type: "photo_with_new" },
  7: { gridClass: "grid-5x2", pairCount: 5, requiredCardCount: 7, type: "photo_extra_dup" },
  8: { gridClass: "grid-5x2", pairCount: 5, requiredCardCount: 7, type: "time_travel" }, // 現在 vs 過去照片
  9: { gridClass: "grid-4x3", pairCount: 6, requiredCardCount: 8, type: "photo_text_mixed" },
  10: { gridClass: "grid-4x4", pairCount: 8, requiredCardCount: 8, type: "ultimate", emptySlots: 2 }
};

// 難度權重係數 W
function getLevelWeight(level) {
  if (level <= 2) return 1.0;
  if (level <= 5) return 1.5;
  if (level <= 8) return 2.0;
  return 2.5; // L9-L10
}

// 計算過關所需的點擊次數門檻
function getClickThresholds(totalCards) {
  return {
    fastThreshold: Math.floor(totalCards * 1.8),  // <= 此值為 Grade 3
    normalThreshold: Math.floor(totalCards * 3.0), // <= 此值為 Grade 2
    giveUpThreshold: Math.floor(totalCards * 4.0)  // > 此值觸發放棄按鈕顯示
  };
}

// 計算過關時間限制
function getTimeLimit(level) {
  return (level === 9 || level === 10) ? 120 : 90; // 秒
}

// ============================================
// 預設備用人物 (8位內建溫暖人物)
// 當長輩跳過上傳時，自動補位使用
// 這裡用簡單的 emoji + 色塊作為佔位，之後可替換為實際圖片
// ============================================
const FALLBACK_PERSONS = [
  {
    cardId: "fallback_01",
    relation: "白鬍子爺爺",
    image: "/avatars/grandpa_whitebeard.png"
  },
  {
    cardId: "fallback_02",
    relation: "橘圍巾爺爺",
    image: "/avatars/grandpa_orange_scarf.png"
  },
  {
    cardId: "fallback_03",
    relation: "年輕兒子",
    image: "/avatars/young_son.png"
  },
  {
    cardId: "fallback_04",
    relation: "捲髮女兒",
    image: "/avatars/daughter_curly.png"
  },
  {
    cardId: "fallback_05",
    relation: "花頭巾奶奶",
    image: "/avatars/grandma_floral.png"
  },
  {
    cardId: "fallback_06",
    relation: "圍巾女士",
    image: "/avatars/woman_beige_scarf.png"
  },
  {
    cardId: "fallback_07",
    relation: "鬍子男士",
    image: "/avatars/man_beard.png"
  },
  {
    cardId: "fallback_08",
    relation: "長髮女生",
    image: "/avatars/girl_longhair.png"
  },
  {
    cardId: "fallback_09",
    relation: "黑外套男生",
    image: "/avatars/boy_blackjacket.png"
  }
];

// ============================================
// 取得指定關卡所需的卡牌資料（核心派牌邏輯）
// availableCards: 從 IndexedDB 取得的所有可用卡片
// 回傳值: 一個陣列，每個元素代表「一張牌」
//   { cardId, image (Blob/Object URL), label (文字卡用), pairId }
// ============================================
async function generateLevelDeck(level, availableCards) {
  const config = LEVEL_CONFIG[level];
  if (!config) throw new Error(`Unknown level: ${level}`);

  // 過濾掉沒有照片的卡片
  let usableCards = availableCards.filter(c => c.imageCurrent);

  // 如果照片不足，用 fallback 補位
  while (usableCards.length < config.requiredCardCount) {
    const fallback = FALLBACK_PERSONS[usableCards.length % FALLBACK_PERSONS.length];
    usableCards.push({
      cardId: fallback.cardId,
      relation: fallback.relation,
      isFallback: true,
      imageUrl: fallback.image,
      hidden: true
    });
  }

  let deck = [];

  switch (config.type) {
    case "photo_four_initial": {
      // 第1關：使用最初收集的2位家人，各自一張照片，組成2對 (2x2 = 4張牌)
      const card1 = usableCards.find(c => c.cardId === "card_slot_01") || usableCards[0];
      const card2 = usableCards.find(c => c.cardId === "card_slot_02") || usableCards[1] || usableCards[0];

      [card1, card2].forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeCardEntry(card, "current"));
      });
      break;
    }

    case "photo": {
      // 純照片配對：取 pairCount 組，各一對
      const chosen = pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeCardEntry(card, "current"));
      });
      break;
    }

    case "photo_dual": {
      // 同一人兩張不同照片配對 (需 imageCurrent + imagePast 或第二張)
      const candidates = usableCards.filter(c => c.imagePast || c.imageCurrent2);
      const card = candidates.length > 0 ? candidates[0] : usableCards[0];
      // 兩組來自同一人的不同照片各一對
      deck.push(makeCardEntry(card, "current"));
      deck.push(makeCardEntry(card, "current"));
      const altCard = usableCards.length > 1 ? usableCards[1] : card;
      deck.push(makeCardEntry(altCard, "current"));
      deck.push(makeCardEntry(altCard, "current"));
      break;
    }

    case "photo_mixed_dual": {
      // 3對：其中一人有兩張不同照片，其餘為一般配對
      const chosen = pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeCardEntry(card, "current"));
      });
      break;
    }

    case "photo_with_new": {
      // 4對，必定包含最新加入的一組
      const chosen = pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeCardEntry(card, "current"));
      });
      break;
    }

    case "photo_extra_dup": {
      // 5對：4位家人各一對 + 最親密的人(第一位)再多一對
      const base = pickRandom(usableCards, Math.min(4, usableCards.length));
      base.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeCardEntry(card, "current"));
      });
      // 多一對給第一位（最親密的人）
      const extra = base[0];
      deck.push(makeCardEntry(extra, "current"));
      deck.push(makeCardEntry(extra, "current"));
      break;
    }

    case "time_travel": {
      // 時光倒流配對：現在照片 vs 過去照片
      const candidates = usableCards.filter(c => c.imagePast);
      const chosen = candidates.length > 0 ? candidates.slice(0, config.pairCount) : pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        if (card.imagePast) {
          deck.push(makeCardEntry(card, "current"));
          deck.push(makeCardEntry(card, "past"));
        } else {
          deck.push(makeCardEntry(card, "current"));
          deck.push(makeCardEntry(card, "current"));
        }
      });
      break;
    }

    case "photo_text_mixed": {
      // 6對：照片與文字名稱卡混合配對
      const chosen = pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeTextCardEntry(card));
      });
      break;
    }

    case "ultimate": {
      // 最終關：8組，全文字與照片深度配對
      const chosen = pickRandom(usableCards, config.pairCount);
      chosen.forEach(card => {
        deck.push(makeCardEntry(card, "current"));
        deck.push(makeTextCardEntry(card));
      });
      break;
    }

    default:
      throw new Error(`Unhandled level type: ${config.type}`);
  }

  // 洗牌
  deck = shuffle(deck);

  return { deck, config };
}

// 建立一張「照片牌」資料結構
function makeCardEntry(card, photoType) {
  return {
    pairKey: `${card.cardId}_${photoType}`,
    cardId: card.cardId,
    relation: card.relation,
    displayType: "photo",
    photoType: photoType, // "current" or "past"
    isFallback: !!card.isFallback,
    fallbackEmoji: card.fallbackEmoji,
    fallbackColor: card.fallbackColor,
    imageBlob: photoType === "past" ? card.imagePast : card.imageCurrent
  };
}

// 建立一張「文字牌」資料結構（顯示家人關係文字，例如「大兒子」）
function makeTextCardEntry(card) {
  return {
    pairKey: `${card.cardId}_current`, // 與該人的照片牌配對
    cardId: card.cardId,
    relation: card.relation,
    displayType: "text",
    isFallback: !!card.isFallback
  };
}

// 從陣列中隨機取出 n 個元素
function pickRandom(arr, n) {
  const copy = [...arr];
  shuffle(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

// 洗牌 (Fisher-Yates)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
