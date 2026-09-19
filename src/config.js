import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** .env を process.env に読み込む（既存の環境変数を優先＝CI のシークレットが勝つ）。 */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(val)) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const env = (key, fallback = '') => (process.env[key] ?? '').trim() || fallback;

const applicationId = env('RAKUTEN_APPLICATION_ID');
const accessKey = env('RAKUTEN_ACCESS_KEY');
const affiliateId = env('RAKUTEN_AFFILIATE_ID');

export const config = {
  rakuten: {
    applicationId,
    accessKey,
    affiliateId,
    // 楽天ウェブサービスは短時間の連続アクセスを制限する。1 リクエスト/秒を上限に置く。
    minIntervalMs: Number(env('RAKUTEN_MIN_INTERVAL_MS', '1100')),
    maxRetries: Number(env('RAKUTEN_MAX_RETRIES', '4')),
  },
  site: {
    url: env('SITE_URL', 'http://localhost:4173').replace(/\/+$/, ''),
    name: env('SITE_NAME', '楽天ランキング速報'),
    description: env('SITE_DESCRIPTION', '楽天市場のランキングを毎日自動集計しています。'),
    author: env('SITE_AUTHOR', ''),
  },
  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    snapshots: path.join(ROOT, 'data', 'snapshots'),
    articles: path.join(ROOT, 'data', 'articles'),
    config: path.join(ROOT, 'config'),
    public: path.join(ROOT, 'public'),
  },
  /** 認証情報が無い / MOCK=1 のときはモックデータで動作する。 */
  mock: env('MOCK') === '1' || !applicationId || !accessKey,
};

/** 起動条件を検査し、人が読める問題リストを返す。 */
export function diagnose() {
  const issues = [];
  if (!applicationId) issues.push({ level: 'error', key: 'RAKUTEN_APPLICATION_ID', msg: '楽天ウェブサービスのアプリケーションIDが未設定です。' });
  if (!accessKey) issues.push({ level: 'error', key: 'RAKUTEN_ACCESS_KEY', msg: '楽天ウェブサービスのアクセスキーが未設定です（2026-07-01版APIから必須）。' });
  if (!affiliateId) issues.push({ level: 'error', key: 'RAKUTEN_AFFILIATE_ID', msg: 'アフィリエイトIDが未設定です。リンクが非アフィリエイトURLになり、1円も発生しません。' });
  if (!config.site.url || config.site.url.includes('example')) issues.push({ level: 'warn', key: 'SITE_URL', msg: '公開URLが既定値のままです。sitemap と RSS の絶対URLが誤ります。' });
  // SITE_URL は Referer としてそのまま送られ、アプリ登録時の Allowed websites と
  // 照合される。localhost のまま本番APIを叩くと、認証は通っていても全件弾かれる。
  if (!config.mock && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(config.site.url)) {
    issues.push({ level: 'error', key: 'SITE_URL', msg: 'localhost のままです。この値が Referer として送られるため、楽天のアプリ登録で許可したドメインと一致せず拒否されます。' });
  }
  return issues;
}
