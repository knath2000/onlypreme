#!/usr/bin/env node
// Pull eBay completed-sale listings for all comp items in a comps config file.
// Outputs a single merged JSON with per-comp results and aggregate derived ratios.
//
// Usage:
//   EBAY_APP_ID=... node scripts/ebay-comp-sold-pull.mjs \
//     --config scripts/configs/arc-hoodie-comps.json \
//     --out data/completed-sales/comps/arc-hoodie-comps-2026-04-30.json \
//     [--pages 2] [--category 11484]

import fs from "node:fs";
import path from "node:path";
import { median, parseArgs } from "./stockx-client.mjs";
import {
  buildDerivedSummary,
  classifySales,
  delay,
  deriveColorRatios,
  deriveSizeRatios,
  extractItems,
  extractPagination,
  findCompletedItems,
  requireCreds,
  summarizeGroup
} from "./ebay-client.mjs";

const args = parseArgs();
const configPath = args.config;
const out = args.out;
const maxPages = parseInt(args.pages || "2", 10);
const categoryId = args.category || null;

if (!configPath || !out) {
  console.error(
    'Usage: EBAY_APP_ID=... node scripts/ebay-comp-sold-pull.mjs\n' +
    '  --config scripts/configs/arc-hoodie-comps.json\n' +
    '  --out data/completed-sales/comps/arc-hoodie-comps-2026-04-30.json\n' +
    '  [--pages 2] [--category 11484]'
  );
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const creds = requireCreds();
const knownSizes = config.sizes || ["S", "M", "L", "XL", "XXL"];
const compResults = [];

for (const comp of config.comps) {
  const knownColors = comp.colors;
  // Query each color separately for better title-match precision on eBay
  const colorResults = [];

  for (const color of knownColors) {
    const query = `Supreme ${comp.name.replace(/^Supreme\s*/i, "")} ${color}`;
    console.log(`\nComp: ${comp.name} ${color} (${comp.season})`);
    const allRaw = [];

    for (let page = 1; page <= maxPages; page++) {
      const result = await findCompletedItems(query, { pageNumber: page, pageSize: 100, categoryId }, creds);
      if (!result.ok) {
        console.error(`  Page ${page} failed: HTTP ${result.status}`);
        break;
      }
      const pagination = extractPagination(result);
      const items = extractItems(result);
      console.log(`  Page ${page}/${pagination.totalPages}: ${items.length} items`);
      allRaw.push(...items);
      if (page >= pagination.totalPages) break;
      await delay(400);
    }

    const { sales, rejected } = classifySales(allRaw, { knownColors: [color], knownSizes });
    console.log(`  Included: ${sales.length}  Rejected: ${rejected.length}`);

    const derivedSummary = buildDerivedSummary(sales);
    colorResults.push({
      color,
      query,
      salesCount: sales.length,
      rejectedCount: rejected.length,
      sales,
      rejected,
      derivedSummary
    });
  }

  compResults.push({
    name: comp.name,
    season: comp.season,
    colors: colorResults
  });
}

// Aggregate size and color ratios across all comps
// Size ratios: earnMore[size] / earnMore[M] within each color — we use median sold price as proxy
const allSizeRatioValues = {};
const allColorRatioValues = {};

for (const comp of compResults) {
  for (const colorResult of comp.colors) {
    const mMedian = colorResult.derivedSummary.bySize["M"]?.medianUsd;
    if (mMedian) {
      for (const [size, summary] of Object.entries(colorResult.derivedSummary.bySize)) {
        if (summary.medianUsd && summary.count >= 2) {
          allSizeRatioValues[size] = allSizeRatioValues[size] || [];
          allSizeRatioValues[size].push({ ratio: summary.medianUsd / mMedian, comp: comp.name, color: colorResult.color, count: summary.count });
        }
      }
    }

    // Color ratios: non-Black color M median / Black color M median (within same comp)
    const blackResult = comp.colors.find((c) => c.color === "Black");
    const blackMMedian = blackResult?.derivedSummary.bySize["M"]?.medianUsd;
    if (blackMMedian && colorResult.color !== "Black") {
      const colorMMedian = colorResult.derivedSummary.bySize["M"]?.medianUsd;
      const colorMCount = colorResult.derivedSummary.bySize["M"]?.count || 0;
      if (colorMMedian && colorMCount >= 2) {
        allColorRatioValues[colorResult.color] = allColorRatioValues[colorResult.color] || [];
        allColorRatioValues[colorResult.color].push({ ratio: colorMMedian / blackMMedian, comp: comp.name, count: colorMCount });
      }
    }
  }
}

function aggregateRatios(ratioEntries) {
  const values = ratioEntries.map((e) => e.ratio).filter((v) => isFinite(v));
  return {
    median: median(values),
    compsUsed: ratioEntries.length,
    entries: ratioEntries.map((e) => ({ ...e, ratio: Math.round(e.ratio * 1000) / 1000 }))
  };
}

const aggregateSizeRatios = Object.fromEntries(
  Object.entries(allSizeRatioValues).map(([size, entries]) => [size, aggregateRatios(entries)])
);
const aggregateColorRatios = Object.fromEntries(
  Object.entries(allColorRatioValues).map(([color, entries]) => [color, aggregateRatios(entries)])
);

const output = {
  schemaVersion: "0.1",
  capturedAt: new Date().toISOString(),
  configFile: configPath,
  category: config.category,
  knownSizes,
  source: "eBay Finding API findCompletedItems",
  comps: compResults,
  aggregateRatios: {
    sizeRatios: aggregateSizeRatios,
    colorRatios: aggregateColorRatios,
    note: "Size ratios: median(soldPrice[size] / soldPrice[M]) across all comp colors with ≥2 sales at each size. Color ratios: median(nonBlackColorM / BlackM) across comps with ≥2 sales at M for both colors. Sample sizes below 3 are low-confidence."
  }
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\nsaved ${out}`);
