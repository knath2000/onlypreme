import fs from "node:fs";
import path from "node:path";

// Decode JWT expiry without a library — JWT payload is base64url, no signature verification needed.
function jwtExpiresAt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function findEnvFile() {
  let dir = new URL(".", import.meta.url).pathname;
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

function writeEnvTokens(envPath, accessToken, refreshToken) {
  let src = fs.readFileSync(envPath, "utf8");
  src = src.replace(/^STOCKX_ACCESS_TOKEN=.*/m, `STOCKX_ACCESS_TOKEN=${accessToken}`);
  if (refreshToken) {
    src = src.replace(/^STOCKX_REFRESH_TOKEN=.*/m, `STOCKX_REFRESH_TOKEN=${refreshToken}`);
  }
  fs.writeFileSync(envPath, src, "utf8");
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  const response = await fetch("https://accounts.stockx.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }
  return response.json();
}

// Call this instead of requireCreds() when running pipeline scripts.
// Automatically refreshes the access token if it has expired or expires within 5 minutes,
// and writes the new tokens back to .env so future runs stay authenticated.
export async function requireCredsWithRefresh() {
  const apiKey = process.env.STOCKX_API_KEY;
  let accessToken = process.env.STOCKX_ACCESS_TOKEN;
  const refreshToken = process.env.STOCKX_REFRESH_TOKEN;
  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;

  const missing = [];
  if (!apiKey) missing.push("STOCKX_API_KEY");
  if (!accessToken) missing.push("STOCKX_ACCESS_TOKEN");
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

  const expiresAt = jwtExpiresAt(accessToken);
  const expiresInMs = expiresAt ? expiresAt - Date.now() : null;
  const needsRefresh = expiresInMs !== null && expiresInMs < 5 * 60 * 1000;

  if (needsRefresh) {
    if (!refreshToken || !clientId || !clientSecret) {
      console.warn("Access token is expired or expiring soon but STOCKX_REFRESH_TOKEN / STOCKX_CLIENT_ID / STOCKX_CLIENT_SECRET are not set. Proceeding with existing token.");
    } else {
      console.log(`Access token expires in ${Math.round(expiresInMs / 60000)}min — refreshing...`);
      const tokens = await refreshAccessToken(clientId, clientSecret, refreshToken);
      accessToken = tokens.access_token;
      process.env.STOCKX_ACCESS_TOKEN = accessToken;

      const envPath = findEnvFile();
      if (envPath) {
        writeEnvTokens(envPath, accessToken, tokens.refresh_token || refreshToken);
        console.log(`  Tokens saved to ${envPath}`);
      } else {
        console.warn("  Could not locate .env file to save refreshed tokens. Set STOCKX_ACCESS_TOKEN manually.");
      }
    }
  }

  return { apiKey, accessToken };
}

export function requireCreds() {
  const apiKey = process.env.STOCKX_API_KEY;
  const accessToken = process.env.STOCKX_ACCESS_TOKEN;
  const missing = [];
  if (!apiKey) missing.push("STOCKX_API_KEY");
  if (!accessToken) missing.push("STOCKX_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
  return { apiKey, accessToken };
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function delay(ms = Number.parseInt(process.env.STOCKX_DELAY_MS || "500", 10)) {
  return new Promise((resolve) => setTimeout(resolve, Number.isFinite(ms) ? ms : 500));
}

export async function stockxGet(path, creds) {
  const response = await fetch(`https://api.stockx.com${path}`, {
    headers: {
      authorization: `Bearer ${creds.accessToken}`,
      "x-api-key": creds.apiKey,
      accept: "application/json"
    }
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  await delay();
  return { ok: response.ok, status: response.status, data };
}

export async function searchProduct(query, creds) {
  const path = `/v2/catalog/search?${new URLSearchParams({
    query,
    pageNumber: "1",
    pageSize: "5"
  }).toString()}`;
  const result = await stockxGet(path, creds);
  const product = result.data?.products?.[0] || null;
  return { ...result, endpoint: path, product };
}

export async function getVariants(productId, creds) {
  const path = `/v2/catalog/products/${productId}/variants`;
  const result = await stockxGet(path, creds);
  const rawVariants = result.data?.variants || result.data || [];
  const variants = Array.isArray(rawVariants)
    ? rawVariants
        .map((variant) => ({
          size: variant.variantValue || variant.sizeChart?.defaultConversion?.size || null,
          variantId: variant.variantId || variant.id || null,
          raw: variant
        }))
        .filter((variant) => variant.size && variant.variantId)
    : [];
  return { ...result, endpoint: path, variants };
}

export async function getMarketData(productId, variantId, creds) {
  const path = `/v2/catalog/products/${productId}/variants/${variantId}/market-data`;
  const result = await stockxGet(path, creds);
  return { ...result, endpoint: path };
}

export function normalizeMarketData(data) {
  const lowestAskUsd = parseMoney(data?.lowestAskAmount ?? data?.standardMarketData?.lowestAsk);
  const highestBidUsd = parseMoney(data?.highestBidAmount ?? data?.standardMarketData?.highestBidAmount);
  return {
    lowestAskUsd,
    highestBidUsd,
    flexLowestAskUsd: parseMoney(data?.flexLowestAskAmount ?? data?.flexMarketData?.lowestAsk),
    sellFasterUsd: parseMoney(data?.sellFasterAmount ?? data?.standardMarketData?.sellFaster),
    earnMoreUsd: parseMoney(data?.earnMoreAmount ?? data?.standardMarketData?.earnMore),
    hasBid: highestBidUsd !== null,
    bidAskSpreadUsd: lowestAskUsd !== null && highestBidUsd !== null ? lowestAskUsd - highestBidUsd : null
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const values = [];
    while (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      values.push(argv[index + 1]);
      index += 1;
    }
    args[key] = values.length > 1 ? values : values[0] ?? true;
  }
  return args;
}

export function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

export function roundMoney(value) {
  return Math.round(value);
}
