import { config } from '../config.js';

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const yen = (n) => `${Number(n || 0).toLocaleString('ja-JP')}円`;
export const jpDate = (d) => String(d).replaceAll('-', '/');

/**
 * 景品表示法の指定告示（いわゆるステマ規制・2023年10月施行）で、
 * 広告であることを一般消費者が判別できる表示が義務付けられている。
 * アフィリエイトリンクを含むページには必ずこの表示を出す。
 */
export const PR_NOTICE = `
<p class="pr-badge"><strong>広告（PR）</strong>：当サイトは楽天アフィリエイトを利用しており、リンク経由の購入で運営者が報酬を受け取ることがあります。価格・在庫・ポイント倍率は変動します。最新の情報は必ず楽天市場の商品ページでご確認ください。</p>`;

/** rel="sponsored nofollow" は広告リンクに対する検索エンジン側の要求仕様。 */
export function affiliateLink(href, text, className = '') {
  const cls = className ? ` class="${esc(className)}"` : '';
  return `<a href="${esc(href)}"${cls} rel="sponsored nofollow noopener" target="_blank">${esc(text)}</a>`;
}

/** MOCK で生成したサイトを本物と取り違えないための警告。本番ビルドでは出ない。 */
const MOCK_BANNER = `
<p class="pr-badge" style="border-color:#bf0000"><strong>MOCKモードで生成されたページです。</strong>掲載されている商品・価格・リンクはすべてダミーで、実在しません。.env に楽天の認証情報を設定して再生成してください。</p>`;

export function layout({ title, description, canonical, body, jsonLd = null, breadcrumb = '' }) {
  const fullTitle = title === config.site.name ? title : `${title}｜${config.site.name}`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${config.site.googleVerification ? `<meta name="google-site-verification" content="${esc(config.site.googleVerification)}">` : ''}
${config.mock ? '<meta name="robots" content="noindex,nofollow">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(config.site.name)}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(config.site.name)}" href="${esc(config.site.url)}/feed.xml">
<link rel="stylesheet" href="${esc(config.site.url)}/style.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<header class="site">
  <div class="wrap">
    <a class="brand" href="${esc(config.site.url)}/">${esc(config.site.name)}</a>
    <nav>
      <a href="${esc(config.site.url)}/">ホーム</a>
      <a href="${esc(config.site.url)}/about/">このサイトについて</a>
      <a href="${esc(config.site.url)}/feed.xml">RSS</a>
    </nav>
  </div>
</header>
<main class="wrap">
${config.mock ? MOCK_BANNER : ''}
${breadcrumb}
${PR_NOTICE}
${body}
</main>
<footer class="site">
  <div class="wrap">
    <p>${esc(config.site.name)}${config.site.author ? `　運営：${esc(config.site.author)}` : ''}</p>
    <p>掲載データは楽天ウェブサービスから取得しています（Supported by Rakuten Developers）。商品情報は取得時点のもので、実際の価格・在庫とは異なる場合があります。</p>
    <p><a href="${esc(config.site.url)}/about/">このサイトについて・広告表記</a></p>
  </div>
</footer>
</body>
</html>`;
}
