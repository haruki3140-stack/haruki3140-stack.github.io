import { config } from '../config.js';
import { loadGenres } from './genres.js';
import { listSnapshotDates, loadSnapshot } from './store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 12;

function dateMinusDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

function sortedObservations(byDate) {
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function preferSpecificGenre(current, candidate) {
  if (!current) return candidate;
  if (current.genreSlug === 'all' && candidate.genreSlug !== 'all') return candidate;
  return current;
}

/**
 * スナップショットから「直近7日」の値下がり・順位上昇を組み立てる純粋関数。
 * 同じ商品が総合と個別ジャンルに出る場合、値下がり欄では1商品にまとめる。
 */
export function compileWeeklyReport(snapshots, { minDays = 2, maxDays = 7 } = {}) {
  const dates = [...new Set(snapshots.map((snapshot) => snapshot.date))].sort();
  const latestDate = dates.at(-1);
  if (!latestDate) return null;

  const cutoff = dateMinusDays(latestDate, maxDays - 1);
  const windowDates = dates.filter((date) => date >= cutoff && date <= latestDate);
  if (windowDates.length < minDays) return null;
  const dateSet = new Set(windowDates);
  const selected = snapshots.filter((snapshot) => dateSet.has(snapshot.date));

  const prices = new Map();
  const ranks = new Map();

  for (const snapshot of selected) {
    for (const item of snapshot.items || []) {
      if (!item.code) continue;
      const observation = {
        ...item,
        date: snapshot.date,
        genreName: snapshot.genreName,
        genreSlug: snapshot.genreSlug,
      };

      const priceTrack = prices.get(item.code) || new Map();
      priceTrack.set(snapshot.date, preferSpecificGenre(priceTrack.get(snapshot.date), observation));
      prices.set(item.code, priceTrack);

      const rankKey = `${snapshot.genreSlug}:${item.code}`;
      const rankTrack = ranks.get(rankKey) || new Map();
      rankTrack.set(snapshot.date, observation);
      ranks.set(rankKey, rankTrack);
    }
  }

  const priceDrops = [];
  for (const byDate of prices.values()) {
    const observations = sortedObservations(byDate);
    const first = observations[0];
    const last = observations.at(-1);
    if (observations.length < 2 || last.date !== latestDate || last.price >= first.price) continue;
    const priceDelta = first.price - last.price;
    priceDrops.push({
      ...last,
      previousPrice: first.price,
      priceDelta,
      priceDeltaPct: Number(((priceDelta / first.price) * 100).toFixed(1)),
      observedDays: observations.length,
      comparedFrom: first.date,
    });
  }
  priceDrops.sort((a, b) => b.priceDeltaPct - a.priceDeltaPct || b.priceDelta - a.priceDelta);

  const bestRiserByProduct = new Map();
  for (const byDate of ranks.values()) {
    const observations = sortedObservations(byDate);
    const first = observations[0];
    const last = observations.at(-1);
    const rankDelta = first.rank - last.rank;
    if (observations.length < 2 || last.date !== latestDate || rankDelta <= 0) continue;
    const candidate = {
      ...last,
      previousRank: first.rank,
      rankDelta,
      observedDays: observations.length,
      comparedFrom: first.date,
    };
    const current = bestRiserByProduct.get(last.code);
    if (!current || candidate.rankDelta > current.rankDelta) {
      bestRiserByProduct.set(last.code, candidate);
    }
  }
  const risers = [...bestRiserByProduct.values()]
    .sort((a, b) => b.rankDelta - a.rankDelta || a.rank - b.rank)
    .slice(0, MAX_ITEMS);

  return {
    startDate: windowDates[0],
    endDate: latestDate,
    observedDays: windowDates.length,
    priceDrops: priceDrops.slice(0, MAX_ITEMS),
    risers,
  };
}

export async function buildWeeklyReport() {
  const dates = await listSnapshotDates();
  const latestDate = dates[0];
  if (!latestDate) return null;
  const cutoff = dateMinusDays(latestDate, 6);
  const selectedDates = dates.filter((date) => date >= cutoff && date <= latestDate);
  const genres = await loadGenres();
  const snapshots = (await Promise.all(
    selectedDates.flatMap((date) => genres.map((genre) => loadSnapshot(date, genre.slug))),
  )).filter((snapshot) => snapshot && Boolean(snapshot.mock) === Boolean(config.mock));

  return compileWeeklyReport(snapshots);
}
