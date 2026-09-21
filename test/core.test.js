import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { todayKey, readJson, writeJson } from '../src/pipeline/store.js';
import { composeArticle } from '../src/pipeline/compose.js';
import { safeHttpUrl, serializeJsonLd } from '../src/render/html.js';
import { isMockArticle } from '../src/render/site.js';
import { compileWeeklyReport } from '../src/pipeline/weekly.js';

test('todayKey uses Japan time across the UTC date boundary', () => {
  assert.equal(todayKey(new Date('2026-09-19T14:59:59Z')), '2026-09-19');
  assert.equal(todayKey(new Date('2026-09-19T15:00:00Z')), '2026-09-20');
});

test('safeHttpUrl rejects executable and malformed schemes', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('not a url'), '');
  assert.equal(safeHttpUrl('https://example.com/item?a=1'), 'https://example.com/item?a=1');
});

test('serializeJsonLd cannot terminate its script element', () => {
  const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
  assert.equal(json.includes('</script>'), false);
  assert.match(json, /\\u003c\/script>/);
});

test('legacy mock articles are detected from their item data', () => {
  const legacy = {
    sections: [{ type: 'ranking', items: [{ shopCode: 'mock-shop-1', url: 'https://example.com/' }] }],
  };
  assert.equal(isMockArticle(legacy), true);
  assert.equal(isMockArticle({ ...legacy, mock: false }), false);
});

test('composeArticle preserves the source mode', () => {
  const article = composeArticle({
    snapshot: {
      date: '2026-09-20', genreId: '0', genreSlug: 'all', genreName: '総合', mock: true, items: [],
    },
    previous: null,
  });
  assert.equal(article.mock, true);
});

test('writeJson safely replaces an existing document', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'affi-test-'));
  const file = path.join(dir, 'state.json');
  try {
    await writeJson(file, { version: 1 });
    await writeJson(file, { version: 2 });
    assert.deepEqual(await readJson(file), { version: 2 });
    assert.deepEqual(await fs.readdir(dir), ['state.json']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('compileWeeklyReport finds price drops and rank risers from the latest seven days', () => {
  const item = (overrides) => ({
    code: 'shop:item', name: '商品A', price: 2000, rank: 10, url: 'https://example.com/item',
    shopName: 'テスト店', isAffiliate: true, reviewCount: 10, reviewAverage: 4.5,
    ...overrides,
  });
  const snapshot = (date, overrides) => ({
    date, genreSlug: 'food', genreName: '食品', mock: false, items: [item(overrides)],
  });

  const report = compileWeeklyReport([
    snapshot('2026-09-15', { price: 2000, rank: 18 }),
    snapshot('2026-09-18', { price: 1800, rank: 12 }),
    snapshot('2026-09-21', { price: 1500, rank: 5 }),
  ]);

  assert.equal(report.startDate, '2026-09-15');
  assert.equal(report.endDate, '2026-09-21');
  assert.equal(report.observedDays, 3);
  assert.equal(report.priceDrops[0].priceDelta, 500);
  assert.equal(report.priceDrops[0].priceDeltaPct, 25);
  assert.equal(report.risers[0].rankDelta, 13);
  assert.equal(report.risers[0].previousRank, 18);
});

test('compileWeeklyReport waits for at least two collection days', () => {
  const report = compileWeeklyReport([{
    date: '2026-09-21', genreSlug: 'all', genreName: '総合', mock: false,
    items: [{ code: 'shop:item', name: '商品A', price: 1000, rank: 1 }],
  }]);
  assert.equal(report, null);
});
