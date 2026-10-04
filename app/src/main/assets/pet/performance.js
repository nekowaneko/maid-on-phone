// 懸浮窗的演出排程（M1.6；介面見 docs/M1.6-EXPENSIVE-PLAN.md §4.3）。
// 全部是純函式：不碰 DOM、不讀時間、不改動傳入的物件。index.html 依這裡排出的步驟設計時器。
// 節奏照抄 accompany_bot 的聊天網頁：換臉後空 450 毫秒才出字、每 30 毫秒一個字、說完停 3 秒回平常的臉。
// 依賴 vendor/stream-parser.js 掛上的 PetStreamParser（需先載入）。
(function (root) {
  // 常數定義
  var TIMING = { leadMs: 450, charMs: 30, holdMs: 3000 }; // 照抄 LEAD_MS、TYPEWRITER_INTERVAL_MS、HOLD_MS
  var EMPTY_TEXT = '';
  var SKIP_SEPARATOR = '\n\n'; // 跳到演完時，各則台詞之間空一行

  // 以 stream-parser 一次解析完整台詞，回傳 { text, cues }
  function parseScript(script, frames, defaultEmotion) {
    var parser = root.PetStreamParser;
    var source = typeof script === 'string' ? script : EMPTY_TEXT;
    return parser.finalize(parser.feedAll([source], frames, defaultEmotion), defaultEmotion);
  }

  // 第 k 個字（1 起算）出現的時間
  function charTime(k) {
    return TIMING.leadMs + (k - 1) * TIMING.charMs;
  }

  // 開頭的臉：index 0 的 cue（有多個時取最後一個，才是真正生效的表情），沒有就用預設表情
  function firstFace(cues, defaultEmotion) {
    var face = defaultEmotion;
    for (var i = 0; i < cues.length; i += 1) {
      if (cues[i].index === 0) face = cues[i].emotion;
    }
    return face;
  }

  // 取出 index 恰好等於指定位置的 cue，轉成換臉步驟
  function faceStepsAt(cues, index, atMs) {
    var steps = [];
    for (var i = 0; i < cues.length; i += 1) {
      if (cues[i].index === index) steps.push({ atMs: atMs, face: cues[i].emotion });
    }
    return steps;
  }

  // 取出標籤寫在最後一個字之後（index ≥ 字數，且不是開頭）的 cue，轉成換臉步驟
  function trailingFaceSteps(cues, length, atMs) {
    var steps = [];
    for (var i = 0; i < cues.length; i += 1) {
      if (cues[i].index > 0 && cues[i].index >= length) steps.push({ atMs: atMs, face: cues[i].emotion });
    }
    return steps;
  }

  // 排出一則台詞的演出步驟：{ text, steps, endMs }
  function planTimeline(script, frames, defaultEmotion) {
    var parsed = parseScript(script, frames, defaultEmotion);
    var text = parsed.text;
    var cues = parsed.cues;
    var steps = [{ atMs: 0, face: firstFace(cues, defaultEmotion) }];
    for (var k = 1; k <= text.length; k += 1) {
      if (k > 1) steps = steps.concat(faceStepsAt(cues, k - 1, charTime(k))); // 換臉排在同一時間的出字之前
      steps.push({ atMs: charTime(k), count: k });
    }
    var lastMs = text.length > 0 ? charTime(text.length) : TIMING.leadMs; // 沒有字時以 leadMs 當最後一個字的時間
    steps = steps.concat(trailingFaceSteps(cues, text.length, lastMs)); // 標籤在最後：排在最後一個字之後
    var endMs = lastMs + TIMING.holdMs;
    steps.push({ atMs: endMs, face: defaultEmotion }); // 停留結束換回平常的臉
    return { text: text, steps: steps, endMs: endMs };
  }

  // 表情鍵對應的圖檔名；不在清單裡就用預設表情的圖
  function frameFor(emotion, emotionMapConfig) {
    var config = emotionMapConfig || {};
    var frames = config.frames || {};
    if (typeof emotion === 'string' && Object.prototype.hasOwnProperty.call(frames, emotion)) return frames[emotion];
    return frames[config.defaultEmotion];
  }

  // 建立空的舞台：目前演出中的一則與排在後面的
  function createStage() {
    return { current: null, waiting: [] };
  }

  // 安全取出 waiting 陣列（不存在時當成空的）
  function waitingOf(stage) {
    return stage && Array.isArray(stage.waiting) ? stage.waiting : [];
  }

  // 安全取出 current（不存在時當成 null）
  function currentOf(stage) {
    return stage && typeof stage.current === 'string' ? stage.current : null;
  }

  // 收到一則台詞：沒在演就直接演，否則排到最後面
  function stageSay(stage, script) {
    var current = currentOf(stage);
    var waiting = waitingOf(stage);
    if (current === null) return { current: script, waiting: waiting.slice() };
    return { current: current, waiting: waiting.concat([script]) };
  }

  // 一則演完：換排在最前面的那一則上場，沒有就清空
  function stageFinish(stage) {
    var waiting = waitingOf(stage);
    if (waiting.length === 0) return { current: null, waiting: [] };
    return { current: waiting[0], waiting: waiting.slice(1) };
  }

  // 跳到演完：目前與排隊中的每則各自解析後以空一行串接，舞台清空、臉換回預設表情
  function stageSkip(stage, frames, defaultEmotion) {
    var current = currentOf(stage);
    var scripts = (current === null ? [] : [current]).concat(waitingOf(stage));
    var texts = [];
    for (var i = 0; i < scripts.length; i += 1) {
      texts.push(parseScript(scripts[i], frames, defaultEmotion).text);
    }
    return { stage: createStage(), text: texts.join(SKIP_SEPARATOR), face: defaultEmotion };
  }

  root.PetPerformance = {
    TIMING: TIMING,
    planTimeline: planTimeline,
    frameFor: frameFor,
    createStage: createStage,
    stageSay: stageSay,
    stageFinish: stageFinish,
    stageSkip: stageSkip
  };
})(this);
