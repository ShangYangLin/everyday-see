// ============================================
// 語系文案 i18n.js
// 不提供手動切換，依 navigator.language 自動偵測
// ============================================

const TRANSLATIONS = {
  zh: {
    appName: "每天見",
    welcomeTitle: "每天見",
    welcomeSubtitle: "陪伴 · 記憶 · 每一天",
    welcomeStart: "開始",

    askUploadFirst: "請上傳與您最親密的一位家人照片",
    askWhoIsThis: "這是誰？",
    askUploadAnother: "請再上傳一位家人照片",
    uploadButton: "選擇照片",
    confirmButton: "確定",
    skipButton: "跳過",

    askUploadSecondPhoto: "請再上傳一張 {name} 的不同照片",

    memoryTaskTitle: "如果您願意告訴我對您重要的事情，我會幫助您記得。",
    memoryTaskQuestion: "您的重要聯絡人是？他的電話是？",
    memoryTaskNamePlaceholder: "姓名",
    memoryTaskPhonePlaceholder: "電話號碼",
    memoryTaskSave: "記下來",

    quizPromptTitle: "小提醒時間",
    quizCorrect: "答對了！太棒了",
    quizWrong: "再想想看？",
    quizShowHint: "給我提示",
    quizHintPrefix: "提示：",
    quizContactPhoneQuestion: "{name}的電話是？",
    quizSubmit: "確定",
    quizSkip: "先跳過",
    quizSlowReminder: "別著急，慢慢想",

    askAddNewMemo: "要不要告訴我一件對您重要的事？",
    addMemoQuestionPlaceholder: "想記住什麼事情？(例如：吃藥時間)",
    addMemoAnswerPlaceholder: "答案/內容",
    addMemoSave: "記下來",
    addMemoSkip: "現在不用",
    manageMemosButton: "新增/更新事項",
    selectFamilyMemberTitle: "請選擇要詢問哪位家人",
    yesAnswer: "是",
    noAnswer: "否",
    askHasMedication: "您現在有在吃藥嗎？",
    askMedicationTime: "吃藥的時間是？",
    askHasDoctorVisit: "您有定期回診嗎？",
    askDoctorVisitTime: "回診的時間是？",
    askKnowsBirthday: "您記得{name}的生日嗎？",
    askBirthdayIs: "{name}的生日是？",
    askKnowsSchool: "您知道{name}就讀的學校嗎？",
    askSchoolIs: "{name}就讀的學校是？",
    askTransportMode: "您平常的交通工具是？",
    transportDrive: "開車/騎車",
    transportTransit: "大眾運輸",
    transportOther: "其他",
    askVehiclePlate: "車號是？",
    askTransitRoute: "您最常搭的路線是？",
    labelMedicationTime: "吃藥時間",
    labelDoctorVisit: "回診時間",
    labelBirthday: "{name}的生日",
    labelSchool: "{name}就讀的學校",
    labelVehiclePlate: "車號",
    labelTransitRoute: "常搭路線",

    randomHintAddPhoto: "好久沒看到新照片了，要不要新增一張呢？",
    randomHintAddMemo: "要不要告訴我一件對您重要的事？",

    giveUpButton: "放棄 / 休息一下",
    greatJobMessage: "您今天很棒囉！我們休息一下，明天再見！",

    levelComplete: "過關了！",
    gameComplete: "全部完成！",

    hintButton: "家人給的小提示",

    inviteShare: "邀請家人傳送他們的近況",
    inviteShareDesc: "點擊這裡傳送邀請，請家人錄一段問候影片喔！",

    familyAlbum: "家人相冊",
    familyAlbumHint: "可以在這裡新增家人照片喔，越多照片越有趣！",
    importantMemos: "重要記憶事項",
    streakDays: "連續訓練天數",
    shareButton: "邀請家人",
    playTodayButton: "開始今天的遊戲",

    addPhoto: "新增/更新照片",
    managePhotosTitle: "管理家人照片",
    addNewPerson: "新增一位家人",
    backButton: "返回",
    currentPhotoLabel: "現在",
    photoSlotLabel: "照片{n}",
    secondPhotoLabel: "第二張",
    addPhotoSlot: "新增",
    relationNamePlaceholder: "家人關係/姓名",
    deletePersonButton: "刪除這位家人",
    confirmDeletePerson: "確定要刪除這位家人嗎？相關照片會一併移除。",

    relationDefaults: {
      spouse: "老伴",
      son: "兒子",
      daughter: "女兒",
      grandchild: "孫子"
    }
  },

  en: {
    appName: "See You Every Day",
    welcomeTitle: "See You Every Day",
    welcomeSubtitle: "Companionship · Memory · Every Day",
    welcomeStart: "Start",

    askUploadFirst: "Please upload a photo of someone close to you",
    askWhoIsThis: "Who is this?",
    askUploadAnother: "Please upload another family photo",
    uploadButton: "Choose Photo",
    confirmButton: "Confirm",
    skipButton: "Skip",

    askUploadSecondPhoto: "Please upload another photo of {name}",

    memoryTaskTitle: "If you'd like to tell me something important, I'll help you remember it.",
    memoryTaskQuestion: "Who is your important contact? What is their phone number?",
    memoryTaskNamePlaceholder: "Name",
    memoryTaskPhonePlaceholder: "Phone Number",
    memoryTaskSave: "Remember This",

    quizPromptTitle: "Quick Reminder",
    quizCorrect: "That's right! Wonderful",
    quizWrong: "Let's think again?",
    quizShowHint: "Give me a hint",
    quizHintPrefix: "Hint: ",
    quizContactPhoneQuestion: "What is {name}'s phone number?",
    quizSubmit: "Confirm",
    quizSkip: "Skip for now",
    quizSlowReminder: "Take your time",

    askAddNewMemo: "Would you like to tell me something important?",
    addMemoQuestionPlaceholder: "What should I remember? (e.g. medicine time)",
    addMemoAnswerPlaceholder: "Answer/Content",
    addMemoSave: "Remember This",
    addMemoSkip: "Not Now",
    manageMemosButton: "Add/Update Memos",
    selectFamilyMemberTitle: "Who would you like to talk about?",
    yesAnswer: "Yes",
    noAnswer: "No",
    askHasMedication: "Are you currently taking any medication?",
    askMedicationTime: "What time do you take it?",
    askHasDoctorVisit: "Do you have regular doctor visits?",
    askDoctorVisitTime: "When are your doctor visits?",
    askKnowsBirthday: "Do you remember {name}'s birthday?",
    askBirthdayIs: "What is {name}'s birthday?",
    askKnowsSchool: "Do you know what school {name} attends?",
    askSchoolIs: "What school does {name} attend?",
    askTransportMode: "How do you usually get around?",
    transportDrive: "Drive/Ride",
    transportTransit: "Public Transit",
    transportOther: "Other",
    askVehiclePlate: "What is your license plate number?",
    askTransitRoute: "What route do you take most often?",
    labelMedicationTime: "Medication Time",
    labelDoctorVisit: "Doctor Visit",
    labelBirthday: "{name}'s Birthday",
    labelSchool: "{name}'s School",
    labelVehiclePlate: "License Plate",
    labelTransitRoute: "Usual Route",

    randomHintAddPhoto: "It's been a while since a new photo — want to add one?",
    randomHintAddMemo: "Would you like to tell me something important?",

    giveUpButton: "Take a Break",
    greatJobMessage: "You did great today! Let's rest now, see you tomorrow!",

    levelComplete: "Level Complete!",
    gameComplete: "All Done!",

    hintButton: "Hint from Family",

    inviteShare: "Invite Family to Share Updates",
    inviteShareDesc: "Tap here to invite family to record a greeting video!",

    familyAlbum: "Family Album",
    familyAlbumHint: "Add family photos here — the more, the merrier!",
    importantMemos: "Important Memories",
    streakDays: "Days in a Row",
    shareButton: "Invite Family",
    playTodayButton: "Play Today's Game",

    addPhoto: "Add/Update Photo",
    managePhotosTitle: "Manage Family Photos",
    addNewPerson: "Add a Family Member",
    backButton: "Back",
    currentPhotoLabel: "Current",
    photoSlotLabel: "Photo {n}",
    secondPhotoLabel: "Second",
    addPhotoSlot: "Add",
    relationNamePlaceholder: "Relation/Name",
    deletePersonButton: "Remove This Person",
    confirmDeletePerson: "Remove this family member? Their photos will also be removed.",

    relationDefaults: {
      spouse: "Spouse",
      son: "Son",
      daughter: "Daughter",
      grandchild: "Grandchild"
    }
  },

  es: {
    appName: "Nos Vemos Cada Día",
    welcomeTitle: "Nos Vemos Cada Día",
    welcomeSubtitle: "Compañía · Memoria · Cada Día",
    welcomeStart: "Comenzar",

    askUploadFirst: "Por favor suba una foto de alguien cercano a usted",
    askWhoIsThis: "¿Quién es?",
    askUploadAnother: "Por favor suba otra foto familiar",
    uploadButton: "Elegir Foto",
    confirmButton: "Confirmar",
    skipButton: "Omitir",

    askUploadSecondPhoto: "Por favor suba otra foto de {name}",

    memoryTaskTitle: "Si desea contarme algo importante, le ayudaré a recordarlo.",
    memoryTaskQuestion: "¿Quién es su contacto importante? ¿Cuál es su número de teléfono?",
    memoryTaskNamePlaceholder: "Nombre",
    memoryTaskPhonePlaceholder: "Número de Teléfono",
    memoryTaskSave: "Recordar Esto",

    quizPromptTitle: "Recordatorio Rápido",
    quizCorrect: "¡Correcto! Maravilloso",
    quizWrong: "¿Pensemos otra vez?",
    quizShowHint: "Dame una pista",
    quizHintPrefix: "Pista: ",
    quizContactPhoneQuestion: "¿Cuál es el número de teléfono de {name}?",
    quizSubmit: "Confirmar",
    quizSkip: "Omitir por ahora",
    quizSlowReminder: "Tómese su tiempo",

    askAddNewMemo: "¿Quiere contarme algo importante?",
    addMemoQuestionPlaceholder: "¿Qué debo recordar? (ej. hora de medicina)",
    addMemoAnswerPlaceholder: "Respuesta/Contenido",
    addMemoSave: "Recordar Esto",
    addMemoSkip: "Ahora No",
    manageMemosButton: "Añadir/Actualizar Memorias",
    selectFamilyMemberTitle: "¿De quién le gustaría hablar?",
    yesAnswer: "Sí",
    noAnswer: "No",
    askHasMedication: "¿Toma algún medicamento actualmente?",
    askMedicationTime: "¿A qué hora lo toma?",
    askHasDoctorVisit: "¿Tiene visitas médicas regulares?",
    askDoctorVisitTime: "¿Cuándo son sus visitas médicas?",
    askKnowsBirthday: "¿Recuerda el cumpleaños de {name}?",
    askBirthdayIs: "¿Cuál es el cumpleaños de {name}?",
    askKnowsSchool: "¿Sabe a qué escuela va {name}?",
    askSchoolIs: "¿A qué escuela va {name}?",
    askTransportMode: "¿Cómo se transporta habitualmente?",
    transportDrive: "Conducir/Moto",
    transportTransit: "Transporte Público",
    transportOther: "Otro",
    askVehiclePlate: "¿Cuál es el número de su placa?",
    askTransitRoute: "¿Qué ruta toma con más frecuencia?",
    labelMedicationTime: "Hora de Medicina",
    labelDoctorVisit: "Visita Médica",
    labelBirthday: "Cumpleaños de {name}",
    labelSchool: "Escuela de {name}",
    labelVehiclePlate: "Placa",
    labelTransitRoute: "Ruta Habitual",

    randomHintAddPhoto: "Hace tiempo que no hay fotos nuevas, ¿añadimos una?",
    randomHintAddMemo: "¿Quiere contarme algo importante?",

    giveUpButton: "Tomar un Descanso",
    greatJobMessage: "¡Lo hizo muy bien hoy! Descansemos, ¡hasta mañana!",

    levelComplete: "¡Nivel Completado!",
    gameComplete: "¡Todo Listo!",

    hintButton: "Pista de la Familia",

    inviteShare: "Invitar a la Familia",
    inviteShareDesc: "¡Toque aquí para invitar a un familiar a grabar un saludo!",

    familyAlbum: "Álbum Familiar",
    familyAlbumHint: "¡Añada fotos familiares aquí, cuantas más, mejor!",
    importantMemos: "Memorias Importantes",
    streakDays: "Días Consecutivos",
    shareButton: "Invitar Familia",
    playTodayButton: "Jugar Hoy",

    addPhoto: "Añadir/Actualizar Foto",
    managePhotosTitle: "Administrar Fotos Familiares",
    addNewPerson: "Añadir un Familiar",
    backButton: "Volver",
    currentPhotoLabel: "Actual",
    photoSlotLabel: "Foto {n}",
    secondPhotoLabel: "Segunda",
    addPhotoSlot: "Añadir",
    relationNamePlaceholder: "Relación/Nombre",
    deletePersonButton: "Eliminar Esta Persona",
    confirmDeletePerson: "¿Eliminar a este familiar? Sus fotos también se eliminarán.",

    relationDefaults: {
      spouse: "Cónyuge",
      son: "Hijo",
      daughter: "Hija",
      grandchild: "Nieto"
    }
  },

  ja: {
    appName: "毎日会いましょう",
    welcomeTitle: "毎日会いましょう",
    welcomeSubtitle: "寄り添い・記憶・毎日",
    welcomeStart: "はじめる",

    askUploadFirst: "一番親しいご家族の写真をアップロードしてください",
    askWhoIsThis: "この方はどなたですか？",
    askUploadAnother: "もう一人ご家族の写真をアップロードしてください",
    uploadButton: "写真を選ぶ",
    confirmButton: "確定",
    skipButton: "スキップ",

    askUploadSecondPhoto: "{name}の別の写真をもう一枚アップロードしてください",

    memoryTaskTitle: "大切なことを教えていただければ、覚えるお手伝いをします。",
    memoryTaskQuestion: "大切な連絡先はどなたですか？電話番号は？",
    memoryTaskNamePlaceholder: "お名前",
    memoryTaskPhonePlaceholder: "電話番号",
    memoryTaskSave: "記録する",

    quizPromptTitle: "ちょっとした確認です",
    quizCorrect: "正解です！すばらしい",
    quizWrong: "もう一度考えてみましょう",
    quizShowHint: "ヒントをください",
    quizHintPrefix: "ヒント：",
    quizContactPhoneQuestion: "{name}の電話番号は？",
    quizSubmit: "確定",
    quizSkip: "あとでやる",
    quizSlowReminder: "ゆっくり考えてくださいね",

    askAddNewMemo: "大切なことを教えていただけますか？",
    addMemoQuestionPlaceholder: "何を覚えておきたいですか？（例：薬を飲む時間）",
    addMemoAnswerPlaceholder: "答え・内容",
    addMemoSave: "記録する",
    addMemoSkip: "今はしない",
    manageMemosButton: "記憶事項を追加/更新",
    selectFamilyMemberTitle: "どなたについて伺いますか？",
    yesAnswer: "はい",
    noAnswer: "いいえ",
    askHasMedication: "現在お薬を飲んでいますか？",
    askMedicationTime: "お薬を飲む時間は？",
    askHasDoctorVisit: "定期的に通院していますか？",
    askDoctorVisitTime: "通院の時間は？",
    askKnowsBirthday: "{name}の誕生日を覚えていますか？",
    askBirthdayIs: "{name}の誕生日は？",
    askKnowsSchool: "{name}が通っている学校を知っていますか？",
    askSchoolIs: "{name}が通っている学校は？",
    askTransportMode: "普段の交通手段は？",
    transportDrive: "車/バイク",
    transportTransit: "公共交通機関",
    transportOther: "その他",
    askVehiclePlate: "車両番号は？",
    askTransitRoute: "よく利用する路線は？",
    labelMedicationTime: "お薬の時間",
    labelDoctorVisit: "通院時間",
    labelBirthday: "{name}の誕生日",
    labelSchool: "{name}の学校",
    labelVehiclePlate: "車両番号",
    labelTransitRoute: "よく使う路線",

    randomHintAddPhoto: "しばらく新しい写真がありませんね、追加しませんか？",
    randomHintAddMemo: "大切なことを教えていただけますか？",

    giveUpButton: "休憩する",
    greatJobMessage: "今日もよく頑張りましたね！また明日お会いしましょう！",

    levelComplete: "クリアしました！",
    gameComplete: "すべて完了です！",

    hintButton: "家族からのヒント",

    inviteShare: "ご家族に近況の共有をお願いする",
    inviteShareDesc: "ここをタップして、ご家族に挨拶の動画を送ってもらいましょう！",

    familyAlbum: "家族アルバム",
    familyAlbumHint: "ここにご家族の写真を追加できます。写真が増えるほど楽しくなります！",
    importantMemos: "大切な記憶事項",
    streakDays: "連続記録日数",
    shareButton: "家族を招待",
    playTodayButton: "今日のゲームを始める",

    addPhoto: "写真を追加/更新",
    managePhotosTitle: "家族の写真を管理",
    addNewPerson: "ご家族を追加",
    backButton: "戻る",
    currentPhotoLabel: "現在",
    photoSlotLabel: "写真{n}",
    secondPhotoLabel: "2枚目",
    addPhotoSlot: "追加",
    relationNamePlaceholder: "関係/お名前",
    deletePersonButton: "この方を削除",
    confirmDeletePerson: "この方を削除しますか？関連する写真も削除されます。",

    relationDefaults: {
      spouse: "配偶者",
      son: "息子",
      daughter: "娘",
      grandchild: "孫"
    }
  }
};

// 偵測使用者語系，回傳對應的文案物件
function detectLocale() {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("ja")) return "ja";
  return "en";
}

let currentLocale = detectLocale();
let T = TRANSLATIONS[currentLocale];

// 測試/除錯用：執行時切換語系，不用重新整理頁面
function setLocale(locale) {
  if (!TRANSLATIONS[locale]) return false;
  currentLocale = locale;
  T = TRANSLATIONS[locale];
  return true;
}

function getLocale() {
  return currentLocale;
}

// 簡單的字串模板替換，例如 t("askUploadSecondPhoto", {name: "兒子"})
function t(key, params = {}) {
  let str = T[key] || key;
  Object.keys(params).forEach(p => {
    str = str.replace(`{${p}}`, params[p]);
  });
  return str;
}
