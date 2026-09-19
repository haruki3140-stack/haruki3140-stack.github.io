import { config } from '../config.js';
import { layout, esc, jpDate, yen, affiliateLink } from './html.js';
import { priceChart } from './chart.js';

const BASE = config.site.url;

export const historyUrl = (slug) => `${BASE}/p/${slug}/`;
const genreUrl = (slug) => `${BASE}/g/${slug}/`;

function crumb(parts) {
  const html = parts
    .map((p, i) => (p.url && i < parts.length - 1 ? `<a href="${esc(p.url)}">${esc(p.label)}</a>` : esc(p.label)))
    .join(' &rsaquo; ');
  return `<p class="meta">${html}</p>`;
}

/**
 * 商品ごとの価格推移ページ。
 *
 * ランキング記事はどうしても他サイトと内容が似るが、このページは毎日記録し続けた
 * 者にしか作れない。「商品名 価格推移」「商品名 最安値」のような指名検索は
 * 競合が少なく、購入を検討している段階の訪問者が来る。
 */
export function renderHistoryPage(h, genres) {
  const { item, stats, points } = h;
  const period = `${jpDate(points[0].date)}〜${jpDate(points.at(-1).date)}`;

  const verdict = stats.isLowestNow
    ? '現在の価格は、当サイトが記録している期間の<strong>最安値と同じ</strong>です。'
    : `現在の価格は、記録上の最安値より<strong>${esc(yen(stats.diffFromMin))}高い</strong>状態です（最安値は${esc(jpDate(stats.lowestDate))}の${esc(yen(stats.min))}）。`;

  const rows = [...points]
    .reverse()
    .map((p) => {
      const isMin = p.price === stats.min;
      return `<li class="item">
  <div class="body">
    <p class="name">${esc(jpDate(p.date))}${isMin ? '　<span class="tag down">最安</span>' : ''}</p>
    <p class="price">${esc(yen(p.price))}</p>
    ${p.rank ? `<p class="shop">ランキング ${p.rank}位</p>` : ''}
  </div>
</li>`;
    })
    .join('\n');

  const body = `
<h1>${esc(item.name)}の価格推移</h1>
<p class="meta">${esc(period)}　/　${points.length}日分の記録　/　${esc(h.genres.join('、'))}</p>

<div class="verdict"><p>${verdict}</p></div>

<ul class="stats">
  <li><span class="k">現在の価格</span><span class="v">${esc(yen(stats.current))}</span></li>
  <li><span class="k">記録上の最安値</span><span class="v low">${esc(yen(stats.min))}</span></li>
  <li><span class="k">記録上の最高値</span><span class="v">${esc(yen(stats.max))}</span></li>
  <li><span class="k">平均</span><span class="v">${esc(yen(stats.average))}</span></li>
</ul>

${priceChart(points)}

<p>${affiliateLink(item.url, '楽天市場で現在の価格を見る', 'buy')}</p>
<p class="note">グラフは当サイトが毎日記録した値です。価格・在庫・ポイント倍率は変動するため、購入前に必ず商品ページで最新の情報をご確認ください。</p>

<section>
  <h2>日別の記録</h2>
  <ul class="list">${rows}</ul>
</section>

<section>
  <h2>ジャンル別のランキング</h2>
  <ul class="chips">${genres.map((g) => `<li><a href="${esc(genreUrl(g.slug))}">${esc(g.name)}</a></li>`).join('')}</ul>
</section>`;

  return layout({
    title: `${item.name.slice(0, 40)}の価格推移`,
    description: `${item.name.slice(0, 50)}の価格推移を${points.length}日分記録。最安値は${jpDate(stats.lowestDate)}の${yen(stats.min)}、現在は${yen(stats.current)}です。`,
    canonical: historyUrl(h.slug),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: item.name,
      image: item.image || undefined,
      offers: {
        '@type': 'Offer',
        price: stats.current,
        priceCurrency: 'JPY',
        url: item.url,
        availability: item.availability === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    },
    breadcrumb: crumb([
      { label: 'ホーム', url: `${BASE}/` },
      { label: '価格推移', url: `${BASE}/p/` },
      { label: item.name.slice(0, 20) },
    ]),
    body,
  });
}

export function renderHistoryIndex(histories) {
  const cards = histories
    .slice(0, 200)
    .map(
      (h) => `<li class="card">
  <h3><a href="${esc(historyUrl(h.slug))}">${esc(h.item.name.slice(0, 60))}</a></h3>
  <p class="sub">${esc(yen(h.stats.current))}　/　最安 ${esc(yen(h.stats.min))}　/　${h.points.length}日分${h.stats.isLowestNow ? '　/　<strong>いまが最安</strong>' : ''}</p>
</li>`,
    )
    .join('\n');

  const body = `
<h1>価格推移を記録している商品</h1>
<p class="meta">${histories.length}商品　/　3日以上の記録があり、実際に価格が動いた商品だけを掲載しています。</p>
${histories.length ? `<ul class="grid">${cards}</ul>` : '<p class="empty">まだ十分なデータがありません。数日分の記録が貯まると表示されます。</p>'}`;

  return layout({
    title: '価格推移を記録している商品',
    description: '毎日記録した楽天市場の商品価格の推移。最安値がいつだったか、いまが買い時かを確認できます。',
    canonical: `${BASE}/p/`,
    breadcrumb: crumb([{ label: 'ホーム', url: `${BASE}/` }, { label: '価格推移' }]),
    body,
  });
}
