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

/** 切り出した結果が本当に1位からのTOP Nか検査してから保存する。 */
export function selectTopRankingItems(items, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('取得件数は正の整数で指定してください。');
  // APIが20位を返さない場合に21位を繰り上げてTOP20へ混ぜない。
  // 1〜19位がそろっていれば、記事は実際の件数に合わせたTOP19になる。
  const selected = sortRankingItems(items)
    .filter((item) => Number(item.rank) <= limit)
    .slice(0, limit);
  if (!rankingCoverage(selected).completeTop) {
    throw new Error(`ランキングの順位が1位から連続していません: ${selected.map((item) => item.rank).join(',')}`);
  }
  return selected;
}
