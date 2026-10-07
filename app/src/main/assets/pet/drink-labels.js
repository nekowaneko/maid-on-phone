// 懸浮窗的戒飲記錄文字對照表（M2 契約檔，B、C 兩條線共用，內容不得由任何一條線修改）。
// 角色頁從手機本機開啟，讀不到 JSON 也不能用 import，所以寫成一般 script，掛在全域的 PetDrinkLabels。
// sugarLevels 的編號與順序和 backend/config/drink-model.json 相同；按鈕文字與 App 通知按鈕用同一套字。
(function (root) {
  root.PetDrinkLabels = {
    sugarLevels: [
      { id: 'full', name: '全糖' },
      { id: 'less', name: '少糖' },
      { id: 'half', name: '半糖' },
      { id: 'quarter', name: '微糖' },
      { id: 'none', name: '無糖' }
    ],
    buttons: {
      confirm: '對，記下來',
      changeSugar: '改甜度',
      cancel: '取消',
      resist: '沒喝',
      speak: '有喝，用說的',
      undo: '撤銷',
      history: '📊 戒飲歷史'
    },
    undoMs: 60000   // 撤銷按鈕保留的時間（毫秒）
  }
})(this)
