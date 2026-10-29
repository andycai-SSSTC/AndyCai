export function calculateFareSplit(fare, subsidy, people, base) {
  if (![fare, subsidy, people, base].every(Number.isSafeInteger) ||
      fare < 0 || subsidy < 0 || people < 1 || base < 1) {
    throw new RangeError("請輸入有效的整數金額與人數。");
  }
  if (subsidy > fare) {
    throw new RangeError("社團補助不能高於車資總費用。");
  }

  const upfront = Math.ceil(fare / people / base) * base;
  const collected = upfront * people;
  const refundPool = subsidy + collected - fare;
  const refund = Math.floor(refundPool / people / base) * base;
  const leftover = refundPool - refund * people;

  if (![upfront, collected, refundPool, refund, leftover].every(Number.isSafeInteger)) {
    throw new RangeError("金額過大，無法正確試算。");
  }

  return { fare, subsidy, upfront, collected, refund, leftover, perPerson: (fare - subsidy) / people };
}

if (typeof document !== "undefined") {
  const form = document.querySelector("#fareForm");
  const fareInput = document.querySelector("#fareTotal");
  const subsidyInput = document.querySelector("#fareSubsidy");
  const peopleInput = document.querySelector("#farePeople");
  const baseInput = document.querySelector("#fareRoundBase");
  const message = document.querySelector("#fareMessage");
  const results = document.querySelector("#fareResults");
  const currency = new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0
  });
  const referenceCurrency = new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  function renderFareSplit() {
    if (!fareInput.value || !peopleInput.value) {
      results.classList.add("hidden");
      message.textContent = "輸入車資與人數後即可查看結果。";
      message.classList.remove("error");
      return;
    }

    try {
      const value = calculateFareSplit(
        Number(fareInput.value), Number(subsidyInput.value),
        Number(peopleInput.value), Number(baseInput.value)
      );
      const outputs = {
        fareOutTotal: value.fare,
        fareOutSubsidy: value.subsidy,
        fareOutUpfront: value.upfront,
        fareOutCollected: value.collected,
        fareOutRefund: value.refund,
        fareOutLeftover: value.leftover
      };
      Object.entries(outputs).forEach(([id, amount]) => {
        document.getElementById(id).textContent = currency.format(amount);
      });
      document.querySelector("#fareOutPerPerson").textContent = referenceCurrency.format(value.perPerson);
      results.classList.remove("hidden");
      message.textContent = "計算完成。";
      message.classList.remove("error");
    } catch (error) {
      results.classList.add("hidden");
      message.textContent = error.message;
      message.classList.add("error");
    }
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  [fareInput, subsidyInput, peopleInput].forEach((input) => input.addEventListener("input", renderFareSplit));
  baseInput.addEventListener("change", renderFareSplit);
  document.querySelector("#farePeopleMinus").addEventListener("click", () => {
    peopleInput.value = Math.max((Number(peopleInput.value) || 1) - 1, 1);
    renderFareSplit();
  });
  document.querySelector("#farePeoplePlus").addEventListener("click", () => {
    peopleInput.value = (Number(peopleInput.value) || 0) + 1;
    renderFareSplit();
  });
}
