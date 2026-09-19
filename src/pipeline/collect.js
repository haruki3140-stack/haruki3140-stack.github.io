import { fetchRanking } from '../rakuten/api.js';
import { loadGenres } from './genres.js';
import { saveSnapshot, todayKey, pruneSnapshots } from './store.js';
import { config } from '../config.js';

/**
 * 有効ジャンルのランキングを取得して当日のスナップショットとして保存する。
 * 1ジャンル失敗しても他は続行し、最後に失敗数を返す。
 */
export async function collect({ date = todayKey(), limit = 20 } = {}) {
  const genres = await loadGenres();
  const results = [];
  const failures = [];

  console.log(`■ 収集開始 (${date})  対象 ${genres.length} ジャンル${config.mock ? '  ※MOCKモード' : ''}`);

  for (const genre of genres) {
    try {
      const { items, fetchedAt } = await fetchRanking({ genreId: genre.id });
      if (items.length === 0) {
        failures.push({ genre: genre.name, reason: 'ランキングが空でした' });
        console.warn(`  - ${genre.name}: 0件`);
        continue;
      }
      const payload = {
        date,
        genreId: genre.id,
        genreSlug: genre.slug,
        genreName: genre.name,
        fetchedAt,
        mock: config.mock,
        items: items.slice(0, limit),
      };
      await saveSnapshot(date, genre.slug, payload);
      results.push(payload);
      console.log(`  ✓ ${genre.name}: ${payload.items.length}件`);
    } catch (err) {
      failures.push({ genre: genre.name, reason: err.message });
      console.error(`  × ${genre.name}: ${err.message}`);
    }
  }

  const pruned = await pruneSnapshots();
  if (pruned.length) console.log(`  … 古いスナップショット ${pruned.length}日分を削除`);

  return { date, snapshots: results, failures };
}
