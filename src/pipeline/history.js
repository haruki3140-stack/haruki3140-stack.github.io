import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { listSnapshotDates, readJson, writeJson, SNAPSHOT_KEEP_DAYS } from './store.js';

/**
 * 蓄積したスナップショットを商品単位に組み替えて価格・順位の履歴を作る。
 *
 * ランキング記事は他サイトと内容が似通うが、「この商品がいつ・いくらだったか」は
 * 記録し続けた者しか持てない。指名検索（商品名＋価格推移／最安値）はライバルが
 * 少なく、購入直前の訪問者が来るため、このサイトの主戦力になる。
 *
 * スナップショットは45日で消えるので、価格推移ページの対象になった商品の記録だけを
 * data/history/archive.json に移して残す。全商品を残すと年に数十MB増えるうえ、
 * 実測では9割近くの商品が一度しかランクインしない。
 */

/** 薄いページを量産しないための下限。これを満たさない商品はページを作らない。 */
export const MIN_POINTS = 3;

export const archiveFile = () => path.join(config.paths.data, 'history', 'archive.json');

/** itemCode（例 shop-name:10001234）をURLに使える形にする。 */
export function historySlug(code) {
  return String(code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** 長期保存に要らない長文（商品説明・キャッチコピー）を落とす。 */
function slimItem(item) {
  const { caption, catchcopy, ...rest } = item;
  return rest;
}

/**
 * 1日分のスナップショットを商品単位の観測にする。
 * 同じ日に複数ジャンルへ登場する商品は、最初に読んだ1件だけを使う。
 */
async function readDay(date) {
  const dir = path.join(config.paths.snapshots, date);
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const seen = new Map();
  for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
    const snap = await readJson(path.join(dir, file));
    // モックで作ったデータを実データの履歴に混ぜない。
    if (!snap || snap.mock) continue;
    for (const item of snap.items) {
      if (!item.code || !(item.price > 0) || seen.has(item.code)) continue;
      seen.set(item.code, { date, item, genre: snap.genreName });
    }
  }
  return [...seen.values()];
}

/**
 * 保存済みの記録と、日ごとの観測（古い順）を商品単位にまとめる。
 * 商品名や画像は最も新しい観測を正とする。
 */
export function mergeObservations(archive, days) {
  const byCode = new Map();
  for (const [code, saved] of Object.entries(archive?.items ?? {})) {
    byCode.set(code, {
      code,
      item: saved.item,
      itemDate: saved.points.at(-1)?.date ?? '',
      genres: new Set(saved.genres),
      points: [...saved.points],
    });
  }

  for (const { date, item, genre } of days.flat()) {
    let entry = byCode.get(item.code);
    if (!entry) {
      entry = { code: item.code, item, itemDate: '', genres: new Set(), points: [] };
      byCode.set(item.code, entry);
    }
    if (entry.points.some((p) => p.date === date)) continue;
    if (date >= entry.itemDate) {
      entry.item = item;
      entry.itemDate = date;
    }
    entry.genres.add(genre);
    entry.points.push({ date, price: item.price, rank: item.rank ?? null });
  }

  for (const entry of byCode.values()) entry.points.sort((a, b) => a.date.localeCompare(b.date));
  return byCode;
}

/** 価格推移ページを作る条件。記録が少ない・価格が動いていない商品は作らない。 */
function qualifies(entry, minPoints) {
  if (!entry || entry.points.length < minPoints) return false;
  const prices = entry.points.map((p) => p.price);
  return Math.min(...prices) !== Math.max(...prices);
}

function summarize(points, latestDate) {
  const prices = points.map((p) => p.price).filter((p) => p > 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const last = points[points.length - 1];
  const current = last.price;
  const lowest = points.filter((p) => p.price === min).at(-1);

  return {
    min,
    max,
    current,
    average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    lowestDate: lowest?.date ?? null,
    lastDate: last.date,
    // 最新の集計日にランクインしていない商品の値は「最終記録時の価格」であって現在の価格ではない。
    isCurrent: Boolean(latestDate) && last.date === latestDate,
    // 最後の記録が過去最安と同じなら「最安」。差額も出して判断材料にする。
    isLowestNow: current === min,
    diffFromMin: current - min,
    diffFromMaxPct: max > 0 ? Math.round(((max - current) / max) * 1000) / 10 : 0,
  };
}

/** まとめた観測から、ページを作る商品の履歴を組み立てる。 */
export function compileHistories(byCode, { minPoints = MIN_POINTS, latestDate = null } = {}) {
  const histories = [];
  for (const entry of byCode.values()) {
    if (!qualifies(entry, minPoints)) continue;
    histories.push({
      code: entry.code,
      slug: historySlug(entry.code),
      item: entry.item,
      genres: [...entry.genres],
      points: entry.points,
      stats: summarize(entry.points, latestDate),
    });
  }

  // 値動きが大きいものを優先（ページ一覧の並びに使う）。
  histories.sort((a, b) => b.stats.diffFromMaxPct - a.stats.diffFromMaxPct);
  return histories;
}

export async function loadArchive() {
  return readJson(archiveFile(), { version: 1, items: {} });
}

/** 保存済みの記録と全スナップショットから、商品ごとの履歴を返す。 */
export async function buildHistories({ minPoints = MIN_POINTS } = {}) {
  const dates = (await listSnapshotDates()).sort(); // 古い順
  const days = [];
  for (const date of dates) days.push(await readDay(date));
  const byCode = mergeObservations(await loadArchive(), days);
  return compileHistories(byCode, { minPoints, latestDate: dates.at(-1) ?? null });
}

/**
 * 削除予定の日の観測から、価格推移ページの対象になる商品の記録だけを archive に移す。
 * 対象かどうかは残る日の観測も合わせて判定する（消える日に1回・残る期間に2回でも対象）。
 * 同じ日を2回渡しても記録は重複しない。
 */
export function foldIntoArchive(archive, expiringDays, liveDays, { minPoints = MIN_POINTS } = {}) {
  const merged = mergeObservations(archive, [...expiringDays, ...liveDays]);
  const items = { ...(archive?.items ?? {}) };
  let added = 0;

  for (const { date, item, genre } of expiringDays.flat()) {
    if (!qualifies(merged.get(item.code), minPoints)) continue;
    const saved = items[item.code] ?? { item: null, genres: [], points: [] };
    if (saved.points.some((p) => p.date === date)) continue;
    const newest = !saved.points.length || date >= saved.points.at(-1).date;
    items[item.code] = {
      item: newest ? slimItem(item) : saved.item,
      genres: [...new Set([...saved.genres, genre])],
      points: [...saved.points, { date, price: item.price, rank: item.rank ?? null }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
    added++;
  }

  // キー順を固定して、毎日のコミット差分を最小にする。
  const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)));
  return { archive: { version: 1, items: sorted }, added };
}

/**
 * pruneSnapshots() の直前に呼ぶ。消える日の記録のうち必要なものを archive に移す。
 * 書き込みに失敗したら例外で止まり、スナップショットは消されない。
 */
export async function archiveExpiringSnapshots(keepDays = SNAPSHOT_KEEP_DAYS) {
  const dates = await listSnapshotDates(); // 新しい順
  const expiring = dates.slice(keepDays).sort();
  if (!expiring.length) return 0;

  const expiringDays = [];
  for (const date of expiring) expiringDays.push(await readDay(date));
  const liveDays = [];
  for (const date of dates.slice(0, keepDays).sort()) liveDays.push(await readDay(date));

  const { archive, added } = foldIntoArchive(await loadArchive(), expiringDays, liveDays);
  if (added) await writeJson(archiveFile(), archive);
  return added;
}
