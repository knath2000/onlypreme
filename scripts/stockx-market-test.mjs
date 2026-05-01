#!/usr/bin/env node

const apiKey = process.env.STOCKX_API_KEY;
const token = process.env.STOCKX_ACCESS_TOKEN;
const query = process.env.STOCKX_QUERY || "ghostface arc hooded sweatshirt";

if (!apiKey || !token) {
  console.error("Missing STOCKX_API_KEY or STOCKX_ACCESS_TOKEN.");
  process.exit(1);
}

async function stockx(path) {
  const response = await fetch(`https://api.stockx.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-api-key": apiKey,
      accept: "application/json"
    }
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

const searchPath = `/v2/catalog/search?${new URLSearchParams({
  query,
  pageNumber: "1",
  pageSize: "5"
}).toString()}`;

const search = await stockx(searchPath);
console.log(JSON.stringify({ endpoint: searchPath, status: search.status, data: search.data }, null, 2));

const product = search.data?.products?.[0];
if (!product?.productId) process.exit(search.ok ? 0 : 1);

const variantsPath = `/v2/catalog/products/${product.productId}/variants`;
const variants = await stockx(variantsPath);
console.log(JSON.stringify({ endpoint: variantsPath, status: variants.status, data: variants.data }, null, 2));

const variant = variants.data?.variants?.[0] || variants.data?.[0];
const variantId = variant?.variantId || variant?.id;
if (!variantId) process.exit(0);

const marketPath = `/v2/catalog/products/${product.productId}/variants/${variantId}/market-data`;
const marketData = await stockx(marketPath);
console.log(JSON.stringify({ endpoint: marketPath, status: marketData.status, data: marketData.data }, null, 2));
