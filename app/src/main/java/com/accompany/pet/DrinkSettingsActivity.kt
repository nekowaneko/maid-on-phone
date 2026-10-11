package com.accompany.pet

import android.os.Bundle
import android.text.InputType
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.drink.ENABLED_PATH
import com.accompany.pet.core.drink.SETTINGS_PATH
import com.accompany.pet.core.drink.UNREACHABLE_MESSAGE
import com.accompany.pet.core.drink.askTimeOptions
import com.accompany.pet.core.drink.workerErrorMessage
import org.json.JSONException
import org.json.JSONObject

// 常數定義
const val SETTINGS_SAVED_MESSAGE = "已儲存"                    // 儲存成功
const val SETTINGS_LOADING_MESSAGE = "讀取中…"                 // 讀取設定中
const val SETTINGS_LOADED_MESSAGE = "已讀取目前的設定"         // 讀取完成
const val SETTINGS_SAVING_MESSAGE = "儲存中…"                  // 儲存中
const val SETTINGS_INVALID_FALLBACK = "設定值不正確"           // 400 但沒有 error 欄位時
const val HTTP_BAD_REQUEST = 400                               // 設定值不正確
const val FIELD_NAME = "subscriptionName"                      // 訂閱名稱
const val FIELD_FEE = "monthlyFee"                             // 月費
const val FIELD_RESIST = "resistValue"                         // 忍住一杯的入帳金額
const val FIELD_QUOTA = "monthlyQuota"                         // 每月額度
const val FIELD_ASK = "askTime"                                // 每天詢問時間

// 戒飲設定畫面：五個欄位，開啟時向 Worker 讀取，按「儲存」寫回；驗證一律由 Worker 做
class DrinkSettingsActivity : AppCompatActivity() {

    private lateinit var status: TextView        // 狀態說明
    private lateinit var enabledSwitch: SwitchCompat  // 啟用戒飲記錄
    private lateinit var nameInput: EditText     // 訂閱名稱
    private lateinit var feeInput: EditText      // 月費
    private lateinit var resistInput: EditText   // 忍住一杯的入帳金額
    private lateinit var quotaInput: EditText    // 每月額度
    private lateinit var askSpinner: Spinner     // 每天詢問時間（整點）
    private lateinit var saveButton: Button      // 儲存
    private val askOptions = askTimeOptions()    // 00:00～23:00

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        title = "戒飲設定"
        val root = buildLayout()
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val pad = dp(PADDING_DP)
            v.setPadding(bars.left + pad, bars.top + pad, bars.right + pad, bars.bottom + pad)
            insets
        }
        loadSettings()
    }

    // dp 轉 px
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // 建立畫面元件（照 MainActivity 用程式碼組版面，不新增 layout XML）
    private fun buildLayout(): ScrollView {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        status = TextView(this).apply { textSize = 16f }
        enabledSwitch = SwitchCompat(this).apply {
            text = "啟用戒飲記錄"
            isChecked = true
        }
        nameInput = EditText(this).apply { inputType = InputType.TYPE_CLASS_TEXT }
        feeInput = numberInput()
        resistInput = numberInput()
        quotaInput = numberInput()
        askSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@DrinkSettingsActivity, android.R.layout.simple_spinner_dropdown_item, askOptions)
        }
        saveButton = Button(this).apply {
            text = "儲存"
            isEnabled = false  // 讀到目前的設定之前不能存，避免用空白覆蓋
            setOnClickListener { saveSettings() }
        }
        root.addView(status)
        root.addView(enabledSwitch)
        addField(root, "訂閱名稱", nameInput)
        addField(root, "月費（元）", feeInput)
        addField(root, "忍住一杯的入帳金額（元）", resistInput)
        addField(root, "每月額度（杯）", quotaInput)
        addField(root, "每天詢問時間", askSpinner)
        root.addView(saveButton)
        root.addView(Button(this).apply {
            text = "重新讀取"
            setOnClickListener { loadSettings() }
        })
        return ScrollView(this).apply {
            clipToPadding = false
            addView(root)
        }
    }

    // 建立只能輸入數字的輸入框
    private fun numberInput(): EditText = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER }

    // 加一個欄位：標題＋輸入元件
    private fun addField(root: LinearLayout, label: String, view: android.view.View) {
        root.addView(TextView(this).apply {
            text = label
            textSize = 14f
        })
        root.addView(view)
    }

    // 向 Worker 讀取目前的設定並填入
    private fun loadSettings() {
        status.text = SETTINGS_LOADING_MESSAGE
        saveButton.isEnabled = false
        WorkerApi.get(SETTINGS_PATH) { result ->
            if (isFinishing || isDestroyed) return@get
            val message = workerErrorMessage(result.status)
            if (message != null) {
                status.text = message
                return@get
            }
            if (fillFields(result.text)) {
                loadEnabled()
            } else {
                status.text = UNREACHABLE_MESSAGE  // 回應格式不對，當成連不上
            }
        }
    }

    // 設定讀完後讀開關；讀不到就不讓存（這裡不是降級情境，不套用 drinkUiEnabled）
    private fun loadEnabled() {
        WorkerApi.get(ENABLED_PATH) { result ->
            if (isFinishing || isDestroyed) return@get
            val enabled = parseEnabled(result)
            if (enabled == null) {
                status.text = workerErrorMessage(result.status) ?: UNREACHABLE_MESSAGE  // 格式不對也當成連不上
                return@get
            }
            enabledSwitch.isChecked = enabled
            status.text = SETTINGS_LOADED_MESSAGE
            saveButton.isEnabled = true
        }
    }

    // 把回應的設定填進欄位；格式不對回 false
    private fun fillFields(json: String): Boolean = try {
        val obj = JSONObject(json)
        nameInput.setText(obj.getString(FIELD_NAME))
        feeInput.setText(obj.getInt(FIELD_FEE).toString())
        resistInput.setText(obj.getInt(FIELD_RESIST).toString())
        quotaInput.setText(obj.getInt(FIELD_QUOTA).toString())
        val index = askOptions.indexOf(obj.getString(FIELD_ASK))
        if (index >= 0) askSpinner.setSelection(index)  // 不在選單上就維持第一個（儲存時 Worker 照樣驗證）
        true
    } catch (e: JSONException) {
        false
    }

    // 數字欄位：能轉成整數就送整數，否則原文送出，由 Worker 回「設定值不正確：…」
    private fun numberValue(input: EditText): Any {
        val raw = input.text.toString().trim()
        return raw.toIntOrNull() ?: raw
    }

    // 按「儲存」：五個欄位一起 PUT；成功顯示「已儲存」，400 顯示回應的 error，其他照固定提示
    private fun saveSettings() {
        val body = JSONObject()
            .put(FIELD_NAME, nameInput.text.toString())
            .put(FIELD_FEE, numberValue(feeInput))
            .put(FIELD_RESIST, numberValue(resistInput))
            .put(FIELD_QUOTA, numberValue(quotaInput))
            .put(FIELD_ASK, askOptions[askSpinner.selectedItemPosition.coerceIn(0, askOptions.size - 1)])
            .toString()
        status.text = SETTINGS_SAVING_MESSAGE
        saveButton.isEnabled = false
        WorkerApi.put(SETTINGS_PATH, body) { result ->
            if (isFinishing || isDestroyed) return@put
            val message = saveResultMessage(result)
            if (message != SETTINGS_SAVED_MESSAGE) {  // 設定那步失敗就不送開關
                saveButton.isEnabled = true
                status.text = message
                return@put
            }
            saveEnabled()
        }
    }

    // 第二步：存開關；失敗顯示這一步的錯誤，不回滾已存的五個欄位
    private fun saveEnabled() {
        val enabledBody = JSONObject().put("enabled", enabledSwitch.isChecked).toString()
        WorkerApi.put(ENABLED_PATH, enabledBody) { result ->
            if (isFinishing || isDestroyed) return@put
            saveButton.isEnabled = true
            status.text = saveResultMessage(result)
        }
    }
}

// 儲存結果要顯示的文字
fun saveResultMessage(result: WorkerResult): String {
    if (result.status == HTTP_BAD_REQUEST) return errorField(result.text) ?: SETTINGS_INVALID_FALLBACK  // 「設定值不正確：月費」
    return workerErrorMessage(result.status) ?: SETTINGS_SAVED_MESSAGE
}

// 取出回應的 error 欄位；沒有或格式不對回 null
fun errorField(json: String): String? = try {
    (JSONObject(json).opt("error") as? String)?.trim()?.takeIf { it.isNotEmpty() }
} catch (e: JSONException) {
    null
}
