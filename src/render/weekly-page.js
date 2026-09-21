import { config } from '../config.js';
import { esc, jpDate, layout } from './html.js';
import { renderItem } from './components.js';

export const weeklyUrl = () => `${config.site.url}/weekly/`;

function weeklyJsonLd(report) {
  const items = [...report.priceDrops, ...report.risers]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code) === index)
    .slice(0, 20);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '楽天市場 直近7日間の値下がり・急上昇まとめ',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function renderWeeklyPage(report) {
  if (!report) {
    return layout({
      title: '直近7日間の値下がり・急上昇まとめ',
      description: '楽天市場ランキングの週間変動を準備しています。',
      canonical: weeklyUrl(),
      robots: 'noindex,follow',
      breadcrumb: '<p class="meta"><a href="/">ホーム</a> &rsaquo; 週間レポート</p>',
      body: `
<h1>直近7日間の値下がり・急上昇まとめ</h1>
<div class="lead"><p>正確な比較には2日分以上の記録が必要です。データがたまり次第、自動で公開します。</p></div>
<p class="empty">現在、集計データを準備しています。</p>`,
    });
  }

  const range = `${jpDate(report.startDate)}〜${jpDate(report.endDate)}`;
  const priceSection = report.priceDrops.length
    ? `<ul class="list">${report.priceDrops.map((item) => renderItem(item, { type: 'pricedrop', showRank: false })).join('')}</ul>`
    : '<p class="empty">期間内に確認できた値下がり商品はありませんでした。</p>';
  const riserSection = report.risers.length
    ? `<ul class="list">${report.risers.map((item) => renderItem(item, { type: 'riser' })).join('')}</ul>`
    : '<p class="empty">期間内に確認できた急上昇商品はありませんでした。</p>';

  const body = `
<h1>楽天市場 直近7日間の値下がり・急上昇まとめ</h1>
<p class="meta">集計期間：${esc(range)}　/　実集計${report.observedDays}日分</p>
<div class="lead">
  <p>楽天市場のランキング記録を比較し、期間中に価格が下がった商品と順位を上げた商品を抽出しました。実際の使用レビューではなく、取得した価格・順位データに基づく買い物の判断材料です。</p>
</div>
<section>
  <h2>期間中の値下がり商品</h2>
  <p class="note">期間内の最初と最後の記録価格を比較し、値下がり率が大きい順に最大12件掲載しています。</p>
  ${priceSection}
</section>
<section>
  <h2>期間中に順位を上げた商品</h2>
  <p class="note">同じジャンル内で期間最初の記録より順位が上がった商品を、上昇幅の大きい順に最大12件掲載しています。</p>
  ${riserSection}
</section>
<section>
  <h2>データの見方</h2>
  <ul>
    <li>価格・順位は毎朝の取得時点の記録です。</li>
    <li>欠測日がある場合は、実際に取得できた日だけで比較します。</li>
    <li>クーポン、送料、ポイント条件などで実質価格が変わる場合があります。購入前に楽天市場の商品ページで最新条件をご確認ください。</li>
  </ul>
</section>`;

  return layout({
    title: '楽天市場 直近7日間の値下がり・急上昇まとめ',
    description: `${range}の楽天市場ランキングを比較。値下がり商品と順位急上昇商品を、取得データに基づいて掲載しています。`,
    canonical: weeklyUrl(),
    jsonLd: weeklyJsonLd(report),
    breadcrumb: '<p class="meta"><a href="/">ホーム</a> &rsaquo; 週間レポート</p>',
    body,
  });
}
