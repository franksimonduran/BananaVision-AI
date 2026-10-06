import { LABELS, exportLabel, dayKey, percentage } from './data.js?v=20261006-6';

const NS = 'http://www.w3.org/2000/svg';
const colors = ['#337c59', '#b45f4c', '#c8a255'];

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

function chart(host, description, height = 190) {
  host.replaceChildren();
  const width = Math.max(280, Math.round(host.clientWidth) || 600);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'group', 'aria-label': description });
  svg.append(svgNode('title', {}, description));
  host.append(svg);
  return svg;
}

function empty(host, title, text) {
  const message = document.createElement('div');
  message.className = 'chart-empty';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const caption = document.createElement('span');
  caption.textContent = text;
  message.append(heading, caption);
  host.append(message);
}

function interactivePoint(host, node, description) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', description);
  node.append(svgNode('title', {}, description));
  const show = () => {
    let tooltip = host.querySelector('.chart-tooltip');
    if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'chart-tooltip'; tooltip.setAttribute('aria-hidden', 'true'); host.append(tooltip); }
    tooltip.textContent = description;
  };
  const hide = () => host.querySelector('.chart-tooltip')?.remove();
  node.addEventListener('pointerenter', show);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);
}

export function renderActivity(host, history, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days + index + 1);
    return { date, key: dayKey(date), count: 0 };
  });
  const byDay = new Map(buckets.map(bucket => [bucket.key, bucket]));
  history.forEach(item => { const bucket = byDay.get(dayKey(item.timestamp)); if (bucket) bucket.count++; });
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const svg = chart(host, `Actividad de los últimos ${days} días: ${total} muestras. Cada barra indica el número de análisis de un día.`, 190);
  const left = 30, top = 12, bottom = 158, width = svg.viewBox.baseVal.width - 42;
  const maximum = Math.max(4, Math.ceil(Math.max(...buckets.map(bucket => bucket.count)) / 4) * 4);
  for (let index = 0; index <= 4; index++) {
    const y = bottom - (bottom - top) * index / 4;
    svg.append(svgNode('line', { x1: left, x2: left + width, y1: y, y2: y, class: 'chart-gridline' }));
    svg.append(svgNode('text', { x: 19, y: y + 3, 'text-anchor': 'end' }, maximum * index / 4));
  }
  const step = width / days;
  const labelStep = Math.ceil(days / 7);
  buckets.forEach((bucket, index) => {
    const x = left + step * index + step / 2;
    const height = bucket.count / maximum * (bottom - top);
    const rect = svgNode('rect', { x: x - step * .24, y: bottom - Math.max(height, 4), width: step * .48, height: Math.max(height, 4), rx: Math.min(4, step * .12), class: 'chart-bar', style: bucket.count ? '' : 'fill:transparent' });
    const description = `${bucket.date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}: ${bucket.count} ${bucket.count === 1 ? 'muestra' : 'muestras'}`;
    interactivePoint(host, rect, description);
    svg.append(rect);
    if (index % labelStep === 0 || index === days - 1) {
      const dateOptions = index === 0 || index === days - 1 ? { day: 'numeric', month: 'short' } : { day: 'numeric' };
      svg.append(svgNode('text', { x, y: 180, 'text-anchor': 'middle' }, bucket.date.toLocaleDateString('es-PE', dateOptions)));
    }
  });
  if (!total) empty(host, 'Todavía no hay actividad en este periodo', 'Tus próximos análisis darán forma a este gráfico.');
  return total;
}

export function renderDistribution(host, legend, history) {
  host.replaceChildren();
  legend.replaceChildren();
  const total = history.length;
  const counts = LABELS.map(label => history.filter(item => item.label === label).length);
  const description = total ? counts.map((count, index) => `${exportLabel(LABELS[index])}: ${count}`).join('; ') : 'Sin resultados guardados';
  const svg = svgNode('svg', { viewBox: '0 0 200 200', class: 'donut-svg', role: 'img', 'aria-label': `Clasificación visual. ${description}.` });
  svg.append(svgNode('circle', { cx: 100, cy: 100, r: 76, fill: 'none', stroke: '#edf1e7', 'stroke-width': 17 }));
  const circumference = 2 * Math.PI * 76;
  let offset = 0;
  counts.forEach((count, index) => {
    if (count) {
      const length = circumference * count / total;
      const segment = svgNode('circle', { cx: 100, cy: 100, r: 76, fill: 'none', stroke: colors[index], 'stroke-width': 17, 'stroke-dasharray': `${Math.max(0, length - (count === total ? 0 : 3))} ${circumference}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 100 100)', class: 'donut-segment' });
      segment.append(svgNode('title', {}, `${exportLabel(LABELS[index])}: ${count} (${percentage(count / total)})`));
      svg.append(segment);
      offset += length;
    }
    const row = document.createElement('div'); row.className = 'legend-row';
    const dot = document.createElement('i'); dot.className = `legend-dot ${['apto', 'no-apto', 'uncertain'][index]}`;
    const label = document.createElement('span'); label.textContent = exportLabel(LABELS[index]);
    const value = document.createElement('strong'); value.textContent = count;
    const share = document.createElement('small'); share.textContent = total ? `${Math.round(count / total * 100)}%` : '—';
    row.append(dot, label, value, share); legend.append(row);
  });
  svg.append(svgNode('text', { x: 100, y: 102, 'text-anchor': 'middle', class: 'donut-count' }, total));
  svg.append(svgNode('text', { x: 100, y: 121, 'text-anchor': 'middle', class: 'donut-caption' }, total ? 'MUESTRAS' : 'SIN LECTURAS'));
  host.append(svg);
}

export function renderConfidence(host, history) {
  const readings = history.slice(0, 12).reverse();
  const svg = chart(host, readings.length ? `Confianza de las últimas ${readings.length} lecturas, de la más antigua a la más reciente. La confianza no equivale a precisión.` : 'Evolución de confianza: sin lecturas.', 195);
  const left = 35, right = svg.viewBox.baseVal.width - 20, top = 15, bottom = 162;
  [0, 25, 50, 75, 100].forEach(value => {
    const y = bottom - (bottom - top) * value / 100;
    svg.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, class: 'chart-gridline' }));
    svg.append(svgNode('text', { x: 26, y: y + 3, 'text-anchor': 'end' }, `${value}%`));
  });
  const points = readings.map((reading, index) => ({ reading, x: readings.length === 1 ? (left + right) / 2 : left + (right - left) * index / (readings.length - 1), y: bottom - reading.confidence * (bottom - top) }));
  if (points.length > 1) {
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
    const defs = svgNode('defs');
    const gradient = svgNode('linearGradient', { id: 'confidence-fill', x1: 0, x2: 0, y1: 0, y2: 1 });
    gradient.append(svgNode('stop', { offset: '0%', 'stop-color': '#6b9a60', 'stop-opacity': '.2' }), svgNode('stop', { offset: '100%', 'stop-color': '#6b9a60', 'stop-opacity': '.015' }));
    defs.append(gradient); svg.append(defs);
    svg.append(svgNode('path', { d: `${path} L${points.at(-1).x},${bottom} L${points[0].x},${bottom} Z`, fill: 'url(#confidence-fill)' }));
    svg.append(svgNode('path', { d: path, fill: 'none', stroke: '#43774d', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  }
  points.forEach(({ reading, x, y }, index) => {
    const point = svgNode('circle', { cx: x, cy: y, r: 4, fill: colors[LABELS.indexOf(reading.label)], stroke: '#fff', 'stroke-width': 2 });
    interactivePoint(host, point, `${reading.name}: ${percentage(reading.confidence)} · ${exportLabel(reading.label)}`);
    svg.append(point);
    if (index % 2 === 0 || index === points.length - 1) svg.append(svgNode('text', { x, y: 184, 'text-anchor': 'middle' }, String(index + 1).padStart(2, '0')));
  });
  if (!readings.length) empty(host, 'Cada lectura añade una nueva perspectiva', 'La confianza de tus muestras aparecerá aquí.');
}
