import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import {
  archiveExpiringSnapshots, buildHistories, compileHistories, foldIntoArchive, loadArchive, mergeObservations,
} from '../src/pipeline/history.js';
import {
  EXPIRED_ARTICLES_LIMIT, loadExpiredArticleIds, pruneArticles, pruneSnapshots, saveArticle, writeJson,
} from '../src/pipeline/store.js';
import { renderRedirects } from '../src/render/site.js';
import { renderHistoryPage, renderHistoryIndex } from '../src/render/history-page.js';

const item = (code, price, extra = {}) => ({
  code, name: `商品${code}`, price, rank: 1, url: `https://hb.afl.rakuten.co.jp/hgc/test/?${code}`,
  image: '', shopName: 'テスト店', caption: '長い商品説明'.repeat(50), catchcopy: '【curation_x】', ...extra,
});
const obs = (date, it, genre = '総合') => ({ date, item: it, genre });

/** config.paths を一時ディレクトリに向け、終わったら戻す。 */
async function withTempData(t) {
  const original = { ...config.paths };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'affi-retention-'));
  Object.assign(config.paths, {
    data: dir,
    snapshots: path.join(dir, 'snapshots'),
    articles: path.join(dir, 'articles'),
  });
  t.after(async () => {
    Object.assign(config.paths, original);
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

const saveSnap = (date, slug, items, mock = false) =>
  writeJson(path.join(config.paths.snapshots, date, `${slug}.json`), { date, genreSlug: slug, genreName: slug, mock, items });

test('foldIntoArchive keeps expiring points only for items that qualify with the remaining days', () => {
  const expiring = [[obs('2026-09-01', item('a', 1000)), obs('2026-09-01', item('once', 500))]];
  const live = [[obs('2026-09-02', item('a', 900))], [obs('2026-09-03', item('a', 950))]];
  const { archive, added } = foldIntoArchive({ version: 1, items: {} }, expiring, live);

  assert.equal(added, 1);
  assert.deepEqual(Object.keys(archive.items), ['a']);
  assert.deepEqual(archive.items.a.points, [{ date: '2026-09-01', price: 1000, rank: 1 }]);
  // 長期保存には表示に使わない長文を持ち込まない。
  assert.equal('caption' in archive.items.a.item, false);
  assert.equal('catchcopy' in archive.items.a.item, false);

  // 同じ日をもう一度渡しても重複しない。
  const again = foldIntoArchive(archive, expiring, live);
  assert.equal(again.added, 0);
  assert.deepEqual(again.archive, archive);
});

test('foldIntoArchive skips items whose price never moved', () => {
  const expiring = [[obs('2026-09-01', item('flat', 1000))]];
  const live = [[obs('2026-09-02', item('flat', 1000))], [obs('2026-09-03', item('flat', 1000))]];
  assert.equal(foldIntoArchive({ version: 1, items: {} }, expiring, live).added, 0);
});

test('histories continue across the archive and live snapshots and flag stale records', () => {
  const archive = {
    version: 1,
    items: {
      gone: { item: item('gone', 1200, { caption: undefined }), genres: ['総合'], points: [
        { date: '2026-08-01', price: 1200, rank: 3 }, { date: '2026-08-02', price: 1000, rank: 2 },
        { date: '2026-08-03', price: 1100, rank: 2 },
      ] },
      live: { item: item('live', 2000, { name: '古い名前' }), genres: ['総合'], points: [
        { date: '2026-08-01', price: 2000, rank: 5 },
      ] },
    },
  };
  const days = [
    [obs('2026-09-20', item('live', 1800, { name: '新しい名前' }), '家電')],
    [obs('2026-09-21', item('live', 1700, { name: '新しい名前' }), '家電')],
  ];
  const histories = compileHistories(mergeObservations(archive, days), { latestDate: '2026-09-21' });
  const byCode = Object.fromEntries(histories.map((h) => [h.code, h]));

  assert.deepEqual(byCode.live.points.map((p) => p.date), ['2026-08-01', '2026-09-20', '2026-09-21']);
  assert.equal(byCode.live.item.name, '新しい名前');
  assert.deepEqual(byCode.live.genres.sort(), ['家電', '総合']);
  assert.equal(byCode.live.stats.isCurrent, true);

  assert.equal(byCode.gone.stats.isCurrent, false);
  assert.equal(byCode.gone.stats.lastDate, '2026-08-03');
});

test('stale history pages do not present an old record as the current offer', () => {
  const [history] = compileHistories(mergeObservations({ version: 1, items: {} }, [
    [obs('2026-08-01', item('x', 1200))], [obs('2026-08-02', item('x', 1000))], [obs('2026-08-03', item('x', 1000))],
  ]), { latestDate: '2026-09-21' });
  const html = renderHistoryPage(history, []);

  assert.match(html, /最終記録時の価格（2026\/08\/03）/);
  assert.doesNotMatch(html, /<span class="k">現在の価格<\/span>/);
  assert.doesNotMatch(html, /"@type":"Offer"/);
  assert.match(html, /ランキング圏外/);
  assert.doesNotMatch(renderHistoryIndex([history]), /いまが最安/);

  const current = { ...history, stats: { ...history.stats, isCurrent: true } };
  assert.match(renderHistoryPage(current, []), /"@type":"Offer"/);
  assert.match(renderHistoryIndex([current]), /いまが最安/);
});

test('archiving before pruning preserves price history past the snapshot retention window', async (t) => {
  await withTempData(t);
  await saveSnap('2026-09-01', 'all', [item('keep', 1000), item('drop', 500)]);
  await saveSnap('2026-09-02', 'all', [item('keep', 900)]);
  await saveSnap('2026-09-03', 'all', [item('keep', 950)]);
  await saveSnap('2026-09-03', 'mock', [item('mock-only', 1)], true);

  assert.equal(await archiveExpiringSnapshots(2), 1);
  assert.deepEqual(await pruneSnapshots(2), ['2026-09-01']);

  const archive = await loadArchive();
  assert.deepEqual(Object.keys(archive.items), ['keep']);
  const histories = await buildHistories();
  assert.deepEqual(histories.map((h) => h.code), ['keep']);
  assert.deepEqual(histories[0].points.map((p) => p.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(histories[0].stats.isCurrent, true);
});

test('pruneArticles records published article IDs newest first for redirects', async (t) => {
  await withTempData(t);
  const article = (date, slug, mock = false) => ({ id: `${date}-${slug}`, date, genreSlug: slug, mock, sections: [] });
  for (const a of [
    article('2026-09-01', 'all'), article('2026-09-01', 'genre-1', true),
    article('2026-09-02', 'all'), article('2026-09-03', 'all'),
  ]) await saveArticle(a);

  await pruneArticles(2);
  assert.deepEqual(await loadExpiredArticleIds(), ['2026-09-01-all']);

  await saveArticle(article('2026-09-04', 'all'));
  await pruneArticles(2);
  assert.deepEqual(await loadExpiredArticleIds(), ['2026-09-02-all', '2026-09-01-all']);
  assert.ok(EXPIRED_ARTICLES_LIMIT < 2000);
});

test('renderRedirects sends expired articles to their genre and respects the rule limit', () => {
  const out = renderRedirects(
    ['2026-09-02-all', '2026-09-02-genre-100371', '2026-09-01-removed', 'bad id', '2026-09-01-all'],
    new Set(['all', 'genre-100371']),
    { limit: 3 },
  );
  assert.equal(out, [
    '/a/2026-09-02-all/ /g/all/ 301',
    '/a/2026-09-02-genre-100371/ /g/genre-100371/ 301',
    '/a/2026-09-01-removed/ / 301',
    '',
  ].join('\n'));
  assert.equal(renderRedirects([], new Set()), '');
});
