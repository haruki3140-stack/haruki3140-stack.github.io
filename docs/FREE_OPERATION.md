# 費用ゼロで継続運用する

このサイトは、次の構成なら固定費0円で運用できます。

| 用途 | サービス | 費用 |
|---|---|---:|
| ソース・日次データ | GitHub 公開リポジトリ | 0円 |
| 毎日の収集 | GitHub Actions（標準Linuxランナー） | 0円 |
| サイト公開 | Cloudflare Pages Free | 0円 |
| 商品データ | 楽天ウェブサービス | 0円 |
| 収益 | 楽天アフィリエイト | 初期費用・月額0円 |

独自ドメインは必須ではありません。まずは無料の `pages.dev` ドメインで始めます。

## なぜ GitHub Pages から移すのか

GitHub Pages は技術的には無料で動きますが、GitHub公式の利用制限では、オンラインビジネスや
商取引を主目的とするサイトの無料ホスティング用途を想定していません。アフィリエイトサイトを
長期運用する場所としては停止リスクがあります。

Cloudflare Pages は静的ファイルのリクエストが無料で、Freeプランは月500ビルドまでです。
このサイトは1日1回、月約30ビルドなので十分に収まります。

## Cloudflare Pagesへの接続

1. Cloudflareの無料アカウントを作る。
2. ダッシュボードの **Workers & Pages** から Pages プロジェクトを作る。
3. **Connect to Git** で GitHub を選び、`haruki3140-stack.github.io` リポジトリを接続する。
4. Production branchを `main` にする。
5. ビルド設定を次のようにする。

| 項目 | 値 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | 空欄 |

6. Environment variablesに次を登録する。

| 名前 | 値 |
|---|---|
| `NODE_VERSION` | `20` |
| `SITE_URL` | Cloudflareが発行した `https://<プロジェクト名>.pages.dev` |
| `SITE_NAME` | サイト名 |
| `SITE_DESCRIPTION` | サイト説明 |
| `SITE_AUTHOR` | 運営者名（任意） |
| `GOOGLE_SITE_VERIFICATION` | Search Consoleの確認値（取得後） |
| `INDEXNOW_KEY` | 8〜128文字の英数字・ハイフン（任意） |

楽天のAPIキーはCloudflareへ登録しません。Cloudflareでは、Gitに保存された記事から静的HTMLを
作るだけです。APIキーは毎日の収集を行うGitHub ActionsのSecretsにだけ置きます。

7. 最初のデプロイが成功し、`pages.dev` のURLでサイトが表示されることを確認する。
8. 楽天ウェブサービスのアプリ設定で、Allowed websites / アプリURLを新しいURLへ変更する。
9. GitHub ActionsのRepository variablesを更新する。

| 名前 | 値 |
|---|---|
| `SITE_URL` | 新しい `pages.dev` URL |
| `HOSTING_PROVIDER` | `cloudflare` |

`HOSTING_PROVIDER=cloudflare` を設定すると、GitHub Pagesへの二重デプロイだけが止まり、毎日の
データ収集とGitへの保存は継続します。Gitへのpushを検知してCloudflare Pagesが自動公開します。

## 検索登録

URLを変えたら、Google Search Consoleに新URLを登録し、`https://<プロジェクト名>.pages.dev/sitemap.xml`
を送信します。旧URLのSearch Console設定は新URLへ自動では移りません。

## 収益化の最低条件

- 公開ページのアフィリエイトリンク化率が100%であること（`npm run stats`）。
- 楽天側に登録したサイトURLと実際の公開URLが一致していること。
- 広告（PR）表記を消さないこと。
- ランキングの転載だけにせず、価格推移・最安値・比較など独自に蓄積した情報を増やすこと。
- Search Consoleで「クロール済み・インデックス未登録」が増えていないか週1回確認すること。

楽天市場の通常料率は商品ジャンル別に2〜4%です。月1万円を得る目安は、返品・キャンセル前の
単純計算でも承認売上25万〜50万円です。収益を保証する仕組みではないため、最初の目標は
「検索流入を得る」「クリックが発生する」「最初の1件が承認される」の順に置きます。
