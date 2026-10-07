// 懸浮窗的 Todoist 按鈕文字對照表（M3 第二輪契約檔，內容不得由任何一條線修改）。
// 動作代號與 backend/config/todoist-contract.json 的 viewButtons 一一對應；角色頁讀不到 JSON，所以寫成一般 script。
(function (root) {
  root.PetTodoistLabels = {
    buttons: {
      doToday: '今天推進一小步',
      doTodayP3: '今天做',
      snooze: '延後一週',
      split: '拆成小步驟',
      tomorrow: '明天再提醒',
      setDateTomorrow: '明天',
      setDateNextMonday: '下週一',
      setDateNextMonth: '下個月',
      unknownDate: '不知道',
      confirmSplit: '幫我加成子任務',
      cancel: '取消'
    }
  };
})(this);
