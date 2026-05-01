const FINDING_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";

export function requireCreds() {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) throw new Error("Missing env: EBAY_APP_ID");
  return { appId };
}

export function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findCompletedItems(keywords, { pageNumber = 1, pageSize = 100, categoryId = null } = {}, creds) {
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.0.0",
    "SECURITY-APPNAME": creds.appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    keywords,
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "paginationInput.entriesPerPage": String(Math.min(pageSize, 100)),
    "paginationInput.pageNumber": String(pageNumber),
    "sortOrder": "EndTimeSoonest"
  });
  if (categoryId) params.set("categoryId", String(categoryId));

  const response = await fetch(`${FINDING_BASE}?${params.toString()}`);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  await delay();
  return { ok: response.ok, status: response.status, data };
}

export function extractItems(result) {
  return result.data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
}

export function extractPagination(result) {
  const p = result.data?.findCompletedItemsResponse?.[0]?.paginationOutput?.[0] || {};
  return {
    page: parseInt(p.pageNumber?.[0] || "1", 10),
    totalPages: parseInt(p.totalPages?.[0] || "0", 10),
    totalEntries: parseInt(p.totalEntries?.[0] || "0", 10)
  };
}

export function normalizeEbayItem(raw) {
  const title = raw.title?.[0] || "";
  const priceRaw = raw.sellingStatus?.[0]?.currentPrice?.[0];
  const soldPriceUsd = priceRaw ? parseFloat(priceRaw.__value__) : null;
  const currency = priceRaw?.["@currencyId"] || "USD";
  const sellingState = raw.sellingStatus?.[0]?.sellingState?.[0] || "";
  const soldDate = raw.listingInfo?.[0]?.endTime?.[0] || null;
  const condition = raw.condition?.[0]?.conditionDisplayName?.[0] || null;
  const url = raw.viewItemURL?.[0] || null;
  const itemId = raw.itemId?.[0] || null;
  const shippingRaw = raw.shippingInfo?.[0]?.shippingServiceCost?.[0];
  const shippingUsd = shippingRaw ? parseFloat(shippingRaw.__value__) : null;
  const listingType = raw.listingInfo?.[0]?.listingType?.[0] || null;
  return { itemId, title, url, soldDate, soldPriceUsd, currency, shippingUsd, condition, sellingState, listingType };
}

// Color matchers ordered most-specific first to avoid Ash Grey being captured by Grey.
const COLOR_MATCHERS = [
  { color: "Ash Grey", pattern: /\bash[\s\-]*gr[ae]y\b/i },
  { color: "Heather Grey", pattern: /\bheather[\s\-]*gr[ae]y\b/i },
  { color: "Black", pattern: /\bblack\b/i },
  { color: "Red", pattern: /\bred\b/i },
  { color: "White", pattern: /\bwhite\b/i },
  { color: "Blue", pattern: /\bblue\b/i },
  { color: "Green", pattern: /\bgreen\b/i },
  { color: "Navy", pattern: /\bnavy\b/i },
  { color: "Purple", pattern: /\bpurple\b/i },
  { color: "Pink", pattern: /\bpink\b/i },
  { color: "Grey", pattern: /\bgr[ae]y\b/i }
];

const SIZE_MAP = {
  xxl: "XXL", "2xl": "XXL", "2x": "XXL",
  xl: "XL",
  "extra large": "XL", extralarge: "XL",
  large: "L", l: "L",
  medium: "M", m: "M",
  small: "S", s: "S"
};
const VALID_SIZES = new Set(["S", "M", "L", "XL", "XXL"]);

export function parseColor(title, knownColors = null) {
  const matchers = knownColors
    ? COLOR_MATCHERS.filter(({ color }) => knownColors.includes(color))
    : COLOR_MATCHERS;
  for (const { color, pattern } of matchers) {
    if (pattern.test(title)) return { color, confidence: "high" };
  }
  return { color: null, confidence: "none" };
}

export function parseSize(title) {
  // "Size XL", "Sz XL" patterns (highest confidence)
  let m = title.match(/\b(?:size|sz)[:\s]+(xxl|2xl|xl|extra\s*large|large|medium|small|[sml])\b/i);
  if (m) {
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const size = SIZE_MAP[key];
    return size && VALID_SIZES.has(size) ? { size, confidence: "high" } : { size: null, confidence: "low" };
  }
  // Full-word sizes — not just single letters
  m = title.match(/\b(xxl|2xl|extra\s*large|large|medium|small)\b/i);
  if (m) {
    const key = m[1].toLowerCase().replace(/\s+/g, "");
    const size = SIZE_MAP[key];
    return size && VALID_SIZES.has(size) ? { size, confidence: "high" } : { size: null, confidence: "low" };
  }
  // "XL" as a standalone abbreviation (safe)
  m = title.match(/\bXL\b/);
  if (m) return { size: "XL", confidence: "medium" };
  // XXL (case-insensitive, safe)
  m = title.match(/\bXXL\b/i);
  if (m) return { size: "XXL", confidence: "medium" };
  // Single-letter S, M, L — only when surrounded by non-alpha chars to reduce false positives
  m = title.match(/(?:^|[\s\/\-(])([SML])(?=$|[\s\/\-),])/);
  if (m) {
    const size = SIZE_MAP[m[1].toLowerCase()];
    return size && VALID_SIZES.has(size) ? { size, confidence: "low" } : { size: null, confidence: "none" };
  }
  return { size: null, confidence: "none" };
}

export function isSold(item) {
  return item.sellingState === "EndedWithSales";
}

export function median(values) {
  const clean = values.filter((v) => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function summarizeGroup(group) {
  const prices = group.map((s) => s.soldPriceUsd).filter(Boolean);
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    count: group.length,
    medianUsd: median(prices),
    minUsd: sorted[0] ?? null,
    maxUsd: sorted.at(-1) ?? null,
    recentDates: group.map((s) => s.soldDate).filter(Boolean).sort().slice(-3)
  };
}

export function deriveSizeRatios(sizeSummaries) {
  const mMedian = sizeSummaries["M"]?.medianUsd;
  const ratios = {};
  for (const [size, summary] of Object.entries(sizeSummaries)) {
    ratios[size] = {
      ratio: mMedian && summary.medianUsd ? Math.round((summary.medianUsd / mMedian) * 1000) / 1000 : null,
      sampleSize: summary.count,
      confidence: summary.count >= 3 ? "medium" : "low",
      medianUsd: summary.medianUsd
    };
  }
  return ratios;
}

export function deriveColorRatios(colorSummaries) {
  const blackMedian = colorSummaries["Black"]?.medianUsd;
  const ratios = {};
  for (const [color, summary] of Object.entries(colorSummaries)) {
    if (color === "Black") continue;
    ratios[color] = {
      ratio: blackMedian && summary.medianUsd ? Math.round((summary.medianUsd / blackMedian) * 1000) / 1000 : null,
      sampleSize: summary.count,
      confidence: summary.count >= 3 ? "medium" : "low",
      medianUsd: summary.medianUsd
    };
  }
  return ratios;
}

export function classifySales(rawItems, { knownColors = null, knownSizes = ["S", "M", "L", "XL", "XXL"] } = {}) {
  const sales = [];
  const rejected = [];

  for (const raw of rawItems) {
    const norm = normalizeEbayItem(raw);

    if (!isSold(norm)) {
      rejected.push({ ...norm, rejectionReason: `sellingState: ${norm.sellingState}` });
      continue;
    }
    if (!norm.soldPriceUsd || norm.soldPriceUsd <= 0) {
      rejected.push({ ...norm, rejectionReason: "no valid sold price" });
      continue;
    }

    const { color, confidence: colorConfidence } = parseColor(norm.title, knownColors);
    const { size, confidence: sizeConfidence } = parseSize(norm.title);

    const canInclude = colorConfidence !== "none" || sizeConfidence !== "none";
    let rejectionReason = null;

    if (!canInclude) {
      rejectionReason = "could not parse color or size from title";
    } else if (knownSizes && size && !knownSizes.includes(size)) {
      rejectionReason = `size ${size} not in knownSizes`;
    }

    const row = {
      source: "ebay",
      itemId: norm.itemId,
      url: norm.url,
      title: norm.title,
      soldDate: norm.soldDate,
      soldPriceUsd: norm.soldPriceUsd,
      shippingUsd: norm.shippingUsd,
      currency: norm.currency,
      condition: norm.condition,
      listingType: norm.listingType,
      parsedColor: color,
      parsedSize: size,
      colorMatchConfidence: colorConfidence,
      sizeMatchConfidence: sizeConfidence,
      included: !rejectionReason,
      rejectionReason
    };

    if (rejectionReason) {
      rejected.push(row);
    } else {
      sales.push(row);
    }
  }

  return { sales, rejected };
}

export function buildDerivedSummary(sales) {
  const included = sales.filter((s) => s.included && s.soldPriceUsd);

  const byColor = {};
  const bySize = {};
  const byColorAndSize = {};

  for (const sale of included) {
    if (sale.parsedColor) {
      byColor[sale.parsedColor] = byColor[sale.parsedColor] || [];
      byColor[sale.parsedColor].push(sale);
    }
    if (sale.parsedSize) {
      bySize[sale.parsedSize] = bySize[sale.parsedSize] || [];
      bySize[sale.parsedSize].push(sale);
    }
    if (sale.parsedColor && sale.parsedSize) {
      byColorAndSize[sale.parsedColor] = byColorAndSize[sale.parsedColor] || {};
      byColorAndSize[sale.parsedColor][sale.parsedSize] = byColorAndSize[sale.parsedColor][sale.parsedSize] || [];
      byColorAndSize[sale.parsedColor][sale.parsedSize].push(sale);
    }
  }

  const colorSummaries = Object.fromEntries(Object.entries(byColor).map(([k, v]) => [k, summarizeGroup(v)]));
  const sizeSummaries = Object.fromEntries(Object.entries(bySize).map(([k, v]) => [k, summarizeGroup(v)]));
  const colorSizeSummaries = {};
  for (const [color, sizeMap] of Object.entries(byColorAndSize)) {
    colorSizeSummaries[color] = Object.fromEntries(Object.entries(sizeMap).map(([sz, rows]) => [sz, summarizeGroup(rows)]));
  }

  return {
    byColor: colorSummaries,
    bySize: sizeSummaries,
    byColorAndSize: colorSizeSummaries,
    sizeRatios: deriveSizeRatios(sizeSummaries),
    colorRatios: deriveColorRatios(colorSummaries)
  };
}
