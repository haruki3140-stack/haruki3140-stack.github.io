# 楽天アフィリエイト自動化パイプライン

楽天市場のジャンル別ランキングを毎日自動で取得し、**前回との差分（順位変動・値下がり・新規ランクイン）**を記録して、
アフィリエイトリンク付きの静的サイトとして公開します。GitHub Actions で全自動、サーバー費用ゼロ。

```
楽天API → スナップショット保存 → 前日との差分 → 記事生成 → 静的サイト → Cloudflare Pages
  collect                            compose                build          deploy
```

## 特徴

- **依存パッケージ ゼロ** — Node 20 の標準機能のみ。`npm install` すら要らない
- **差分の記録** — 「今日の順位」だけでなく「昨日から何位上がったか・いくら下がったか」を毎日蓄積
- **認証情報なしでも動く** — MOCK モードで全工程を試せる
- **法令対応込み** — 景品表示法の指定告示（ステマ規制）に対応した広告表記と `rel="sponsored nofollow"` を全ページに出力

## はじめかた

認証情報なしで、まず動かしてみる場合：

```bash
node src/cli.js run
```

```bash
node src/cli.js serve
```

<http://localhost:4173> が開けば動いています（データはダミーです）。

実データに切り替える手順は **[docs/SETUP.md](docs/SETUP.md)** を参照してください。
費用ゼロで継続運用する構成と移行手順は **[docs/FREE_OPERATION.md](docs/FREE_OPERATION.md)** にまとめています。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run doctor` | 設定と認証情報を点検する。**最初にこれ** |
| `npm run genres` | 楽天APIから実ジャンル一覧を取得して `config/genres.json` を更新 |
| `npm run collect` | ランキングを取得してスナップショットを保存 |
| `npm run compose` | スナップショットから記事データを生成 |
| `npm run build` | 記事データから静的サイトを `public/` に出力 |
| `npm run run` | collect → compose → build を通しで実行（CIが使うのはこれ） |
| `npm run serve` | `public/` をローカルで確認 |
| `npm run stats` | 蓄積状況とアフィリエイトリンク化率を表示 |
| `npm run stats:strict` | リンク化率が100%でなければ失敗（CIの公開前検査） |
| `npm test` | 日付・出力安全性・保存処理の回帰テスト |

## ディレクトリ

```
config/genres.json      対象ジャンル（npm run genres が自動更新）
data/snapshots/<日付>/  日次のランキング記録（45日分を保持、Gitにコミットされる）
data/articles/          生成された記事データ
public/                 出力される静的サイト（Git管理外）
src/rakuten/            楽天APIクライアント（レート制限・再試行・モック）
src/pipeline/           収集・差分・記事生成
src/render/             HTML/RSS/サイトマップ生成
```

`data/` をリポジトリにコミットするのは意図的です。**過去の価格と順位はここにしか残らず**、
消すと差分記事が作れなくなります。

## 設定

`.env`（ローカル）または GitHub の Secrets / Variables（CI）で設定します。`.env.example` を参照。

| 変数 | 必須 | 内容 |
|---|---|---|
| `RAKUTEN_APPLICATION_ID` | ○ | 楽天ウェブサービスのアプリID |
| `RAKUTEN_ACCESS_KEY` | ○ | 同アクセスキー（2026-07-01版APIから必須） |
| `RAKUTEN_AFFILIATE_ID` | ○ | アフィリエイトID。**未設定だと報酬が発生しません** |
| `SITE_URL` | ○ | 公開URL。sitemap と RSS の絶対URLに使う |
| `SITE_NAME` / `SITE_DESCRIPTION` / `SITE_AUTHOR` | | サイトの表示情報 |
| `MOCK` | | `1` でダミーデータ動作 |

## 注意

- 楽天ウェブサービスは短時間の連続アクセスを制限します。本実装は **1リクエスト/秒**に絞り、429 と 5xx は指数バックオフで再試行します。この間隔を詰めないでください。
- `config/genres.json` のジャンルIDを手書きしないでください。誤ったIDは、別カテゴリの商品を黙って間違った見出しで公開します。`npm run genres` を使ってください。
- 収益化の現実的な見通しと、検索エンジン側のリスク（自動生成コンテンツの扱い）については [docs/SETUP.md](docs/SETUP.md) の末尾に書いています。読んでから公開してください。

## 運用メモ（実運用で判明したこと）

### 楽天APIは Referer だけでなく Origin も要求する

アプリを「Web Application」種別で登録した場合、`Referer` ヘッダだけでは
`403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` で拒否されます。
`Origin` ヘッダも必要です。6パターンを総当たりして確認しました。

ブラウザは両方を自動で付けますが、Node の `fetch` はどちらも付けません。
`src/rakuten/client.js` で明示的に送っています。**この2行を消さないでください。**

### ジャンル一覧の取り込みはCIから行う

認証情報は GitHub Secrets にしか無いため、ローカルに `.env` を置かない運用では
ジャンル同期もCIで実行します。Actions →「毎日の自動更新」→ Run workflow で
**sync_genres** にチェックを入れてください。

### アクセスキーの形式

`pk_` で始まる46文字です。楽天の管理画面のフィールドは横スクロールするため、
見えている範囲だけを選択すると欠けます。フィールド内で Ctrl+A → Ctrl+C を使ってください。

### アプリの有効期限

楽天ウェブサービスのアプリには有効期限があります（このアプリは **2027年9月19日**）。
期限が切れるとAPIが止まり、サイトの更新も止まります。管理画面から更新してください。

### ジャンルのURLについて

日本語のジャンル名はASCIIのslugを作れないため、多くが `genre-100371` のような
ID形式になります。読みやすいURLにしたい場合は `config/genres.json` の `slug` を
手で書き換えてください（`name` は同期のたびにAPIの値で上書きされますが、`slug` は保持されます）。
