// 懸浮窗的盤前均線文字對照表（M4 契約檔，B、C 兩條線共用，內容不得由任何一條線修改）。
// 角色頁從手機本機開啟，讀不到 JSON 也不能用 import，所以寫成一般 script，掛在全域的 PetMaLabels。
// 動作代號與 backend/config/ma-contract.json 的 bubbleActions 一一對應。
(function (root) {
  root.PetMaLabels = {
    buttons: {
      openMa: '看明細',
      dismiss: '晚點再看',
      know: '知道了'
    },
    mainButton: '📈 盤前均線',
    summary: {
      u: '多頭',
      d: '空頭',
      m: '其他'
    }
  }
})(this)
