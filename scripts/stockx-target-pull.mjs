#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  getMarketData,
  getVariants,
  normalizeMarketData,
  parseArgs,
  requireCredsWithRefresh,
  searchProduct
} from "./stockx-client.mjs";

const args = parseArgs();
const item = args.item;
const colors = Array.isArray(args.colors) ? args.colors : args.colors ? [args.colors] : [];
const date = args.date;
const out = args.out;

if (!item || !colors.length || !date || !out) {
  console.error('Usage: node scripts/stockx-target-pull.mjs --item "Item Name" --colors Black Red "Ash Grey" --date YYYY-MM-DD --out data/stockx/file.json');
  process.exit(1);
}

const creds = await requireCredsWithRefresh();
const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
const output = existing || {
  schemaVersion: "0.1",
  capturedAt: null,
  item,
  date,
  colors: [],
  errors: []
};

for (const color of colors) {
  const query = `${item} ${color}`;
  const search = await searchProduct(query, creds);
  const products = search.data?.products || [];
  const product = products.find((entry) => (entry.productAttributes?.color || "").toLowerCase() === color.toLowerCase()) || search.product;

  if (!search.ok || !product?.productId) {
    output.errors.push({ color, step: "search", status: search.status, data: search.data });
    continue;
  }

  const variantsResult = await getVariants(product.productId, creds);
  if (!variantsResult.ok) {
    output.errors.push({ color, step: "variants", status: variantsResult.status, data: variantsResult.data });
    continue;
  }

  const variants = [];
  for (const variant of variantsResult.variants) {
    const market = await getMarketData(product.productId, variant.variantId, creds);
    const normalized = normalizeMarketData(market.data);
    variants.push({
      size: variant.size,
      variantId: variant.variantId,
      marketStatus: market.status,
      marketOk: market.ok,
      ...normalized,
      rawMarketData: market.data
    });
  }

  const colorResult = {
    color,
    productId: product.productId,
    title: product.title,
    urlKey: product.urlKey,
    attributes: product.productAttributes,
    variants
  };

  output.colors = output.colors.filter((entry) => entry.color !== color);
  output.colors.push(colorResult);
}

output.capturedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`saved ${out}`);
