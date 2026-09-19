import { esc, yen, affiliateLink } from './html.js';

function tags(item, type) {
  const out = [];
  if (type === 'pricedrop' && item.priceDelta) {
    out.push(`<span class="tag down">${yen(item.priceDelta)}値下がり（-${item.priceDeltaPct}%）</span>`);
  }
  if (type === 'riser' && item.rankDelta > 0) {
    out.push(`<span class="tag up">${item.previousRank}位 → ${item.rank}位（${item.rankDelta}ランクUP）</span>`);
  }
  if (type === 'newcomer') out.push('<span class="tag new">新規ランクイン</span>');
  if (item.reviewCount > 0) {
    out.push(`<span class="tag">★${item.reviewAverage}（${item.reviewCount.toLocaleString('ja-JP')}件）</span>`);
  }
  if (item.postageFlag === 0) out.push('<span class="tag">送料込み</span>');
  if (item.pointRate > 1) out.push(`<span class="tag">ポイント${item.pointRate}倍</span>`);
  if (item.availability === 0) out.push('<span class="tag">在庫なし</span>');
  return out.length ? `<div class="tags">${out.join('')}</div>` : '';
}

export function renderItem(item, { type = 'ranking', showRank = true } = {}) {
  const rankBadge = showRank && item.rank
    ? `<div class="rank${type === 'ranking' ? '' : ' plain'}">${item.rank}</div>`
    : '';
  const img = item.image
    ? `<img src="${esc(item.image)}" alt="" loading="lazy" decoding="async" width="88" height="88">`
    : '';
  const was = item.previousPrice ? `<span class="was">${yen(item.previousPrice)}</span>` : '';

  return `<li class="item">
  ${rankBadge}
  ${img}
  <div class="body">
    <p class="name">${affiliateLink(item.url, item.name)}</p>
    <p class="shop">${esc(item.shopName)}</p>
    <p class="price">${yen(item.price)}${was}</p>
    ${tags(item, type)}
    ${affiliateLink(item.url, '楽天市場で見る', 'buy')}
  </div>
</li>`;
}

export function renderSection(section) {
  const note = section.note ? `<p class="note">${esc(section.note)}</p>` : '';
  const items = section.items.map((it) => renderItem(it, { type: section.type })).join('\n');
  return `<section>
  <h2>${esc(section.heading)}</h2>
  ${note}
  <ul class="list">${items}</ul>
</section>`;
}
