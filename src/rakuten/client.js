import { config } from '../config.js';

const BASE = 'https://openapi.rakuten.co.jp';

export const ENDPOINTS = {
  ranking: `${BASE}/ichibaranking/api/IchibaItem/Ranking/20220601`,
  search: `${BASE}/ichibams/api/IchibaItem/Search/20260701`,
  genre: `${BASE}/ichibagt/api/IchibaGenre/Search/20260401`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCallAt = 0;
/** 楽天の連続アクセス制限を踏まないよう、呼び出し間隔を直列に空ける。 */
async function throttle() {
  const wait = config.rakuten.minIntervalMs - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export class RakutenError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'RakutenError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function buildUrl(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set('applicationId', config.rakuten.applicationId);
  url.searchParams.set('accessKey', config.rakuten.accessKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');
  if (config.rakuten.affiliateId) url.searchParams.set('affiliateId', config.rakuten.affiliateId);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

/** 秘匿値を伏せた URL（ログ用）。 */
function redact(url) {
  const u = new URL(url);
  for (const k of ['applicationId', 'accessKey', 'affiliateId']) {
    if (u.searchParams.has(k)) u.searchParams.set(k, '***');
  }
  return u.toString();
}

/**
 * 楽天ウェブサービスを1回叩く。429 / 5xx / ネットワーク断は指数バックオフで再試行する。
 */
export async function call(endpoint, params = {}) {
  const url = buildUrl(endpoint, params);
  const safeUrl = redact(url);
  let lastErr;

  for (let attempt = 0; attempt <= config.rakuten.maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(30_000, 2 ** attempt * 1000) + Math.random() * 500;
      console.warn(`  ↻ 再試行 ${attempt}/${config.rakuten.maxRetries} (${Math.round(backoff)}ms待機) ${safeUrl}`);
      await sleep(backoff);
    }
    await throttle();

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'rakuten-affiliate-auto/1.0',
          // アプリを「Web Application」種別で登録すると、リファラのドメインで
          // アクセス可否が判定される。Node の fetch は Referer を自動で付けないため、
          // 登録した公開URLを明示的に送る。ここが欠けると全リクエストが弾かれる。
          Referer: `${config.site.url}/`,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastErr = new RakutenError(`通信に失敗しました: ${err.message}`, { url: safeUrl });
      continue;
    }

    const text = await res.text();

    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new RakutenError('レスポンスがJSONとして解釈できません。', { status: res.status, url: safeUrl, body: text.slice(0, 500) });
      }
    }

    // 400 系のうち 429 以外は再試行しても直らない（IDが違う・パラメータ不正など）。
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new RakutenError(describeClientError(res.status, text), { status: res.status, url: safeUrl, body: text.slice(0, 500) });
    }
    lastErr = new RakutenError(`HTTP ${res.status}`, { status: res.status, url: safeUrl, body: text.slice(0, 500) });
  }

  throw lastErr;
}

function describeClientError(status, body) {
  if (status === 400) return 'HTTP 400: リクエストパラメータが不正です（genreId や keyword を確認してください）。';
  if (status === 401 || status === 403) {
    return `HTTP ${status}: 認証に失敗しました。RAKUTEN_APPLICATION_ID と RAKUTEN_ACCESS_KEY の組み合わせを確認してください。`;
  }
  if (status === 404) return 'HTTP 404: エンドポイントが存在しません（APIのバージョン変更の可能性）。';
  return `HTTP ${status}: ${String(body).slice(0, 200)}`;
}
