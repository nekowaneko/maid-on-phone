// 懸浮窗的表情對照表（M1.6 契約檔，三條平行線共用，內容不得由任何一條線修改）。
// 角色頁從手機本機開啟，讀不到 JSON 也不能用 import，所以寫成一般 script，掛在全域的 PetEmotionMap。
// 表情鍵與聊天網頁的 config/emotion-map.json 對齊，另加白髮女僕專用的 pout（微傲）與 shy（嬌）。
// 表情圖是整張替換（不是分層），圖檔放在 frames/local/（不進 git，由 tools/make_expression_frames.py 產生）。
(function (root) {
  root.PetEmotionMap = {
    defaultEmotion: 'neutral',      // 平常的臉；排隊報告每則開頭補的 [neutral] 也是這個鍵
    frameRoot: 'frames/local/',     // 圖檔目錄（相對於 index.html）
    blinkFrame: 'blink.png',        // 眨眼圖：只有畫面是 idleFrame 時才眨眼
    idleFrame: 'idle.png',          // 待機圖
    frames: {
      neutral: 'idle.png',
      laugh: 'idle.png',
      smile: 'smile.png',
      thinking: 'thinking.png',
      troubled: 'troubled.png',
      pout: 'pout.png',
      shy: 'shy.png'
    }
  }
})(this)
