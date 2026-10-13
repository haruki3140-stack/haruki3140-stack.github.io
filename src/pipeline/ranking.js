/** APIの配列順に依存せず、元の配列を変更せずに実順位で並べる。 */
export function sortRankingItems(items) {
  return [...items].sort((a, b) => Number(a.rank) - Number(b.rank));
}

export function rankingCoverage(items) {
  const ranks = sortRankingItems(items).map((item) => Number(item.rank));
  const validRanks = ranks.filter((rank) => Number.isInteger(rank) && rank > 0);
  return {
    count: items.length,
    minRank: validRanks.length ? Math.min(...validRanks) : null,
    maxRank: validRanks.length ? Math.max(...validRanks) : null,
    completeTop: ranks.length > 0 && ranks.every((rank, index) => rank === index + 1),
  };
}

/** 実順位が指定範囲に入る商品だけを保存する。欠測した順位は補完しない。 */
export function selectTopRankingItems(items, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('取得件数は正の整数で指定してください。');
  const sorted = sortRankingItems(items);
  // APIが20位を返さない場合に21位を繰り上げてTOP20へ混ぜない。
  // 1〜19位がそろっていれば、記事は実際の件数に合わせたTOP19になる。
  const selected = sorted
    .filter((item) => Number(item.rank) <= limit)
    .slice(0, limit);
  const ranks = selected.map((item) => Number(item.rank));
  if (sorted.some((item) => !Number.isInteger(Number(item.rank)) || Number(item.rank) < 1)
    || new Set(ranks).size !== ranks.length) {
    throw new Error(`ランキングに無効な順位または重複があります: ${selected.map((item) => item.rank).join(',')}`);
  }
  if (!selected.length) throw new Error('指定範囲のランキングデータがありません。');
  return selected;
}
