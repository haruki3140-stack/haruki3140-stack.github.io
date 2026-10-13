import { loadGenres } from './genres.js';
import { loadSnapshot, findPreviousSnapshot, saveArticle, todayKey, pruneArticles } from './store.js';
import { diffSnapshots } from './diff.js';
import { rankingCoverage, sortRankingItems } from './ranking.js';

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
  return `${top.rank}位は「${top.name}」（${yen(top.price)}／${top.shopName}）。${review}です。`;
}

function rankingLabel(coverage) {
  if (coverage.completeTop) return `TOP${coverage.count}`;
  if (coverage.minRank !== null) {
    const range = coverage.minRank === coverage.maxRank
      ? `${coverage.minRank}位`
      : `${coverage.minRank}〜${coverage.maxRank}位`;
    return `記録（${range}）`;
  }
  return '記録';
}

function correctionNotice(coverage, items, selection, limit) {
  if (!coverage.count) return '';
  const endRank = selection ? Math.max(coverage.maxRank, limit || coverage.maxRank) : coverage.maxRank;
  const present = new Set(items.map((item) => Number(item.rank)));
  const missing = Array.from({ length: endRank }, (_, index) => index + 1)
    .filter((rank) => !present.has(rank));
  if (!missing.length) return '';
  const ranges = [];
  for (let index = 0; index < missing.length; index += 1) {
    const start = missing[index];
    let end = start;
    while (missing[index + 1] === end + 1) end = missing[++index];
    ranges.push(start === end ? `${start}位` : `${start}〜${end}位`);
  }
  const missingTop = `${ranges.join('、')}のデータは${selection ? '取得できませんでした' : '保存されていません'}。`;
  const range = coverage.minRank === coverage.maxRank
    ? `${coverage.minRank}位`
    : `${coverage.minRank}〜${coverage.maxRank}位`;
  const ending = selection
    ? '取得できた商品だけを掲載し、欠測した順位を補完していません。'
    : '上位ランキングとしての表記を訂正し、記録に残っている商品だけを掲載しています。';
  return `${selection ? '取得データの注意' : '訂正'}：この日の記録は${range}の${coverage.count}商品です。${missingTop}${ending}`;
}

function buildTitle(genreName, date, diff, coverage) {
  const d = date.replaceAll('-', '/');
  const label = rankingLabel(coverage);
  if (diff.priceDropCount >= 3) return `【${d}】楽天「${genreName}」ランキング${label}｜値下がり${diff.priceDropCount}商品あり`;
  if (diff.riserCount >= 3) return `【${d}】楽天「${genreName}」ランキング${label}｜急上昇${diff.riserCount}商品`;
  return `【${d}】楽天「${genreName}」売れ筋ランキング${label}`;
}

function buildDescription(genreName, date, coverage, diff) {
  const range = coverage.completeTop ? `上位${coverage.count}商品` : `${rankingLabel(coverage)}の${coverage.count}商品`;
  const parts = [`${date.replaceAll('-', '/')}時点の楽天市場「${genreName}」売れ筋ランキング${range}。`];
  if (diff.comparedTo) parts.push(`前回比で順位が上がった商品${diff.riserCount}件、値下がり${diff.priceDropCount}件を掲載。`);
  return parts.join('').slice(0, 160);
}

/** 過去の保存商品を維持し、実順位に合う表記と表示順へ訂正する。 */
export function correctArticleRanking(article) {
  const ranking = article.sections.find((section) => section.type === 'ranking');
  if (!ranking) return article;
  const items = sortRankingItems(ranking.items);
  const coverage = rankingCoverage(items);
  const dateLabel = article.date.replaceAll('-', '/');
  const v = variant(`${article.date}:${article.genreSlug}`, LEAD_TEMPLATES.length);
  const introduction = coverage.completeTop
    ? LEAD_TEMPLATES[v](article.genreName, dateLabel)
    : `${dateLabel}時点の楽天市場「${article.genreName}」で記録に残っている商品を、実際の順位順に掲載しています。`;
  const lead = [
    introduction, describeTop(items),
    correctionNotice(coverage, items, article.rankingSelection, article.rankingLimit),
  ].filter(Boolean);
  if (article.comparisonNotice) lead.push(article.comparisonNotice);

  return {
    ...article,
    title: buildTitle(article.genreName, article.date, article.diff, coverage),
    description: buildDescription(article.genreName, article.date, coverage, article.diff),
    lead,
    rankingCoverage: coverage,
    sections: article.sections.map((section) => {
      if (section.type === 'ranking') {
        return { ...section, heading: `「${article.genreName}」ランキング ${rankingLabel(coverage)}`, items };
      }
      if (section.type === 'newcomer') {
        return { ...section, note: '前回の記録に含まれていなかった商品です。' };
      }
      return section;
    }),
  };
}

/** 1ジャンル分の記事データを組み立てる。 */
export function composeArticle({ snapshot, previous }) {
  const items = sortRankingItems(snapshot.items);
  const coverage = rankingCoverage(items);
  // 修正前の11〜30位と修正後のTOP20では、新規ランクインなどを比較できない。
  const ranks = items.map((item) => Number(item.rank)).join(',');
  const previousRanks = previous ? sortRankingItems(previous.items).map((item) => Number(item.rank)).join(',') : null;
  const changedCoverage = previousRanks !== null && ranks !== previousRanks;
  const diff = diffSnapshots({ ...snapshot, items }, changedCoverage ? null : previous);

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
      note: '前回の記録に含まれていなかった商品です。',
      items: diff.newcomers,
    });
  }

  sections.push({
    type: 'ranking',
    heading: `「${snapshot.genreName}」ランキング ${rankingLabel(coverage)}`,
    note: null,
    items,
  });

  return correctArticleRanking({
    id: `${snapshot.date}-${snapshot.genreSlug}`,
    date: snapshot.date,
    genreId: snapshot.genreId,
    genreSlug: snapshot.genreSlug,
    genreName: snapshot.genreName,
    // 本番ビルドに試験用の記事を混ぜないため、記事側にも取得モードを残す。
    mock: Boolean(snapshot.mock),
    rankingSelection: snapshot.rankingSelection || '',
    rankingLimit: snapshot.rankingLimit || items.length,
    comparisonNotice: changedCoverage
      ? '今回から取得順位の範囲を訂正したため、前回との比較は掲載していません。同じ取得範囲の記録がそろった次回から比較を再開します。'
      : '',
    sections,
    diff: {
      comparedTo: diff.comparedTo,
      riserCount: diff.risers.length,
      priceDropCount: diff.priceDrops.length,
      newcomerCount: diff.hasComparison ? diff.newcomers.length : 0,
    },
    itemCount: items.length,
    updatedAt: new Date().toISOString(),
  });
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
