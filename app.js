import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ADMIN_EMAILS = ["andy.cai@ssstc.com"];

const firebaseConfig = {
  apiKey: "AIzaSyDH_z8Ir5tOtZtday2EYCfI8Ag4Er71DvY",
  authDomain: "mountain-club-site.firebaseapp.com",
  databaseURL: "https://mountain-club-site-default-rtdb.firebaseio.com",
  projectId: "mountain-club-site",
  storageBucket: "mountain-club-site.firebasestorage.app",
  messagingSenderId: "493691203812",
  appId: "1:493691203812:web:39f535bdea485124847cf1",
  measurementId: "G-5KJMTQ315S"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const dbRefs = {
  wishes: ref(db, "wishes"),
  signups: ref(db, "signups"),
  payments: ref(db, "payments"),
  subsidy: ref(db, "subsidy"),
  subsidyHistory: ref(db, "subsidyHistory"),
  equipmentSubsidy: ref(db, "equipmentSubsidy"),
  equipmentSubsidyHistory: ref(db, "equipmentSubsidyHistory")
};

const emptySubsidy = { amount: 0, memo: "", updatedAt: "" };

const state = {
  wishes: [],
  signups: [],
  payments: [],
  subsidy: { ...emptySubsidy },
  subsidyHistory: [],
  equipmentSubsidy: { ...emptySubsidy },
  equipmentSubsidyHistory: [],
  currentUser: null,
  isAdmin: false
};

const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});

function setStatus(text, type = "") {
  const bar = $("#statusBar");
  bar.textContent = text;
  bar.className = `status-bar ${type}`.trim();
}

function listFromSnapshot(snapshot) {
  const value = snapshot.val();
  if (!value) return [];
  return Object.entries(value)
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (b.createdAtMs || b.updatedAtMs || 0) - (a.createdAtMs || a.updatedAtMs || 0));
}

function nowInfo() {
  const date = new Date();
  return {
    text: new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date),
    ms: date.getTime()
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setFormMessage(selector, text, isSuccess = false) {
  const message = $(selector);
  message.textContent = text;
  message.classList.toggle("success", isSuccess);
}

function emailIsAdmin(email) {
  return ADMIN_EMAILS.includes(String(email || "").toLowerCase());
}

function requireAdmin(actionText) {
  if (state.isAdmin) return true;
  alert(`${actionText}\n請先用管理者帳號登入。`);
  return false;
}

async function runFirebaseAction(action, successText) {
  try {
    await action();
    if (successText) setStatus(successText, "success");
    return true;
  } catch (error) {
    console.error(error);
    setStatus("Firebase 寫入失敗，請確認登入權限、資料庫規則或網路狀態。", "error");
    return false;
  }
}

function updateAdminUi() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !state.isAdmin);
  });

  $("#adminLoginForm").classList.toggle("hidden", state.isAdmin);
  $("#adminLogout").classList.toggle("hidden", !state.currentUser);

  if (state.isAdmin) {
    $("#adminStateText").textContent = `已登入管理者：${state.currentUser.email}`;
    setFormMessage("#loginMessage", "管理者已登入。", true);
  } else if (state.currentUser) {
    $("#adminStateText").textContent = `已登入：${state.currentUser.email}，但此帳號不是管理者。`;
    setFormMessage("#loginMessage", "此帳號沒有管理權限。", false);
  } else {
    $("#adminStateText").textContent = "尚未登入。登入後才能更新補助款與清空資料。";
    setFormMessage("#loginMessage", "", false);
  }
}

function render() {
  $("#wishCount").textContent = state.wishes.length;
  $("#signupCount").textContent = state.signups.length;
  $("#paymentCount").textContent = state.payments.length;
  renderSubsidySummary("#subsidyTotal", "#subsidyUpdatedAt", state.subsidy);
  renderSubsidySummary("#equipmentSubsidyTotal", "#equipmentSubsidyUpdatedAt", state.equipmentSubsidy);
  renderWishes();
  renderSignups();
  renderPayments();
  renderSubsidyHistory("#subsidyHistoryList", state.subsidyHistory);
  renderSubsidyHistory("#equipmentSubsidyHistoryList", state.equipmentSubsidyHistory);
  updateAdminUi();
}

function renderSubsidySummary(totalSelector, updatedAtSelector, item) {
  $(totalSelector).textContent = formatter.format(item.amount || 0);
  $(updatedAtSelector).textContent = item.updatedAt ? `最後更新：${item.updatedAt}` : "尚未更新";
}

function renderWishes() {
  const list = $("#wishList");
  list.classList.toggle("empty", state.wishes.length === 0);
  list.innerHTML = state.wishes
    .map((item) => {
      const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "";
      return `
        <article class="entry">
          <h3>${escapeHtml(item.mountain)}</h3>
          ${note}
          <div class="entry-meta">
            <span>發想人：${escapeHtml(item.name)}</span>
            <span>${escapeHtml(item.createdAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSignups() {
  const list = $("#signupList");
  list.classList.toggle("empty", state.signups.length === 0);
  list.innerHTML = state.signups
    .map((item) => {
      const mountain = item.mountain ? `<p>偏好山岳：${escapeHtml(item.mountain)}</p>` : "";
      const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "";
      return `
        <article class="entry">
          <h3>${escapeHtml(item.name)}</h3>
          ${mountain}
          ${note}
          <div class="entry-meta">
            <span>想去時間：${escapeHtml(item.date)}</span>
            <span>${escapeHtml(item.createdAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPayments() {
  const list = $("#paymentList");
  list.classList.toggle("empty", state.payments.length === 0);
  list.innerHTML = state.payments
    .map((item) => {
      const date = item.paymentDate ? `<span>繳費日期：${escapeHtml(item.paymentDate)}</span>` : "";
      const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "";
      return `
        <article class="entry payment-entry">
          <h3>${escapeHtml(item.name)} - ${escapeHtml(item.trip)}</h3>
          <p>金額：${formatter.format(item.amount || 0)}</p>
          ${note}
          <div class="entry-meta">
            <span>狀態：${escapeHtml(item.status)}</span>
            ${date}
            <span>${escapeHtml(item.createdAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSubsidyHistory(selector, records) {
  const list = $(selector);
  list.classList.toggle("empty", records.length === 0);
  list.innerHTML = records
    .map((item) => {
      const memo = item.memo ? `<p>${escapeHtml(item.memo)}</p>` : "<p>無更新說明</p>";
      return `
        <article class="entry subsidy-entry">
          <h3>${formatter.format(item.amount || 0)}</h3>
          ${memo}
          <div class="entry-meta">
            <span>${escapeHtml(item.updatedAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

onAuthStateChanged(auth, (user) => {
  state.currentUser = user;
  state.isAdmin = emailIsAdmin(user?.email);
  updateAdminUi();
});

onValue(dbRefs.wishes, (snapshot) => {
  state.wishes = listFromSnapshot(snapshot);
  setStatus("已連線 Firebase，資料會即時同步。", "success");
  render();
}, (error) => {
  console.error(error);
  setStatus("Firebase 讀取失敗，請檢查 Realtime Database 規則。", "error");
});

onValue(dbRefs.signups, (snapshot) => {
  state.signups = listFromSnapshot(snapshot);
  render();
});

onValue(dbRefs.payments, (snapshot) => {
  state.payments = listFromSnapshot(snapshot);
  render();
});

onValue(dbRefs.subsidy, (snapshot) => {
  state.subsidy = snapshot.val() || { ...emptySubsidy };
  render();
});

onValue(dbRefs.subsidyHistory, (snapshot) => {
  state.subsidyHistory = listFromSnapshot(snapshot);
  render();
});

onValue(dbRefs.equipmentSubsidy, (snapshot) => {
  state.equipmentSubsidy = snapshot.val() || { ...emptySubsidy };
  render();
});

onValue(dbRefs.equipmentSubsidyHistory, (snapshot) => {
  state.equipmentSubsidyHistory = listFromSnapshot(snapshot);
  render();
});

$("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#adminEmail").value.trim().toLowerCase();
  const password = $("#adminLoginPassword").value;

  if (!emailIsAdmin(email)) {
    setFormMessage("#loginMessage", "此 Email 不在管理者名單內。");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    $("#adminLoginPassword").value = "";
    setFormMessage("#loginMessage", "登入成功。", true);
  } catch (error) {
    console.error(error);
    setFormMessage("#loginMessage", "登入失敗，請確認 Firebase Auth 帳號與密碼。");
  }
});

$("#adminLogout").addEventListener("click", async () => {
  await signOut(auth);
  setFormMessage("#loginMessage", "已登出。", true);
});

$("#wishForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const createdAt = nowInfo();
  const payload = {
    name: $("#wishName").value.trim(),
    mountain: $("#mountainName").value.trim(),
    note: $("#wishNote").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };
  if (await runFirebaseAction(() => push(dbRefs.wishes, payload), "許願已送出。")) {
    event.currentTarget.reset();
  }
});

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const createdAt = nowInfo();
  const payload = {
    name: $("#signupName").value.trim(),
    date: $("#signupDate").value,
    mountain: $("#signupMountain").value.trim(),
    note: $("#signupNote").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };
  if (await runFirebaseAction(() => push(dbRefs.signups, payload), "報名已送出。")) {
    event.currentTarget.reset();
  }
});

$("#paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const createdAt = nowInfo();
  const payload = {
    name: $("#paymentName").value.trim(),
    trip: $("#paymentTrip").value.trim(),
    amount: Number($("#paymentAmount").value),
    paymentDate: $("#paymentDate").value,
    status: $("#paymentStatus").value,
    note: $("#paymentNote").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };
  if (await runFirebaseAction(() => push(dbRefs.payments, payload), "繳費紀錄已送出。")) {
    event.currentTarget.reset();
  }
});

$("#subsidyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireAdmin("更新活動補助款")) return;

  const updatedAt = nowInfo();
  const update = {
    amount: Number($("#subsidyAmount").value),
    memo: $("#subsidyMemo").value.trim(),
    updatedAt: updatedAt.text,
    updatedAtMs: updatedAt.ms
  };

  if (await runFirebaseAction(async () => {
    await set(dbRefs.subsidy, update);
    await push(dbRefs.subsidyHistory, update);
  }, "活動補助款已同步更新。")) {
    setFormMessage("#adminMessage", update.memo ? `已更新：${update.memo}` : "活動補助款已更新。", true);
    $("#subsidyAmount").value = "";
    $("#subsidyMemo").value = "";
  }
});

$("#equipmentSubsidyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireAdmin("更新設備補助款")) return;

  const updatedAt = nowInfo();
  const update = {
    amount: Number($("#equipmentSubsidyAmount").value),
    memo: $("#equipmentSubsidyMemo").value.trim(),
    updatedAt: updatedAt.text,
    updatedAtMs: updatedAt.ms
  };

  if (await runFirebaseAction(async () => {
    await set(dbRefs.equipmentSubsidy, update);
    await push(dbRefs.equipmentSubsidyHistory, update);
  }, "設備補助款已同步更新。")) {
    setFormMessage("#equipmentAdminMessage", update.memo ? `已更新：${update.memo}` : "設備補助款已更新。", true);
    $("#equipmentSubsidyAmount").value = "";
    $("#equipmentSubsidyMemo").value = "";
  }
});

$("#clearWishes").addEventListener("click", async () => {
  if (!state.wishes.length) return;
  if (!requireAdmin("清空所有許願資料")) return;
  if (!confirm("確定清空所有許願資料？")) return;
  await runFirebaseAction(() => remove(dbRefs.wishes), "許願資料已清空。");
});

$("#clearSignups").addEventListener("click", async () => {
  if (!state.signups.length) return;
  if (!requireAdmin("清空所有報名資料")) return;
  if (!confirm("確定清空所有報名資料？")) return;
  await runFirebaseAction(() => remove(dbRefs.signups), "報名資料已清空。");
});

$("#clearPayments").addEventListener("click", async () => {
  if (!state.payments.length) return;
  if (!requireAdmin("清空所有自助團繳費名冊")) return;
  if (!confirm("確定清空所有自助團繳費名冊？")) return;
  await runFirebaseAction(() => remove(dbRefs.payments), "自助團繳費名冊已清空。");
});

$("#clearSubsidyHistory").addEventListener("click", async () => {
  if (!state.subsidyHistory.length) return;
  if (!requireAdmin("清空所有活動補助款更新紀錄")) return;
  if (!confirm("確定清空所有活動補助款更新紀錄？")) return;
  await runFirebaseAction(() => remove(dbRefs.subsidyHistory), "活動補助款更新紀錄已清空。");
});

$("#clearEquipmentSubsidyHistory").addEventListener("click", async () => {
  if (!state.equipmentSubsidyHistory.length) return;
  if (!requireAdmin("清空所有設備補助款更新紀錄")) return;
  if (!confirm("確定清空所有設備補助款更新紀錄？")) return;
  await runFirebaseAction(() => remove(dbRefs.equipmentSubsidyHistory), "設備補助款更新紀錄已清空。");
});

render();

