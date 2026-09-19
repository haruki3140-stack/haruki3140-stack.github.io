import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { listSnapshotDates, readJson } from './store.js';

/**
 * 蓄積したスナップショットを商品単位に組み替えて価格・順位の履歴を作る。
 *
 * ランキング記事は他サイトと内容が似通うが、「この商品がいつ・いくらだったか」は
 * 記録し続けた者しか持てない。指名検索（商品名＋価格推移／最安値）はライバルが
 * 少なく、購入直前の訪問者が来るため、このサイトの主戦力になる。
 */

/** 薄いページを量産しないための下限。これを満たさない商品はページを作らない。 */
export const MIN_POINTS = 3;

/** itemCode（例 shop-name:10001234）をURLに使える形にする。 */
export function historySlug(code) {
  return String(code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function summarize(points) {
  const prices = points.map((p) => p.price).filter((p) => p > 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const current = points[points.length - 1].price;
  const lowest = points.filter((p) => p.price === min).at(-1);

  return {
    min,
    max,
    current,
    average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    lowestDate: lowest?.date ?? null,
    // 現在値が過去最安と同じなら「今が最安」。差額も出して判断材料にする。
    isLowestNow: current === min,
    diffFromMin: current - min,
    diffFromMaxPct: max > 0 ? Math.round(((max - current) / max) * 1000) / 10 : 0,
  };
}

/**
 * 全スナップショットを走査して商品ごとの履歴を返す。
 * 同じ日に複数ジャンルへ登場する商品は1点にまとめる。
 */
export async function buildHistories({ minPoints = MIN_POINTS } = {}) {
  const dates = (await listSnapshotDates()).sort(); // 古い順
  const byCode = new Map();

  for (const date of dates) {
    const dir = path.join(config.paths.snapshots, date);
    let files;
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }

    // 同一日の重複登録を防ぐ。
    const seenToday = new Set();

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const snap = await readJson(path.join(dir, file));
      // モックで作ったデータを実データの履歴に混ぜない。
      if (!snap || snap.mock) continue;

      for (const item of snap.items) {
        if (!item.code || !(item.price > 0)) continue;
        if (seenToday.has(item.code)) continue;
        seenToday.add(item.code);

        let entry = byCode.get(item.code);
        if (!entry) {
          entry = { code: item.code, item, genres: new Set(), points: [] };
          byCode.set(item.code, entry);
        }
        // 商品名や画像は最新のものを正とする。
        entry.item = item;
        entry.genres.add(snap.genreName);
        entry.points.push({ date, price: item.price, rank: item.rank ?? null });
      }
    }
  }

  const histories = [];
  for (const entry of byCode.values()) {
    if (entry.points.length < minPoints) continue;

    const prices = entry.points.map((p) => p.price);
    // 価格がまったく動いていない商品は、推移ページを作る意味がない。
    if (Math.min(...prices) === Math.max(...prices)) continue;

    histories.push({
      code: entry.code,
      slug: historySlug(entry.code),
      item: entry.item,
      genres: [...entry.genres],
      points: entry.points,
      stats: summarize(entry.points),
    });
  }

  // 値動きが大きいものを優先（ページ一覧の並びに使う）。
  histories.sort((a, b) => b.stats.diffFromMaxPct - a.stats.diffFromMaxPct);
  return histories;
}
