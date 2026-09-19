import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const JAPAN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** GitHub Actions の実行時刻ではなく、サイトの基準である日本時間の日付を返す。 */
export function todayKey(d = new Date()) {
  const parts = Object.fromEntries(
    JAPAN_DATE.formatToParts(d)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  // 読み手が書き込み途中のJSONを拾わないよう、同じディレクトリで完成させてから置換する。
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await fs.rename(temp, file);
  } catch (err) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw err;
  }
}

const snapshotFile = (date, slug) => path.join(config.paths.snapshots, date, `${slug}.json`);

export async function saveSnapshot(date, slug, payload) {
  await writeJson(snapshotFile(date, slug), payload);
}

export async function loadSnapshot(date, slug) {
  return readJson(snapshotFile(date, slug));
}

/** スナップショットが存在する日付を新しい順に返す。 */
export async function listSnapshotDates() {
  try {
    const dirs = await fs.readdir(config.paths.snapshots);
    return dirs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * 指定日より前で、そのジャンルの直近スナップショットを探す（欠測日があっても遡れる）。
 * モックで作ったスナップショットと実データを混ぜると、存在しない値下がり記事ができるので、
 * 取得モードが一致するものだけを比較対象にする。
 */
export async function findPreviousSnapshot(date, slug, { mock } = {}) {
  for (const d of await listSnapshotDates()) {
    if (d >= date) continue;
    const snap = await loadSnapshot(d, slug);
    if (!snap) continue;
    if (mock !== undefined && Boolean(snap.mock) !== Boolean(mock)) continue;
    return { date: d, snapshot: snap };
  }
  return null;
}

/** 古いスナップショットを削除してリポジトリの肥大化を防ぐ。 */
export async function pruneSnapshots(keepDays = 45) {
  const dates = await listSnapshotDates();
  const stale = dates.slice(keepDays);
  for (const d of stale) {
    await fs.rm(path.join(config.paths.snapshots, d), { recursive: true, force: true });
  }
  return stale;
}

export async function saveArticle(article) {
  await writeJson(path.join(config.paths.articles, `${article.id}.json`), article);
}

export async function loadArticles() {
  try {
    const files = await fs.readdir(config.paths.articles);
    const articles = await Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(config.paths.articles, f))),
    );
    return articles.filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.genreSlug.localeCompare(b.genreSlug)));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** 記事も一定数で打ち止めにする（サイトマップと生成時間を抑える）。 */
export async function pruneArticles(keepDays = 45) {
  const articles = await loadArticles();
  const dates = [...new Set(articles.map((a) => a.date))].sort().reverse();
  const keep = new Set(dates.slice(0, keepDays));
  const removed = [];
  for (const a of articles) {
    if (keep.has(a.date)) continue;
    await fs.rm(path.join(config.paths.articles, `${a.id}.json`), { force: true });
    removed.push(a.id);
  }
  return removed;
}
