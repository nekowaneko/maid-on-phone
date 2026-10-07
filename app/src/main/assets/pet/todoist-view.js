// 懸浮窗 Todoist 雙軌提醒檢視邏輯（M3R B 線）
// 純函式設計：不碰 DOM、不讀時間。index.html 依這裡算出的按鈕畫泡泡。
// 遵守安全原則：所有外部文字顯示均交由呼叫端以 textContent 渲染防範 XSS。
(function (root) {
  // 常數定義

  // 功能函數定義

  // 產生一顆按鈕物件
  function button(label, action) {
    return { label: String(label), action: action };
  }

  // 根據傳入的資料與對照表產生泡泡內容與按鈕陣列
  function viewFor(data, labels) {
    if (!data || typeof data !== 'object') {
      return { script: '', buttons: [] };
    }

    var script = typeof data.script === 'string' ? data.script : '';
    var taskId = typeof data.taskId === 'string' ? data.taskId : '';
    var btnLabels = (labels && labels.buttons) ? labels.buttons : {};

    // 處理 view 類別（推播發送的畫面）
    if (data.view === 'p2') {
      if (!taskId) return { script: script, buttons: [] };
      var content = typeof data.content === 'string' ? data.content : '';
      return {
        script: script,
        buttons: [
          button(btnLabels.doToday, { action: 'doToday', taskId: taskId, view: 'p2' }),
          button(btnLabels.snooze, { action: 'snooze', taskId: taskId }),
          button(btnLabels.split, { action: 'split', taskId: taskId, content: content })
        ]
      };
    }

    if (data.view === 'p3') {
      if (!taskId) return { script: script, buttons: [] };
      return {
        script: script,
        buttons: [
          button(btnLabels.doTodayP3, { action: 'doToday', taskId: taskId, view: 'p3' }),
          button(btnLabels.tomorrow, { action: 'tomorrow', taskId: taskId })
        ]
      };
    }

    if (data.view === 'askDate') {
      if (!taskId) return { script: script, buttons: [] };
      return {
        script: script,
        buttons: [
          button(btnLabels.setDateTomorrow, { action: 'setDate', taskId: taskId, when: 'tomorrow' }),
          button(btnLabels.setDateNextMonday, { action: 'setDate', taskId: taskId, when: 'nextMonday' }),
          button(btnLabels.setDateNextMonth, { action: 'setDate', taskId: taskId, when: 'nextMonth' }),
          button(btnLabels.unknownDate, { action: 'unknownDate', taskId: taskId })
        ]
      };
    }

    // 處理 kind 類別（Worker 回應的畫面）
    if (data.kind === 'split') {
      if (!taskId) return { script: script, buttons: [] };
      var steps = Array.isArray(data.steps) ? data.steps : [];
      return {
        script: script,
        buttons: [
          button(btnLabels.confirmSplit, { action: 'confirmSplit', taskId: taskId, steps: steps }),
          button(btnLabels.cancel, { action: 'cancel' })
        ]
      };
    }

    if (data.kind === 'done' || data.kind === 'failed') {
      return { script: script, buttons: [] };
    }

    return { script: script, buttons: [] };
  }

  var PetTodoistView = {
    viewFor: viewFor
  };

  root.PetTodoistView = PetTodoistView;
})(this);
