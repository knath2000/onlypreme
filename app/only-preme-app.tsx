"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Forecast = {
  expected7: number;
  expected30: number;
  profit: number;
  confidence: number;
  liquidity: string;
  call: "cop" | "maybe" | "skip";
};

type DropItem = {
  id: string;
  name: string;
  category: string;
  retail: number;
  priceSource: string;
  colors: string[];
  sizing: string;
  heat: number;
  confidenceBase: number;
  collabs: string[];
  details: string;
  image: string;
  sourceUrl: string;
  predictionFile?: string;
  signals: string[];
};

type Prediction = {
  day1Predictions: Array<{
    color: string;
    size: string;
    expectedSaleUsd: number;
    rangeUsd: [number, number];
    netProfitAfterFeesUsd: number;
    call: "cop" | "maybe" | "skip";
  }>;
  horizonPredictions?: Array<{
    color: string;
    size: string;
    day1Usd: number;
    oneWeekUsd: number;
    oneMonthUsd: number;
    oneYearUsd: number;
  }>;
  colorLevelSummaries?: Array<{
    color: string;
    reasoning: string;
  }>;
  model?: {
    method?: {
      colorAdjustments?: Record<string, { basis?: string }>;
      sizeDataGap?: boolean;
      horizonLogic?: {
        oneWeek: string;
        oneMonth: string;
        oneYear: string;
      };
    };
  };
};

type EnrichedItem = DropItem & { forecast: Forecast };

type AuthState = {
  isConfigured: boolean;
  isSignedIn: boolean;
  email: string | null;
  hasActiveSubscription: boolean;
};

type Props = {
  droplist: {
    items: DropItem[];
  };
  auth: AuthState;
};

const feeRate = 0.12;
const shipping = 15;

function categoryMultiple(item: DropItem) {
  const map: Record<string, number> = {
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

function forecastItem(item: DropItem): Forecast {
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

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function colorMultiplier(color: string) {
  const normalized = normalize(color);
  if (normalized.includes("black")) return 1;
  if (normalized.includes("red")) return 0.96;
  if (normalized.includes("grey") || normalized.includes("gray")) return 0.92;
  if (normalized.includes("white")) return 0.9;
  if (normalized.includes("pink") || normalized.includes("purple") || normalized.includes("floral")) return 0.94;
  if (normalized.includes("camo") || normalized.includes("snakeskin") || normalized.includes("graphic")) return 1.04;
  return 0.96;
}

function genericColorForecast(item: EnrichedItem, color: string) {
  const multiplier = colorMultiplier(color);
  const expected7 = Math.round((item.forecast.expected7 * multiplier) / 5) * 5;
  const expected30 = Math.round((item.forecast.expected30 * multiplier) / 5) * 5;
  const profit = Math.round(expected7 * (1 - feeRate) - shipping - item.retail);
  const call = profit >= 25 && item.forecast.confidence >= 58 ? "cop" : profit >= 5 || item.forecast.confidence >= 65 ? "maybe" : "skip";
  return { expected7, expected30, profit, call };
}

export default function OnlyPremeApp({ droplist, auth }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const predictionCache = useRef(new Map<string, Prediction | null>());
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [call, setCall] = useState("all");
  const [sort, setSort] = useState("profit");
  const [activeItem, setActiveItem] = useState<EnrichedItem | null>(null);
  const [activePrediction, setActivePrediction] = useState<Prediction | null>(null);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const enrichedItems = useMemo(() => droplist.items.map((item) => ({ ...item, forecast: forecastItem(item) })), [droplist.items]);
  const categories = useMemo(() => [...new Set(enrichedItems.map((item) => item.category))].sort(), [enrichedItems]);

  const filteredItems = useMemo(() => {
    const query = normalize(search);
    return enrichedItems
      .filter((item) => {
        const haystack = normalize([item.name, item.category, item.colors.join(" "), item.collabs.join(" ")].join(" "));
        return !query || haystack.includes(query);
      })
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => call === "all" || item.forecast.call === call)
      .sort((a, b) => {
        if (sort === "heat") return b.heat - a.heat;
        if (sort === "retail") return b.retail - a.retail;
        if (sort === "confidence") return b.forecast.confidence - a.forecast.confidence;
        return b.forecast.profit - a.forecast.profit;
      });
  }, [call, category, enrichedItems, search, sort]);

  const totalProfit = enrichedItems.reduce((sum, item) => sum + item.forecast.profit, 0);
  const avgProfit = Math.round(totalProfit / enrichedItems.length);
  const copCount = enrichedItems.filter((item) => item.forecast.call === "cop").length;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("onlypreme-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("onlypreme-theme", nextTheme);
  }

  async function loadPrediction(item: EnrichedItem) {
    if (!item.predictionFile) return null;
    if (predictionCache.current.has(item.id)) return predictionCache.current.get(item.id) ?? null;

    const response = await fetch(`/api/predictions/${item.id}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "Unable to load protected prediction.");
    }

    const prediction = await response.json();
    predictionCache.current.set(item.id, prediction);
    return prediction;
  }

  async function openItem(item: EnrichedItem) {
    setActiveItem(item);
    setActivePrediction(null);
    setActiveColor(null);
    setPredictionError(null);
    dialogRef.current?.showModal();

    try {
      setActivePrediction(await loadPrediction(item));
    } catch (error) {
      setPredictionError(error instanceof Error ? error.message : "Unable to load protected prediction.");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <Link className="brand-logo" href="/" aria-label="OnlyPreme home" />
          <p>Supreme SS26 Week 10</p>
        </div>
        <div className="top-actions">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-pressed={theme === "dark"}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {auth.isSignedIn ? (
            <>
              {!auth.hasActiveSubscription ? <ProCheckoutButton compact /> : null}
              <form action="/auth/sign-out" method="post">
                <span>{auth.email}</span>
                <button type="submit">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
          <div className="drop-clock">
            <span>Drop</span>
            <strong>Thu Apr 30, 2026</strong>
            <small>11:00 AM ET</small>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Pre-drop resale predictor</p>
            <h2>Rank tomorrow&apos;s drop by expected reseller outcome.</h2>
            <p>Retail, colorways, sizing, product details, hype temperature, and a transparent resale nowcast for quick cop, maybe, or skip decisions.</p>
          </div>
          <div className="hero-stats" aria-label="Drop summary">
            <div><strong>{enrichedItems.length}</strong><span>items</span></div>
            <div><strong>{money(avgProfit)}</strong><span>avg profit</span></div>
            <div><strong>{copCount}</strong><span>cop calls</span></div>
          </div>
        </section>

        {!auth.isConfigured ? (
          <section className="gate-banner">
            <strong>Supabase is not configured.</strong>
            <span>Public droplist works, but detailed prediction JSON is locked until Supabase env vars and subscriptions are set.</span>
          </section>
        ) : null}

        <section className="controls" aria-label="Droplist controls">
          <label className="search">
            <span>Search</span>
            <input type="search" placeholder="Item, category, color, collab" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>
            <span>Call</span>
            <select value={call} onChange={(event) => setCall(event.target.value)}>
              <option value="all">All calls</option>
              <option value="cop">Cop</option>
              <option value="maybe">Maybe</option>
              <option value="skip">Skip</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="profit">Expected profit</option>
              <option value="heat">Hype temperature</option>
              <option value="retail">Retail price</option>
              <option value="confidence">Confidence</option>
            </select>
          </label>
        </section>

        <section className="ranked">
          <div className="section-head">
            <div>
              <p className="eyebrow">Reseller view</p>
              <h2>Ranked Droplist</h2>
            </div>
            <p>Fee-adjusted profit assumes 12% marketplace fees plus $15 shipping/handling.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Retail</th>
                  <th>7d</th>
                  <th>30d</th>
                  <th>Profit</th>
                  <th>Confidence</th>
                  <th>Call</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length ? filteredItems.map((item) => (
                  <tr key={item.id} data-action={item.id} onClick={() => openItem(item)}>
                    <td>
                      <div className="item-cell">
                        <img src={item.image} alt={item.name} loading="lazy" />
                        <div>
                          <strong>{item.name}</strong>
                          <p className="meta">{item.category} · {item.colors.slice(0, 3).join(", ")}{item.colors.length > 3 ? ` +${item.colors.length - 3}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td>{money(item.retail)}</td>
                    <td>{money(item.forecast.expected7)}</td>
                    <td>{money(item.forecast.expected30)}</td>
                    <td>{money(item.forecast.profit)}</td>
                    <td>{item.forecast.confidence}%</td>
                    <td><span className={`call ${item.forecast.call}`}>{item.forecast.call}</span></td>
                  </tr>
                )) : <tr><td colSpan={7} className="empty">No items match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Product info</p>
              <h2>Item Cards</h2>
            </div>
            <p>Click any item for colors, sizing, details, sources, and forecast signals.</p>
          </div>
          <div className="product-grid">
            {filteredItems.length ? filteredItems.map((item) => (
              <button className="card" type="button" key={item.id} onClick={() => openItem(item)}>
                <div className="image-wrap">
                  <img src={item.image} alt={item.name} loading="lazy" />
                </div>
                <div className="card-body">
                  <div>
                    <h3>{item.name}</h3>
                    <p className="meta">{item.category} · {item.sizing}</p>
                  </div>
                  <div className="pill-row">
                    <span className={`call ${item.forecast.call}`}>{item.forecast.call}</span>
                    <span className="pill">{item.heat}°F hype</span>
                    <span className="source-badge">{item.priceSource}</span>
                  </div>
                  <div className="forecast">
                    <div><span>Retail</span><strong>{money(item.retail)}</strong></div>
                    <div><span>7d resale</span><strong>{money(item.forecast.expected7)}</strong></div>
                    <div><span>Profit</span><strong>{money(item.forecast.profit)}</strong></div>
                  </div>
                  <p className="detail-text">{item.details}</p>
                </div>
              </button>
            )) : <p className="empty">No items match these filters.</p>}
          </div>
        </section>

        <section className="source-note">
          <h2>Data Sources</h2>
          <p>Drop timing and product metadata are pulled from Supreme Drop List and Sole Retriever. Retail prices are marked as Supreme Drop List when canonical, or DropsGG/Reddit image when pre-drop price graphics are the only published source.</p>
          <div className="source-links">
            <a href="https://supremedroplist.com/season/springsummer-2026/week-10" target="_blank" rel="noreferrer">Supreme Drop List Week 10</a>
            <a href="https://www.soleretriever.com/news/articles/supreme-spring-summer-2026-week-10-drop-release-date-april-2026" target="_blank" rel="noreferrer">Sole Retriever preview</a>
            <a href="https://www.reddit.com/r/supremedrops/comments/1sy3sam/supreme_week_10_full_droplist_retail_prices/" target="_blank" rel="noreferrer">Retail price post</a>
          </div>
        </section>
      </main>

      <dialog ref={dialogRef}>
        <button className="close-button" type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>×</button>
        {activeItem ? (
          <div className="dialog-layout">
            <div className="dialog-media">
              <img src={activeItem.image} alt={activeItem.name} />
            </div>
            <div className="dialog-info">
              <div>
                <p className="eyebrow">{activeItem.category}</p>
                <h2>{activeItem.name}</h2>
              </div>
              <div className="pill-row">
                <span className={`call ${activeItem.forecast.call}`}>{activeItem.forecast.call}</span>
                <span className="pill">{activeItem.forecast.confidence}% confidence</span>
                <span className="pill">{activeItem.forecast.liquidity} liquidity</span>
                <span className="source-badge">{activeItem.priceSource}</span>
              </div>
              <div>
                <p className="eyebrow">Colors</p>
                <div className="color-picker">
                  {activeItem.colors.map((color) => (
                    <button type="button" key={color} className={activeColor === color ? "selected" : ""} onClick={() => setActiveColor(color)}>{color}</button>
                  ))}
                </div>
              </div>
              <EstimatePanel item={activeItem} prediction={activePrediction} activeColor={activeColor} error={predictionError} auth={auth} />
              <div>
                <p className="eyebrow">Sizing</p>
                <p className="detail-text">{activeItem.sizing}</p>
              </div>
              <div>
                <p className="eyebrow">Product Details</p>
                <p className="detail-text">{activeItem.details}</p>
              </div>
              <div>
                <p className="eyebrow">Signals</p>
                <ul className="signal-list">{activeItem.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
              </div>
              <a href={activeItem.sourceUrl} target="_blank" rel="noreferrer">Open source page</a>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function EstimatePanel({ item, prediction, activeColor, error, auth }: { item: EnrichedItem; prediction: Prediction | null; activeColor: string | null; error: string | null; auth: AuthState }) {
  if (!activeColor) {
    return (
      <div className="estimate-panel">
        <p className="eyebrow">Resale Estimate</p>
        <p className="detail-text">Select a color to show resale estimates. Color must be selected because the resale market treats colorways as separate variants.</p>
      </div>
    );
  }

  if (item.predictionFile && error) {
    return (
      <div className="estimate-panel gate-panel">
        <p className="eyebrow">Protected Prediction</p>
        <p className="detail-text">{error}</p>
        {!auth.isSignedIn ? <Link href="/login">Sign in</Link> : null}
        {auth.isSignedIn && !auth.hasActiveSubscription ? <ProCheckoutButton /> : null}
      </div>
    );
  }

  if (prediction) {
    const rows = prediction.day1Predictions.filter((entry) => entry.color === activeColor);
    const horizonRows = prediction.horizonPredictions?.filter((entry) => entry.color === activeColor) || [];
    const summary = prediction.colorLevelSummaries?.find((entry) => entry.color === activeColor);
    const colorBasis = prediction.model?.method?.colorAdjustments?.[activeColor]?.basis;
    const sizeGap = prediction.model?.method?.sizeDataGap;

    if (rows.length) {
      return (
        <div className="estimate-panel">
          <p className="eyebrow">Resale Estimate · {activeColor}</p>
          {colorBasis || sizeGap ? (
            <div className="data-note">
              {colorBasis ? <p><strong>Color basis:</strong> {colorBasis}</p> : null}
              {sizeGap ? <p><strong>Size basis:</strong> Prior only. Public StockX/eBay pages did not expose enough size-specific completed sales to measure size ratios.</p> : null}
            </div>
          ) : null}
          <div className="table-wrap compact">
            <table className="size-table">
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
                {rows.map((row) => (
                  <tr key={`${row.color}-${row.size}`}>
                    <td>{row.size}</td>
                    <td>{money(row.expectedSaleUsd)}</td>
                    <td>{money(row.rangeUsd[0])}-{money(row.rangeUsd[1])}</td>
                    <td>{money(row.netProfitAfterFeesUsd)}</td>
                    <td><span className={`call ${row.call}`}>{row.call}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {horizonRows.length ? (
            <details className="horizon-details">
              <summary>Show 1 week, 1 month, and 1 year estimates</summary>
              <div className="table-wrap compact">
                <table className="size-table">
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
                    {horizonRows.map((row) => (
                      <tr key={`${row.color}-${row.size}-horizon`}>
                        <td>{row.size}</td>
                        <td>{money(row.day1Usd)}</td>
                        <td>{money(row.oneWeekUsd)}</td>
                        <td>{money(row.oneMonthUsd)}</td>
                        <td>{money(row.oneYearUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {prediction.model?.method?.horizonLogic ? (
                <ul className="signal-list horizon-copy">
                  <li>{prediction.model.method.horizonLogic.oneWeek}</li>
                  <li>{prediction.model.method.horizonLogic.oneMonth}</li>
                  <li>{prediction.model.method.horizonLogic.oneYear}</li>
                </ul>
              ) : null}
            </details>
          ) : null}
          {summary ? <p className="detail-text">{summary.reasoning}</p> : null}
        </div>
      );
    }
  }

  const forecast = genericColorForecast(item, activeColor);

  return (
    <div className="estimate-panel">
      <p className="eyebrow">Resale Estimate · {activeColor}</p>
      <div className="detail-grid">
        <div><span>Retail</span><strong>{money(item.retail)}</strong></div>
        <div><span>7-day resale</span><strong>{money(forecast.expected7)}</strong></div>
        <div><span>30-day resale</span><strong>{money(forecast.expected30)}</strong></div>
        <div><span>Fee-adjusted profit</span><strong>{money(forecast.profit)}</strong></div>
      </div>
      <details className="horizon-details">
        <summary>Show 1 week, 1 month, and 1 year estimates</summary>
        <div className="detail-grid">
          <div><span>Day 1</span><strong>{money(Math.round((forecast.expected7 * 1.04) / 5) * 5)}</strong></div>
          <div><span>1 Week</span><strong>{money(forecast.expected7)}</strong></div>
          <div><span>1 Month</span><strong>{money(forecast.expected30)}</strong></div>
          <div><span>1 Year</span><strong>{money(Math.round((forecast.expected30 * 1.08) / 5) * 5)}</strong></div>
        </div>
      </details>
      <p className="detail-text">This color estimate uses the item-level MVP forecast adjusted by a color liquidity multiplier. It should be replaced with color-specific comps when available.</p>
    </div>
  );
}

function ProCheckoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/api/stripe/checkout" method="post" className={compact ? "pro-form compact-pro-form" : "pro-form"}>
      <button type="submit">Get Pro · $0.99/mo</button>
    </form>
  );
}
