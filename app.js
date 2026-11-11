/* ==========================================================
   Beach Bike Store — Calculadora de Parcelas
   Fórmula: total = preço / (1 - taxa)   |   parcela = total / n
   ========================================================== */

const MAX_PARCELAS = 21;
const STORAGE_KEY = "bbs-calc-config-v1";

// Versão da tabela padrão. AUMENTE este número sempre que mudar as taxas/faixas
// abaixo: os aparelhos já configurados passam a usar a nova tabela (o PIN é mantido).
const DEFAULTS_VERSION = 2;

// Taxas da loja (% sobre o preço). 1x a 10x = sem juros.
const DEFAULTS = {
  rates: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //  1x a 10x
    4.59,  // 11x
    6.39,  // 12x
    7.99,  // 13x
    8.99,  // 14x
    9.99,  // 15x
    10.99, // 16x
    11.99, // 17x
    11.99, // 18x
    13.59, // 19x
    14.49, // 20x
    14.99, // 21x
  ],
  tiers: [
    { min: 0, max: 12 },     // até R$ 2.999,99 -> até 12x
    { min: 3000, max: 21 },  // a partir de R$ 3.000 -> até 21x
  ],
  subtitle: "no cartão de crédito",
  pin: "1234",
};

/* ---------------- Config (localStorage) ---------------- */
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(DEFAULTS);
    if (saved.defaultsVersion !== DEFAULTS_VERSION) {
      // tabela da loja foi atualizada: aplica as novas taxas/faixas, mantém PIN e texto
      const migrated = { ...structuredClone(DEFAULTS), pin: saved.pin || DEFAULTS.pin, subtitle: saved.subtitle || DEFAULTS.subtitle };
      saveConfig(migrated);
      return migrated;
    }
    return {
      ...structuredClone(DEFAULTS),
      ...saved,
      rates: Array.from({ length: MAX_PARCELAS }, (_, i) =>
        Number.isFinite(saved.rates?.[i]) ? saved.rates[i] : DEFAULTS.rates[i]),
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, defaultsVersion: DEFAULTS_VERSION }));
}

let config = loadConfig();

/* ---------------- Cálculo ---------------- */
function maxParcelasFor(price) {
  const tiers = [...config.tiers].sort((a, b) => b.min - a.min);
  const tier = tiers.find((t) => price >= t.min);
  const max = tier ? tier.max : 1;
  return Math.min(Math.max(1, Math.floor(max)), MAX_PARCELAS);
}

function calcular(price, n) {
  const taxa = (config.rates[n - 1] || 0) / 100;
  if (taxa >= 1) return null;
  const totalBruto = price / (1 - taxa);
  // arredonda a parcela para cima no centavo, para a loja nunca receber menos
  const parcela = Math.ceil((totalBruto / n) * 100 - 1e-9) / 100;
  return { parcela, total: Math.round(parcela * n * 100) / 100 };
}

/* ---------------- Formatação ---------------- */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function parsePrice(text) {
  const digits = (text || "").replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

/* ---------------- Elementos ---------------- */
const $ = (id) => document.getElementById(id);
const priceInput = $("price");
const welcome = $("welcome");
const offer = $("offer");
const selector = $("selector");
const legal = $("legal");

let selected = null; // nº de parcelas escolhido

/* ---------------- Render ---------------- */
function render({ animate = false } = {}) {
  const price = parsePrice(priceInput.value);

  if (price <= 0) {
    welcome.hidden = false;
    offer.hidden = true;
    selector.hidden = true;
    legal.textContent = "";
    selected = null;
    return;
  }

  const max = maxParcelasFor(price);
  if (!selected || selected > max) selected = max;

  renderSelector(max);

  const r = calcular(price, selected);
  welcome.hidden = true;
  offer.hidden = false;
  selector.hidden = max <= 1;

  if (!r) {
    $("offerTimes").textContent = `${selected}x`;
    $("offerInt").textContent = "--";
    $("offerCents").textContent = "";
    legal.textContent = "Taxa inválida para esta quantidade de parcelas.";
    return;
  }

  const [int, cents] = r.parcela.toFixed(2).split(".");
  $("offerTimes").textContent = `${selected}x`;
  $("offerInt").textContent = intFmt.format(Number(int));
  $("offerCents").textContent = `,${cents}`;
  $("offerSub").textContent = config.subtitle;

  const semJuros = selected > 1 && !(config.rates[selected - 1] > 0);
  $("badge").hidden = !semJuros;

  legal.textContent = semJuros
    ? `Preço à vista ${brl.format(price)} · ${selected}x de ${brl.format(r.parcela)} sem juros`
    : `Preço à vista ${brl.format(price)} · Total a prazo ${brl.format(r.total)} em ${selected}x de ${brl.format(r.parcela)}`;

  if (animate) {
    const el = $("offerValue");
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }
}

const slider = $("slider");

function renderSelector(max) {
  slider.max = max;
  slider.value = selected;
  $("sliderMax").textContent = `${max}x`;
  const pct = max > 1 ? ((selected - 1) / (max - 1)) * 100 : 100;
  slider.style.setProperty("--fill", `${pct}%`);
}

/* ---------------- Eventos principais ---------------- */
priceInput.addEventListener("input", () => {
  const value = parsePrice(priceInput.value);
  priceInput.value = value > 0 ? brl.format(value) : "";
  selected = null; // novo preço -> volta para o máximo de parcelas (menor parcela)
  render({ animate: true });
});

priceInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") priceInput.blur();
});

slider.addEventListener("input", () => {
  selected = Number(slider.value);
  render();
});

/* ---------------- PIN ---------------- */
const pinDialog = $("pinDialog");
const pinInput = $("pinInput");
const pinError = $("pinError");

$("openSettings").addEventListener("click", () => {
  pinInput.value = "";
  pinError.hidden = true;
  pinDialog.showModal();
  pinInput.focus();
});

$("pinForm").addEventListener("submit", (e) => {
  if (pinInput.value !== String(config.pin)) {
    e.preventDefault();
    pinError.hidden = false;
    pinInput.select();
    return;
  }
  pinDialog.close();
  openSettings();
});

/* ---------------- Configurações ---------------- */
const settingsDialog = $("settingsDialog");
const ratesGrid = $("ratesGrid");
const tiersList = $("tiersList");
let draftTiers = [];

function openSettings(cfg = config) {
  ratesGrid.innerHTML = "";
  cfg.rates.forEach((rate, i) => {
    const row = document.createElement("label");
    row.className = "rate";
    row.innerHTML = `<b>${i + 1}x</b><input type="number" step="0.01" min="0" max="99.99" data-i="${i}" value="${rate}"><span>%</span>`;
    ratesGrid.appendChild(row);
  });

  draftTiers = cfg.tiers.map((t) => ({ ...t }));
  renderTiers();

  $("cfgSubtitle").value = cfg.subtitle;
  $("cfgPin").value = "";
  if (!settingsDialog.open) settingsDialog.showModal();
}

function renderTiers() {
  tiersList.innerHTML = "";
  draftTiers.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "tier";
    row.innerHTML = `
      <span>A partir de R$</span>
      <input type="number" min="0" step="0.01" data-k="min" value="${t.min}">
      <span>até</span>
      <input type="number" min="1" max="${MAX_PARCELAS}" step="1" data-k="max" value="${t.max}">
      <button type="button" class="icon-btn" aria-label="Remover faixa" ${draftTiers.length <= 1 ? "disabled" : ""}>✕</button>`;
    row.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("input", () => { t[inp.dataset.k] = Number(inp.value); }));
    row.querySelector("button").addEventListener("click", () => {
      draftTiers.splice(idx, 1);
      renderTiers();
    });
    tiersList.appendChild(row);
  });
}

$("addTier").addEventListener("click", () => {
  const last = draftTiers.reduce((a, b) => (b.min > a.min ? b : a), { min: 0, max: 1 });
  draftTiers.push({ min: last.min + 1000, max: Math.min(MAX_PARCELAS, last.max + 1) });
  renderTiers();
});

$("resetDefaults").addEventListener("click", () => {
  if (confirm("Restaurar taxas, faixas e textos para o padrão? (o PIN será mantido)")) {
    openSettings({ ...structuredClone(DEFAULTS), pin: config.pin });
  }
});

$("settingsForm").addEventListener("submit", (e) => {
  const rates = [...ratesGrid.querySelectorAll("input")].map((inp) => {
    const v = Number(String(inp.value).replace(",", "."));
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), 99.99) : 0;
  });

  const tiers = draftTiers
    .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.max))
    .map((t) => ({
      min: Math.max(0, t.min),
      max: Math.min(MAX_PARCELAS, Math.max(1, Math.round(t.max))),
    }));
  if (!tiers.length) {
    e.preventDefault();
    alert("Cadastre pelo menos uma faixa de preço.");
    return;
  }

  const newPin = $("cfgPin").value.trim();
  config = {
    rates,
    tiers,
    subtitle: $("cfgSubtitle").value.trim() || DEFAULTS.subtitle,
    pin: newPin || config.pin,
  };
  saveConfig(config);
  selected = null;
  render({ animate: true });
});

// Botões "Cancelar"/"Fechar"
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest("dialog").close()));

/* ---------------- PWA ---------------- */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
