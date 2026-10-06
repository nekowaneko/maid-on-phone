// 懸浮窗的 Todoist 雙軌提醒畫面（M3）
// 純函式設計：不碰 DOM、不讀時間。index.html 依這裡算出的按鈕畫泡泡。
// 遵守安全原則：所有外部標題文字顯示均交由呼叫端以 textContent 渲染防範 XSS。
(function (root) {
  // 一顆按鈕：label 為文字，action 為按下後要做的事
  function button(label, action) {
    return { label: String(label), action: action };
  }

  // P2 催進度的 3 顆選項按鈕
  function viewForP2(task) {
    var taskId = task && task.id ? String(task.id) : '';
    return {
      buttons: [
        button('今天推進一小步', { action: 'do_today', taskId: taskId }),
        button('延後一週', { action: 'snooze', taskId: taskId }),
        button('拆成小步驟', { action: 'split', taskId: taskId })
      ]
    };
  }

  // P3 時機到的 2 顆選項按鈕
  function viewForP3(task) {
    var taskId = task && task.id ? String(task.id) : '';
    return {
      buttons: [
        button('今天做', { action: 'do_today', taskId: taskId }),
        button('明天再提醒', { action: 'tomorrow', taskId: taskId })
      ]
    };
  }

  // 拆成小步驟確認泡泡
  function viewForSplit(task, steps) {
    var taskId = task && task.id ? String(task.id) : '';
    return {
      buttons: [
        button('確認新增子任務', { action: 'confirm_split', taskId: taskId, steps: steps || [] }),
        button('取消', { action: 'cancel' })
      ]
    };
  }

  var PetTodoistView = {
    viewForP2: viewForP2,
    viewForP3: viewForP3,
    viewForSplit: viewForSplit
  };

  root.PetTodoistView = PetTodoistView;
})(this);
