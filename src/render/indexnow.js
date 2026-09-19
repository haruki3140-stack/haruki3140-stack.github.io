import { config } from '../config.js';

/**
 * IndexNow: 更新したURLを検索エンジンに直接通知する無料の仕組み。
 * Bing / Yandex / Naver などが対応していて、アカウント登録も審査も要らない。
 * sitemap のクロール待ち（数日〜数週間）を待たずに拾われる。
 *
 * 仕組み: 所有証明として <サイト>/<key>.txt に同じ key を置き、APIにURL一覧を投げる。
 * key ファイルは build() が自動生成するので、値がずれることはない。
 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** 1回の通知に含められるURLは1万件まで。実際にはそこまで増えない。 */
const MAX_URLS = 10_000;

export function indexNowKeyFile() {
  const key = config.site.indexNowKey;
  if (!key) return null;
  return { name: `${key}.txt`, content: key };
}

export async function pingIndexNow(urls) {
  const key = config.site.indexNowKey;

  if (!key) {
    console.log('  · IndexNow: キー未設定のため通知しません（INDEXNOW_KEY）');
    return { skipped: 'no-key' };
  }
  if (config.mock) {
    console.log('  · IndexNow: MOCKモードのため通知しません');
    return { skipped: 'mock' };
  }
  // localhost を通知しても相手が到達できない。
  if (/localhost|127\.0\.0\.1/.test(config.site.url)) {
    console.log('  · IndexNow: ローカルURLのため通知しません');
    return { skipped: 'local' };
  }

  const host = new URL(config.site.url).host;
  const body = {
    host,
    key,
    keyLocation: `${config.site.url}/${key}.txt`,
    urlList: urls.slice(0, MAX_URLS),
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    // 200/202 は受理。それ以外でもサイト生成は成功させる（通知は付加価値なので落とさない）。
    if (res.ok) {
      console.log(`  ✓ IndexNow: ${body.urlList.length}件のURLを通知`);
      return { ok: true, count: body.urlList.length };
    }
    console.warn(`  · IndexNow: HTTP ${res.status}（サイト生成は成功しています）`);
    return { ok: false, status: res.status };
  } catch (err) {
    console.warn(`  · IndexNow: 通知に失敗 ${err.message}（サイト生成は成功しています）`);
    return { ok: false, error: err.message };
  }
}
