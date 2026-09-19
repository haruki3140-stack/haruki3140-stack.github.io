import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { todayKey, readJson, writeJson } from '../src/pipeline/store.js';
import { composeArticle } from '../src/pipeline/compose.js';
import { safeHttpUrl, serializeJsonLd } from '../src/render/html.js';
import { isMockArticle } from '../src/render/site.js';

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
