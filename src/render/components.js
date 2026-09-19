import { esc, yen, affiliateLink, safeHttpUrl } from './html.js';
import { config } from '../config.js';
import { historySlug } from '../pipeline/history.js';

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

/**
 * その商品の価格推移ページが存在するときだけリンクする。
 * 内部リンクが無いとクロールされにくく、せっかく作ったページが検索に載らない。
 */
function historyLink(item, historySlugs) {
  if (!historySlugs || !item.code) return '';
  const slug = historySlug(item.code);
  if (!historySlugs.has(slug)) return '';
  return `<a class="hist-link" href="${esc(config.site.url)}/p/${esc(slug)}/">この商品の価格推移を見る →</a>`;
}

export function renderItem(item, { type = 'ranking', showRank = true, historySlugs = null } = {}) {
  const rankBadge = showRank && item.rank
    ? `<div class="rank${type === 'ranking' ? '' : ' plain'}">${item.rank}</div>`
    : '';
  const image = safeHttpUrl(item.image);
  const img = image
    ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" width="88" height="88">`
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
    ${historyLink(item, historySlugs)}
  </div>
</li>`;
}

export function renderSection(section, { historySlugs = null } = {}) {
  const note = section.note ? `<p class="note">${esc(section.note)}</p>` : '';
  const items = section.items.map((it) => renderItem(it, { type: section.type, historySlugs })).join('\n');
  return `<section>
  <h2>${esc(section.heading)}</h2>
  ${note}
  <ul class="list">${items}</ul>
</section>`;
}
