import { correctArticleRanking } from '../src/pipeline/compose.js';
import { loadArticles, saveArticle } from '../src/pipeline/store.js';

// 保存済みの商品・価格・実順位・更新日時は維持して、生成記事の表記だけ訂正する。
let corrected = 0;
const articles = await loadArticles();
for (const article of articles) {
  const repaired = correctArticleRanking(article);
  if (JSON.stringify(repaired) === JSON.stringify(article)) continue;
  await saveArticle(repaired);
  corrected += 1;
}
console.log(`ランキング表記の訂正: ${corrected}/${articles.length}記事`);
