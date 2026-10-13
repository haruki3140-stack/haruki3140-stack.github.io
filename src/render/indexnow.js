import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

/**
 * IndexNow: 更新したURLを検索エンジンに直接通知する無料の仕組み。
 * Bing / Yandex / Naver などが対応していて、アカウント登録も審査も要らない。
 * sitemap のクロール待ち（数日〜数週間）を待たずに拾われる。
 *
 * 仕組み: 所有証明として <サイト>/<key>.txt に同じ key を置き、APIにURL一覧を投げる。
 * key ファイルは static/<key>.txt としてリポジトリに置く（key は公開して構わない値）。
 *
 * 通知は build() ではなく GitHub Actions の2ステップで行う。
 *   plan: push 前に、公開中の sitemap と今回の sitemap を比べて変わったURLだけを決める
 *   send: push 後、Cloudflare Pages の公開を待ってから通知する
 * 公開前に通知すると、検索エンジンが古いページやキーの無いサイトを取りに来てしまう。
 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** 1回の通知に含められるURLは1万件まで。実際にはそこまで増えない。 */
const MAX_URLS = 10_000;
const VALID_KEY = /^[A-Za-z0-9-]{8,128}$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const planFile = () => process.env.INDEXNOW_PLAN_FILE || path.join(os.tmpdir(), 'indexnow-urls.json');
const localSitemap = () => path.join(config.paths.public, 'sitemap.xml');

/** Actions の実行画面に警告として出す（ログに埋もれて何週間も気付かない事故を防ぐ）。 */
function warn(message) {
  console.warn(`  · IndexNow: ${message}`);
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning title=IndexNow::${message.replace(/\r?\n/g, ' ')}`);
}

function validKey() {
  const key = config.site.indexNowKey;
  return key && VALID_KEY.test(key) ? key : '';
}

/** sitemap.xml を loc → lastmod の対応にする。 */
export function parseSitemap(xml) {
  const urls = new Map();
  for (const [, block] of String(xml ?? '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    urls.set(loc.replaceAll('&amp;', '&'), /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1] ?? '');
  }
  return urls;
}

/** 新しい sitemap のうち、URL が増えたか lastmod が変わったものだけを返す。 */
export function changedUrls(previousXml, currentXml) {
  const previous = parseSitemap(previousXml);
  return [...parseSitemap(currentXml)]
    .filter(([loc, lastmod]) => !previous.has(loc) || previous.get(loc) !== lastmod)
    .map(([loc]) => loc);
}

/** 公開中のファイルをキャッシュを避けて取得する。404 は null。 */
async function fetchLive(relPath, fetchImpl) {
  const res = await fetchImpl(`${config.site.url}/${relPath}?t=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 通知できる状態かを確かめる。できなければ理由を返す。 */
function skipReason() {
  if (!config.site.indexNowKey) return 'キー未設定のため通知しません（INDEXNOW_KEY）';
  if (!validKey()) return 'キーの形式が不正です（英数字・ハイフン、8〜128文字）';
  if (config.mock) return 'MOCKモードのため通知しません';
  // localhost を通知しても相手が到達できない。
  if (/localhost|127\.0\.0\.1/.test(config.site.url)) return 'ローカルURLのため通知しません';
  return '';
}

/** push 前に呼ぶ。公開中の sitemap と比べて、通知するURLを planFile() に書く。 */
export async function planIndexNow({ fetchImpl = fetch } = {}) {
  const reason = skipReason();
  if (reason) {
    console.log(`  · IndexNow: ${reason}`);
    return { skipped: reason };
  }

  const current = await fs.readFile(localSitemap(), 'utf8');
  let live;
  try {
    live = await fetchLive('sitemap.xml', fetchImpl);
  } catch (err) {
    // 公開中の状態が分からないまま全URLを送ると、毎日の大量通知に戻ってしまう。
    warn(`公開中の sitemap を取得できないため今回は通知しません（${err.message}）`);
    await fs.writeFile(planFile(), JSON.stringify({ urls: [] }), 'utf8');
    return { urls: [] };
  }

  // 初回公開（sitemap がまだ無い）なら全URLが新規になる。
  const urls = changedUrls(live ?? '', current).slice(0, MAX_URLS);
  await fs.writeFile(planFile(), JSON.stringify({ urls }), 'utf8');
  console.log(`  ✓ IndexNow: 通知予定 ${urls.length}件（公開中の sitemap との差分）`);
  return { urls };
}

/**
 * push 後に呼ぶ。公開中の sitemap が今回のものに追いつくのを待ち、
 * キーファイルが公開されていることを確かめてから、plan で決めたURLを通知する。
 * 通知は付加価値なので、失敗しても例外は投げず警告に留める。
 */
export async function sendIndexNow({ fetchImpl = fetch, waitMs = 10 * 60_000, intervalMs = 15_000, wait = sleep } = {}) {
  const reason = skipReason();
  if (reason) {
    console.log(`  · IndexNow: ${reason}`);
    return { skipped: reason };
  }

  let urls = [];
  try {
    ({ urls } = JSON.parse(await fs.readFile(planFile(), 'utf8')));
  } catch {
    // plan が無い＝今回は push していない、などの理由で通知対象が無い。
  }
  if (!urls.length) {
    console.log('  · IndexNow: 通知するURLはありません');
    return { skipped: 'no-urls' };
  }

  const current = await fs.readFile(localSitemap(), 'utf8');
  const deadline = Date.now() + waitMs;
  let deployed = false;
  for (;;) {
    try {
      deployed = changedUrls(await fetchLive('sitemap.xml', fetchImpl), current).length === 0;
    } catch {
      deployed = false;
    }
    if (deployed || Date.now() + intervalMs > deadline) break;
    await wait(intervalMs);
  }
  if (!deployed) {
    warn(`${Math.round(waitMs / 60_000)}分待っても新しい sitemap が公開されなかったため通知しません`);
    return { ok: false, skipped: 'not-deployed' };
  }

  const key = validKey();
  let liveKey = null;
  try {
    liveKey = await fetchLive(`${key}.txt`, fetchImpl);
  } catch {
    liveKey = null;
  }
  if (liveKey?.trim() !== key) {
    warn(`キーファイル ${config.site.url}/${key}.txt が公開されていないか内容が違います。static/${key}.txt に key だけを書いて置いてください`);
    return { ok: false, skipped: 'key-file' };
  }

  return pingIndexNow(urls, { fetchImpl });
}

export async function pingIndexNow(urls, { fetchImpl = fetch } = {}) {
  const key = validKey();
  const body = {
    host: new URL(config.site.url).host,
    key,
    keyLocation: `${config.site.url}/${key}.txt`,
    urlList: urls.slice(0, MAX_URLS),
  };

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    // 200/202 は受理。
    if (res.ok) {
      console.log(`  ✓ IndexNow: ${body.urlList.length}件のURLを通知`);
      return { ok: true, count: body.urlList.length };
    }
    // 拒否理由（例: UserForbiddedToAccessSite）は本文に入る。握りつぶさずに出す。
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    warn(`HTTP ${res.status} で拒否されました ${detail}`);
    return { ok: false, status: res.status, detail };
  } catch (err) {
    warn(`通知に失敗 ${err.message}`);
    return { ok: false, error: err.message };
  }
}
