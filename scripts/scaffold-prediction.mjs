#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { median, parseArgs, roundMoney } from "./stockx-client.mjs";

const args = parseArgs();
const targetPath = args.target;
const compsPath = args.comps;
const itemPath = args.item;
const out = args.out;

if (!targetPath || !itemPath || !out) {
  console.error("Usage: node scripts/scaffold-prediction.mjs --target data/stockx/target.json --item scripts/configs/item.json --out data/predictions/item.json [--comps data/stockx/comps.json]");
  process.exit(1);
}

const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const item = JSON.parse(fs.readFileSync(itemPath, "utf8"));
const comps = compsPath && fs.existsSync(compsPath) ? JSON.parse(fs.readFileSync(compsPath, "utf8")) : null;
const feeRate = item.feeAssumption.marketplaceFeePercent / 100;
const shipping = item.feeAssumption.shippingAndHandlingUsd;
const todos = [];

function normalizeTarget(input) {
  if (Array.isArray(input.colors)) return input;
  const grouped = new Map();
  for (const row of input.variantMarketData || []) {
    if (!grouped.has(row.color)) {
      grouped.set(row.color, {
        color: row.color,
        productId: row.productId,
        title: row.productTitle,
        variants: []
      });
    }
    grouped.get(row.color).variants.push({
      size: row.size,
      variantId: row.variantId,
      lowestAskUsd: Number(row.marketData?.lowestAskAmount ?? row.lowestAskUsd ?? 0) || null,
      highestBidUsd: Number(row.marketData?.highestBidAmount ?? row.highestBidUsd ?? 0) || null,
      sellFasterUsd: Number(row.marketData?.sellFasterAmount ?? row.sellFasterUsd ?? 0) || null,
      earnMoreUsd: Number(row.marketData?.earnMoreAmount ?? row.earnMoreUsd ?? 0) || null,
      hasBid: row.marketData?.highestBidAmount !== null && row.marketData?.highestBidAmount !== undefined,
      bidAskSpreadUsd: row.marketData?.lowestAskAmount && row.marketData?.highestBidAmount
        ? Number(row.marketData.lowestAskAmount) - Number(row.marketData.highestBidAmount)
        : null
    });
  }
  return { capturedAt: input.capturedAt, item: input.item || item.name, date: item.releaseDate, colors: [...grouped.values()] };
}

function netProfit(expectedSaleUsd) {
  return roundMoney(expectedSaleUsd * (1 - feeRate) - shipping - item.retailPriceUsd);
}

function callFor(row, profit) {
  if (profit >= item.callThresholds.copMinProfitUsd && row.hasBid) return "cop";
  if (profit >= item.callThresholds.maybeMinProfitUsd && row.hasBid && row.bidAskSpreadUsd !== null && row.bidAskSpreadUsd <= 15) return "cop";
  if (profit >= item.callThresholds.maybeMinProfitUsd) return "maybe";
  return "skip";
}

function buildRatios(targetData) {
  const baseColor = targetData.colors.find((entry) => entry.color === item.baseColorForRatios);
  const baseM = baseColor?.variants.find((entry) => entry.size === item.baseSizeForRatios)?.earnMoreUsd;
  const liveColorRatios = {};
  for (const color of targetData.colors) {
    const colorBase = color.variants.find((entry) => entry.size === item.baseSizeForRatios)?.earnMoreUsd;
    liveColorRatios[color.color] = baseM && colorBase ? roundMoney((colorBase / baseM) * 100) / 100 : null;
  }

  const compSizeRatios = {};
  const compColorRatios = {};
  const derived = comps?.derivedRatios;
  for (const size of item.sizesModeled) {
    const ratio = derived?.sizeRatios?.aggregate?.[size];
    compSizeRatios[size] = ratio ? { compMedian: ratio.median, compsUsed: ratio.compsUsed } : { compMedian: null, compsUsed: 0 };
  }
  for (const color of item.colorsModeled) {
    if (color === item.baseColorForRatios) continue;
    const ratio = derived?.colorRatios?.aggregate?.[color];
    const liveObserved = liveColorRatios[color];
    const compMedian = ratio?.median ?? null;
    compColorRatios[color] = {
      compMedian,
      compsUsed: ratio?.compsUsed ?? 0,
      liveObserved,
      liveOverrideApplied: compMedian !== null && liveObserved !== null ? Math.abs(liveObserved - compMedian) / compMedian > 0.15 : false,
      liveOverrideNote: compMedian !== null && liveObserved !== null && Math.abs(liveObserved - compMedian) / compMedian > 0.15
        ? `Live earnMore[${color} ${item.baseSizeForRatios}] / earnMore[${item.baseColorForRatios} ${item.baseSizeForRatios}] contradicts comp median by >15%.`
        : null
    };
  }
  return { sizeRatios: compSizeRatios, colorRatios: compColorRatios };
}

const targetData = normalizeTarget(target);
const day1Predictions = [];
const horizonPredictions = [];
const targetMarketData = {
  capturedAt: targetData.capturedAt,
  sourceFile: targetPath,
  colors: targetData.colors.map((color) => ({
    color: color.color,
    productId: color.productId,
    title: color.title,
    variants: color.variants.map((variant) => ({
      size: variant.size,
      variantId: variant.variantId,
      lowestAskUsd: variant.lowestAskUsd,
      highestBidUsd: variant.highestBidUsd,
      sellFasterUsd: variant.sellFasterUsd,
      earnMoreUsd: variant.earnMoreUsd,
      hasBid: variant.hasBid,
      bidAskSpreadUsd: variant.bidAskSpreadUsd
    }))
  }))
};

for (const color of targetMarketData.colors) {
  for (const variant of color.variants.filter((entry) => item.sizesModeled.includes(entry.size))) {
    const expectedSaleUsd = variant.earnMoreUsd;
    const profit = expectedSaleUsd !== null ? netProfit(expectedSaleUsd) : null;
    const call = expectedSaleUsd !== null ? callFor(variant, profit) : "skip";
    const liquidityNote = !variant.hasBid
      ? "TODO: No active StockX highest bid at scaffold time; analyst should decide whether thin supply warrants maybe/cop."
      : null;
    if (liquidityNote) todos.push(`${color.color} ${variant.size}: resolve no-bid liquidity note`);
    day1Predictions.push({
      color: color.color,
      size: variant.size,
      expectedSaleUsd,
      rangeUsd: [
        variant.sellFasterUsd,
        expectedSaleUsd !== null ? roundMoney(expectedSaleUsd * 1.05) : null
      ],
      netProfitAfterFeesUsd: profit,
      call,
      scaffoldBasis: "earnMore",
      hasBid: variant.hasBid,
      bidAskSpreadUsd: variant.bidAskSpreadUsd,
      liquidityNote,
      analystOverride: null,
      analystOverrideReason: null
    });
    horizonPredictions.push({
      color: color.color,
      size: variant.size,
      day1Usd: expectedSaleUsd,
      oneWeekUsd: null,
      oneWeekUsd_todo: true,
      oneMonthUsd: null,
      oneMonthUsd_todo: true,
      oneYearUsd: null,
      oneYearUsd_todo: true
    });
  }
}

todos.push("Fill product source snapshots");
todos.push("Fill written detailed reasoning");
todos.push("Fill 1 week, 1 month, and 1 year horizon predictions");
todos.push("Add eBay sold listing comps by size/color");
todos.push("Review analystOverride fields and critique questions");

const output = {
  schemaVersion: "0.2",
  item,
  sourceSnapshot: {
    productSources: [],
    productSources_todo: true,
    marketComps: [],
    marketComps_todo: true
  },
  model: {
    name: "stockx-live scaffold",
    version: "0.2",
    target: "expected resale sale price before seller fees by horizon",
    feeAssumption: item.feeAssumption,
    method: {
      compDerivedRatios: {
        sourceFile: compsPath || null,
        ...buildRatios(targetData)
      },
      targetMarketData,
      detailedReasoning: "TODO: analyst must explain comp weighting, live overrides, no-bid variants, and horizon logic.",
      reviewQuestionsForCritic: ["TODO: analyst must add critique questions."]
    }
  },
  day1Predictions,
  horizonPredictions,
  colorLevelSummaries: item.colorsModeled.map((color) => ({
    color,
    expectedDay1BySizeUsd: Object.fromEntries(day1Predictions.filter((entry) => entry.color === color).map((entry) => [entry.size, entry.expectedSaleUsd])),
    reasoning: "TODO: analyst must write color-level reasoning."
  })),
  overall: {
    bestTargets: [],
    bestTargets_todo: true,
    avoidForResale: [],
    avoidForResale_todo: true,
    baseRecommendation: "TODO: analyst recommendation",
    confidenceScore: null,
    confidenceScore_todo: true,
    keyRisks: ["TODO: analyst must add key risks."]
  },
  accuracyTracking: {
    oneWeek: { trackedAt: null, sourceFile: null, medianAbsPercentError: null, variantResults: [] },
    oneMonth: null,
    oneYear: null
  }
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`saved ${out}`);
console.log("TODOs:");
todos.forEach((todo, index) => console.log(`${index + 1}. ${todo}`));
