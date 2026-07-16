#!/usr/bin/env node

import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(process.argv[2] ?? 'out');
const indexPath = resolve(outputDir, 'index.html');

const BUDGETS = Object.freeze({
  initialJavaScriptGzipKiB: 155,
  initialCssGzipKiB: 30,
  initialTotalGzipKiB: 185,
  lazyThemeScenesGzipKiB: 60,
});

function matches(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function localAssetPath(url) {
  const clean = url.split(/[?#]/, 1)[0] ?? '';
  const assetIndex = clean.indexOf('assets/');
  if (assetIndex < 0) throw new Error(`Expected a built asset URL, received ${url}`);
  return resolve(outputDir, clean.slice(assetIndex));
}

async function sizeOf(url) {
  const path = localAssetPath(url);
  const bytes = await readFile(path);
  return {
    url,
    raw: (await stat(path)).size,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
  };
}

function kib(bytes) {
  return bytes / 1024;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + row[field], 0);
}

function enforce(label, actual, budget, failures) {
  const line = `${label}: ${actual.toFixed(2)} KiB / ${budget.toFixed(2)} KiB`;
  if (actual > budget) failures.push(line);
  return line;
}

const html = await readFile(indexPath, 'utf8');
const entryScripts = matches(html, /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
const modulePreloads = matches(html, /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi);
const stylesheets = matches(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi);

if (entryScripts.length === 0) throw new Error(`No module entry found in ${indexPath}`);
if (stylesheets.length === 0) throw new Error(`No stylesheet found in ${indexPath}`);

const initialJavaScript = await Promise.all([...new Set([...entryScripts, ...modulePreloads])].map(sizeOf));
const initialCss = await Promise.all([...new Set(stylesheets)].map(sizeOf));
const assetNames = await readdir(resolve(outputDir, 'assets'));
const themeName = assetNames.find((name) => /^theme-scenes-[^/]+\.js$/.test(name));
const themeUrl = themeName ? `assets/${themeName}` : undefined;
const theme = themeUrl ? await sizeOf(themeUrl) : undefined;

const initialJsGzip = kib(sum(initialJavaScript, 'gzip'));
const initialCssGzip = kib(sum(initialCss, 'gzip'));
const initialTotalGzip = initialJsGzip + initialCssGzip;
const failures = [];
const report = [
  enforce('Initial JavaScript gzip', initialJsGzip, BUDGETS.initialJavaScriptGzipKiB, failures),
  enforce('Initial CSS gzip', initialCssGzip, BUDGETS.initialCssGzipKiB, failures),
  enforce('Initial JS + CSS gzip', initialTotalGzip, BUDGETS.initialTotalGzipKiB, failures),
];

if (modulePreloads.some((url) => url.includes('theme-scenes-'))) {
  failures.push('Decorative theme scene chunk is present in the initial modulepreload graph');
}
if (!theme) {
  failures.push('No lazy theme-scenes chunk was emitted');
} else {
  report.push(enforce(
    'Lazy theme-scenes gzip',
    kib(theme.gzip),
    BUDGETS.lazyThemeScenesGzipKiB,
    failures,
  ));
}

for (const row of [...initialJavaScript, ...initialCss]) {
  report.push(`  ${row.url}: ${kib(row.raw).toFixed(2)} KiB raw / ${kib(row.gzip).toFixed(2)} KiB gzip`);
}

console.log(report.join('\n'));
if (failures.length > 0) {
  console.error(`\nPerformance budget failure:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('\nPerformance asset budgets passed.');
}
