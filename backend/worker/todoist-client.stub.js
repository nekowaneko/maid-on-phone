// 測試專用 Todoist 客戶端 Stub 模組
// 模擬 Todoist API 行為，不連線至外部網路，並記錄所有寫入呼叫。

/**
 * 建立 Todoist 測試專用 Stub
 * @param {object} options 初始化選項
 * @param {Array<object>} options.tasks 初始任務清單
 * @param {boolean} options.fail 是否模擬伺服器錯誤
 * @returns {object}
 */
export const createTodoistStub = ({ tasks = [], fail = false } = {}) => {
  let taskList = tasks.map((t) => ({ ...t }))
  const calls = []

  return {
    calls,

    /**
     * 從清單中移除指定任務（模擬使用者完成任務）
     * @param {string} id 任務編號
     */
    remove(id) {
      taskList = taskList.filter((t) => t.id !== id)
    },

    /**
     * 取得任務清單
     * @returns {Promise<Array<object>>}
     */
    async listTasks() {
      if (fail) {
        throw new Error('TODOIST_500')
      }
      return taskList.map((t) => ({ ...t }))
    },

    /**
     * 取得單一任務資訊
     * @param {string} id 任務編號
     * @returns {Promise<object|null>}
     */
    async getTask(id) {
      if (fail) {
        throw new Error('TODOIST_500')
      }
      const found = taskList.find((t) => t.id === id)
      if (!found) {
        return null
      }
      return { ...found }
    },

    /**
     * 更新任務到期日（記錄寫入呼叫）
     * @param {string} id 任務編號
     * @param {string} dateKey 到期日期 YYYY-MM-DD
     * @returns {Promise<object>}
     */
    async updateDue(id, dateKey) {
      if (fail) {
        throw new Error('TODOIST_500')
      }
      calls.push({ method: 'updateDue', id, dateKey })
      const found = taskList.find((t) => t.id === id)
      if (found) {
        found.due = { date: dateKey }
      }
      return { id, due: { date: dateKey } }
    },

    /**
     * 建立子任務（記錄寫入呼叫）
     * @param {string} parentId 父任務編號
     * @param {string} content 子任務內容
     * @returns {Promise<object>}
     */
    async addSubtask(parentId, content) {
      if (fail) {
        throw new Error('TODOIST_500')
      }
      calls.push({ method: 'addSubtask', parentId, content })
      const subtask = {
        id: `sub_${Date.now()}_${calls.length}`,
        content,
        parent_id: parentId
      }
      taskList.push(subtask)
      return subtask
    }
  }
}
