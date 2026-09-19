/**
 * 一時的な切り分け用スクリプト。
 * 認証情報の渡し方とリファラの送り方の組み合わせを総当たりし、
 * どれが通るかを1回の実行で特定する。原因が分かったら削除する。
 * 値そのものは絶対に出力しない。
 */
const APP_ID = process.env.RAKUTEN_APPLICATION_ID ?? '';
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY ?? '';
const SITE = 'https://haruki3140-stack.github.io';
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';

function url({ keyInQuery }) {
  const u = new URL(ENDPOINT);
  u.searchParams.set('applicationId', APP_ID);
  if (keyInQuery) u.searchParams.set('accessKey', ACCESS_KEY);
  u.searchParams.set('format', 'json');
  u.searchParams.set('formatVersion', '2');
  u.searchParams.set('genreId', '0');
  return u;
}

const CASES = [
  { name: 'A: key=query,  Referer=末尾スラッシュあり', keyInQuery: true, keyInHeader: false, referer: `${SITE}/` },
  { name: 'B: key=query,  Referer=末尾スラッシュなし', keyInQuery: true, keyInHeader: false, referer: SITE },
  { name: 'C: key=header, Referer=末尾スラッシュあり', keyInQuery: false, keyInHeader: true, referer: `${SITE}/` },
  { name: 'D: key=両方,   Referer=末尾スラッシュあり', keyInQuery: true, keyInHeader: true, referer: `${SITE}/` },
  { name: 'E: key=query,  Referer + Origin 両方', keyInQuery: true, keyInHeader: false, referer: `${SITE}/`, origin: SITE },
  { name: 'F: key=query,  Referer なし', keyInQuery: true, keyInHeader: false, referer: null },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const c of CASES) {
  const headers = { 'User-Agent': 'rakuten-affiliate-auto/1.0' };
  if (c.keyInHeader) headers.accessKey = ACCESS_KEY;
  if (c.referer) headers.Referer = c.referer;
  if (c.origin) headers.Origin = c.origin;

  try {
    const res = await fetch(url(c), { headers });
    const text = await res.text();
    let detail = '';
    try {
      const j = JSON.parse(text);
      detail = j.errors?.errorMessage ?? `件数=${(j.Items || []).length}`;
    } catch {
      detail = text.slice(0, 80);
    }
    console.log(`${res.ok ? '✓' : '×'} ${c.name}  →  HTTP ${res.status}  ${detail}`);
  } catch (err) {
    console.log(`× ${c.name}  →  通信失敗 ${err.message}`);
  }
  await sleep(1200); // レート制限を踏まないよう間隔を空ける
}
