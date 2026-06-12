import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ADMIN_EMAILS = ["b26270727@gmail.com"];

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
  signupContacts: ref(db, "signupContacts"),
  payments: ref(db, "payments"),
  subsidy: ref(db, "subsidy"),
  subsidyHistory: ref(db, "subsidyHistory"),
  equipmentSubsidy: ref(db, "equipmentSubsidy"),
  equipmentSubsidyHistory: ref(db, "equipmentSubsidyHistory"),
  pollSettings: ref(db, "pollSettings"),
  routeVotes: ref(db, "routeVotes")
};

const emptySubsidy = { amount: 0, memo: "", updatedAt: "" };
const emptyPollSettings = { startDate: "", endDate: "", availableDates: [] };

const state = {
  wishes: [],
  signups: [],
  signupContacts: {},
  payments: [],
  subsidy: { ...emptySubsidy },
  subsidyHistory: [],
  equipmentSubsidy: { ...emptySubsidy },
  equipmentSubsidyHistory: [],
  pollSettings: { ...emptyPollSettings },
  routeVotes: [],
  currentUser: null,
  isAdmin: false
};

const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});
let unsubscribeSignupContacts = null;

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

function todayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateFromValue(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateToValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatVoteDate(value) {
  const date = dateFromValue(value);
  if (!date) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function generateSaturdayDates(startDate, endDate) {
  const start = dateFromValue(startDate);
  const end = dateFromValue(endDate);
  if (!start || !end || start > end) return [];

  const current = new Date(start);
  const daysUntilSaturday = (6 - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + daysUntilSaturday);

  const dates = [];
  while (current <= end) {
    dates.push(dateToValue(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
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

async function runDataAction(action, successText) {
  try {
    await action();
    if (successText) setStatus(successText, "success");
    return true;
  } catch (error) {
    console.error(error);
    setStatus("寫入失敗，請確認登入權限、資料庫規則或網路狀態。", "error");
    return false;
  }
}

function updateAdminUi() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !state.isAdmin);
  });

  $("#adminLoginForm").classList.toggle("hidden", state.isAdmin);
  $("#adminPasswordForm").classList.toggle("hidden", !state.isAdmin);
  $("#adminLogout").classList.toggle("hidden", !state.currentUser);

  if (state.isAdmin) {
    $("#adminStateText").textContent = "已登入管理者。";
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
  renderPollUi();
  renderWishes();
  renderSignups();
  renderPayments();
  renderSubsidyHistory("#subsidyHistoryList", state.subsidyHistory);
  renderSubsidyHistory("#equipmentSubsidyHistoryList", state.equipmentSubsidyHistory);
  renderRouteVotes();
  renderVoteAnalysis();
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
      const privateContact = state.signupContacts[item.id]?.note || item.note || "";
      const note = state.isAdmin && privateContact
        ? `<p class="private-contact">聯絡方式或備註：${escapeHtml(privateContact)}</p>`
        : "";
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
      const change = Number(item.change || 0);
      const changeText = change
        ? `<span class="${change < 0 ? "expense-change" : "income-change"}">${change < 0 ? "扣款" : "增加"}：${formatter.format(change)}</span>`
        : "";
      return `
        <article class="entry subsidy-entry ${change < 0 ? "expense-entry" : ""}">
          <h3>${formatter.format(item.amount || 0)}</h3>
          ${memo}
          <div class="entry-meta">
            ${changeText}
            <span>${escapeHtml(item.updatedAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function pollIsOpen() {
  const { startDate, endDate } = state.pollSettings;
  const today = todayValue();
  return Boolean(startDate && endDate && today >= startDate && today <= endDate);
}

function renderPollUi() {
  const settings = state.pollSettings;
  const availableDates = generateSaturdayDates(settings.startDate, settings.endDate);
  const routeSelect = $("#voteRoute");
  const dateSelect = $("#voteAvailableDate");
  const selectedRoute = routeSelect.value;
  const selectedDate = dateSelect.value;

  routeSelect.innerHTML = [
    '<option value="">請先選擇路線</option>',
    ...state.wishes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.mountain)} - ${escapeHtml(item.name || "未填發想人")}</option>`)
  ].join("");
  routeSelect.value = state.wishes.some((item) => item.id === selectedRoute) ? selectedRoute : "";

  dateSelect.innerHTML = [
    '<option value="">請先選擇日期</option>',
    ...availableDates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(formatVoteDate(date))}</option>`)
  ].join("");
  dateSelect.value = availableDates.includes(selectedDate) ? selectedDate : "";

  $("#pollStartDate").value = settings.startDate || "";
  $("#pollEndDate").value = settings.endDate || "";
  $("#generatedSaturdayList").textContent = availableDates.length
    ? `系統將開放這些星期六：${availableDates.map(formatVoteDate).join("、")}`
    : "此期間內沒有星期六，請調整開始日或結束日。";

  const statusCard = $("#pollStatusCard");
  if (!settings.startDate || !settings.endDate) {
    statusCard.textContent = "投票期間尚未設定。";
    statusCard.className = "poll-status-card";
  } else if (pollIsOpen()) {
    statusCard.textContent = `投票開放中：${settings.startDate} 至 ${settings.endDate}，可選星期六 ${availableDates.length} 天。`;
    statusCard.className = "poll-status-card open";
  } else {
    statusCard.textContent = `投票未開放：${settings.startDate} 至 ${settings.endDate}。`;
    statusCard.className = "poll-status-card closed";
  }
}

function renderRouteVotes() {
  const list = $("#routeVoteList");
  list.classList.toggle("empty", state.routeVotes.length === 0);
  list.innerHTML = state.routeVotes
    .map((item) => {
      const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "";
      return `
        <article class="entry vote-entry">
          <h3>${escapeHtml(item.routeName)}</h3>
          ${note}
          <div class="entry-meta">
            <span>投票人：${escapeHtml(item.voterName)}</span>
            <span>有空日期：${escapeHtml(item.availableDate)}</span>
            <span>${escapeHtml(item.createdAt)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "未填";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function renderRanking(title, counts, total) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<section><h3>${title}</h3><p>目前尚無資料</p></section>`;
  return `
    <section>
      <h3>${title}</h3>
      <div class="analysis-list">
        ${rows.map(([name, count]) => {
          const percent = total ? Math.round((count / total) * 100) : 0;
          return `
            <div class="analysis-row">
              <div>
                <strong>${escapeHtml(name)}</strong>
                <span>${count} 票，${percent}%</span>
              </div>
              <div class="bar"><i style="width: ${percent}%"></i></div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderVoteAnalysis() {
  const target = $("#voteAnalysis");
  const total = state.routeVotes.length;
  target.classList.toggle("empty", total === 0);
  if (!total) {
    target.innerHTML = "";
    return;
  }

  const routeCounts = countBy(state.routeVotes, "routeName");
  const dateCounts = countBy(state.routeVotes, "availableDate");
  const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0];
  const topDate = Object.entries(dateCounts).sort((a, b) => b[1] - a[1])[0];

  target.innerHTML = `
    <div class="analysis-summary">
      <article><span>總票數</span><strong>${total}</strong></article>
      <article><span>熱門路線</span><strong>${escapeHtml(topRoute?.[0] || "-")}</strong></article>
      <article><span>最多人有空</span><strong>${escapeHtml(topDate?.[0] || "-")}</strong></article>
    </div>
    ${renderRanking("路線排名", routeCounts, total)}
    ${renderRanking("日期可行性", dateCounts, total)}
  `;
}

onAuthStateChanged(auth, (user) => {
  state.currentUser = user;
  state.isAdmin = emailIsAdmin(user?.email);
  watchSignupContacts();
  updateAdminUi();
});

function watchSignupContacts() {
  if (unsubscribeSignupContacts) {
    unsubscribeSignupContacts();
    unsubscribeSignupContacts = null;
  }

  state.signupContacts = {};
  if (!state.isAdmin) {
    render();
    return;
  }

  unsubscribeSignupContacts = onValue(dbRefs.signupContacts, (snapshot) => {
    state.signupContacts = snapshot.val() || {};
    render();
    migrateLegacySignupNotes();
  }, (error) => {
    console.error(error);
    state.signupContacts = {};
    render();
  });
}

onValue(dbRefs.wishes, (snapshot) => {
  state.wishes = listFromSnapshot(snapshot);
  setStatus("已連線，資料會即時同步。", "success");
  render();
}, (error) => {
  console.error(error);
  setStatus("讀取失敗，請檢查資料庫規則。", "error");
});

onValue(dbRefs.signups, (snapshot) => {
  state.signups = listFromSnapshot(snapshot);
  render();
  migrateLegacySignupNotes();
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

onValue(dbRefs.pollSettings, (snapshot) => {
  const value = snapshot.val() || {};
  state.pollSettings = {
    ...emptyPollSettings,
    ...value,
    availableDates: Array.isArray(value.availableDates) ? value.availableDates : []
  };
  render();
});

onValue(dbRefs.routeVotes, (snapshot) => {
  state.routeVotes = listFromSnapshot(snapshot);
  render();
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tabTarget;
    document.querySelectorAll(".tab-button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-page").forEach((page) => {
      page.classList.toggle("active", page.id === targetId);
    });
  });
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
    setFormMessage("#loginMessage", "登入失敗，請確認管理者帳號與密碼。");
  }
});

$("#adminLogout").addEventListener("click", async () => {
  await signOut(auth);
  setFormMessage("#loginMessage", "已登出。", true);
});

$("#adminPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireAdmin("修改管理者密碼")) return;

  const newPassword = $("#newAdminPassword").value;
  const confirmPassword = $("#confirmAdminPassword").value;

  if (newPassword.length < 8) {
    setFormMessage("#passwordMessage", "新密碼至少需要 8 個字元。");
    return;
  }

  if (newPassword !== confirmPassword) {
    setFormMessage("#passwordMessage", "兩次輸入的新密碼不一致。");
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPassword);
    event.currentTarget.reset();
    setFormMessage("#passwordMessage", "管理者密碼已更新。", true);
  } catch (error) {
    console.error(error);
    setFormMessage("#passwordMessage", "密碼更新失敗，請先登出後重新登入，再立刻修改密碼。");
  }
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
  if (await runDataAction(() => push(dbRefs.wishes, payload), "許願已送出。")) {
    event.currentTarget.reset();
  }
});

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const createdAt = nowInfo();
  const signupId = push(dbRefs.signups).key;
  const payload = {
    name: $("#signupName").value.trim(),
    date: $("#signupDate").value,
    mountain: $("#signupMountain").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };
  const contactPayload = {
    note: $("#signupNote").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };
  if (await runDataAction(async () => {
    await set(ref(db, `signups/${signupId}`), payload);
    await set(ref(db, `signupContacts/${signupId}`), contactPayload);
  }, "報名已送出。")) {
    event.currentTarget.reset();
  }
});

async function migrateLegacySignupNotes() {
  if (!state.isAdmin) return;

  const legacyItems = state.signups.filter((item) => item.note && !state.signupContacts[item.id]?.note);
  if (!legacyItems.length) return;

  await runDataAction(async () => {
    for (const item of legacyItems) {
      const { note, ...publicSignup } = item;
      await set(ref(db, `signupContacts/${item.id}`), {
        note,
        createdAt: item.createdAt || "",
        createdAtMs: item.createdAtMs || Date.now()
      });
      await set(ref(db, `signups/${item.id}`), publicSignup);
    }
  }, "已將舊報名聯絡資訊移到管理者私密區。");
}

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
  if (await runDataAction(() => push(dbRefs.payments, payload), "繳費紀錄已送出。")) {
    event.currentTarget.reset();
  }
});

$("#pollSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireAdmin("設定路線投票")) return;

  const startDate = $("#pollStartDate").value;
  const endDate = $("#pollEndDate").value;
  const availableDates = generateSaturdayDates(startDate, endDate);
  const updatedAt = nowInfo();

  if (startDate > endDate) {
    setFormMessage("#pollSettingsMessage", "投票開始日不可晚於結束日。");
    return;
  }

  if (!availableDates.length) {
    setFormMessage("#pollSettingsMessage", "投票期間內沒有星期六，請調整開始日或結束日。");
    return;
  }

  const payload = {
    startDate,
    endDate,
    availableDates,
    updatedAt: updatedAt.text,
    updatedAtMs: updatedAt.ms
  };

  if (await runDataAction(() => set(dbRefs.pollSettings, payload), "投票設定已更新。")) {
    setFormMessage("#pollSettingsMessage", "投票設定已儲存。", true);
  }
});

$("#routeVoteForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!pollIsOpen()) {
    setFormMessage("#voteMessage", "目前不在投票期間內，暫時不能送出投票。");
    return;
  }

  const createdAt = nowInfo();
  const routeId = $("#voteRoute").value;
  const route = state.wishes.find((item) => item.id === routeId);
  const availableDate = $("#voteAvailableDate").value;
  const availableDates = Array.isArray(state.pollSettings.availableDates) ? state.pollSettings.availableDates : [];

  if (!route) {
    setFormMessage("#voteMessage", "請先選擇許願路線。");
    return;
  }

  if (!availableDates.includes(availableDate)) {
    setFormMessage("#voteMessage", "請先選擇系統產生的星期六日期。");
    return;
  }

  const payload = {
    voterName: $("#voteName").value.trim(),
    routeId,
    routeName: route.mountain,
    availableDate,
    note: $("#voteNote").value.trim(),
    createdAt: createdAt.text,
    createdAtMs: createdAt.ms
  };

  if (await runDataAction(() => push(dbRefs.routeVotes, payload), "投票已送出。")) {
    setFormMessage("#voteMessage", "投票已送出。", true);
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

  if (await runDataAction(async () => {
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

  if (await runDataAction(async () => {
    await set(dbRefs.equipmentSubsidy, update);
    await push(dbRefs.equipmentSubsidyHistory, update);
  }, "設備補助款已同步更新。")) {
    setFormMessage("#equipmentAdminMessage", update.memo ? `已更新：${update.memo}` : "設備補助款已更新。", true);
    $("#equipmentSubsidyAmount").value = "";
    $("#equipmentSubsidyMemo").value = "";
  }
});

$("#equipmentPurchaseForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const deduction = Number($("#equipmentPurchaseAmount").value);
  const purchaser = $("#equipmentPurchaserName").value.trim();
  const itemName = $("#equipmentPurchaseName").value.trim();
  const memoInput = $("#equipmentPurchaseMemo").value.trim();
  const currentAmount = Number(state.equipmentSubsidy.amount || 0);

  if (!purchaser) {
    setFormMessage("#equipmentPurchaseMessage", "請填寫採購人姓名。");
    return;
  }

  if (!deduction || deduction <= 0) {
    setFormMessage("#equipmentPurchaseMessage", "請輸入大於 0 的採購扣款金額。");
    return;
  }

  if (deduction > currentAmount) {
    setFormMessage("#equipmentPurchaseMessage", `扣款金額不可大於目前設備補助款 ${formatter.format(currentAmount)}。`);
    return;
  }

  const updatedAt = nowInfo();
  const nextAmount = currentAmount - deduction;
  const memo = [`採購人：${purchaser}`, itemName ? `採購裝備：${itemName}` : "設備採購扣款", memoInput].filter(Boolean).join("；");
  const update = {
    amount: nextAmount,
    memo,
    type: "expense",
    change: -deduction,
    purchaser,
    itemName,
    updatedAt: updatedAt.text,
    updatedAtMs: updatedAt.ms
  };

  if (await runDataAction(async () => {
    const result = await runTransaction(dbRefs.equipmentSubsidy, (current) => {
      const amount = Number(current?.amount || 0);
      if (deduction > amount) return;
      return {
        ...(current || {}),
        amount: amount - deduction,
        memo,
        type: "expense",
        change: -deduction,
        purchaser,
        itemName,
        updatedAt: updatedAt.text,
        updatedAtMs: updatedAt.ms
      };
    });

    if (!result.committed) {
      throw new Error("Equipment subsidy deduction was not committed.");
    }

    const committedAmount = Number(result.snapshot.val()?.amount || nextAmount);
    await push(dbRefs.equipmentSubsidyHistory, {
      ...update,
      amount: committedAmount
    });
  }, "設備採購費用已自動扣除。")) {
    setFormMessage("#equipmentPurchaseMessage", `${formatter.format(deduction)} 已扣除，設備補助款剩餘 ${formatter.format(nextAmount)}。`, true);
    event.currentTarget.reset();
  }
});

$("#clearWishes").addEventListener("click", async () => {
  if (!state.wishes.length) return;
  if (!requireAdmin("清空所有許願資料")) return;
  if (!confirm("確定清空所有許願資料？")) return;
  await runDataAction(() => remove(dbRefs.wishes), "許願資料已清空。");
});

$("#clearSignups").addEventListener("click", async () => {
  if (!state.signups.length) return;
  if (!requireAdmin("清空所有報名資料")) return;
  if (!confirm("確定清空所有報名資料？")) return;
  await runDataAction(async () => {
    await remove(dbRefs.signups);
    await remove(dbRefs.signupContacts);
  }, "報名資料已清空。");
});

$("#clearPayments").addEventListener("click", async () => {
  if (!state.payments.length) return;
  if (!requireAdmin("清空所有自助團繳費名冊")) return;
  if (!confirm("確定清空所有自助團繳費名冊？")) return;
  await runDataAction(() => remove(dbRefs.payments), "自助團繳費名冊已清空。");
});

$("#clearSubsidyHistory").addEventListener("click", async () => {
  if (!state.subsidyHistory.length) return;
  if (!requireAdmin("清空所有活動補助款更新紀錄")) return;
  if (!confirm("確定清空所有活動補助款更新紀錄？")) return;
  await runDataAction(() => remove(dbRefs.subsidyHistory), "活動補助款更新紀錄已清空。");
});

$("#clearEquipmentSubsidyHistory").addEventListener("click", async () => {
  if (!state.equipmentSubsidyHistory.length) return;
  if (!requireAdmin("清空所有設備補助款更新紀錄")) return;
  if (!confirm("確定清空所有設備補助款更新紀錄？")) return;
  await runDataAction(() => remove(dbRefs.equipmentSubsidyHistory), "設備補助款更新紀錄已清空。");
});

$("#clearRouteVotes").addEventListener("click", async () => {
  if (!state.routeVotes.length) return;
  if (!requireAdmin("清空所有路線投票")) return;
  if (!confirm("確定清空所有路線投票？")) return;
  await runDataAction(() => remove(dbRefs.routeVotes), "路線投票已清空。");
});

render();


