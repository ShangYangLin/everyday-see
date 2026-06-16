// ============================================
// 關卡設定 levels.js
// ============================================

const LEVEL_CONFIG = {
  1: { gridClass: "grid-2x2", type: "level_1" },
  2: { gridClass: "grid-2x2", type: "level_2" },
  3: { gridClass: "grid-2x3", type: "level_3" },
  4: { gridClass: "grid-2x3", type: "level_4" },
  5: { gridClass: "grid-3x3", type: "level_5" },
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
  return level >= 4 ? 120 : 90;
}

// ============================================
// 預設備用人物：3人，每人有2張不同造型的圖片
// 用於模擬「同一人的兩張不同照片」，避免配對時出現4張一樣的怪異畫面
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
  }
];

async function generateLevelDeck(level, availableCards) {
  const config = LEVEL_CONFIG[level];
  if (!config) throw new Error(`Unknown level: ${level}`);

  let realCards = availableCards
    .filter(c => !c.isFallback && c.imageCurrent)
    .sort((a, b) => a.cardId.localeCompare(b.cardId));

  let deck = [];

  switch (config.type) {

    case "level_1": {
      const cardA = realCards.find(c => c.cardId === "card_slot_01") || realCards[0] || makeFallback(0);
      const cardB = realCards.find(c => c.cardId === "card_slot_02") || realCards[1] || makeFallback(1);
      deck.push(makeEntry(cardA, "current", "L1_A"));
      deck.push(makeEntry(cardA, "current", "L1_A"));
      deck.push(makeEntry(cardB, "current", "L1_B"));
      deck.push(makeEntry(cardB, "current", "L1_B"));
      break;
    }

    case "level_2": {
      let dualCard = realCards.find(c => c.imageCurrent && c.imagePast);
      if (!dualCard) {
        // 沒有真實的雙照片家人時，用一位 fallback 人物代替（已內建current+past兩張不同圖）
        dualCard = makeFallback(0);
      }
      deck.push(makeEntry(dualCard, "current", "L2_cur"));
      deck.push(makeEntry(dualCard, "current", "L2_cur"));
      deck.push(makeEntry(dualCard, "past",    "L2_past"));
      deck.push(makeEntry(dualCard, "past",    "L2_past"));
      break;
    }

    case "level_3": {
      let chosen = realCards.slice(0, 3);
      while (chosen.length < 3) chosen.push(makeFallback(chosen.length));
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
      let dualCard = realCards.find(c => c.imageCurrent && c.imagePast) || realCards[0] || makeFallback(0);
      deck.push(makeEntry(dualCard, "current", "L4_cur"));
      deck.push(makeEntry(dualCard, "current", "L4_cur"));

      if (dualCard.imagePast) {
        deck.push(makeEntry(dualCard, "past", "L4_past"));
        deck.push(makeEntry(dualCard, "past", "L4_past"));
      } else {
        // 這位家人只有1張照片，借用一位 fallback 人物頂替第二對，避免畫面出現4張一樣的照片
        const substitute = makeFallback(1);
        deck.push(makeEntry(substitute, "current", "L4_sub"));
        deck.push(makeEntry(substitute, "current", "L4_sub"));
      }

      const others = realCards.filter(c => c.cardId !== dualCard.cardId);
      const otherCard = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : makeFallback(2);
      deck.push(makeEntry(otherCard, "current", "L4_other"));
      deck.push(makeEntry(otherCard, "current", "L4_other"));
      break;
    }

    case "level_5": {
      const dualCards = realCards.filter(c => c.imageCurrent && c.imagePast);
      const cardA = dualCards[0] || realCards[0] || makeFallback(0);
      const cardB = dualCards[1] || realCards[1] || makeFallback(1);

      deck.push(makeEntry(cardA, "current", "L5_A_cur"));
      deck.push(makeEntry(cardA, "current", "L5_A_cur"));
      if (cardA.imagePast) {
        deck.push(makeEntry(cardA, "past", "L5_A_past"));
        deck.push(makeEntry(cardA, "past", "L5_A_past"));
      } else {
        const subA = makeFallback(1);
        deck.push(makeEntry(subA, "current", "L5_A_sub"));
        deck.push(makeEntry(subA, "current", "L5_A_sub"));
      }

      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      if (cardB.imagePast) {
        deck.push(makeEntry(cardB, "past", "L5_B_past"));
        deck.push(makeEntry(cardB, "past", "L5_B_past"));
      } else {
        const subB = makeFallback(2);
        deck.push(makeEntry(subB, "current", "L5_B_sub"));
        deck.push(makeEntry(subB, "current", "L5_B_sub"));
      }

      deck = shuffle(deck);
      // 在第5格（index 4）插入中間裝飾牌，不參與翻牌
      deck.splice(4, 0, {
        pairKey: "DECO_CENTER",
        cardId: "deco",
        displayType: "deco",
        isDecorative: true
      });
      break;
    }

    default:
      throw new Error(`Unhandled level type: ${config.type}`);
  }

  if (config.type !== "level_5") {
    deck = shuffle(deck);
  }

  return { deck, config };
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

function makeFallback(index) {
  const f = FALLBACK_PERSONS[index % FALLBACK_PERSONS.length];
  return {
    cardId: f.cardId,
    relation: f.relation,
    isFallback: true,
    imageCurrent: f.imageCurrent, // 檔案路徑字串，不是Blob
    imagePast: f.imagePast
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
