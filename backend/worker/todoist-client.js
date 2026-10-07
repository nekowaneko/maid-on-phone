// Todoist API 客戶端模組
// 唯一允許存取 api.todoist.com 的模組（架構約束 A35、V30）
// 集中處理 Bearer 權杖、分頁讀取任務、修改到期日與新增子任務。

// 常數定義
const DEFAULT_ORIGIN = 'https://api.todoist.com/api/v1'
const DEFAULT_PAGE_LIMIT = 200
const DEFAULT_MAX_PAGES = 10
const CONTENT_TYPE_JSON = 'application/json'

/**
 * 建立 Todoist API 客戶端實例
 * @param {string} token API 存取權杖
 * @param {Function} fetchImpl fetch 實作函式
 * @param {object} defaults 預設設定
 * @returns {object|null}
 */
export const createTodoistClient = (token, fetchImpl = fetch, defaults = {}) => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    return null
  }

  const apiOrigin = defaults.apiOrigin || DEFAULT_ORIGIN
  const pageLimit = defaults.pageLimit || DEFAULT_PAGE_LIMIT
  const maxPages = defaults.maxPages || DEFAULT_MAX_PAGES
  const authHeader = `Bearer ${token.trim()}`

  return {
    /**
     * 讀取任務清單（自動分頁）
     * @returns {Promise<Array<object>>}
     */
    async listTasks() {
      const allResults = []
      let cursor = null
      let pageCount = 0

      while (pageCount < maxPages) {
        pageCount += 1
        const url = new URL(`${apiOrigin}/tasks`)
        url.searchParams.set('limit', String(pageLimit))
        if (cursor) {
          url.searchParams.set('cursor', cursor)
        }

        let response
        try {
          response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: { Authorization: authHeader }
          })
        } catch {
          throw new Error('TODOIST_NETWORK')
        }

        if (!response.ok) {
          throw new Error(`TODOIST_${response.status}`)
        }

        const data = await response.json()
        if (Array.isArray(data.results)) {
          allResults.push(...data.results)
        }
        if (!data.next_cursor) {
          break
        }
        cursor = data.next_cursor
      }

      return allResults
    },

    /**
     * 取得單一任務資訊
     * @param {string} id 任務編號
     * @returns {Promise<object|null>}
     */
    async getTask(id) {
      const url = `${apiOrigin}/tasks/${encodeURIComponent(id)}`
      let response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: authHeader }
        })
      } catch {
        throw new Error('TODOIST_NETWORK')
      }

      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`TODOIST_${response.status}`)
      }

      return response.json()
    },

    /**
     * 更新任務到期日
     * @param {string} id 任務編號
     * @param {string} dateKey 到期日期 YYYY-MM-DD
     * @returns {Promise<object>}
     */
    async updateDue(id, dateKey) {
      const url = `${apiOrigin}/tasks/${encodeURIComponent(id)}`
      let response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': CONTENT_TYPE_JSON
          },
          body: JSON.stringify({ due_date: dateKey })
        })
      } catch {
        throw new Error('TODOIST_NETWORK')
      }

      if (!response.ok) {
        throw new Error(`TODOIST_${response.status}`)
      }

      return response.json()
    },

    /**
     * 建立子任務
     * @param {string} parentId 父任務編號
     * @param {string} content 子任務內容
     * @returns {Promise<object>}
     */
    async addSubtask(parentId, content) {
      const url = `${apiOrigin}/tasks`
      let response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': CONTENT_TYPE_JSON
          },
          body: JSON.stringify({
            content,
            parent_id: parentId
          })
        })
      } catch {
        throw new Error('TODOIST_NETWORK')
      }

      if (!response.ok) {
        throw new Error(`TODOIST_${response.status}`)
      }

      return response.json()
    }
  }
}
