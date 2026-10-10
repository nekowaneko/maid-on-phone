// 懸浮窗盤前均線檢視邏輯（M4 B 線）
// 純函式設計：不碰 DOM、不讀時間、不改動傳入物件。index.html 依這裡算出的內容畫泡泡。
// 遵守安全原則：所有外部文字顯示均交由呼叫端以 textContent 渲染防範 XSS。
(function (root) {
  // 常數定義

  // 功能函數定義

  // 判斷是否為大於等於 0 的整數
  function isNonNegativeInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  // 產生一顆按鈕物件
  function button(label, action) {
    return { label: String(label), action: action };
  }

  // 依據傳入的資料與對照表產生泡泡內容、摘要與按鈕陣列
  function viewFor(data, labels) {
    if (!data || typeof data !== 'object') {
      return { script: '', summary: null, buttons: [] };
    }

    var script = typeof data.script === 'string' ? data.script : '';
    var btnLabels = (labels && labels.buttons) ? labels.buttons : {};

    // 狀態為 ok：檢查 u、d、m 是否皆為大於等於 0 的整數
    if (data.status === 'ok') {
      if (isNonNegativeInteger(data.u) && isNonNegativeInteger(data.d) && isNonNegativeInteger(data.m)) {
        return {
          script: script,
          summary: {
            u: data.u,
            d: data.d,
            m: data.m
          },
          buttons: [
            button(btnLabels.openMa || '看明細', { action: 'openMa' }),
            button(btnLabels.dismiss || '晚點再看', { action: 'dismiss' })
          ]
        };
      }
      return { script: script, summary: null, buttons: [] };
    }

    // 狀態為 failed：摘要為 null，僅有「知道了」按鈕
    if (data.status === 'failed') {
      return {
        script: script,
        summary: null,
        buttons: [
          button(btnLabels.know || '知道了', { action: 'dismiss' })
        ]
      };
    }

    // 不認得的 status，或格式不符
    return { script: script, summary: null, buttons: [] };
  }

  var PetMaView = {
    viewFor: viewFor
  };

  root.PetMaView = PetMaView;
})(this);
