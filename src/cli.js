import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, diagnose } from './config.js';
import { collect } from './pipeline/collect.js';
import { compose } from './pipeline/compose.js';
import { fetchRanking } from './rakuten/api.js';
import { syncGenres, loadGenres } from './pipeline/genres.js';
import { build } from './render/site.js';
import { listSnapshotDates, loadArticles } from './pipeline/store.js';

const USAGE = `
楽天アフィリエイト自動化パイプライン

  npm run doctor    設定と認証情報を点検する（最初にこれ）
  npm run verify    実際にAPIを1回叩いて認証が通るか確かめる
  npm run genres    楽天APIから実ジャンル一覧を取得して config/genres.json を更新
  npm run collect   ランキングを取得してスナップショットを保存
  npm run compose   スナップショットから記事データを生成
  npm run build     記事データから静的サイトを public/ に出力
  npm run run       collect → compose → build を通しで実行（CIが使うのはこれ）
  npm run serve     public/ をローカルで確認（http://localhost:4173）
  npm run stats     蓄積状況を表示
`;

function banner() {
  if (config.mock) {
    console.log('┌──────────────────────────────────────────────┐');
    console.log('│ MOCK モードで動作中（ダミーデータ）           │');
    console.log('│ .env に楽天の認証情報を設定すると実データに   │');
    console.log('│ 切り替わります。 npm run doctor で確認        │');
    console.log('└──────────────────────────────────────────────┘');
  }
}

async function cmdDoctor() {
  console.log('■ 設定の点検\n');
  const issues = diagnose();

  const show = (label, value, ok) => console.log(`  ${ok ? '✓' : '×'} ${label.padEnd(26)} ${value}`);
  const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-2)} (${v.length}文字)` : '未設定');

  show('APPLICATION_ID', mask(config.rakuten.applicationId), Boolean(config.rakuten.applicationId));
  show('ACCESS_KEY', mask(config.rakuten.accessKey), Boolean(config.rakuten.accessKey));
  show('AFFILIATE_ID', mask(config.rakuten.affiliateId), Boolean(config.rakuten.affiliateId));
  show('SITE_URL', config.site.url, !config.site.url.includes('example'));
  show('モード', config.mock ? 'MOCK（ダミーデータ）' : '本番（楽天API）', !config.mock);

  const genres = await loadGenres();
  show('有効ジャンル数', `${genres.length}件`, genres.length > 0);
  if (genres.length <= 1) {
    console.log('    → npm run genres を実行すると楽天APIから実ジャンルを取り込みます。');
  }

  console.log('');
  if (!issues.length) {
    console.log('問題は見つかりませんでした。npm run run で本番実行できます。');
    return 0;
  }

  for (const i of issues) {
    console.log(`  ${i.level === 'error' ? '【要対応】' : '【注意】  '} ${i.key}: ${i.msg}`);
  }
  console.log('\n取得手順は docs/SETUP.md を参照してください。');
  return issues.some((i) => i.level === 'error') ? 1 : 0;
}

/**
 * 認証情報が通るかだけを1回のAPI呼び出しで確かめる。
 * CI を回して結果を待つより早く、ファイルも書き換えない。
 */
async function cmdVerify() {
  if (config.mock) {
    console.error('× 認証情報が未設定のため MOCK モードです。.env に3つの値を設定してください。');
    return 1;
  }

  const mask = (v) => `${v.slice(0, 6)}…(${v.length}文字)`;
  console.log('■ 認証情報の検証\n');
  console.log(`  APPLICATION_ID  ${mask(config.rakuten.applicationId)}`);
  console.log(`  ACCESS_KEY      ${mask(config.rakuten.accessKey)}`);
  console.log(`  AFFILIATE_ID    ${mask(config.rakuten.affiliateId)}`);
  console.log(`  Referer として送る値  ${config.site.url}/\n`);

  try {
    const { items } = await fetchRanking({ genreId: 0 });
    const top = items[0];
    console.log('✓ 認証に成功しました。');
    if (top) {
      console.log(`  1位: ${top.name.slice(0, 40)}… / ${top.price.toLocaleString('ja-JP')}円`);
      console.log(`  アフィリエイトリンク: ${top.isAffiliate ? '有効' : '× 無効（AFFILIATE_ID を確認してください）'}`);
    }
    console.log('\nGitHub Secrets にも同じ値を登録すれば、自動実行でも通ります。');
    return 0;
  } catch (err) {
    console.error(`× 失敗: ${err.message}\n`);
    if (String(err.message).includes('Invalid Access Key')) {
      console.error('  ACCESS_KEY の値が実物と一致していません。');
      console.error('  楽天の管理画面で目のアイコンを押して全体を表示し、');
      console.error('  フィールド内を Ctrl+A → Ctrl+C で丸ごとコピーしてください。');
      console.error('  （横スクロールするフィールドなので、見えている範囲だけ選択すると欠けます）');
    }
    return 1;
  }
}

async function cmdStats() {
  const dates = await listSnapshotDates();
  const articles = await loadArticles();
  const genres = await loadGenres();

  console.log('■ 蓄積状況\n');
  console.log(`  集計日数      ${dates.length}日  ${dates.length ? `(${dates[dates.length - 1]} 〜 ${dates[0]})` : ''}`);
  console.log(`  記事数        ${articles.length}件`);
  console.log(`  有効ジャンル  ${genres.length}件`);

  const affiliate = articles
    .flatMap((a) => a.sections.find((s) => s.type === 'ranking')?.items || [])
    .filter((it) => it.isAffiliate).length;
  const total = articles.reduce((n, a) => n + (a.sections.find((s) => s.type === 'ranking')?.items.length || 0), 0);
  console.log(`  アフィリエイトリンク化率  ${total ? Math.round((affiliate / total) * 100) : 0}% (${affiliate}/${total})`);
  if (total && affiliate === 0) {
    console.log('    → 0% です。RAKUTEN_AFFILIATE_ID が未設定だと報酬は発生しません。');
  }
  return 0;
}

async function cmdServe() {
  const root = config.paths.public;
  if (!fs.existsSync(root)) {
    console.error('public/ がありません。先に npm run build を実行してください。');
    return 1;
  }
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  };

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = path.join(root, urlPath);
      // root の外に出るパス（../ を含む要求）は拒否する。
      if (!path.resolve(file).startsWith(path.resolve(root))) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (!path.extname(file)) file = path.join(file, 'index.html');
      const buf = await fsp.readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1>');
    }
  });

  // 前回のプレビューが生きていると 4173 は塞がっている。落とさず隣のポートに逃がす。
  const basePort = Number(process.env.PORT || 4173);
  const port = await listenWithFallback(server, basePort, 10);
  if (port === null) {
    console.error(`ポート ${basePort}〜${basePort + 9} がすべて使用中です。`);
    console.error('先に起動しているプレビューを終了するか、PORT=5173 npm run serve のように指定してください。');
    return 1;
  }

  console.log(`プレビュー: http://localhost:${port}  (Ctrl+C で終了)`);
  if (port !== basePort) console.log(`※ ${basePort} が使用中だったため ${port} を使いました。`);
  console.log('※ SITE_URL が localhost 以外だとリンクとCSSが外部URLを指します。');
  return new Promise(() => {});
}

/** basePort から順に空きポートを探して listen する。見つからなければ null。 */
function listenWithFallback(server, basePort, attempts) {
  return new Promise((resolve) => {
    let port = basePort;

    const onError = (err) => {
      if (err.code !== 'EADDRINUSE' || port >= basePort + attempts - 1) {
        server.removeListener('error', onError);
        resolve(null);
        return;
      }
      port += 1;
      server.listen(port);
    };

    server.on('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      resolve(port);
    });
  });
}

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'doctor':
      return cmdDoctor();
    case 'verify':
      return cmdVerify();
    case 'stats':
      return cmdStats();
    case 'serve':
      return cmdServe();
    case 'genres': {
      banner();
      const genres = await syncGenres();
      console.log(`■ ジャンル同期完了: ${genres.length}件`);
      for (const g of genres) console.log(`  ${g.enabled === false ? '·' : '✓'} ${g.id.padEnd(8)} ${g.slug.padEnd(24)} ${g.name}`);
      return 0;
    }
    case 'collect': {
      banner();
      const { failures } = await collect();
      return failures.length ? 1 : 0;
    }
    case 'compose':
      banner();
      await compose();
      return 0;
    case 'build':
      await build();
      return 0;
    case 'run': {
      banner();
      const started = Date.now();
      const { snapshots, failures } = await collect();
      if (!snapshots.length) {
        console.error('\n収集できたジャンルが1件もありません。npm run doctor で設定を確認してください。');
        return 1;
      }
      await compose();
      await build();
      console.log(`\n完了 (${((Date.now() - started) / 1000).toFixed(1)}秒)${failures.length ? `  失敗 ${failures.length}ジャンル` : ''}`);
      // 一部ジャンルの失敗では落とさない。残りのジャンルでサイトは成立するので、
      // 毎日の自動更新を1ジャンルの不調で止めないほうが損失が小さい。
      return 0;
    }
    default:
      console.log(USAGE);
      return cmd ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(`\n失敗: ${err.message}`);
    if (err.status) console.error(`  HTTP ${err.status}  ${err.url ?? ''}`);
    if (err.body) console.error(`  ${err.body}`);
    process.exit(1);
  },
);
