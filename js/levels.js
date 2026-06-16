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

const FALLBACK_PERSONS = [
  { cardId: "fallback_01", relation: "白鬍子爺爺", image: "avatars/grandpa_whitebeard.png" },
  { cardId: "fallback_02", relation: "橘圍巾爺爺", image: "avatars/grandpa_orange_scarf.png" },
  { cardId: "fallback_03", relation: "年輕兒子",   image: "avatars/young_son.png" },
  { cardId: "fallback_04", relation: "捲髮女兒",   image: "avatars/daughter_curly.png" },
  { cardId: "fallback_05", relation: "花頭巾奶奶", image: "avatars/grandma_floral.png" },
  { cardId: "fallback_06", relation: "圍巾女士",   image: "avatars/woman_beige_scarf.png" },
  { cardId: "fallback_07", relation: "鬍子男士",   image: "avatars/man_beard.png" },
  { cardId: "fallback_08", relation: "長髮女生",   image: "avatars/girl_longhair.png" },
  { cardId: "fallback_09", relation: "黑外套男生", image: "avatars/boy_blackjacket.png" }
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
        const card = realCards[0] || makeFallback(0);
        deck.push(makeEntry(card, "current", "L2_p1"));
        deck.push(makeEntry(card, "current", "L2_p1"));
        deck.push(makeEntry(card, "current", "L2_p2"));
        deck.push(makeEntry(card, "current", "L2_p2"));
      } else {
        deck.push(makeEntry(dualCard, "current", "L2_cur"));
        deck.push(makeEntry(dualCard, "current", "L2_cur"));
        deck.push(makeEntry(dualCard, "past",    "L2_past"));
        deck.push(makeEntry(dualCard, "past",    "L2_past"));
      }
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
      const pastType = dualCard.imagePast ? "past" : "current";
      const pastKey  = dualCard.imagePast ? "L4_past" : "L4_cur2";
      deck.push(makeEntry(dualCard, pastType, pastKey));
      deck.push(makeEntry(dualCard, pastType, pastKey));
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
      const aType2 = cardA.imagePast ? "past" : "current";
      const aKey2  = cardA.imagePast ? "L5_A_past" : "L5_A_cur2";
      deck.push(makeEntry(cardA, aType2, aKey2));
      deck.push(makeEntry(cardA, aType2, aKey2));
      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      deck.push(makeEntry(cardB, "current", "L5_B_cur"));
      const bType2 = cardB.imagePast ? "past" : "current";
      const bKey2  = cardB.imagePast ? "L5_B_past" : "L5_B_cur2";
      deck.push(makeEntry(cardB, bType2, bKey2));
      deck.push(makeEntry(cardB, bType2, bKey2));
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
  return {
    pairKey: pairKey,
    cardId: card.cardId,
    relation: card.relation,
    displayType: "photo",
    photoType: photoType,
    isFallback: !!card.isFallback,
    fallbackImage: card.fallbackImage,
    imageBlob: photoType === "past" ? card.imagePast : card.imageCurrent
  };
}

function makeFallback(index) {
  const f = FALLBACK_PERSONS[index % FALLBACK_PERSONS.length];
  return {
    cardId: f.cardId,
    relation: f.relation,
    isFallback: true,
    fallbackImage: f.image,
    imageCurrent: null,
    imagePast: null
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
