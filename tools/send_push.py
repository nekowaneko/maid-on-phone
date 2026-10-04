# 從電腦送一則「純資料」推播給手機上的陪伴角色（FCM HTTP v1 API）
# 只帶 data: {id, text}（給了 --script 時多帶 script），App 在背景時也會經過 ReminderDispatcher 分流
#
# 用法：
#   python tools/send_push.py --key 金鑰.json --text "該喝水了"
#   python tools/send_push.py --key 金鑰.json --delay 30          # 30 秒後送（先切到遊戲畫面）
#   python tools/send_push.py --key 金鑰.json --id 上次的編號       # 用同一個編號重送（測去重）
#   python tools/send_push.py --key 金鑰.json --text "真拿主人沒辦法。水記得喝。" --script "[pout]真拿主人沒辦法。[smile]水記得喝。"
#                                                                # 帶角色演出用的原文（M1.6；不經 Worker，不會自動剝標籤）
# 金鑰路徑也可以用環境變數 PET_FCM_KEY 指定；推播代碼預設用 adb 從手機讀（需接線或無線偵錯）
# 金鑰與推播代碼都是憑證：不要放進專案資料夾，本腳本也不會把它們印出來

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

# 常數定義
PACKAGE = "com.accompany.pet"                       # App 套件名稱
TOKEN_FILE = "files/push-token.txt"                 # App 存推播代碼的位置（相對於 App 資料夾）
SCOPE = "https://www.googleapis.com/auth/firebase.messaging"  # 送推播需要的權限範圍
SEND_URL = "https://fcm.googleapis.com/v1/projects/%s/messages:send"  # HTTP v1 端點
DEFAULT_TEXT = "這是一則從電腦送出的測試推播"        # 沒指定文字時的內容


# 找 adb 執行檔：先看 PATH，再看 Android SDK 的預設安裝位置
def find_adb():
    found = shutil.which("adb")
    if found:
        return found
    sdk = os.environ.get("ANDROID_HOME") or os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk")
    candidate = os.path.join(sdk, "platform-tools", "adb.exe" if os.name == "nt" else "adb")
    return candidate if os.path.isfile(candidate) else None


# 用 adb 從手機讀推播代碼（debug 版 App 才能用 run-as）
def read_token_from_phone():
    adb = find_adb()
    if adb is None:
        sys.exit("找不到 adb，請改用 --token 指定推播代碼")
    result = subprocess.run([adb, "exec-out", "run-as", PACKAGE, "cat", TOKEN_FILE], capture_output=True)
    value = result.stdout.decode("utf-8", "replace").strip()
    if result.returncode != 0 or not value or "No such file" in value:
        sys.exit("讀不到手機上的推播代碼：確認手機已連線、App 已開過且主畫面有顯示推播代碼")
    return value


# 用服務帳戶金鑰換取存取權杖，並回傳（權杖, 專案編號）
def get_access(key_path):
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request

    with open(key_path, encoding="utf-8") as f:
        project_id = json.load(f)["project_id"]
    credentials = service_account.Credentials.from_service_account_file(key_path, scopes=[SCOPE])
    credentials.refresh(Request())
    return credentials.token, project_id


# 組出推播的 data：script 有給（非空字串）才多帶 script 欄位，沒給時與 M1.5 相同只有 id、text
def build_data(reminder_id, text, script=None):
    data = {"id": reminder_id, "text": text}
    if script:
        data["script"] = script  # 角色演出用的原文（含表情標籤）
    return data


# 組出推播內容：只有 data（id、text，必要時加 script），高優先順序才能在省電狀態下即時送達
def build_message(device_token, reminder_id, text, script=None):
    return {
        "message": {
            "token": device_token,
            "data": build_data(reminder_id, text, script),
            "android": {"priority": "high"},
        }
    }


# 送出推播，成功回傳 FCM 給的訊息名稱，失敗則印出原因並結束
def send(access_token, project_id, message):
    import requests

    response = requests.post(
        SEND_URL % project_id,
        headers={"Authorization": "Bearer " + access_token, "Content-Type": "application/json; charset=utf-8"},
        data=json.dumps(message, ensure_ascii=False).encode("utf-8"),
        timeout=30,
    )
    if response.status_code != 200:
        sys.exit("送出失敗（HTTP %d）：%s" % (response.status_code, response.text))
    return response.json().get("name", "")


# 讀取命令列參數
def parse_args():
    parser = argparse.ArgumentParser(description="從電腦送一則純資料推播給陪伴角色")
    parser.add_argument("--key", default=os.environ.get("PET_FCM_KEY"), help="服務帳戶金鑰 JSON 路徑（或設環境變數 PET_FCM_KEY）")
    parser.add_argument("--token", help="手機的推播代碼；不給就用 adb 從手機讀")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="角色要說的話")
    parser.add_argument("--id", help="提醒編號；不給就自動產生新的，給上次的編號可測去重")
    parser.add_argument("--delay", type=int, default=0, help="幾秒後才送（方便先切到遊戲畫面）")
    parser.add_argument("--script", help="角色演出用的原文（可含 [pout] 等表情標籤）；不給就只送 id、text")
    return parser.parse_args()


# 主流程：讀參數 → 取推播代碼 → 等待 → 換權杖 → 送出
def main():
    args = parse_args()
    if not args.key or not os.path.isfile(args.key):
        sys.exit("找不到服務帳戶金鑰，請用 --key 指定路徑或設定 PET_FCM_KEY")
    device_token = args.token or read_token_from_phone()
    reminder_id = args.id or "pc-%d" % int(time.time() * 1000)
    for left in range(args.delay, 0, -1):
        print("\r%d 秒後送出…" % left, end="", flush=True)
        time.sleep(1)
    if args.delay:
        print()
    access_token, project_id = get_access(args.key)
    name = send(access_token, project_id, build_message(device_token, reminder_id, args.text, args.script))
    print("已送出：編號 %s（FCM 訊息 %s）" % (reminder_id, name.rsplit("/", 1)[-1]))


main()
