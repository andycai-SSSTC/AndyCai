# 登山社團報名系統

這是一個可部署到 GitHub Pages 的登山社團報名網站，資料透過 Firebase Realtime Database 即時同步。

## 功能

1. 社員可以新增想去的山。
2. 社員可以登記報名人、想去日期、偏好山岳與備註。
3. 社員可以新增自助團繳費名冊，包含活動、金額、繳費日期、狀態與備註。
4. 管理者必須使用 Firebase Auth 登入後，才能更新活動剩餘補助款。
5. 管理者必須使用 Firebase Auth 登入後，才能更新設備剩餘補助款。
6. 活動補助款與設備補助款都會保存更新時間與備註紀錄。
7. 清空許願、報名、自助團繳費名冊、補助款紀錄時，需要管理者登入。
8. 不同電腦或手機打開同一個網址，會看到同一份 Firebase 資料。

## 管理者帳號

目前前端管理者 email allowlist 在 `app.js`：

```js
const ADMIN_EMAILS = ["b26270727@gmail.com"];
```

請在 Firebase Console 啟用 Authentication 的 Email/Password，並建立這個 email 的使用者帳號。

## Firebase Realtime Database Rules 建議

請到 Firebase Console > Realtime Database > Rules，改成類似以下規則。這會讓一般人只能新增資料，只有管理者 email 可以更新補助款與刪除資料。

```json
{
  "rules": {
    ".read": true,
    "wishes": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'",
      "$id": {
        ".write": "(!data.exists() && newData.exists()) || (auth != null && auth.token.email == 'b26270727@gmail.com')",
        ".validate": "!newData.exists() || newData.hasChildren(['name','mountain','createdAt','createdAtMs'])"
      }
    },
    "signups": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'",
      "$id": {
        ".write": "(!data.exists() && newData.exists()) || (auth != null && auth.token.email == 'b26270727@gmail.com')",
        ".validate": "!newData.exists() || newData.hasChildren(['name','date','createdAt','createdAtMs'])"
      }
    },
    "payments": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'",
      "$id": {
        ".write": "(!data.exists() && newData.exists()) || (auth != null && auth.token.email == 'b26270727@gmail.com')",
        ".validate": "!newData.exists() || newData.hasChildren(['name','trip','amount','status','createdAt','createdAtMs'])"
      }
    },
    "subsidy": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'"
    },
    "subsidyHistory": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'"
    },
    "equipmentSubsidy": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'"
    },
    "equipmentSubsidyHistory": {
      ".write": "auth != null && auth.token.email == 'b26270727@gmail.com'"
    }
  }
}
```

## 上傳 GitHub

更新後重新上傳或 push 這些檔案到 GitHub repository：

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Commit message 可以填：

`Require Firebase Auth for admin actions`

GitHub Pages 通常會在 1 到 3 分鐘後更新。若瀏覽器還看到舊畫面，請按 `Ctrl + F5` 強制重新整理。



