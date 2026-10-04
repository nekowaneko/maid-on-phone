// 懸浮窗的演出排程（M1.6 骨架，由 B 線實作；介面見 docs/M1.6-EXPENSIVE-PLAN.md §4.3）。
(function (root) {
  // 尚未實作時一律丟出錯誤
  var notYet = function () { throw new Error('尚未實作') }
  root.PetPerformance = {
    TIMING: { leadMs: 450, charMs: 30, holdMs: 3000 },
    planTimeline: notYet,
    frameFor: notYet,
    createStage: notYet,
    stageSay: notYet,
    stageFinish: notYet,
    stageSkip: notYet
  }
})(this)
