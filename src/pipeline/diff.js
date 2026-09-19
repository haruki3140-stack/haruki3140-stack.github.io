/**
 * 前回スナップショットとの差分を取る。
 * 「今日のランキング」だけでは他サイトと同じ内容になるので、
 * 順位変動・値下がり・新規ランクインという“このサイトにしか無い情報”を作る。
 */
export function diffSnapshots(current, previous) {
  const prevByCode = new Map((previous?.items || []).map((it) => [it.code, it]));

  const movers = [];
  const priceDrops = [];
  const newcomers = [];

  for (const item of current.items) {
    const before = prevByCode.get(item.code);

    if (!before) {
      newcomers.push({ ...item, previousRank: null });
      continue;
    }

    const rankDelta = before.rank - item.rank; // 正 = 順位が上がった
    if (rankDelta !== 0) movers.push({ ...item, previousRank: before.rank, rankDelta });

    if (before.price > 0 && item.price > 0 && item.price < before.price) {
      const diff = before.price - item.price;
      const pct = Math.round((diff / before.price) * 1000) / 10;
      // 端数レベルの揺れは載せない。1% 以上 または 500円以上 の下げだけ拾う。
      if (pct >= 1 || diff >= 500) {
        priceDrops.push({ ...item, previousPrice: before.price, priceDelta: diff, priceDeltaPct: pct });
      }
    }
  }

  movers.sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));
  priceDrops.sort((a, b) => b.priceDeltaPct - a.priceDeltaPct);

  return {
    comparedTo: previous?.date ?? null,
    movers: movers.slice(0, 10),
    risers: movers.filter((m) => m.rankDelta > 0).slice(0, 5),
    priceDrops: priceDrops.slice(0, 8),
    newcomers: newcomers.slice(0, 8),
    hasComparison: Boolean(previous),
  };
}
