import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { fetchRanking } from '../src/rakuten/api.js';
import { rankingCoverage, selectTopRankingItems } from '../src/pipeline/ranking.js';
import { composeArticle, correctArticleRanking } from '../src/pipeline/compose.js';

const rankingItem = (rank) => ({
  code: `shop:item-${rank}`, name: `商品${rank}`, rank, price: 1000,
  url: `https://hb.afl.rakuten.co.jp/hgc/test/?item=${rank}`,
  isAffiliate: true, shopName: 'テスト店', reviewCount: 10, reviewAverage: 4.5,
});
const snapshot = (date, ranks) => ({
  date, genreId: '0', genreSlug: 'all', genreName: '総合', mock: false,
  items: ranks.map(rankingItem),
});
const top30 = Array.from({ length: 30 }, (_, index) => index + 1);
const top20 = top30.slice(0, 20);

test('fetchRanking normalizes reversed and shuffled real API responses before truncation', async (t) => {
  const orders = [
    [...top30].reverse(),
    [...top30.filter((rank) => rank % 2 === 0).reverse(), ...top30.filter((rank) => rank % 2 === 1)],
  ];
  const originalMock = config.mock;
  const originalInterval = config.rakuten.minIntervalMs;
  let rawItems;
  config.mock = false;
  config.rakuten.minIntervalMs = 0;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ Items: rawItems })));
  try {
    for (const order of orders) {
      rawItems = order.map((rank) => ({
        rank: String(rank), itemCode: `shop:item-${rank}`, itemName: `商品${rank}`,
        itemPrice: 1000, affiliateUrl: `https://hb.afl.rakuten.co.jp/hgc/test/?item=${rank}`,
      }));
      const result = await fetchRanking();
      assert.deepEqual(result.items.map((item) => item.rank), top30);
      const selected = selectTopRankingItems(result.items);
      assert.deepEqual(selected.map((item) => item.rank), top20);
      assert.deepEqual(selected.map((item) => item.code), top20.map((rank) => `shop:item-${rank}`));
      assert.equal(selected.every((item) => item.isAffiliate), true);
      assert.deepEqual(rawItems.map((item) => Number(item.rank)), order);
    }
    assert.equal(fetchMock.mock.calls.length, orders.length);
  } finally {
    t.mock.restoreAll();
    config.mock = originalMock;
    config.rakuten.minIntervalMs = originalInterval;
  }
});

test('collection sorts independently before selecting the top 20 and preserves its source', () => {
  const source = [...top30].reverse().map(rankingItem);
  assert.deepEqual(selectTopRankingItems(source).map((item) => item.rank), top20);
  assert.deepEqual(source.map((item) => item.rank), [...top30].reverse());
});

test('collection rejects missing first rank, gaps, duplicates and invalid ranks', () => {
  for (const ranks of [[11, 12, 13], [1, 3], [1, 1, 2], [1, null], [1, 2.5]]) {
    assert.throws(() => selectTopRankingItems(ranks.map(rankingItem)), /1位から連続/);
  }
});

test('collection never fills a missing rank 20 with rank 21', () => {
  const items = top30.filter((rank) => rank !== 20).reverse().map(rankingItem);
  const selected = selectTopRankingItems(items);
  assert.deepEqual(selected.map((item) => item.rank), top20.slice(0, 19));
  const article = composeArticle({ snapshot: { ...snapshot('2026-10-13', []), items: selected }, previous: null });
  assert.match(article.title, /TOP19/);
  assert.doesNotMatch(article.title, /TOP20/);
});

test('historical articles report the preserved 11-30 ranks without inventing the top 10', () => {
  const source = snapshot('2026-10-12', [...top30].slice(10).reverse());
  const original = structuredClone(source);
  const article = composeArticle({ snapshot: source, previous: null });
  const ranking = article.sections.find((section) => section.type === 'ranking');
  assert.match(article.title, /11〜30位/);
  assert.doesNotMatch(article.title, /TOP20/);
  assert.doesNotMatch(article.description, /上位20/);
  assert.doesNotMatch(ranking.heading, /TOP20/);
  assert.deepEqual(ranking.items.map((item) => item.rank), top30.slice(10));
  assert.equal(article.lead.some((line) => line.startsWith('1位は')), false);
  assert.equal(article.lead.some((line) => line.startsWith('11位は')), true);
  assert.equal(article.lead.some((line) => line.includes('1〜10位のデータは保存されていません')), true);
  assert.equal(article.rankingCoverage.completeTop, false);
  assert.deepEqual(source, original);
});

test('repairing stored article presentation is idempotent and preserves recorded fields', () => {
  const source = snapshot('2026-10-12', top30.slice(10).reverse());
  const stored = {
    id: '2026-10-12-all', date: source.date, genreId: '0', genreSlug: 'all', genreName: '総合',
    mock: false, title: 'ランキングTOP20', description: '上位20商品', lead: ['1位は商品30'],
    diff: { comparedTo: null, priceDropCount: 0, riserCount: 0, newcomerCount: 0 },
    itemCount: 20, updatedAt: '2026-10-12T00:00:00Z',
    sections: [{ type: 'ranking', heading: 'ランキング TOP20', note: null, items: source.items }],
  };
  const repaired = correctArticleRanking(stored);
  assert.deepEqual(correctArticleRanking(repaired), repaired);
  assert.equal(repaired.updatedAt, stored.updatedAt);
  assert.equal(repaired.id, stored.id);
  assert.equal(stored.title, 'ランキングTOP20');
  assert.deepEqual(repaired.sections[0].items, [...stored.sections[0].items].reverse());
});

test('first corrected top 20 is not compared against the old partial ranking', () => {
  const article = composeArticle({
    snapshot: snapshot('2026-10-13', [...top20].reverse()),
    previous: snapshot('2026-10-12', top30.slice(10).reverse()),
  });
  assert.match(article.title, /TOP20/);
  assert.equal(article.rankingCoverage.completeTop, true);
  assert.equal(article.diff.comparedTo, null);
  assert.equal(article.diff.newcomerCount, 0);
  assert.equal(article.sections.some((section) => ['newcomer', 'riser', 'pricedrop'].includes(section.type)), false);
  assert.match(article.comparisonNotice, /次回から比較を再開/);
  assert.deepEqual(article.sections.at(-1).items.map((item) => item.rank), top20);
});

test('comparison resumes between corrected top rankings', () => {
  const previous = snapshot('2026-10-13', top20);
  const current = snapshot('2026-10-14', top20);
  current.items[0].price = 800;
  const article = composeArticle({ snapshot: current, previous });
  assert.equal(article.diff.comparedTo, previous.date);
  assert.equal(article.diff.priceDropCount, 1);
  assert.equal(article.comparisonNotice, '');
  assert.deepEqual(rankingCoverage(article.sections.at(-1).items), {
    count: 20, minRank: 1, maxRank: 20, completeTop: true,
  });
});

test('partial records containing rank 1 still disclose their missing ranks', () => {
  const ranks = Array.from({ length: 19 }, (_, index) => index + 1).filter((rank) => rank !== 11);
  const article = composeArticle({ snapshot: snapshot('2026-10-04', ranks), previous: null });
  assert.match(article.title, /記録（1〜19位）/);
  assert.doesNotMatch(article.title, /TOP/);
  assert.equal(article.lead.some((line) => line.startsWith('1位は')), true);
  assert.equal(article.lead.some((line) => line.includes('一部の順位のデータが保存されていません')), true);
  assert.equal(article.itemCount, 18);
});

test('comparison is withheld when the available top-rank range changes', () => {
  const article = composeArticle({
    snapshot: snapshot('2026-10-14', top20),
    previous: snapshot('2026-10-13', top20.slice(0, 19)),
  });
  assert.equal(article.diff.comparedTo, null);
  assert.equal(article.diff.newcomerCount, 0);
  assert.match(article.comparisonNotice, /前回との比較は掲載していません/);
});
