// 懸浮窗的戒飲記錄畫面（M2；介面見 docs/M2-EXPENSIVE-PLAN.md §4.4）。
// 全部是純函式：不碰 DOM、不讀時間、不改動傳入的物件。index.html 依這裡算出的台詞與按鈕畫泡泡。
// 按鈕的 action 是要交給 PetBridge.onDrinkAction 的物件，或 { local: 'sugarMenu' }（在網頁內換成糖度選單）。
// 依賴 drink-labels.js 掛上的 PetDrinkLabels（由呼叫端傳入，這裡不直接讀全域）。
(function (root) {
  // 常數定義
  var EMPTY_SCRIPT = '';
  var CHOICE_FIELDS = {          // choose 的 field → 草稿裡對應的欄位
    starbucks: 'starbucksId',
    base: 'baseId',
    size: 'sizeId',
    sugar: 'sugarLevelId'
  };
  var TOPPING_FIELD = 'topping'; // 配料是加進 toppingIds，不是取代
  var SOURCE_TABLE = 'table';    // 星巴克查表：熱量是官方值，不能改甜度

  // 複製草稿（toppingIds 另外複製一份陣列），之後改動不會影響傳入的物件
  function copyDraft(draft) {
    var copy = {};
    var source = draft && typeof draft === 'object' ? draft : {};
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
    }
    copy.toppingIds = Array.isArray(source.toppingIds) ? source.toppingIds.slice() : [];
    return copy;
  }

  // 依選擇的欄位與編號產生新的草稿：starbucks／base／size／sugar 設定欄位，topping 加進 toppingIds（不重複）
  function applyChoice(draft, field, id) {
    var next = copyDraft(draft);
    if (field === TOPPING_FIELD) {
      if (next.toppingIds.indexOf(id) < 0) next.toppingIds.push(id);
      return next;
    }
    if (Object.prototype.hasOwnProperty.call(CHOICE_FIELDS, field)) next[CHOICE_FIELDS[field]] = id;
    return next;
  }

  // 一顆按鈕：label 為文字，action 為按下後要做的事
  function button(label, action) {
    return { label: String(label), action: action };
  }

  // 取消按鈕
  function cancelButton(labels) {
    return button(labels.buttons.cancel, { action: 'cancel' });
  }

  // 改甜度的 5 顆選項：順序同 labels.sugarLevels，按下送出重新複述（不寫入）
  function sugarMenu(draft, labels) {
    return labels.sugarLevels.map(function (level) {
      var next = copyDraft(draft);
      next.sugarLevelId = level.id;
      return button(level.name, { action: 'preview', draft: next });
    });
  }

  // 複述：記下來、改甜度（星巴克查表沒有）、取消
  function confirmButtons(resp, labels) {
    var buttons = [button(labels.buttons.confirm, { action: 'confirm', draft: copyDraft(resp.draft) })];
    if (resp.source !== SOURCE_TABLE) buttons.push(button(labels.buttons.changeSugar, { local: 'sugarMenu' }));
    buttons.push(cancelButton(labels));
    return buttons;
  }

  // 請使用者選：每個候選一顆（選了送出重新複述），最後加取消
  function chooseButtons(resp, labels) {
    var candidates = Array.isArray(resp.candidates) ? resp.candidates : [];
    var buttons = candidates.map(function (candidate) {
      return button(candidate.name, { action: 'preview', draft: applyChoice(resp.draft, resp.field, candidate.id) });
    });
    buttons.push(cancelButton(labels));
    return buttons;
  }

  // 記下來之後：有 logId 才有撤銷
  function savedButtons(resp, labels) {
    if (typeof resp.logId !== 'string' || resp.logId.length === 0) return [];
    return [button(labels.buttons.undo, { action: 'undo', logId: resp.logId })];
  }

  // 每日詢問：沒喝、有喝用說的
  function askButtons(labels) {
    return [
      button(labels.buttons.resist, { action: 'resist' }),
      button(labels.buttons.speak, { action: 'speak' })
    ];
  }

  // 依 Worker 的回應（或 App 組的 ask）算出泡泡要演的台詞與按鈕
  function viewFor(resp, labels) {
    if (!resp || typeof resp !== 'object') return { script: EMPTY_SCRIPT, buttons: [] };
    var script = typeof resp.script === 'string' ? resp.script : EMPTY_SCRIPT;
    var buttons = [];
    if (resp.kind === 'confirm') buttons = confirmButtons(resp, labels);
    else if (resp.kind === 'choose') buttons = chooseButtons(resp, labels);
    else if (resp.kind === 'saved') buttons = savedButtons(resp, labels);
    else if (resp.kind === 'ask') buttons = askButtons(labels);
    return { script: script, buttons: buttons }; // already、undone、other 與不認得的 kind 沒有按鈕
  }

  root.PetDrinkView = {
    viewFor: viewFor,
    sugarMenu: sugarMenu,
    applyChoice: applyChoice
  };
})(this);
