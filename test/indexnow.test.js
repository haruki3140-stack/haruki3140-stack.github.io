import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { changedUrls, planIndexNow, sendIndexNow } from '../src/render/indexnow.js';

const SITE = 'https://example.pages.dev';
const KEY = 'abcdef0123456789';
const sitemap = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([loc, lastmod]) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;
const OLD = sitemap([[`${SITE}/`, '2026-10-12'], [`${SITE}/about/`], [`${SITE}/a/2026-10-12-all/`, '2026-10-12']]);
const NEW = sitemap([[`${SITE}/`, '2026-10-13'], [`${SITE}/about/`], [`${SITE}/a/2026-10-12-all/`, '2026-10-12'], [`${SITE}/a/2026-10-13-all/`, '2026-10-13']]);

/** 公開サイトとIndexNow APIの応答を差し替えた fetch。呼び出しを記録する。 */
function fakeFetch({ liveSitemaps, keyFile = KEY, pingStatus = 202, pingBody = '' }) {
  const calls = [];
  let sitemapReads = 0;
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = new URL(url);
    if (u.pathname === '/sitemap.xml') {
      const body = liveSitemaps[Math.min(sitemapReads++, liveSitemaps.length - 1)];
      return body === null ? new Response('', { status: 404 }) : new Response(body);
    }
    if (u.pathname === `/${KEY}.txt`) return keyFile === null ? new Response('', { status: 404 }) : new Response(keyFile);
    if (u.host === 'api.indexnow.org') return new Response(pingBody, { status: pingStatus });
    throw new Error(`unexpected ${url}`);
  };
  return { impl, calls, pings: () => calls.filter((c) => c.url.startsWith('https://api.indexnow.org')) };
}

async function setup(t) {
  const original = { url: config.site.url, key: config.site.indexNowKey, mock: config.mock, public: config.paths.public };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'affi-indexnow-'));
  process.env.INDEXNOW_PLAN_FILE = path.join(dir, 'plan.json');
  Object.assign(config.site, { url: SITE, indexNowKey: KEY });
  config.mock = false;
  config.paths.public = dir;
  await fs.writeFile(path.join(dir, 'sitemap.xml'), NEW, 'utf8');
  t.after(async () => {
    Object.assign(config.site, { url: original.url, indexNowKey: original.key });
    config.mock = original.mock;
    config.paths.public = original.public;
    delete process.env.INDEXNOW_PLAN_FILE;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

const noWait = async () => {};

test('changedUrls returns only new URLs and URLs whose lastmod changed', () => {
  assert.deepEqual(changedUrls(OLD, NEW), [`${SITE}/`, `${SITE}/a/2026-10-13-all/`]);
  assert.deepEqual(changedUrls(NEW, NEW), []);
  assert.equal(changedUrls('', NEW).length, 4);
});

test('plan then send waits for the deployment and pings only the changed URLs', async (t) => {
  await setup(t);
  const plan = fakeFetch({ liveSitemaps: [OLD] });
  assert.deepEqual((await planIndexNow({ fetchImpl: plan.impl })).urls, [`${SITE}/`, `${SITE}/a/2026-10-13-all/`]);

  // 1回目はまだ前回の sitemap、2回目で公開済みになる。
  const send = fakeFetch({ liveSitemaps: [OLD, NEW] });
  const result = await sendIndexNow({ fetchImpl: send.impl, wait: noWait });
  assert.equal(result.ok, true);
  assert.equal(send.pings().length, 1);
  const body = JSON.parse(send.pings()[0].init.body);
  assert.deepEqual(body.urlList, [`${SITE}/`, `${SITE}/a/2026-10-13-all/`]);
  assert.equal(body.keyLocation, `${SITE}/${KEY}.txt`);
  assert.equal(body.host, 'example.pages.dev');
});

test('send does not ping before the new sitemap is live', async (t) => {
  await setup(t);
  await planIndexNow({ fetchImpl: fakeFetch({ liveSitemaps: [OLD] }).impl });
  const send = fakeFetch({ liveSitemaps: [OLD] });
  const result = await sendIndexNow({ fetchImpl: send.impl, wait: noWait, waitMs: 30_000, intervalMs: 10_000 });
  assert.equal(result.skipped, 'not-deployed');
  assert.equal(send.pings().length, 0);
});

test('send refuses to ping when the key file is missing or different', async (t) => {
  await setup(t);
  await planIndexNow({ fetchImpl: fakeFetch({ liveSitemaps: [OLD] }).impl });
  for (const keyFile of [null, 'other-key']) {
    const send = fakeFetch({ liveSitemaps: [NEW], keyFile });
    assert.equal((await sendIndexNow({ fetchImpl: send.impl, wait: noWait })).skipped, 'key-file');
    assert.equal(send.pings().length, 0);
  }
});

test('rejections surface the reason from the response body', async (t) => {
  await setup(t);
  await planIndexNow({ fetchImpl: fakeFetch({ liveSitemaps: [OLD] }).impl });
  const send = fakeFetch({ liveSitemaps: [NEW], pingStatus: 403, pingBody: '{"errorCode":"UserForbiddedToAccessSite"}' });
  const result = await sendIndexNow({ fetchImpl: send.impl, wait: noWait });
  assert.equal(result.status, 403);
  assert.match(result.detail, /UserForbiddedToAccessSite/);
});

test('plan sends nothing when the live sitemap cannot be read', async (t) => {
  await setup(t);
  const failing = async () => new Response('', { status: 500 });
  assert.deepEqual((await planIndexNow({ fetchImpl: failing })).urls, []);
  const send = fakeFetch({ liveSitemaps: [NEW] });
  assert.equal((await sendIndexNow({ fetchImpl: send.impl, wait: noWait })).skipped, 'no-urls');
});
