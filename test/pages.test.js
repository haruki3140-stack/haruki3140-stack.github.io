import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, safeContactUrl, RAKUTEN_CREDIT } from '../src/render/html.js';
import { renderWeeklyPage } from '../src/render/weekly-page.js';
import { renderHistoryPage } from '../src/render/history-page.js';

const page = () => layout({ title: 't', description: 'd', canonical: 'https://example.com/', body: '' });

test('every page carries the unmodified Rakuten credit snippet and an unofficial-site notice', () => {
  const html = page();
  // 規約で改変禁止。1文字でも変わったらテストで止める。
  assert.ok(html.includes('<a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a>'));
  assert.ok(html.includes(RAKUTEN_CREDIT));
  assert.match(html, /楽天グループ株式会社が運営・公認するサイトではありません/);
  assert.match(html, /\/privacy\//);
});

test('safeContactUrl accepts only web URLs and mailto addresses', () => {
  assert.equal(safeContactUrl('https://forms.example.com/x'), 'https://forms.example.com/x');
  assert.equal(safeContactUrl('mailto:info@example.com'), 'mailto:info@example.com');
  assert.equal(safeContactUrl('javascript:alert(1)'), '');
  assert.equal(safeContactUrl('mailto:"><script>@x'), '');
  assert.equal(safeContactUrl(''), '');
});

test('weekly report does not mark external affiliate URLs as an ItemList', () => {
  const item = { code: 'a', name: 'A', price: 900, previousPrice: 1000, priceDelta: 100, priceDeltaPct: 10, rank: 1, url: 'https://hb.afl.rakuten.co.jp/x' };
  const html = renderWeeklyPage({ startDate: '2026-10-07', endDate: '2026-10-13', observedDays: 7, priceDrops: [item], risers: [] });
  assert.doesNotMatch(html, /ItemList/);
});

test('history pages emit Product markup only while the price is current', () => {
  const base = {
    slug: 'a', genres: ['総合'], item: { name: 'A', url: 'https://hb.afl.rakuten.co.jp/x', image: '' },
    points: [{ date: '2026-10-01', price: 1000 }, { date: '2026-10-02', price: 900 }, { date: '2026-10-03', price: 950 }],
    stats: { min: 900, max: 1000, current: 950, average: 950, lowestDate: '2026-10-02', lastDate: '2026-10-03', isLowestNow: false, diffFromMin: 50, diffFromMaxPct: 5 },
  };
  assert.match(renderHistoryPage({ ...base, stats: { ...base.stats, isCurrent: true } }, []), /"@type":"Product"/);
  assert.doesNotMatch(renderHistoryPage({ ...base, stats: { ...base.stats, isCurrent: false } }, []), /application\/ld\+json/);
});
