# static/

ここに置いたファイルは、ビルドのたびに `public/` へそのまま複製されます。

`public/` は毎回作り直されるので、生成物ではないファイルを直接置いても消えます。
消えては困るものはここに入れてください。

用途の例:

- `google1234abcd.html` — Search Console の「HTMLファイル」方式の認証ファイル
- `ads.txt` — 広告関連の宣言ファイル
- `CNAME` — 独自ドメインを使う場合（中身はドメイン名のみ、1行）
- `favicon.ico` などの画像

Search Console を「HTMLタグ」方式で認証する場合は、ファイルではなく
リポジトリの Variables に `GOOGLE_SITE_VERIFICATION` を登録してください。
全ページの `<head>` に meta タグが出力されます。
