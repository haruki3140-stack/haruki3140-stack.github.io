import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { fetchGenre } from '../rakuten/api.js';

const FILE = path.join(config.paths.config, 'genres.json');

/** 日本語ジャンル名から URL に使える slug を作る。重複は連番で解決。 */
function toSlug(id, name, used) {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let base = ascii && ascii.length >= 2 ? ascii : `genre-${id}`;
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

export async function loadGenres() {
  const json = JSON.parse(await fs.readFile(FILE, 'utf8'));
  return json.genres.filter((g) => g.enabled !== false);
}

/**
 * 楽天のジャンルツリー直下（レベル1）を取得して config/genres.json を更新する。
 * 既存の enabled / slug は引き継ぐので、無効化した設定は消えない。
 */
export async function syncGenres() {
  const existing = JSON.parse(await fs.readFile(FILE, 'utf8'));
  const prev = new Map(existing.genres.map((g) => [g.id, g]));

  const { children } = await fetchGenre(0);
  const used = new Set();
  const genres = [{ id: '0', slug: 'all', name: '総合', enabled: prev.get('0')?.enabled ?? true }];
  used.add('all');

  for (const child of children) {
    const before = prev.get(child.id);
    genres.push({
      id: child.id,
      slug: before?.slug ?? toSlug(child.id, child.name, used),
      name: child.name, // 名称は常に API を正とする
      enabled: before?.enabled ?? true,
    });
    if (before?.slug) used.add(before.slug);
  }

  const out = {
    _note: existing._note,
    _updatedAt: new Date().toISOString(),
    genres,
  };
  await fs.writeFile(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return genres;
}
