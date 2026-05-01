#!/usr/bin/env node

const command = process.argv[2];

const config = {
  clientId: process.env.STOCKX_CLIENT_ID,
  clientSecret: process.env.STOCKX_CLIENT_SECRET,
  redirectUri: process.env.STOCKX_REDIRECT_URI,
  code: process.env.STOCKX_AUTH_CODE,
  refreshToken: process.env.STOCKX_REFRESH_TOKEN
};

function requireEnv(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    console.error(`Missing env: ${missing.map((key) => key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()).join(", ")}`);
    process.exit(1);
  }
}

function authorizeUrl() {
  requireEnv(["clientId", "redirectUri"]);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "offline_access openid",
    audience: "gateway.stockx.com",
    state: process.env.STOCKX_STATE || "onlypreme-stockx-test"
  });
  console.log(`https://accounts.stockx.com/authorize?${params.toString()}`);
}

async function exchangeCode() {
  requireEnv(["clientId", "clientSecret", "redirectUri", "code"]);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: config.code,
    redirect_uri: config.redirectUri
  });
  const response = await fetch("https://accounts.stockx.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

async function refreshToken() {
  requireEnv(["clientId", "clientSecret", "refreshToken"]);
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });
  const response = await fetch("https://accounts.stockx.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

if (command === "authorize-url") authorizeUrl();
else if (command === "exchange-code") await exchangeCode();
else if (command === "refresh") await refreshToken();
else {
  console.log("Usage:");
  console.log("  STOCKX_CLIENT_ID=... STOCKX_REDIRECT_URI=... node scripts/stockx-auth.mjs authorize-url");
  console.log("  STOCKX_CLIENT_ID=... STOCKX_CLIENT_SECRET=... STOCKX_REDIRECT_URI=... STOCKX_AUTH_CODE=... node scripts/stockx-auth.mjs exchange-code");
  console.log("  STOCKX_CLIENT_ID=... STOCKX_CLIENT_SECRET=... STOCKX_REFRESH_TOKEN=... node scripts/stockx-auth.mjs refresh");
  process.exit(1);
}
