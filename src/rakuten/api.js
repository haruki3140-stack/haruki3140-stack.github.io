import { call, ENDPOINTS } from './client.js';
import { config } from '../config.js';
import { mockRanking, mockSearch, mockGenre } from './mock.js';

/** 画像URLから楽天のサイズ指定サフィックス(_ex=128x128)を外し、指定幅に付け替える。 */
function sizedImage(url, px = 400) {
  if (!url) return '';
  return url.replace(/\?_ex=\d+x\d+$/, '') + `?_ex=${px}x${px}`;
}

/** API のレスポンス1件を、サイト側が使う一定の形に正規化する。 */
export function normalizeItem(raw, fallbackRank = null) {
  const image =
    (Array.isArray(raw.mediumImageUrls) ? raw.mediumImageUrls[0] : null) ||
    (Array.isArray(raw.smallImageUrls) ? raw.smallImageUrls[0] : null) ||
    '';
  const imageUrl = typeof image === 'string' ? image : image?.imageUrl || '';

  return {
    code: raw.itemCode || '',
    name: raw.itemName || '',
    price: Number(raw.itemPrice) || 0,
    // affiliateUrl は affiliateId を渡したときだけ返る。無ければ素のURLに落とす。
    url: raw.affiliateUrl || raw.itemUrl || '',
    isAffiliate: Boolean(raw.affiliateUrl),
    shopName: raw.shopName || '',
    shopCode: raw.shopCode || '',
    shopUrl: raw.shopAffiliateUrl || raw.shopUrl || '',
    reviewCount: Number(raw.reviewCount) || 0,
    reviewAverage: Number(raw.reviewAverage) || 0,
    image: sizedImage(imageUrl, 400),
    rank: Number(raw.rank) || fallbackRank,
    pointRate: Number(raw.pointRate) || 1,
    catchcopy: (raw.catchcopy || '').trim(),
    caption: (raw.itemCaption || '').trim(),
    genreId: String(raw.genreId ?? ''),
    availability: Number(raw.availability ?? 1),
    postageFlag: Number(raw.postageFlag ?? 1), // 0 = 送料込み
  };
}

/** 楽天市場ジャンル別ランキング（リアルタイム）。 */
export async function fetchRanking({ genreId = 0, period = 'realtime', age, sex, page = 1 } = {}) {
  const json = config.mock
    ? mockRanking({ genreId, page })
    : await call(ENDPOINTS.ranking, { genreId, period, age, sex, page });

  const items = (json.Items || []).map((it, i) => normalizeItem(it, (page - 1) * 30 + i + 1));
  return { items, genreId: String(genreId), period, fetchedAt: new Date().toISOString() };
}

/** キーワード検索。特集記事の素材集めに使う。 */
export async function fetchSearch({ keyword, genreId, hits = 30, page = 1, sort = '-reviewCount', minPrice, maxPrice } = {}) {
  const json = config.mock
    ? mockSearch({ keyword, hits })
    : await call(ENDPOINTS.search, { keyword, genreId, hits, page, sort, minPrice, maxPrice });

  return {
    items: (json.Items || []).map((it) => normalizeItem(it)),
    count: Number(json.count) || 0,
    keyword,
  };
}

/**
 * ジャンルツリーを1階層取得する。genres コマンドでマスタを作るのに使う。
 *
 * レスポンス形式はAPIのバージョンで変わっている:
 *   〜2026-04-01  { current, children:[{child:{genreId, genreName, genreLevel}}] }
 *   2026-07-01〜  { genre, children:[{genreId, nameJa, level}] }
 * 将来また変わっても落ちないよう、どちらの綴りも受ける。
 */
export async function fetchGenre(genreId = 0) {
  const json = config.mock ? mockGenre(genreId) : await call(ENDPOINTS.genre, { genreId });

  const pick = (raw) => {
    const g = raw?.child ?? raw;
    if (!g) return null;
    const name = g.nameJa ?? g.genreName ?? g.name;
    if (g.genreId === undefined || !name) return null;
    return { id: String(g.genreId), name, level: Number(g.level ?? g.genreLevel ?? 0) };
  };

  const currentRaw = json.genre ?? json.current;
  return {
    current: pick(Array.isArray(currentRaw) ? currentRaw[0] : currentRaw),
    // 名前やIDが欠けた要素は捨てる。1件の欠損で同期全体を落とさない。
    children: (json.children || []).map(pick).filter(Boolean),
  };
}
