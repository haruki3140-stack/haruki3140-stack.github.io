import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { loadArticles } from '../pipeline/store.js';
import { loadGenres } from '../pipeline/genres.js';
import { layout, esc, jpDate } from './html.js';
import { renderSection, renderItem } from './components.js';
import { CSS } from './styles.js';

const OUT = config.paths.public;
const BASE = config.site.url;

async function writePage(relPath, html) {
  const file = path.join(OUT, relPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, 'utf8');
}

const articleUrl = (a) => `${BASE}/a/${a.id}/`;
const genreUrl = (slug) => `${BASE}/g/${slug}/`;

function crumb(parts) {
  const html = parts
    .map((p, i) => (p.url && i < parts.length - 1 ? `<a href="${esc(p.url)}">${esc(p.label)}</a>` : esc(p.label)))
    .join(' &rsaquo; ');
  return `<p class="meta">${html}</p>`;
}

function articleCard(a) {
  const badges = [];
  if (a.diff.priceDropCount) badges.push(`値下がり${a.diff.priceDropCount}件`);
  if (a.diff.riserCount) badges.push(`急上昇${a.diff.riserCount}件`);
  return `<li class="card">
  <h3><a href="${esc(articleUrl(a))}">${esc(a.title)}</a></h3>
  <p class="sub">${esc(jpDate(a.date))}　${esc(a.genreName)}${badges.length ? `　/　${esc(badges.join('・'))}` : ''}</p>
</li>`;
}

function articleJsonLd(a) {
  const ranking = a.sections.find((s) => s.type === 'ranking');
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: a.title,
    description: a.description,
    numberOfItems: a.itemCount,
    itemListElement: (ranking?.items || []).map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

function renderArticlePage(a, genres) {
  const genre = genres.find((g) => g.slug === a.genreSlug);
  const body = `
<h1>${esc(a.title)}</h1>
<p class="meta">${esc(jpDate(a.date))} 更新${a.diff.comparedTo ? `　/　前回集計：${esc(jpDate(a.diff.comparedTo))}` : ''}</p>
<div class="lead">${a.lead.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
${a.sections.map(renderSection).join('\n')}
<section>
  <h2>ほかのジャンルのランキング</h2>
  <ul class="chips">${genres.map((g) => `<li><a href="${esc(genreUrl(g.slug))}">${esc(g.name)}</a></li>`).join('')}</ul>
</section>`;

  return layout({
    title: a.title,
    description: a.description,
    canonical: articleUrl(a),
    jsonLd: articleJsonLd(a),
    breadcrumb: crumb([
      { label: 'ホーム', url: `${BASE}/` },
      { label: genre?.name ?? a.genreName, url: genreUrl(a.genreSlug) },
      { label: jpDate(a.date) },
    ]),
    body,
  });
}

function renderGenrePage(genre, articles, genres) {
  const latest = articles[0];
  const body = `
<h1>楽天「${esc(genre.name)}」ランキングの記録</h1>
<p class="meta">${articles.length}日分の集計を保存しています。</p>
${latest ? `<div class="lead"><p>最新は <a href="${esc(articleUrl(latest))}">${esc(latest.title)}</a> です。日ごとの順位と価格を残しているので、値動きの傾向を追えます。</p></div>` : ''}
<section>
  <h2>日別アーカイブ</h2>
  ${articles.length ? `<ul class="grid">${articles.map(articleCard).join('')}</ul>` : '<p class="empty">まだ記事がありません。</p>'}
</section>
<section>
  <h2>ほかのジャンル</h2>
  <ul class="chips">${genres.map((g) => `<li><a href="${esc(genreUrl(g.slug))}">${esc(g.name)}</a></li>`).join('')}</ul>
</section>`;

  return layout({
    title: `楽天「${genre.name}」ランキングの記録`,
    description: `楽天市場「${genre.name}」の売れ筋ランキングを毎日自動集計したアーカイブ。順位変動と値下がりを日次で記録しています。`,
    canonical: genreUrl(genre.slug),
    breadcrumb: crumb([{ label: 'ホーム', url: `${BASE}/` }, { label: genre.name }]),
    body,
  });
}

function renderIndex(articles, genres) {
  const latestDate = articles[0]?.date;
  const todays = articles.filter((a) => a.date === latestDate);
  const older = articles.filter((a) => a.date !== latestDate).slice(0, 24);

  const highlights = todays
    .flatMap((a) => {
      const sec = a.sections.find((s) => s.type === 'pricedrop');
      return (sec?.items || []).map((it) => ({ ...it, genreName: a.genreName }));
    })
    .sort((x, y) => y.priceDeltaPct - x.priceDeltaPct)
    .slice(0, 6);

  const body = `
<h1>${esc(config.site.name)}</h1>
<div class="lead"><p>${esc(config.site.description)}</p></div>
<ul class="chips">${genres.map((g) => `<li><a href="${esc(genreUrl(g.slug))}">${esc(g.name)}</a></li>`).join('')}</ul>
${highlights.length ? `<section>
  <h2>今日いちばん値下がりした商品</h2>
  <p class="note">前回集計時の価格との比較です。価格は変動します。</p>
  <ul class="list">${highlights.map((it) => renderItem(it, { type: 'pricedrop', showRank: false })).join('')}</ul>
</section>` : ''}
<section>
  <h2>${latestDate ? `${esc(jpDate(latestDate))}の集計` : '最新の集計'}</h2>
  ${todays.length ? `<ul class="grid">${todays.map(articleCard).join('')}</ul>` : '<p class="empty">まだ記事がありません。npm run run を実行してください。</p>'}
</section>
${older.length ? `<section>
  <h2>過去の集計</h2>
  <ul class="grid">${older.map(articleCard).join('')}</ul>
</section>` : ''}`;

  return layout({
    title: config.site.name,
    description: config.site.description,
    canonical: `${BASE}/`,
    body,
  });
}

function renderAbout(genres) {
  const body = `
<h1>このサイトについて</h1>
<section>
  <h2>何をしているサイトか</h2>
  <p>楽天市場のジャンル別ランキングを毎日自動で取得し、前回集計との「順位の変動」「価格の変動」を記録して公開しています。単に今日の順位を並べるのではなく、<strong>いつ・いくらから・いくらに下がったか</strong>を残すことを目的にしています。</p>
</section>
<section>
  <h2>広告表記</h2>
  <p>当サイトのリンクには楽天アフィリエイトのリンクが含まれます。リンク経由で商品が購入された場合、運営者が成果報酬を受け取ることがあります。この表示は景品表示法の指定告示（いわゆるステルスマーケティング規制）に基づくものです。</p>
  <p>報酬の有無によって掲載順位を操作することはありません。掲載順位は楽天市場のランキングAPIが返す順位をそのまま使用しています。</p>
</section>
<section>
  <h2>データの出典と注意</h2>
  <p>商品情報は楽天ウェブサービス（Rakuten Web Service）から取得しています。価格・在庫・ポイント倍率・送料条件は常に変動するため、<strong>表示内容は取得時点のもの</strong>です。購入前に必ず楽天市場の商品ページで最新の情報をご確認ください。表示と実際の条件が異なることによる損害について、運営者は責任を負いかねます。</p>
</section>
<section>
  <h2>掲載ジャンル</h2>
  <ul class="chips">${genres.map((g) => `<li><a href="${esc(genreUrl(g.slug))}">${esc(g.name)}</a></li>`).join('')}</ul>
</section>`;

  return layout({
    title: 'このサイトについて',
    description: `${config.site.name}の運営方針、広告表記、データの出典について。`,
    canonical: `${BASE}/about/`,
    breadcrumb: crumb([{ label: 'ホーム', url: `${BASE}/` }, { label: 'このサイトについて' }]),
    body,
  });
}

function renderFeed(articles) {
  const items = articles.slice(0, 40).map((a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${esc(articleUrl(a))}</link>
    <guid isPermaLink="true">${esc(articleUrl(a))}</guid>
    <pubDate>${new Date(a.updatedAt).toUTCString()}</pubDate>
    <description>${esc(a.description)}</description>
  </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(config.site.name)}</title>
  <link>${esc(BASE)}/</link>
  <description>${esc(config.site.description)}</description>
  <language>ja</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel></rss>`;
}

function renderSitemap(urls) {
  const body = urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

/**
 * static/ の中身を public/ にそのまま複製する。
 *
 * build() は毎回 public/ を消してから作り直すため、そこに直接置いたファイルは
 * 翌日のビルドで消える。Search Console の認証用HTML、ads.txt、独自ドメインの
 * CNAME など「生成物ではないが公開したいファイル」は static/ に置く。
 */
async function copyStatic() {
  const src = path.join(config.paths.root, 'static');
  try {
    await fs.access(src);
  } catch {
    return 0;
  }
  // フォルダの説明書きと .gitkeep は公開対象ではない。
  const skip = new Set(['README.md', '.gitkeep']);
  await fs.cp(src, OUT, {
    recursive: true,
    filter: (from) => !skip.has(path.basename(from)),
  });

  const copied = (await fs.readdir(src, { recursive: true })).filter((f) => !skip.has(path.basename(f)));
  if (copied.length) console.log(`  ✓ static/ の ${copied.length} 件をそのまま公開`);
  return copied.length;
}

export async function build() {
  const [articles, genres] = await Promise.all([loadArticles(), loadGenres()]);
  console.log(`■ サイト生成  記事 ${articles.length}件 / ジャンル ${genres.length}件`);

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  await writePage('style.css', CSS.trim());
  // GitHub Pages の Jekyll 処理を止める（_ で始まるパスが無視されるのを防ぐ）。
  await fs.writeFile(path.join(OUT, '.nojekyll'), '', 'utf8');

  await writePage('index.html', renderIndex(articles, genres));
  await writePage('about/index.html', renderAbout(genres));

  for (const a of articles) {
    await writePage(`a/${a.id}/index.html`, renderArticlePage(a, genres));
  }

  for (const g of genres) {
    const list = articles.filter((a) => a.genreSlug === g.slug);
    await writePage(`g/${g.slug}/index.html`, renderGenrePage(g, list, genres));
  }

  await writePage('feed.xml', renderFeed(articles));

  const urls = [
    { loc: `${BASE}/`, lastmod: articles[0]?.date },
    { loc: `${BASE}/about/` },
    ...genres.map((g) => ({ loc: genreUrl(g.slug), lastmod: articles.find((a) => a.genreSlug === g.slug)?.date })),
    ...articles.map((a) => ({ loc: articleUrl(a), lastmod: a.date })),
  ];
  await writePage('sitemap.xml', renderSitemap(urls));
  await writePage('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);

  await copyStatic();

  console.log(`  ✓ ${urls.length} ページを ${path.relative(config.paths.root, OUT)}/ に出力`);
  return { pages: urls.length, articles: articles.length };
}
