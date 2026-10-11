package com.accompany.pet

import android.animation.ValueAnimator
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.drink.ENABLED_PATH
import com.accompany.pet.core.drink.SETTINGS_PATH
import com.accompany.pet.core.drink.SettingsField
import com.accompany.pet.core.drink.UNREACHABLE_MESSAGE
import com.accompany.pet.core.drink.askTimeOptions
import com.accompany.pet.core.drink.settingsFieldOf
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
const val SETTINGS_INTRO = "調整每月額度、忍住一杯的入帳金額，以及女僕每天問你的時間。"  // 標題下方的說明句
const val SETTINGS_FOOTER = "月費 1～100000 元、入帳金額 0～10000 元、每月額度 0～300 杯，都要填整數；訂閱名稱最多 30 字。"  // 頁尾提示
const val SETTINGS_OFF_NOTE = "已關閉：泡泡上不會顯示 🎤 說話、沒喝、戒飲歷史。聊聊與盤前均線不受影響。"  // 開關為關時的說明框
const val SETTINGS_RELOAD_LABEL = "重新讀取"                   // 重新讀取按鈕
const val SETTINGS_SAVE_LABEL = "儲存"                         // 儲存按鈕
const val SETTINGS_BACK_DESCRIPTION = "返回"                   // 返回鈕的無障礙說明
const val INPUT_WIDTH_NUMBER_DP = 128                          // 數字輸入框寬度
const val INPUT_WIDTH_NAME_DP = 190                            // 訂閱名稱輸入框寬度
const val MIN_TOUCH_DP = 48                                    // 按鈕與輸入框最小高度
const val PULSE_PERIOD_MS = 1200L                              // 呼吸動畫一圈的時間
const val PULSE_LOW_ALPHA = 0.45f                              // 呼吸動畫最暗的透明度
const val BAR_EXTRA_DP = 16                                    // 捲動區底部在操作列之外多留的空間

// 戒飲設定畫面：五個欄位，開啟時向 Worker 讀取，按「儲存」寫回；驗證一律由 Worker 做
class DrinkSettingsActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout   // 捲動區內容
    private lateinit var bar: LinearLayout       // 底部固定操作列
    private lateinit var status: TextView        // 狀態說明
    private lateinit var statusDot: View         // 狀態圓點
    private lateinit var retryLink: TextView     // 連不上時狀態列右側的「重新讀取」
    private lateinit var enabledSwitch: SwitchCompat  // 啟用戒飲記錄
    private lateinit var offNote: TextView       // 開關為關時的說明框
    private lateinit var nameInput: EditText     // 訂閱名稱
    private lateinit var feeInput: EditText      // 月費
    private lateinit var resistInput: EditText   // 忍住一杯的入帳金額
    private lateinit var quotaInput: EditText    // 每月額度
    private lateinit var askSpinner: Spinner     // 每天詢問時間（整點）
    private lateinit var nameBox: View           // 訂閱名稱的輸入框外框（紅框標在這裡）
    private lateinit var feeBox: View            // 月費的輸入框外框
    private lateinit var resistBox: View         // 入帳金額的輸入框外框
    private lateinit var quotaBox: View          // 每月額度的輸入框外框
    private lateinit var askBox: View            // 每天詢問時間的輸入框外框
    private lateinit var saveButton: Button      // 儲存
    private lateinit var reloadButton: Button    // 重新讀取
    private val askOptions = askTimeOptions()    // 00:00～23:00
    private var markedField: SettingsField? = null  // 目前被標紅的欄位（畫面狀態，不存本機）
    private var dotPulse: ValueAnimator? = null  // 狀態圓點的閃動
    private var skeletonPulse: ValueAnimator? = null  // 載入中欄位的骨架呼吸
    private var lastAskPosition = 0              // 上一次選的詢問時間位置（只有真的改選才清紅框）

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        title = "戒飲設定"
        val root = buildLayout()
        setContentView(root)
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false      // 深色背景上用淺色狀態列圖示
            isAppearanceLightNavigationBars = false
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val pad = dp(PADDING_DP)
            content.setPadding(bars.left + pad, bars.top + pad, bars.right + pad, content.paddingBottom)
            bar.setPadding(bars.left + pad, pad, bars.right + pad, bars.bottom + pad)
            insets
        }
        loadSettings()
    }

    override fun onDestroy() {
        dotPulse?.cancel()
        skeletonPulse?.cancel()
        super.onDestroy()
    }

    // dp 轉 px
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // 取資源顏色（色碼只放在資源檔）
    private fun color(res: Int): Int = ContextCompat.getColor(this, res)

    // 建立畫面元件（照 MainActivity 用程式碼組版面，不新增 layout XML）
    private fun buildLayout(): FrameLayout {
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        status = TextView(this).apply {
            textSize = 14f
            setTextColor(color(R.color.settings_text))
        }
        statusDot = View(this).apply {
            setBackgroundResource(R.drawable.bg_settings_dot)
            layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply { marginEnd = dp(10) }
        }
        retryLink = TextView(this).apply {
            text = SETTINGS_RELOAD_LABEL
            textSize = 14f
            setTextColor(color(R.color.settings_accent))
            minHeight = dp(MIN_TOUCH_DP)
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            setOnClickListener { loadSettings() }
        }
        enabledSwitch = SwitchCompat(this).apply {
            isChecked = true
            trackTintList = ContextCompat.getColorStateList(this@DrinkSettingsActivity, R.color.switch_track_tint)
            thumbTintList = ContextCompat.getColorStateList(this@DrinkSettingsActivity, R.color.switch_thumb_tint)
        }
        offNote = TextView(this).apply {
            text = SETTINGS_OFF_NOTE
            textSize = 13f
            setTextColor(color(R.color.settings_text))
            setBackgroundResource(R.drawable.bg_settings_note)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            visibility = View.GONE
        }
        enabledSwitch.setOnCheckedChangeListener { _, checked ->
            offNote.visibility = if (checked) View.GONE else View.VISIBLE  // 關閉時才顯示說明框
        }
        nameInput = textInput(InputType.TYPE_CLASS_TEXT, Gravity.END or Gravity.CENTER_VERTICAL).apply {
            maxLines = 1
            isSingleLine = true
            ellipsize = TextUtils.TruncateAt.END  // 過長時尾端省略，不換行
        }
        feeInput = numberInput()
        resistInput = numberInput()
        quotaInput = numberInput()
        askSpinner = Spinner(this).apply {
            background = null
            adapter = darkAdapter()
            setPopupBackgroundResource(R.drawable.bg_settings_card)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    if (position != lastAskPosition) {  // 真的改選才算「修改」
                        lastAskPosition = position
                        clearMarkIf(askBox)
                    }
                }

                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
        }
        nameBox = inputBox(nameInput, null, INPUT_WIDTH_NAME_DP)
        feeBox = inputBox(feeInput, "元", INPUT_WIDTH_NUMBER_DP)
        quotaBox = inputBox(quotaInput, "杯", INPUT_WIDTH_NUMBER_DP)
        resistBox = inputBox(resistInput, "元", INPUT_WIDTH_NUMBER_DP)
        askBox = spinnerBox(askSpinner)
        watchEdit(nameInput, nameBox)
        watchEdit(feeInput, feeBox)
        watchEdit(quotaInput, quotaBox)
        watchEdit(resistInput, resistBox)
        saveButton = Button(this).apply {
            text = SETTINGS_SAVE_LABEL
            isEnabled = false  // 讀到目前的設定之前不能存，避免用空白覆蓋
            setBackgroundResource(R.drawable.bg_settings_btn_primary)
            setTextColor(color(R.color.settings_text))
            setOnClickListener { saveSettings() }
        }
        reloadButton = Button(this).apply {
            text = SETTINGS_RELOAD_LABEL
            setBackgroundResource(R.drawable.bg_settings_btn_ghost)
            setTextColor(color(R.color.settings_text))
            setOnClickListener { loadSettings() }
        }

        content.addView(headerRow())
        content.addView(captionText(SETTINGS_INTRO), sectionParams(top = 8))
        content.addView(statusBar(), sectionParams(top = 14))
        addSwitchCard(content)
        content.addView(offNote, sectionParams(top = 10))
        val subscribeCard = addGroup(content, "訂閱")
        addField(subscribeCard, "訂閱名稱", "例如「星巴克咖啡月租」", nameBox)
        addField(subscribeCard, "月費", "每月固定扣款的金額", feeBox)
        addField(subscribeCard, "每月額度", "一個月最多喝幾杯", quotaBox)
        val resistCard = addGroup(content, "忍住一杯")
        addField(resistCard, "入帳金額", "每按一次「沒喝」記進省下的錢", resistBox)
        val remindCard = addGroup(content, "提醒")
        addField(remindCard, "每天詢問時間", "女僕會在這個整點問你今天喝了沒", askBox)
        content.addView(captionText(SETTINGS_FOOTER), sectionParams(top = 14))

        bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundResource(R.drawable.bg_settings_bar)
            addView(reloadButton, buttonParams(end = 6))
            addView(saveButton, buttonParams(start = 6))
        }
        val scroll = ScrollView(this).apply {
            clipToPadding = false
            addView(content)
        }
        bar.addOnLayoutChangeListener { _, _, top, _, bottom, _, _, _, _ ->
            content.setPadding(content.paddingLeft, content.paddingTop, content.paddingRight, bottom - top + dp(BAR_EXTRA_DP))  // 內容不被操作列擋住
        }
        return FrameLayout(this).apply {
            setBackgroundResource(R.drawable.bg_mac_wallpaper)
            addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        }
    }

    // 頂端：圓形返回鈕＋標題
    private fun headerRow(): LinearLayout {
        val back = TextView(this).apply {
            text = "‹"
            textSize = 24f
            gravity = Gravity.CENTER
            setTextColor(color(R.color.settings_text))
            contentDescription = SETTINGS_BACK_DESCRIPTION
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(color(R.color.settings_ghost_fill))
                setStroke(dp(1), color(R.color.settings_card_stroke))
            }
            setOnClickListener { finish() }
        }
        val heading = TextView(this).apply {
            text = "戒飲設定"
            textSize = 24f
            setTextColor(color(R.color.settings_text))
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(back, LinearLayout.LayoutParams(dp(MIN_TOUCH_DP), dp(MIN_TOUCH_DP)).apply { marginEnd = dp(12) })
            addView(heading)
        }
    }

    // 說明小字（次要文字色）
    private fun captionText(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 13f
        setTextColor(color(R.color.settings_text_secondary))
    }

    // 頂部狀態列：圓點＋狀態文字＋（連不上時）重新讀取
    private fun statusBar(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundResource(R.drawable.bg_settings_status)
        setPadding(dp(14), dp(6), dp(8), dp(6))
        minimumHeight = dp(MIN_TOUCH_DP)
        addView(statusDot)
        addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(retryLink)
    }

    // 區塊之間的間距
    private fun sectionParams(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }

    // 操作列上兩顆按鈕的版面參數
    private fun buttonParams(start: Int = 0, end: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(0, dp(MIN_TOUCH_DP), 1f).apply {
            marginStart = dp(start)
            marginEnd = dp(end)
        }

    // 總開關卡片：標題、說明、右側開關
    private fun addSwitchCard(parent: LinearLayout) {
        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@DrinkSettingsActivity).apply {
                text = "啟用戒飲記錄"
                textSize = 16f
                setTextColor(color(R.color.settings_text))
            })
            addView(captionText("開啟後，泡泡上有 🎤 說話、沒喝、戒飲歷史三顆按鈕。"))
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.bg_settings_card)
            setPadding(dp(16), dp(12), dp(16), dp(12))
            minimumHeight = dp(MIN_TOUCH_DP)
            addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(12) })
            addView(enabledSwitch)
        }
        parent.addView(card, sectionParams(top = 14))
    }

    // 加一個分組：分組標題＋卡片，回傳卡片讓欄位加進去
    private fun addGroup(parent: LinearLayout, title: String): LinearLayout {
        parent.addView(captionText(title).apply { setPadding(dp(4), 0, 0, 0) }, sectionParams(top = 18))
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_settings_card)
        }
        parent.addView(card, sectionParams(top = 6))
        return card
    }

    // 加一個欄位列：左邊標籤與說明（可換行），右邊輸入框；第二列起上方加分隔線
    private fun addField(card: LinearLayout, label: String, hint: String, box: View) {
        if (card.childCount > 0) {
            card.addView(View(this).apply { setBackgroundColor(color(R.color.settings_divider)) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)))
        }
        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@DrinkSettingsActivity).apply {
                text = label
                textSize = 15f
                setTextColor(color(R.color.settings_text))
            })
            addView(captionText(hint).apply { textSize = 12f })
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(12) })
            addView(box)
        }
        card.addView(row)
    }

    // 建立文字輸入框（透明底，外框由 inputBox 提供）
    private fun textInput(type: Int, align: Int): EditText = EditText(this).apply {
        inputType = type
        background = null
        gravity = align
        textSize = 16f
        setTextColor(color(R.color.settings_text))
        setHintTextColor(color(R.color.settings_text_secondary))
        setPadding(dp(12), 0, 0, 0)
    }

    // 建立只能輸入數字的輸入框
    private fun numberInput(): EditText = textInput(InputType.TYPE_CLASS_NUMBER, Gravity.END or Gravity.CENTER_VERTICAL)

    // 輸入框外框：輸入框＋（選用）框內右側單位；標紅、聚焦都改這個外框的背景
    private fun inputBox(input: EditText, unit: String?, widthDp: Int): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.bg_settings_field)
            minimumHeight = dp(MIN_TOUCH_DP)
            layoutParams = LinearLayout.LayoutParams(dp(widthDp), ViewGroup.LayoutParams.WRAP_CONTENT)
            addView(input, LinearLayout.LayoutParams(0, dp(MIN_TOUCH_DP), 1f))
            if (unit != null) {
                addView(TextView(this@DrinkSettingsActivity).apply {
                    text = unit
                    textSize = 14f
                    setTextColor(color(R.color.settings_text_secondary))
                    setPadding(dp(6), 0, dp(12), 0)
                })
            } else {
                setPadding(0, 0, dp(12), 0)
            }
        }
        input.setOnFocusChangeListener { _, _ -> refreshBackground(box) }  // 聚焦時換成藍框
        return box
    }

    // 詢問時間的外框：選單＋下拉箭頭
    private fun spinnerBox(spinner: Spinner): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundResource(R.drawable.bg_settings_field)
        minimumHeight = dp(MIN_TOUCH_DP)
        layoutParams = LinearLayout.LayoutParams(dp(INPUT_WIDTH_NUMBER_DP), ViewGroup.LayoutParams.WRAP_CONTENT)
        addView(spinner, LinearLayout.LayoutParams(0, dp(MIN_TOUCH_DP), 1f))
        addView(TextView(this@DrinkSettingsActivity).apply {
            text = "▾"
            textSize = 14f
            setTextColor(color(R.color.settings_text_secondary))
            setPadding(0, 0, dp(12), 0)
        })
    }

    // 深色底用的選單轉接器：選中列與下拉列的文字都用主要文字色
    private fun darkAdapter(): ArrayAdapter<String> = object : ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, askOptions) {
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
            (super.getView(position, convertView, parent) as TextView).apply {
                setTextColor(color(R.color.settings_text))
                gravity = Gravity.END or Gravity.CENTER_VERTICAL
            }

        override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View =
            (super.getDropDownView(position, convertView, parent) as TextView).apply {
                setTextColor(color(R.color.settings_text))
                setBackgroundColor(color(R.color.settings_card_fill))
                setPadding(dp(16), dp(12), dp(16), dp(12))
            }
    }

    // 使用者開始修改某欄時，清掉那一欄的紅框
    private fun watchEdit(input: EditText, box: View) {
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = clearMarkIf(box)
        })
    }

    // 欄位對應的輸入框外框（欄位與畫面元件的對應只寫在這裡）
    private fun viewOf(field: SettingsField): View = when (field) {
        SettingsField.NAME -> nameBox
        SettingsField.FEE -> feeBox
        SettingsField.RESIST -> resistBox
        SettingsField.QUOTA -> quotaBox
        SettingsField.ASK -> askBox
    }

    // 外框背景：標紅 > 聚焦 > 平常
    private fun refreshBackground(box: View) {
        val invalid = markedField?.let { viewOf(it) === box } ?: false
        val focused = box.findFocus() != null
        box.setBackgroundResource(
            when {
                invalid -> R.drawable.bg_settings_field_invalid
                focused -> R.drawable.bg_settings_field_focus
                else -> R.drawable.bg_settings_field
            }
        )
    }

    // 把某個欄位標紅（先清掉舊的）；null 表示不標任何欄位
    private fun markField(field: SettingsField?) {
        clearMark()
        markedField = field
        if (field != null) refreshBackground(viewOf(field))
    }

    // 清掉所有紅框
    private fun clearMark() {
        val old = markedField ?: return
        markedField = null
        refreshBackground(viewOf(old))
    }

    // 若被標紅的正是這個外框，清掉紅框（其他欄不受影響）
    private fun clearMarkIf(box: View) {
        val marked = markedField ?: return
        if (viewOf(marked) === box) clearMark()
    }

    // 更新狀態列：文字、圓點顏色、是否閃動
    private fun showStatus(text: String, dotColor: Int, busy: Boolean) {
        status.text = text
        statusDot.backgroundTintList = ColorStateList.valueOf(color(dotColor))
        dotPulse?.cancel()
        dotPulse = null
        statusDot.alpha = 1f
        if (busy) dotPulse = pulse(listOf(statusDot))
    }

    // 呼吸動畫：開啟「移除動畫」時不跑，只維持靜止的半透明
    private fun pulse(targets: List<View>): ValueAnimator? {
        val animationsOff = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        if (animationsOff) {
            targets.forEach { it.alpha = PULSE_LOW_ALPHA }
            return null
        }
        return ValueAnimator.ofFloat(1f, PULSE_LOW_ALPHA).apply {
            duration = PULSE_PERIOD_MS / 2
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            addUpdateListener { a -> targets.forEach { it.alpha = a.animatedValue as Float } }
            start()
        }
    }

    // 載入中的骨架：欄位外框呼吸；結束時恢復
    private fun setSkeleton(on: Boolean) {
        val boxes = listOf(nameBox, feeBox, quotaBox, resistBox, askBox)
        skeletonPulse?.cancel()
        skeletonPulse = null
        boxes.forEach { it.alpha = 1f }
        if (on) skeletonPulse = pulse(boxes)
    }

    // 欄位與開關能不能編輯
    private fun setEditable(editable: Boolean) {
        listOf(nameInput, feeInput, quotaInput, resistInput, askSpinner, enabledSwitch).forEach { it.isEnabled = editable }
    }

    // 連不上或讀不到：固定提示、欄位不可編輯、儲存停用、只能重新讀取
    private fun showLoadFailure(message: String) {
        showStatus(message, R.color.settings_danger, false)
        setSkeleton(false)
        setEditable(false)
        saveButton.isEnabled = false
        reloadButton.isEnabled = true
        retryLink.visibility = View.VISIBLE
    }

    // 向 Worker 讀取目前的設定並填入
    private fun loadSettings() {
        clearMark()
        showStatus(SETTINGS_LOADING_MESSAGE, R.color.settings_warning, true)
        setSkeleton(true)
        setEditable(false)
        retryLink.visibility = View.GONE
        saveButton.isEnabled = false
        reloadButton.isEnabled = false
        WorkerApi.get(SETTINGS_PATH) { result ->
            if (isFinishing || isDestroyed) return@get
            val message = workerErrorMessage(result.status)
            if (message != null) {
                showLoadFailure(message)
                return@get
            }
            if (fillFields(result.text)) {
                loadEnabled()
            } else {
                showLoadFailure(UNREACHABLE_MESSAGE)  // 回應格式不對，當成連不上
            }
        }
    }

    // 設定讀完後讀開關；讀不到就不讓存（這裡不是降級情境，不套用 drinkUiEnabled）
    private fun loadEnabled() {
        WorkerApi.get(ENABLED_PATH) { result ->
            if (isFinishing || isDestroyed) return@get
            val enabled = parseEnabled(result)
            if (enabled == null) {
                showLoadFailure(workerErrorMessage(result.status) ?: UNREACHABLE_MESSAGE)  // 格式不對也當成連不上
                return@get
            }
            enabledSwitch.isChecked = enabled
            showStatus(SETTINGS_LOADED_MESSAGE, R.color.settings_success, false)
            setSkeleton(false)
            setEditable(true)
            saveButton.isEnabled = true
            reloadButton.isEnabled = true
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
        if (index >= 0) {
            lastAskPosition = index
            askSpinner.setSelection(index)  // 不在選單上就維持第一個（儲存時 Worker 照樣驗證）
        }
        true
    } catch (e: JSONException) {
        false
    }

    // 數字欄位：能轉成整數就送整數，否則原文送出，由 Worker 回「設定值不正確：…」
    private fun numberValue(input: EditText): Any {
        val raw = input.text.toString().trim()
        return raw.toIntOrNull() ?: raw
    }

    // 把儲存結果顯示在狀態列：成功綠點，其餘紅點
    private fun showResult(message: String) {
        showStatus(message, if (message == SETTINGS_SAVED_MESSAGE) R.color.settings_success else R.color.settings_danger, false)
    }

    // 按「儲存」：五個欄位一起 PUT；成功顯示「已儲存」，400 顯示回應的 error，其他照固定提示
    private fun saveSettings() {
        clearMark()
        val body = JSONObject()
            .put(FIELD_NAME, nameInput.text.toString())
            .put(FIELD_FEE, numberValue(feeInput))
            .put(FIELD_RESIST, numberValue(resistInput))
            .put(FIELD_QUOTA, numberValue(quotaInput))
            .put(FIELD_ASK, askOptions[askSpinner.selectedItemPosition.coerceIn(0, askOptions.size - 1)])
            .toString()
        showStatus(SETTINGS_SAVING_MESSAGE, R.color.settings_warning, true)
        saveButton.isEnabled = false
        WorkerApi.put(SETTINGS_PATH, body) { result ->
            if (isFinishing || isDestroyed) return@put
            val message = saveResultMessage(result)
            if (message != SETTINGS_SAVED_MESSAGE) {  // 設定那步失敗就不送開關
                saveButton.isEnabled = true
                showResult(message)
                markField(settingsFieldOf(message))
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
            val message = saveResultMessage(result)
            showResult(message)
            markField(settingsFieldOf(message))
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
