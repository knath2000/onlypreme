#!/usr/bin/env node
// Pull eBay completed-sale listings for a single item query.
// Uses the eBay Finding API (findCompletedItems) — requires only EBAY_APP_ID, no OAuth.
//
// Usage:
//   EBAY_APP_ID=... node scripts/ebay-sold-pull.mjs \
//     --query "Supreme Ghostface Arc Hooded Sweatshirt" \
//     --colors Black Red "Ash Grey" \
//     --sizes S M L XL XXL \
//     --out data/completed-sales/ghostface-arc-hoodie-2026-04-30.json \
//     [--pages 3] [--category 11484]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./stockx-client.mjs";
import {
  buildDerivedSummary,
  classifySales,
  delay,
  extractItems,
  extractPagination,
  findCompletedItems,
  requireCreds
} from "./ebay-client.mjs";

const args = parseArgs();
const query = args.query;
const out = args.out;
const knownColors = args.colors ? (Array.isArray(args.colors) ? args.colors : [args.colors]) : null;
const knownSizes = args.sizes
  ? (Array.isArray(args.sizes) ? args.sizes : [args.sizes])
  : ["S", "M", "L", "XL", "XXL"];
const maxPages = parseInt(args.pages || "3", 10);
const categoryId = args.category || null;

if (!query || !out) {
  console.error(
    'Usage: EBAY_APP_ID=... node scripts/ebay-sold-pull.mjs\n' +
    '  --query "Supreme Ghostface Arc Hooded Sweatshirt"\n' +
    '  --colors Black Red "Ash Grey"\n' +
    '  --out data/completed-sales/ghostface-arc-hoodie-2026-04-30.json\n' +
    '  [--pages 3] [--category 11484]'
  );
  process.exit(1);
}

const creds = requireCreds();
const allRaw = [];

console.log(`eBay sold pull: "${query}"`);
for (let page = 1; page <= maxPages; page++) {
  const result = await findCompletedItems(query, { pageNumber: page, pageSize: 100, categoryId }, creds);
  if (!result.ok) {
    console.error(`  Page ${page} failed: HTTP ${result.status}`, JSON.stringify(result.data).slice(0, 200));
    break;
  }
  const pagination = extractPagination(result);
  const items = extractItems(result);
  console.log(`  Page ${page}/${pagination.totalPages}: ${items.length} items (${pagination.totalEntries} total)`);
  allRaw.push(...items);
  if (page >= pagination.totalPages) break;
  await delay(400);
}

console.log(`  Raw: ${allRaw.length}`);

const { sales, rejected } = classifySales(allRaw, { knownColors, knownSizes });
console.log(`  Included: ${sales.length}  Rejected: ${rejected.length}`);

const derivedSummary = buildDerivedSummary(sales);

const output = {
  schemaVersion: "0.1",
  capturedAt: new Date().toISOString(),
  query,
  knownColors,
  knownSizes,
  source: "eBay Finding API findCompletedItems",
  salesCount: sales.length,
  rejectedCount: rejected.length,
  sales,
  rejected,
  derivedSummary
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`saved ${out}`);
