import { esc } from './html.js';

/**
 * 価格推移の折れ線グラフをインラインSVGで描く。
 * 外部ライブラリを足さず、ダークモードでも読めるよう色はCSS変数に寄せる。
 */
export function priceChart(points, { width = 720, height = 220 } = {}) {
  if (points.length < 2) return '';

  const pad = { top: 16, right: 16, bottom: 28, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // 全点が同値でも 0 除算しないよう、範囲が潰れたら幅を持たせる。
  const span = max - min || Math.max(1, max * 0.1);
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;

  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;

  const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;
  const gridValues = [max, Math.round((max + min) / 2), min];

  const grid = gridValues
    .map((v) => {
      const gy = y(v).toFixed(1);
      return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" class="ch-grid"/>
<text x="${pad.left - 8}" y="${gy}" class="ch-ylabel">${esc(yen(v))}</text>`;
    })
    .join('\n');

  // 点が多いと日付ラベルが潰れるので、両端と中央だけ出す。
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const xLabels = labelIdx
    .map((i) => {
      const d = points[i].date.slice(5).replace('-', '/');
      const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      return `<text x="${x(i).toFixed(1)}" y="${height - 8}" class="ch-xlabel" text-anchor="${anchor}">${esc(d)}</text>`;
    })
    .join('\n');

  const dots = points
    .map((p, i) => {
      const cls = p.price === min ? 'ch-dot ch-dot-min' : 'ch-dot';
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="${p.price === min ? 4.5 : 3}" class="${cls}"><title>${esc(p.date)} ${esc(yen(p.price))}</title></circle>`;
    })
    .join('\n');

  const first = points[0];
  const last = points.at(-1);
  const summary = `${first.date}の${yen(first.price)}から${last.date}の${yen(last.price)}まで、${points.length}日分の価格推移。最安値は${yen(min)}、最高値は${yen(max)}。`;

  return `<figure class="chart">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">
${grid}
<path d="${area}" class="ch-area"/>
<path d="${line}" class="ch-line"/>
${dots}
${xLabels}
</svg>
<figcaption>${esc(summary)}</figcaption>
</figure>`;
}
