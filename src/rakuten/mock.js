/**
 * 認証情報が無くてもパイプライン全体を動かすためのダミー応答。
 * 日付を種にした疑似乱数なので、日が変われば順位も価格も動き、
 * 「順位変動」「値下がり」の生成ロジックまで実データ無しで検証できる。
 */

const PRODUCTS = [
  ['ワイヤレスイヤホン ノイズキャンセリング', 7980, 'サウンドギア楽天市場店'],
  ['北海道産 ほたて貝柱 1kg 訳あり', 5480, '北の海鮮市場'],
  ['オートミール 4.5kg 大容量', 2980, 'ヘルシーフーズ直販'],
  ['珪藻土バスマット 速乾 抗菌', 3280, 'くらし雑貨マート'],
  ['ロボット掃除機 water拭き両用', 29800, '家電のリバティ'],
  ['メンズ 防風ストレッチパンツ', 4290, 'カジュアルストア楽天市場店'],
  ['国産 鶏むね肉 2kg 冷凍', 2180, '鶏肉専門 とり音'],
  ['電動歯ブラシ 替えブラシ8本セット', 1980, 'オーラルケア本舗'],
  ['遮光1級カーテン 4枚セット', 5990, 'インテリアのパレット'],
  ['プロテイン ホエイ 3kg チョコ味', 6480, 'スポーツ栄養ラボ'],
  ['折りたたみ傘 自動開閉 耐風', 2480, 'アンブレラ工房'],
  ['シャインマスカット 1.2kg 産地直送', 4980, '山梨フルーツ便'],
  ['ゲーミングチェア リクライニング', 18900, 'オフィス家具のミライ'],
  ['圧縮袋 布団用 6枚組', 1580, '収納プラス'],
  ['無洗米 新潟県産こしひかり 10kg', 7180, '米処にいがた'],
  ['加湿器 卓上 超音波 静音', 3980, '季節家電セレクト'],
  ['スニーカー 軽量 幅広 3E', 4380, 'シューズランド楽天市場店'],
  ['日焼け止め SPF50+ 2本セット', 2680, 'コスメティックヴィラ'],
  ['カセットコンロ 薄型 耐熱', 4680, 'アウトドアベース'],
  ['ドリップコーヒー 100袋 詰め合わせ', 3280, '自家焙煎 豆蔵'],
  ['スマートウォッチ 血中酸素 通話対応', 8980, 'デジタルワークス'],
  ['除湿シート シングル 2枚', 2280, 'ねむりの森'],
  ['エコバッグ 折りたたみ 大容量', 1280, 'バッグファクトリー'],
  ['ペットシーツ レギュラー 800枚', 4180, 'ペットグッズ ワンだふる'],
  ['LED デスクライト 目に優しい', 3480, 'ライティングストア'],
  ['冷凍 ぎょうざ 100個 業務用', 2980, '中華惣菜の匠'],
  ['ヨガマット 10mm 滑り止め', 2180, 'フィットネス工房'],
  ['モバイルバッテリー 20000mAh', 3980, 'チャージギア'],
  ['今治タオル フェイスタオル10枚', 3980, 'タオル問屋 今治屋'],
  ['たらこ 切れ子 500g 無着色', 3180, '博多の味 明太堂'],
];

/** 文字列＋数値から決定的な疑似乱数 (0..1) を作る。 */
function seeded(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const today = () => new Date().toISOString().slice(0, 10);

function makeItem(index, genreId, rank) {
  const [baseName, basePrice, shop] = PRODUCTS[index % PRODUCTS.length];
  const shopCode = `mock-shop-${(index % 12) + 1}`;
  const code = `${shopCode}:1000${String(index).padStart(4, '0')}`;
  // 日替わりで ±12% 価格が揺れる＝値下がり検知ロジックの動作確認用。
  const drift = 1 + (seeded(`${code}:${today()}`) - 0.5) * 0.24;
  const price = Math.max(100, Math.round((basePrice * drift) / 10) * 10);
  return {
    itemCode: code,
    itemName: `${baseName}【送料無料】`,
    itemPrice: price,
    itemUrl: `https://item.rakuten.co.jp/${shopCode}/${code.split(':')[1]}/`,
    affiliateUrl: `https://hb.afl.rakuten.co.jp/hgc/MOCK/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2F${shopCode}%2F`,
    shopName: shop,
    shopCode,
    reviewCount: Math.round(seeded(`${code}:rc`) * 4000),
    reviewAverage: Math.round((3.6 + seeded(`${code}:ra`) * 1.4) * 100) / 100,
    mediumImageUrls: [`https://placehold.jp/24/eeeeee/777777/400x400.png?text=${encodeURIComponent('MOCK')}`],
    rank,
    genreId: String(genreId),
    pointRate: 1 + Math.floor(seeded(`${code}:pt`) * 5),
    catchcopy: 'モックデータ（実データではありません）',
    itemCaption: `${baseName} のダミー説明文です。認証情報を設定すると実データに切り替わります。`,
    availability: 1,
    postageFlag: 0,
  };
}

export function mockRanking({ genreId = 0, page = 1 } = {}) {
  // ジャンルと日付で並び順をシャッフルし、日々順位が入れ替わるようにする。
  const order = PRODUCTS.map((_, i) => i)
    .map((i) => ({ i, k: seeded(`${genreId}:${today()}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.i);

  const start = (page - 1) * 30;
  const Items = order.slice(start, start + 30).map((idx, i) => makeItem(idx, genreId, start + i + 1));
  return { Items, page, pageCount: 1 };
}

export function mockSearch({ keyword = '', hits = 30 } = {}) {
  const order = PRODUCTS.map((_, i) => i).sort((a, b) => seeded(`${keyword}:${a}`) - seeded(`${keyword}:${b}`));
  const Items = order.slice(0, hits).map((idx, i) => makeItem(idx, 0, i + 1));
  return { Items, count: PRODUCTS.length, page: 1, pageCount: 1 };
}

export function mockGenre(genreId = 0) {
  // 2026-07-01版のレスポンス形式に合わせる
  return {
    genre: { genreId: Number(genreId), nameJa: 'モックジャンル', level: 1 },
    children: [
      { genreId: 100371, nameJa: 'レディースファッション', level: 1 },
      { genreId: 551177, nameJa: 'メンズファッション', level: 1 },
    ],
  };
}
