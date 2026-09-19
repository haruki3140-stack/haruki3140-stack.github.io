import { loadGenres } from './genres.js';
import { loadSnapshot, findPreviousSnapshot, saveArticle, todayKey, pruneArticles } from './store.js';
import { diffSnapshots } from './diff.js';

const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;

/** 日付とジャンルから決まる整数（文面のバリエーション選択に使う）。 */
function variant(seed, len) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % len;
}

const LEAD_TEMPLATES = [
  (g, d) => `${d}時点の楽天市場「${g}」リアルタイムランキングをまとめました。前回集計からの順位の動きと価格の変化もあわせて掲載しています。`,
  (g, d) => `楽天市場の「${g}」ジャンルで、${d}現在よく売れている商品を上位から並べました。値下がりした商品は別枠で抜き出しています。`,
  (g, d) => `${d}の「${g}」ランキングです。順位だけでなく「前回から何位上がったか」「いくら下がったか」を記録しているので、買い時の判断材料に使えます。`,
];

function describeTop(items) {
  const top = items[0];
  if (!top) return '';
  const review = top.reviewCount > 0 ? `レビュー${top.reviewCount.toLocaleString('ja-JP')}件・平均${top.reviewAverage}` : 'レビューはまだ少なめ';
  return `1位は「${top.name}」（${yen(top.price)}／${top.shopName}）。${review}です。`;
}

function buildTitle(genreName, date, diff) {
  const d = date.replaceAll('-', '/');
  if (diff.priceDrops.length >= 3) return `【${d}】楽天「${genreName}」ランキングTOP20｜値下がり${diff.priceDrops.length}商品あり`;
  if (diff.risers.length >= 3) return `【${d}】楽天「${genreName}」ランキングTOP20｜急上昇${diff.risers.length}商品`;
  return `【${d}】楽天「${genreName}」売れ筋ランキングTOP20`;
}

function buildDescription(genreName, date, items, diff) {
  const parts = [`${date.replaceAll('-', '/')}時点の楽天市場「${genreName}」売れ筋ランキング上位${items.length}商品。`];
  if (diff.hasComparison) parts.push(`前回比で順位が上がった商品${diff.risers.length}件、値下がり${diff.priceDrops.length}件を掲載。`);
  return parts.join('').slice(0, 160);
}

/** 1ジャンル分の記事データを組み立てる。 */
export function composeArticle({ snapshot, previous }) {
  const diff = diffSnapshots(snapshot, previous);
  const items = snapshot.items;
  const dateLabel = snapshot.date.replaceAll('-', '/');
  const v = variant(`${snapshot.date}:${snapshot.genreSlug}`, LEAD_TEMPLATES.length);

  const lead = [LEAD_TEMPLATES[v](snapshot.genreName, dateLabel), describeTop(items)].filter(Boolean);

  const sections = [];

  if (diff.priceDrops.length) {
    sections.push({
      type: 'pricedrop',
      heading: `前回集計から値下がりした商品（${diff.priceDrops.length}件）`,
      note: `${diff.comparedTo?.replaceAll('-', '/') ?? '前回'}の価格との比較です。価格は変動するため、最終的な金額は商品ページでご確認ください。`,
      items: diff.priceDrops,
    });
  }

  if (diff.risers.length) {
    sections.push({
      type: 'riser',
      heading: `順位を上げた商品（${diff.risers.length}件）`,
      note: '前回のランキングからの上昇幅が大きい順に並べています。',
      items: diff.risers,
    });
  }

  if (diff.newcomers.length && diff.hasComparison) {
    sections.push({
      type: 'newcomer',
      heading: `新しくランクインした商品（${diff.newcomers.length}件）`,
      note: '前回のTOP圏内には無かった商品です。',
      items: diff.newcomers,
    });
  }

  sections.push({
    type: 'ranking',
    heading: `「${snapshot.genreName}」ランキング TOP${items.length}`,
    note: null,
    items,
  });

  return {
    id: `${snapshot.date}-${snapshot.genreSlug}`,
    date: snapshot.date,
    genreId: snapshot.genreId,
    genreSlug: snapshot.genreSlug,
    genreName: snapshot.genreName,
    title: buildTitle(snapshot.genreName, snapshot.date, diff),
    description: buildDescription(snapshot.genreName, snapshot.date, items, diff),
    lead,
    sections,
    diff: {
      comparedTo: diff.comparedTo,
      riserCount: diff.risers.length,
      priceDropCount: diff.priceDrops.length,
      newcomerCount: diff.newcomers.length,
    },
    itemCount: items.length,
    updatedAt: new Date().toISOString(),
  };
}

/** 当日のスナップショット全件を記事化する。 */
export async function compose({ date = todayKey() } = {}) {
  const genres = await loadGenres();
  const articles = [];

  console.log(`■ 記事生成 (${date})`);
  for (const genre of genres) {
    const snapshot = await loadSnapshot(date, genre.slug);
    if (!snapshot) {
      console.warn(`  - ${genre.name}: スナップショット無し（スキップ）`);
      continue;
    }
    const prev = await findPreviousSnapshot(date, genre.slug, { mock: snapshot.mock });
    const article = composeArticle({ snapshot, previous: prev?.snapshot ?? null });
    await saveArticle(article);
    articles.push(article);
    const badge = article.diff.comparedTo ? `↑${article.diff.riserCount} ↓${article.diff.priceDropCount}円 新${article.diff.newcomerCount}` : '初回';
    console.log(`  ✓ ${article.title}  [${badge}]`);
  }

  const removed = await pruneArticles();
  if (removed.length) console.log(`  … 古い記事 ${removed.length}件を削除`);

  return articles;
}
