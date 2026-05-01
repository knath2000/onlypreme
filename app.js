const { items } = await fetch("./data/droplist.json").then((r) => r.json());

const feeRate = 0.12;
const shipping = 15;

function categoryMultiple(item) {
  const map = {
    Accessories: 1.24,
    Skate: 1.38,
    Shoes: 1.32,
    Hats: 1.28,
    Jerseys: 1.18,
    Sweatshirts: 1.15,
    "T-Shirts": 1.2,
    Jackets: 1.08,
    Shorts: 1.08,
    Pants: 1.1,
    Shirts: 1.06,
    Sweaters: 1.04
  };
  return map[item.category] || 1.08;
}

function forecastItem(item) {
  const heatLift = (item.heat - 70) / 160;
  const collabLift = Math.min(item.collabs.length * 0.045, 0.16);
  const retailDrag = item.retail > 500 ? -0.16 : item.retail > 250 ? -0.08 : item.retail < 80 ? 0.08 : 0;
  const noveltyLift = item.category === "Skate" || item.name.includes("Mask") ? 0.08 : 0;
  const multiplier = Math.max(0.78, categoryMultiple(item) + heatLift + collabLift + retailDrag + noveltyLift);
  const expected7 = Math.round((item.retail * multiplier) / 5) * 5;
  const expected30 = Math.round((expected7 * (item.category === "Accessories" || item.category === "Skate" ? 1.08 : 1.02)) / 5) * 5;
  const profit = Math.round(expected7 * (1 - feeRate) - shipping - item.retail);
  const confidence = Math.max(30, Math.min(88, Math.round(item.confidenceBase + (item.heat - 75) * 0.18 - (item.retail > 700 ? 10 : 0))));
  const liquidity = item.retail > 700 ? "Low" : item.category === "Hats" || item.category === "T-Shirts" || item.category === "Shoes" ? "High" : confidence > 62 ? "Medium" : "Low";
  const call = profit >= 25 && confidence >= 58 ? "cop" : profit >= 5 || confidence >= 65 ? "maybe" : "skip";
  return { expected7, expected30, profit, confidence, liquidity, call };
}

const enrichedItems = items.map((item) => ({ ...item, forecast: forecastItem(item) }));
const state = { search: "", category: "all", call: "all", sort: "profit" };

const categorySelect = document.querySelector("#categorySelect");
const searchInput = document.querySelector("#searchInput");
const callSelect = document.querySelector("#callSelect");
const sortSelect = document.querySelector("#sortSelect");
const rankedRows = document.querySelector("#rankedRows");
const productGrid = document.querySelector("#productGrid");
const itemDialog = document.querySelector("#itemDialog");
const dialogBody = document.querySelector("#dialogBody");
const closeDialog = document.querySelector("#closeDialog");
const predictionCache = new Map();

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fillCategories() {
  const categories = [...new Set(enrichedItems.map((item) => item.category))].sort();
  categorySelect.insertAdjacentHTML("beforeend", categories.map((category) => `<option value="${category}">${category}</option>`).join(""));
}

function filteredItems() {
  const query = normalize(state.search);
  return enrichedItems
    .filter((item) => {
      const haystack = normalize([item.name, item.category, item.colors.join(" "), item.collabs.join(" ")].join(" "));
      return !query || haystack.includes(query);
    })
    .filter((item) => state.category === "all" || item.category === state.category)
    .filter((item) => state.call === "all" || item.forecast.call === state.call)
    .sort((a, b) => {
      if (state.sort === "heat") return b.heat - a.heat;
      if (state.sort === "retail") return b.retail - a.retail;
      if (state.sort === "confidence") return b.forecast.confidence - a.forecast.confidence;
      return b.forecast.profit - a.forecast.profit;
    });
}

function renderStats() {
  const totalProfit = enrichedItems.reduce((sum, item) => sum + item.forecast.profit, 0);
  document.querySelector("#itemCount").textContent = enrichedItems.length;
  document.querySelector("#avgProfit").textContent = money(Math.round(totalProfit / enrichedItems.length));
  document.querySelector("#copCount").textContent = enrichedItems.filter((item) => item.forecast.call === "cop").length;
}

function rowTemplate(item) {
  const f = item.forecast;
  return `
    <tr data-action="${item.id}">
      <td>
        <div class="item-cell">
          <img src="${item.image}" alt="${item.name}" loading="lazy">
          <div>
            <strong>${item.name}</strong>
            <p class="meta">${item.category} · ${item.colors.slice(0, 3).join(", ")}${item.colors.length > 3 ? " +" + (item.colors.length - 3) : ""}</p>
          </div>
        </div>
      </td>
      <td>${money(item.retail)}</td>
      <td>${money(f.expected7)}</td>
      <td>${money(f.expected30)}</td>
      <td>${money(f.profit)}</td>
      <td>${f.confidence}%</td>
      <td><span class="call ${f.call}">${f.call}</span></td>
    </tr>
  `;
}

function cardTemplate(item) {
  const f = item.forecast;
  return `
    <button class="card" type="button" data-action="${item.id}">
      <div class="image-wrap">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
      </div>
      <div class="card-body">
        <div>
          <h3>${item.name}</h3>
          <p class="meta">${item.category} · ${item.sizing}</p>
        </div>
        <div class="pill-row">
          <span class="call ${f.call}">${f.call}</span>
          <span class="pill">${item.heat}°F hype</span>
          <span class="source-badge">${item.priceSource}</span>
        </div>
        <div class="forecast">
          <div><span>Retail</span><strong>${money(item.retail)}</strong></div>
          <div><span>7d resale</span><strong>${money(f.expected7)}</strong></div>
          <div><span>Profit</span><strong>${money(f.profit)}</strong></div>
        </div>
        <p class="detail-text">${item.details}</p>
      </div>
    </button>
  `;
}

function renderList() {
  const list = filteredItems();
  rankedRows.innerHTML = list.length ? list.map(rowTemplate).join("") : `<tr><td colspan="7" class="empty">No items match these filters.</td></tr>`;
  productGrid.innerHTML = list.length ? list.map(cardTemplate).join("") : `<p class="empty">No items match these filters.</p>`;
}

async function loadPrediction(item) {
  if (!item.predictionFile) return null;
  if (predictionCache.has(item.predictionFile)) return predictionCache.get(item.predictionFile);
  const response = await fetch(item.predictionFile);
  const prediction = response.ok ? await response.json() : null;
  predictionCache.set(item.predictionFile, prediction);
  return prediction;
}

function colorMultiplier(color) {
  const normalized = normalize(color);
  if (normalized.includes("black")) return 1;
  if (normalized.includes("red")) return 0.96;
  if (normalized.includes("grey") || normalized.includes("gray")) return 0.92;
  if (normalized.includes("white")) return 0.9;
  if (normalized.includes("pink") || normalized.includes("purple") || normalized.includes("floral")) return 0.94;
  if (normalized.includes("camo") || normalized.includes("snakeskin") || normalized.includes("graphic")) return 1.04;
  return 0.96;
}

function genericColorForecast(item, color) {
  const f = item.forecast;
  const multiplier = colorMultiplier(color);
  const expected7 = Math.round((f.expected7 * multiplier) / 5) * 5;
  const expected30 = Math.round((f.expected30 * multiplier) / 5) * 5;
  const profit = Math.round(expected7 * (1 - feeRate) - shipping - item.retail);
  const call = profit >= 25 && f.confidence >= 58 ? "cop" : profit >= 5 || f.confidence >= 65 ? "maybe" : "skip";
  return { expected7, expected30, profit, call };
}

function detailTemplate(item, prediction) {
  const f = item.forecast;
  return `
    <div class="dialog-layout">
      <div class="dialog-media">
        <img src="${item.image}" alt="${item.name}">
      </div>
      <div class="dialog-info">
        <div>
          <p class="eyebrow">${item.category}</p>
          <h2>${item.name}</h2>
        </div>
        <div class="pill-row">
          <span class="call ${f.call}">${f.call}</span>
          <span class="pill">${f.confidence}% confidence</span>
          <span class="pill">${f.liquidity} liquidity</span>
          <span class="source-badge">${item.priceSource}</span>
        </div>
        <div>
          <p class="eyebrow">Colors</p>
          <div class="color-picker" data-color-picker>
            ${item.colors.map((color) => `<button type="button" data-color="${color}">${color}</button>`).join("")}
          </div>
        </div>
        <div class="estimate-panel" data-estimate-panel>
          <p class="eyebrow">Resale Estimate</p>
          <p class="detail-text">Select a color to show resale estimates. Color must be selected because the resale market treats colorways as separate variants.</p>
        </div>
        <div>
          <p class="eyebrow">Sizing</p>
          <p class="detail-text">${item.sizing}</p>
        </div>
        <div>
          <p class="eyebrow">Product Details</p>
          <p class="detail-text">${item.details}</p>
        </div>
        <div>
          <p class="eyebrow">Signals</p>
          <ul class="signal-list">${item.signals.map((signal) => `<li>${signal}</li>`).join("")}</ul>
        </div>
        <a href="${item.sourceUrl}" target="_blank" rel="noreferrer">Open source page</a>
      </div>
    </div>
  `;
}

function colorPredictionTemplate(item, prediction, color) {
  if (prediction) {
    const rows = prediction.day1Predictions.filter((entry) => entry.color === color);
    const horizonRows = prediction.horizonPredictions?.filter((entry) => entry.color === color) || [];
    const summary = prediction.colorLevelSummaries?.find((entry) => entry.color === color);
    const colorBasis = prediction.model?.method?.colorAdjustments?.[color]?.basis;
    const sizeGap = prediction.model?.method?.sizeDataGap;
    if (rows.length) {
      return `
        <p class="eyebrow">Resale Estimate · ${color}</p>
        ${colorBasis || sizeGap ? `
          <div class="data-note">
            ${colorBasis ? `<p><strong>Color basis:</strong> ${colorBasis}</p>` : ""}
            ${sizeGap ? `<p><strong>Size basis:</strong> Prior only. Public StockX/eBay pages did not expose enough size-specific completed sales to measure size ratios.</p>` : ""}
          </div>
        ` : ""}
        <div class="table-wrap compact">
          <table class="size-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Day 1</th>
                <th>Range</th>
                <th>Profit</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${row.size}</td>
                  <td>${money(row.expectedSaleUsd)}</td>
                  <td>${money(row.rangeUsd[0])}-${money(row.rangeUsd[1])}</td>
                  <td>${money(row.netProfitAfterFeesUsd)}</td>
                  <td><span class="call ${row.call}">${row.call}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ${horizonRows.length ? `
          <details class="horizon-details">
            <summary>Show 1 week, 1 month, and 1 year estimates</summary>
            <div class="table-wrap compact">
              <table class="size-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Day 1</th>
                    <th>1 Week</th>
                    <th>1 Month</th>
                    <th>1 Year</th>
                  </tr>
                </thead>
                <tbody>
                  ${horizonRows.map((row) => `
                    <tr>
                      <td>${row.size}</td>
                      <td>${money(row.day1Usd)}</td>
                      <td>${money(row.oneWeekUsd)}</td>
                      <td>${money(row.oneMonthUsd)}</td>
                      <td>${money(row.oneYearUsd)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            ${prediction.model?.method?.horizonLogic ? `
              <ul class="signal-list horizon-copy">
                <li>${prediction.model.method.horizonLogic.oneWeek}</li>
                <li>${prediction.model.method.horizonLogic.oneMonth}</li>
                <li>${prediction.model.method.horizonLogic.oneYear}</li>
              </ul>
            ` : ""}
          </details>
        ` : ""}
        ${summary ? `<p class="detail-text">${summary.reasoning}</p>` : ""}
      `;
    }
  }

  const f = genericColorForecast(item, color);
  return `
    <p class="eyebrow">Resale Estimate · ${color}</p>
    <div class="detail-grid">
      <div><span>Retail</span><strong>${money(item.retail)}</strong></div>
      <div><span>7-day resale</span><strong>${money(f.expected7)}</strong></div>
      <div><span>30-day resale</span><strong>${money(f.expected30)}</strong></div>
      <div><span>Fee-adjusted profit</span><strong>${money(f.profit)}</strong></div>
    </div>
    <details class="horizon-details">
      <summary>Show 1 week, 1 month, and 1 year estimates</summary>
      <div class="detail-grid">
        <div><span>Day 1</span><strong>${money(Math.round((f.expected7 * 1.04) / 5) * 5)}</strong></div>
        <div><span>1 Week</span><strong>${money(f.expected7)}</strong></div>
        <div><span>1 Month</span><strong>${money(f.expected30)}</strong></div>
        <div><span>1 Year</span><strong>${money(Math.round((f.expected30 * 1.08) / 5) * 5)}</strong></div>
      </div>
    </details>
    <p class="detail-text">This color estimate uses the item-level MVP forecast adjusted by a color liquidity multiplier. It should be replaced with color-specific comps when available.</p>
  `;
}

async function openItem(id) {
  const item = enrichedItems.find((entry) => entry.id === id);
  if (!item) return;
  const prediction = await loadPrediction(item);
  dialogBody.innerHTML = detailTemplate(item, prediction);
  itemDialog.showModal();
  const estimatePanel = dialogBody.querySelector("[data-estimate-panel]");
  dialogBody.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      dialogBody.querySelectorAll("[data-color]").forEach((entry) => entry.classList.toggle("selected", entry === button));
      estimatePanel.innerHTML = colorPredictionTemplate(item, prediction, button.dataset.color);
    });
  });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (trigger) openItem(trigger.dataset.action);
});

closeDialog.addEventListener("click", () => itemDialog.close());
itemDialog.addEventListener("click", (event) => {
  if (event.target === itemDialog) itemDialog.close();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderList();
});

categorySelect.addEventListener("change", (event) => {
  state.category = event.target.value;
  renderList();
});

callSelect.addEventListener("change", (event) => {
  state.call = event.target.value;
  renderList();
});

sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderList();
});

fillCategories();
renderStats();
renderList();
