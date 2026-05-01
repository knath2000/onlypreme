#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  getMarketData,
  median,
  normalizeMarketData,
  parseArgs,
  requireCredsWithRefresh
} from "./stockx-client.mjs";

const args = parseArgs();
const predictionPath = args.prediction;
const horizon = args.horizon;
const out = args.out;
const validHorizons = new Set(["day1", "oneWeek", "oneMonth", "oneYear"]);

if (!predictionPath || !horizon || !out || !validHorizons.has(horizon)) {
  console.error("Usage: STOCKX_API_KEY=... STOCKX_ACCESS_TOKEN=... node scripts/stockx-track-accuracy.mjs --prediction data/predictions/file.json --horizon oneWeek --out data/accuracy/report.json");
  process.exit(1);
}

const creds = await requireCredsWithRefresh();
const prediction = JSON.parse(fs.readFileSync(predictionPath, "utf8"));

function targetMarketDataFrom(prediction) {
  const method = prediction.model?.method || {};
  if (method.targetMarketData?.colors) return method.targetMarketData;
  if (method.stockxApiMarketData) {
    const api = method.stockxApiMarketData;
    return {
      capturedAt: api.capturedAt,
      sourceFile: api.sourceFile,
      colors: ["black", "ashGrey", "red"].flatMap((key) => {
        const rows = api[key] || [];
        if (!rows.length) return [];
        const color = key === "ashGrey" ? "Ash Grey" : key[0].toUpperCase() + key.slice(1);
        const productId = rows[0]?.productId || null;
        return [{
          color,
          productId,
          variants: rows
        }];
      })
    };
  }
  return null;
}

function horizonPrediction(color, size) {
  if (horizon === "day1") {
    return prediction.day1Predictions.find((entry) => entry.color === color && entry.size === size)?.expectedSaleUsd ?? null;
  }
  return prediction.horizonPredictions.find((entry) => entry.color === color && entry.size === size)?.[`${horizon}Usd`] ?? null;
}

function classify(errorPct) {
  if (Math.abs(errorPct) <= 10) return "accurate";
  if (Math.abs(errorPct) <= 20) return "close";
  return errorPct > 20 ? "miss_low" : "miss_high";
}

const target = targetMarketDataFrom(prediction);
if (!target) throw new Error("No targetMarketData or stockxApiMarketData found.");

const report = {
  schemaVersion: "0.1",
  predictionFile: predictionPath,
  horizon,
  trackedAt: new Date().toISOString(),
  variantResults: [],
  warnings: []
};

for (const color of target.colors) {
  for (const variant of color.variants) {
    const productId = color.productId || variant.productId;
    if (!productId || !variant.variantId) {
      report.warnings.push({ color: color.color, size: variant.size, warning: "missing productId or variantId" });
      continue;
    }
    const market = await getMarketData(productId, variant.variantId, creds);
    if (market.status === 404) {
      report.warnings.push({ color: color.color, size: variant.size, warning: "variant returned 404" });
      continue;
    }
    if (!market.ok) {
      report.warnings.push({ color: color.color, size: variant.size, status: market.status, data: market.data });
      continue;
    }
    const normalized = normalizeMarketData(market.data);
    const predictedUsd = horizonPrediction(color.color, variant.size);
    const actualUsd = normalized.sellFasterUsd;
    const errorUsd = predictedUsd !== null && actualUsd !== null ? actualUsd - predictedUsd : null;
    const errorPct = predictedUsd && errorUsd !== null ? (errorUsd / predictedUsd) * 100 : null;
    report.variantResults.push({
      color: color.color,
      size: variant.size,
      variantId: variant.variantId,
      predictedUsd,
      actualSellFasterUsd: actualUsd,
      errorUsd,
      errorPct,
      classification: errorPct === null ? "untracked" : classify(errorPct),
      liveMarketData: normalized
    });
  }
}

report.medianAbsPercentError = median(report.variantResults.map((entry) => entry.errorPct === null ? null : Math.abs(entry.errorPct)));

prediction.accuracyTracking ||= {};
prediction.accuracyTracking[horizon] = {
  trackedAt: report.trackedAt,
  sourceFile: out,
  medianAbsPercentError: report.medianAbsPercentError,
  variantResults: report.variantResults
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(predictionPath, `${JSON.stringify(prediction, null, 2)}\n`);
console.log(`saved ${out}`);
console.log(`patched ${predictionPath}`);
