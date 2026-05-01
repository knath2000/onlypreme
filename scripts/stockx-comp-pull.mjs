#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  getMarketData,
  getVariants,
  median,
  normalizeMarketData,
  parseArgs,
  requireCredsWithRefresh,
  searchProduct
} from "./stockx-client.mjs";

const args = parseArgs();
const configPath = args.config;
const out = args.out;

if (!configPath || !out) {
  console.error("Usage: STOCKX_API_KEY=... STOCKX_ACCESS_TOKEN=... node scripts/stockx-comp-pull.mjs --config scripts/configs/arc-hoodie-comps.json --out data/stockx/comps/out.json");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const creds = await requireCredsWithRefresh();
const output = {
  schemaVersion: "0.1",
  capturedAt: new Date().toISOString(),
  configFile: configPath,
  category: config.category,
  comps: [],
  derivedRatios: {
    sizeRatios: { aggregate: {} },
    colorRatios: { aggregate: {} }
  },
  errors: []
};

for (const comp of config.comps) {
  const compResult = { name: comp.name, season: comp.season, colors: [] };
  for (const color of comp.colors) {
    const search = await searchProduct(`${comp.name} ${color}`, creds);
    const products = search.data?.products || [];
    const product = products.find((entry) => (entry.productAttributes?.color || "").toLowerCase() === color.toLowerCase()) || search.product;
    if (!search.ok || !product?.productId) {
      output.errors.push({ comp: comp.name, color, step: "search", status: search.status, data: search.data });
      continue;
    }

    const variantsResult = await getVariants(product.productId, creds);
    if (!variantsResult.ok) {
      output.errors.push({ comp: comp.name, color, step: "variants", status: variantsResult.status, data: variantsResult.data });
      continue;
    }

    const variants = [];
    for (const variant of variantsResult.variants.filter((entry) => config.sizes.includes(entry.size))) {
      const market = await getMarketData(product.productId, variant.variantId, creds);
      variants.push({
        size: variant.size,
        variantId: variant.variantId,
        marketStatus: market.status,
        marketOk: market.ok,
        ...normalizeMarketData(market.data),
        rawMarketData: market.data
      });
    }

    compResult.colors.push({
      color,
      productId: product.productId,
      title: product.title,
      urlKey: product.urlKey,
      attributes: product.productAttributes,
      variants
    });
  }
  output.comps.push(compResult);
}

const sizeRatioValues = Object.fromEntries(config.sizes.map((size) => [size, []]));
const colorRatioValues = {};

for (const comp of output.comps) {
  for (const color of comp.colors) {
    const base = color.variants.find((variant) => variant.size === "M")?.earnMoreUsd;
    if (base) {
      for (const variant of color.variants) {
        if (variant.earnMoreUsd) sizeRatioValues[variant.size]?.push(variant.earnMoreUsd / base);
      }
    }
  }

  const blackBase = comp.colors.find((color) => color.color === "Black")?.variants.find((variant) => variant.size === "M")?.earnMoreUsd;
  if (blackBase) {
    for (const color of comp.colors.filter((entry) => entry.color !== "Black")) {
      const colorBase = color.variants.find((variant) => variant.size === "M")?.earnMoreUsd;
      if (!colorBase) continue;
      colorRatioValues[color.color] ||= [];
      colorRatioValues[color.color].push(colorBase / blackBase);
    }
  }
}

for (const [size, values] of Object.entries(sizeRatioValues)) {
  output.derivedRatios.sizeRatios.aggregate[size] = {
    median: median(values),
    compsUsed: values.length,
    values: values.map((value) => Math.round(value * 1000) / 1000)
  };
}

for (const [color, values] of Object.entries(colorRatioValues)) {
  output.derivedRatios.colorRatios.aggregate[color] = {
    median: median(values),
    compsUsed: values.length,
    values: values.map((value) => Math.round(value * 1000) / 1000)
  };
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`saved ${out}`);
