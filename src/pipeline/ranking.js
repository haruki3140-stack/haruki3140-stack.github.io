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
  const selected = sortRankingItems(items).slice(0, limit);
  if (!rankingCoverage(selected).completeTop) {
    throw new Error(`ランキングの順位が1位から連続していません: ${selected.map((item) => item.rank).join(',')}`);
  }
  return selected;
}
