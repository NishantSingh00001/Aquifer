const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const baseData = window.AQUIFER_DATA;
const KEYS = { imported: 'aquifer-atlas-imported-v1', selected: 'aquifer-atlas-selected-v1', inputs: 'aquifer-atlas-inputs-v1', saved: 'aquifer-atlas-scenarios-v1' };
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const importedInitial = readStore(KEYS.imported, []);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function allWells() {
  const builtIn = baseData.observations.map((well) => ({ ...well, dates: baseData.dates, origin: 'CGWB sample 2021–22' }));
  const added = readStore(KEYS.imported, []).map((well) => ({ ...well, origin: 'Imported in this browser' }));
  return [...builtIn, ...added];
}

function isoLike(date) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthYear(date) {
  const parsed = isoLike(date);
  return parsed ? new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(parsed) : String(date);
}

function displayDate(date) {
  const parsed = isoLike(date);
  return parsed ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(parsed) : String(date);
}

function allDates(wells = allWells()) {
  return [...new Set(wells.flatMap((well) => well.dates || []))].sort((a, b) => {
    const da = isoLike(a); const db = isoLike(b);
    if (da && db) return da - db;
    return String(a).localeCompare(String(b));
  });
}

function valueAtDate(well, date) {
  const index = (well.dates || []).indexOf(date);
  return index < 0 ? null : well.values[index] ?? null;
}

function latestValue(well) {
  for (let i = (well.values || []).length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(Number(well.values[i]))) return Number(well.values[i]);
  }
  return null;
}

function selectedWell() {
  const name = localStorage.getItem(KEYS.selected);
  return allWells().find((well) => `${well.name}|${well.origin}` === name) || allWells()[0];
}

function setSelected(well) {
  if (well) localStorage.setItem(KEYS.selected, `${well.name}|${well.origin}`);
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function allObservationsCSV(wells = allWells()) {
  const rows = [['name', 'date', 'depth_m_bgl', 'district_as_reported', 'aquifer', 'record_source']];
  wells.forEach((well) => (well.dates || []).forEach((date, index) => {
    if (well.values[index] !== null && Number.isFinite(Number(well.values[index]))) {
      rows.push([well.name, date, Number(well.values[index]).toFixed(2), well.district || '', well.aquifer || '', well.origin]);
    }
  }));
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function renderOverview() {
  const wells = allWells();
  const dates = baseData.dates;
  $('#wellCount').textContent = String(wells.length);
  $('#periodCount').textContent = String(allDates(wells).length);
  const firstRows = wells.slice(0, 5);
  $('#overviewRows').innerHTML = firstRows.map((well) => {
    const values = dates.map((date) => valueAtDate(well, date));
    const first = values.find((value) => Number.isFinite(Number(value)));
    const last = [...values].reverse().find((value) => Number.isFinite(Number(value)));
    const change = Number.isFinite(Number(first)) && Number.isFinite(Number(last)) ? Number(last) - Number(first) : null;
    const note = change === null ? 'Incomplete rounds' : Math.abs(change) < .25 ? 'Little change' : change > 0 ? 'Depth increased' : 'Depth decreased';
    const className = change === null ? '' : change > .25 ? 'trend-up' : change < -.25 ? 'trend-down' : '';
    return `<tr data-well="${escapeHTML(well.name)}"><td>${escapeHTML(well.name)}</td><td>${escapeHTML(well.district || '—')}</td>${values.map((value) => `<td>${value == null ? '<span class="missing-value">—</span>' : `<span class="depth-chip ${Number(value) >= 4 ? 'deep' : Number(value) >= 2 ? 'mid' : ''}">${Number(value).toFixed(2)}</span>`}</td>`).join('')}<td class="${className}">${note}</td></tr>`;
  }).join('');
  $$('#overviewRows tr').forEach((row) => row.addEventListener('click', () => {
    const well = allWells().find((item) => item.name === row.dataset.well);
    if (well) setSelected(well);
    window.location.href = 'wells.html';
  }));
  renderOverviewChart();
  $$('#mapDots .well-dot').forEach((dot) => {
    const name = dot.dataset.well;
    dot.addEventListener('mouseenter', (event) => showMapTooltip(event, name));
    dot.addEventListener('focus', (event) => showMapTooltip(event, name));
    dot.addEventListener('mouseleave', hideMapTooltip);
    dot.addEventListener('blur', hideMapTooltip);
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', `${name}; open this site in the well explorer`);
    dot.addEventListener('click', () => {
      const match = allWells().find((well) => well.name === name);
      if (match) setSelected(match);
      window.location.href = 'wells.html';
    });
    dot.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dot.click(); } });
  });
  $('#mapLayer')?.addEventListener('click', () => {
    const hidden = $('#mapDots').classList.toggle('dots-hidden');
    $('#mapLayer').innerHTML = `${hidden ? 'Show well sites' : 'Well sites'} <span>⌄</span>`;
  });
  $('#mapExpand')?.addEventListener('click', () => { window.location.href = 'wells.html'; });
  initializeTerrain();
}

function initializeTerrain() {
  const canvas = $('#terrainCanvas');
  const toggle = $('#terrainToggle');
  const view = $('#terrainView');
  if (!canvas || !toggle || !view) return;
  const visual = $('.map-visual');
  const motion = $('#terrainMotion');
  const context = canvas.getContext('2d');
  if (!context) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0; let height = 0; let dragStart = null; let rotation = -.12; let autoRotate = false; let raf = 0;
  const gridSize = 38;
  const terrain = Array.from({ length: gridSize + 1 }, (_, i) => Array.from({ length: gridSize + 1 }, (_, j) => {
    const x = (i / gridSize - .5) * 2; const y = (j / gridSize - .5) * 2;
    const gaussian = (cx, cy, spread) => Math.exp(-((x-cx)**2 + (y-cy)**2) / spread);
    const ridge = .23 * gaussian(-.3, -.18, .17) + .28 * gaussian(.3, .24, .20) + .16 * gaussian(.08, -.45, .12);
    const basin = .3 * gaussian(.03, .03, .11) + .15 * gaussian(-.42, .42, .16);
    const ripple = .07 * Math.sin(x * 8 + y * 3) * Math.cos(y * 7 - x * 2);
    return Math.max(.08, Math.min(.92, .48 + ridge - basin + ripple));
  }));

  const resize = () => {
    const box = view.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    render();
  };
  const render = () => {
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const centerX = width * .51; const centerY = height * .57;
    const sx = Math.min(width * .29, height * .50); const sy = Math.min(width * .17, height * .23); const sz = Math.min(height * .52, width * .25);
    const ca = Math.cos(rotation); const sa = Math.sin(rotation);
    const points = terrain.map((row, i) => row.map((z, j) => {
      const xx = (i / gridSize - .5) * 2; const yy = (j / gridSize - .5) * 2;
      const rx = xx * ca - yy * sa; const ry = xx * sa + yy * ca;
      return { x: centerX + (rx - ry) * sx, y: centerY + (rx + ry) * sy - z * sz, z };
    }));
    const cells = [];
    for (let i = 0; i < gridSize; i += 1) for (let j = 0; j < gridSize; j += 1) cells.push({i,j,depth:i+j});
    cells.sort((a,b) => b.depth - a.depth);
    cells.forEach(({i,j}) => {
      const a=points[i][j], b=points[i+1][j], c=points[i+1][j+1], d=points[i][j+1];
      const avg=(a.z+b.z+c.z+d.z)/4;
      const hue=avg < .42 ? 177 + avg*10 : 91 + avg*17;
      const light=30 + avg*28;
      context.beginPath(); context.moveTo(a.x,a.y); context.lineTo(b.x,b.y); context.lineTo(c.x,c.y); context.lineTo(d.x,d.y); context.closePath();
      context.fillStyle=`hsl(${hue} 38% ${light}%)`; context.fill();
      context.strokeStyle='rgba(231,241,208,.13)'; context.lineWidth=.55; context.stroke();
    });
    context.save(); context.globalCompositeOperation='screen'; context.strokeStyle='rgba(194,227,184,.18)'; context.lineWidth=1;
    for (let i=4;i<gridSize;i+=5) {
      context.beginPath(); for(let j=0;j<=gridSize;j++){const p=points[i][j]; if(j===0)context.moveTo(p.x,p.y);else context.lineTo(p.x,p.y);} context.stroke();
      context.beginPath(); for(let j=0;j<=gridSize;j++){const p=points[j][i]; if(j===0)context.moveTo(p.x,p.y);else context.lineTo(p.x,p.y);} context.stroke();
    }
    context.restore();
  };
  const frame = () => { if (!autoRotate || document.hidden) return; rotation += .003; render(); raf = requestAnimationFrame(frame); };
  toggle.addEventListener('click', () => {
    const active = !visual.classList.contains('terrain-active');
    visual.classList.toggle('terrain-active', active); view.hidden = !active;
    toggle.setAttribute('aria-pressed', String(active)); toggle.innerHTML = active ? 'View field map <span>↗</span>' : 'View 3D terrain <span>↗</span>';
    if (active) { resize(); cancelAnimationFrame(raf); if (autoRotate && !reducedMotion) raf = requestAnimationFrame(frame); }
    else { autoRotate = false; motion.setAttribute('aria-pressed','false'); motion.innerHTML='<span>◌</span> Rotate surface'; }
  });
  motion.addEventListener('click', () => {
    autoRotate = !autoRotate; motion.setAttribute('aria-pressed',String(autoRotate));
    motion.innerHTML = autoRotate ? '<span>◌</span> Pause rotation' : '<span>◌</span> Rotate surface';
    if (!reducedMotion && autoRotate) { cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); render(); }
  });
  canvas.addEventListener('pointerdown', (event) => { dragStart = { x:event.clientX, rotation }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => { if (!dragStart) return; rotation = dragStart.rotation + (event.clientX - dragStart.x) * .008; render(); });
  canvas.addEventListener('pointerup', () => { dragStart = null; });
  canvas.addEventListener('pointercancel', () => { dragStart = null; });
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(view);
}

function showMapTooltip(event, name) {
  const tooltip = $('#mapTooltip');
  if (!tooltip) return;
  const rect = $('.map-visual').getBoundingClientRect();
  const x = (event.clientX || rect.left + rect.width * .5) - rect.left;
  const y = (event.clientY || rect.top + rect.height * .5) - rect.top;
  tooltip.textContent = `${name} · open well record`;
  tooltip.style.left = `${Math.max(8, Math.min(rect.width - 170, x + 10))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(rect.height - 35, y - 10))}px`;
  tooltip.classList.add('show');
}

function hideMapTooltip() { $('#mapTooltip')?.classList.remove('show'); }

function svgText(x, y, text, className = 'chart-label', anchor = 'middle') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}">${escapeHTML(text)}</text>`;
}

function renderOverviewChart() {
  const chart = $('#overviewChart');
  if (!chart) return;
  const wells = allWells();
  const dates = allDates(wells);
  const medians = dates.map((date) => {
    const values = wells.map((well) => valueAtDate(well, date)).filter((value) => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
    if (!values.length) return null;
    return values[Math.floor(values.length / 2)];
  });
  const maxVal = Math.max(6, ...medians.filter(Number.isFinite));
  const left = 10; const right = 690; const top = 12; const bottom = 174;
  const px = (i) => left + (dates.length <= 1 ? 0 : i / (dates.length - 1)) * (right - left);
  const py = (value) => top + (Number(value) / maxVal) * (bottom - top);
  let markup = '';
  [0, 2, 4, 6].forEach((value) => markup += `<line class="chart-grid-line" x1="${left}" y1="${py(value)}" x2="${right}" y2="${py(value)}"/>`);
  const available = medians.map((value, index) => value == null ? null : { x: px(index), y: py(value), value, date: dates[index] }).filter(Boolean);
  if (available.length > 1) {
    const line = available.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
    const area = `${line} L${available.at(-1).x},${bottom} L${available[0].x},${bottom} Z`;
    markup += `<path class="chart-observed-area" d="${area}"/><path class="chart-observed-line" d="${line}"/>`;
  }
  available.forEach((point) => {
    markup += `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="5"><title>${escapeHTML(displayDate(point.date))}: median ${point.value.toFixed(2)} m below ground</title></circle>`;
    markup += svgText(point.x, bottom + 20, monthYear(point.date));
  });
  chart.innerHTML = markup;
}

function renderWellsPage() {
  const table = $('.well-table');
  if (!table) return;
  const wells = allWells();
  const dates = allDates(wells).slice(-3);
  const roundSelect = $('#roundFilter');
  const previousRound = roundSelect.value;
  roundSelect.innerHTML = '<option value="all">All rounds</option>' + dates.map((date) => `<option value="${escapeHTML(date)}">${escapeHTML(displayDate(date))}</option>`).join('');
  if (dates.includes(previousRound)) roundSelect.value = previousRound;
  const header = $('.well-table thead tr');
  header.innerHTML = `<th>MONITORING SITE <button class="sort-button" id="sortWells" aria-label="Sort sites">↕</button></th><th>TYPE</th>${dates.map((date) => `<th>${escapeHTML(monthYear(date).toUpperCase())}<span>m bgl</span></th>`).join('')}<th>CHANGE <span>oldest → latest</span></th>`;
  const search = $('#wellSearch');
  const roundFilter = $('#roundFilter');
  const depthFilter = $('#depthFilter');
  let sortAscending = true;
  let showAllRows = false;

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const selectedRound = roundFilter.value === 'all' ? null : roundFilter.value;
    const depth = depthFilter.value;
    let rows = allWells().filter((well) => {
      const values = well.values || [];
      const last = latestValue(well);
      if (q && !`${well.name} ${well.district} ${well.aquifer}`.toLowerCase().includes(q)) return false;
      if (selectedRound && valueAtDate(well, selectedRound) == null) return false;
      if (depth === 'shallow' && !(last < 2)) return false;
      if (depth === 'mid' && !(last >= 2 && last < 4)) return false;
      if (depth === 'deep' && !(last >= 4)) return false;
      return true;
    });
    rows.sort((a, b) => a.name.localeCompare(b.name) * (sortAscending ? 1 : -1));
    const matchedCount = rows.length;
    const visibleRows = showAllRows ? rows : rows.slice(0, 8);
    const selected = selectedWell();
    $('#wellRows').innerHTML = visibleRows.map((well) => {
      const latestDates = allDates(allWells()).slice(-3);
      const values = latestDates.map((date) => valueAtDate(well, date));
      const finite = values.filter((value) => Number.isFinite(Number(value))).map(Number);
      const change = finite.length > 1 ? finite.at(-1) - finite[0] : null;
      const recordType = well.origin === 'Imported in this browser' ? 'IMPORTED' : 'UNCONFINED';
      const sourceNote = well.origin === 'Imported in this browser' ? `Imported record · ${well.name}` : `CGWB sample · ${well.name}`;
      return `<tr class="${selected && selected.name === well.name && selected.origin === well.origin ? 'selected' : ''}" data-name="${escapeHTML(well.name)}" data-origin="${escapeHTML(well.origin)}" title="${escapeHTML(sourceNote)}"><td>${escapeHTML(well.name)}<small class="origin-tag">${escapeHTML(well.origin === 'Imported in this browser' ? 'YOUR FILE' : 'SOURCE SAMPLE')}</small></td><td><span class="type-tag">${recordType}</span></td>${values.map((value) => `<td>${value == null ? '<span class="missing-value">—</span>' : Number(value).toFixed(2)}</td>`).join('')}<td class="${change == null ? '' : change > 0 ? 'trend-up' : 'trend-down'}">${change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)} m`}</td></tr>`;
    }).join('');
    $('#wellResultCount').textContent = `Showing ${visibleRows.length} of ${matchedCount} matching records`;
    $('#emptyWells').hidden = matchedCount > 0;
    $('#loadMoreWells').hidden = matchedCount <= 8;
    $('#loadMoreWells').innerHTML = showAllRows ? 'Show fewer records <b>↑</b>' : 'Show all matching records <b>↓</b>';
    $$('#wellRows tr').forEach((row) => row.addEventListener('click', () => {
      const well = allWells().find((item) => item.name === row.dataset.name && item.origin === row.dataset.origin);
      setSelected(well); draw(); renderWellDetail(well);
    }));
  };
  [search, roundFilter, depthFilter].forEach((control) => control.addEventListener(control === search ? 'input' : 'change', () => { showAllRows = false; draw(); }));
  $('#clearFilters').addEventListener('click', () => { search.value = ''; roundFilter.value = 'all'; depthFilter.value = 'all'; draw(); showToast('Filters reset'); });
  header.querySelector('#sortWells').addEventListener('click', () => { sortAscending = !sortAscending; draw(); });
  $('#loadMoreWells').addEventListener('click', () => { showAllRows = !showAllRows; draw(); });
  $('#downloadSample').addEventListener('click', () => downloadFile('aquifer-atlas-observations.csv', allObservationsCSV(), 'text/csv;charset=utf-8'));
  $('#downloadTemplate').addEventListener('click', () => downloadFile('aquifer-atlas-import-template.csv', 'name,date,depth_m_bgl\nSample well,2024-05-01,4.25\n', 'text/csv;charset=utf-8'));
  $('#clearImported').addEventListener('click', () => {
    const imported = readStore(KEYS.imported, []);
    if (!imported.length) { showToast('There are no imported records to remove'); return; }
    writeStore(KEYS.imported, []);
    showToast('Imported data removed from this browser');
    window.setTimeout(() => window.location.reload(), 550);
  });
  $('#csvUpload').addEventListener('change', importCSV);
  $('#useWellForForecast').addEventListener('click', () => { window.location.href = 'forecast.html'; });
  renderWellDetail(selectedWell());
  draw();
}

function renderWellDetail(well) {
  if (!well) return;
  setText('#selectedWellName', well.name);
  setText('#selectedWellMeta', `${well.district || 'Imported record'} · ${well.aquifer || 'Aquifer type not supplied'}`);
  const value = latestValue(well);
  setText('#selectedWellValue', value == null ? '—' : value.toFixed(2));
  const date = [...(well.dates || [])].reverse().find((candidate) => valueAtDate(well, candidate) != null);
  $('#selectedWellValue').nextElementSibling.innerHTML = `m bgl<br><small>${date ? escapeHTML(displayDate(date)) : 'No dated observation'}</small>`;
  const chart = $('#wellDetailChart');
  if (!chart) return;
  const vals = (well.dates || []).map((dateKey, index) => ({ date: dateKey, value: well.values[index] })).filter((item) => item.value != null && Number.isFinite(Number(item.value)));
  if (!vals.length) { chart.innerHTML = '<text x="160" y="70" text-anchor="middle" fill="#89948c" font-size="10">No observations to chart</text>'; return; }
  const max = Math.max(6, ...vals.map((item) => Number(item.value)));
  const x = (i) => 20 + (vals.length < 2 ? 145 : i * (290 / (vals.length - 1)));
  const y = (n) => 14 + Number(n) / max * 100;
  let markup = [14, 64, 114].map((yy) => `<line class="chart-grid-line" x1="15" y1="${yy}" x2="315" y2="${yy}"/>`).join('');
  const path = vals.map((item, i) => `${i ? 'L' : 'M'}${x(i)},${y(item.value)}`).join(' ');
  if (vals.length > 1) markup += `<path d="${path}" class="detail-line"/>`;
  vals.forEach((item, i) => { markup += `<circle cx="${x(i)}" cy="${y(item.value)}" r="5" class="detail-point"><title>${escapeHTML(displayDate(item.date))}: ${Number(item.value).toFixed(2)} m bgl</title></circle>`; });
  chart.innerHTML = markup;
  $$('.detail-date-row span').forEach((span, index) => { span.textContent = vals[index] ? monthYear(vals[index].date) : '—'; });
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('The CSV needs a header and at least one data row.');
  const parseLine = (line) => {
    const result = []; let current = ''; let quote = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quote) { current += '"'; i += 1; }
      else if (char === '"') quote = !quote;
      else if (char === ',' && !quote) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim()); return result;
  };
  const header = parseLine(lines[0]).map((cell) => cell.toLowerCase().trim());
  const nameIndex = header.indexOf('name');
  const dateIndex = header.indexOf('date');
  const valueIndex = header.indexOf('depth_m_bgl');
  if ([nameIndex, dateIndex, valueIndex].some((index) => index < 0)) throw new Error('Required CSV headers: name,date,depth_m_bgl');
  const grouped = new Map();
  lines.slice(1).forEach((line) => {
    const row = parseLine(line); const name = row[nameIndex]; const date = row[dateIndex]; const value = Number(row[valueIndex]);
    if (!name || !date || !Number.isFinite(value) || value < 0) return;
    const key = name.trim();
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key).set(date.trim(), Number(value.toFixed(3)));
  });
  if (!grouped.size) throw new Error('No usable rows found. Check dates and numeric depth_m_bgl values.');
  return [...grouped.entries()].map(([name, readings]) => {
    const dates = [...readings.keys()].sort((a, b) => (isoLike(a) && isoLike(b) ? isoLike(a) - isoLike(b) : a.localeCompare(b))).slice(-24);
    return { name, district: 'Imported by you', aquifer: '', dates, values: dates.map((date) => readings.get(date)) };
  });
}

async function importCSV(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = parseCSV(await file.text());
    const other = readStore(KEYS.imported, []).filter((existing) => !parsed.some((incoming) => incoming.name === existing.name));
    writeStore(KEYS.imported, [...other, ...parsed]);
    showToast(`Imported ${parsed.length} well record${parsed.length === 1 ? '' : 's'} to this browser`);
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    showToast(error.message);
    event.target.value = '';
  }
}

function latestMeasurement(well) {
  for (let i = well.values.length - 1; i >= 0; i -= 1) if (well.values[i] != null) return { date: well.dates[i], value: Number(well.values[i]) };
  return null;
}

function getInputs(storageKey = KEYS.inputs) {
  return readStore(storageKey, { rainfall: 100, pumping: 0, recharge: 0, well: selectedWell().name });
}

function scenarioProjection(well, inputs, months = 12) {
  const measured = (well.dates || []).map((date, index) => ({ date, value: well.values[index] == null ? null : Number(well.values[index]) })).filter((row) => row.value != null);
  if (!measured.length) return { measured, points: [], delta: 0, slope: 0, base: 0 };
  const first = measured[0]; const last = measured.at(-1);
  const firstDate = isoLike(first.date); const lastDate = isoLike(last.date);
  const durationYears = firstDate && lastDate ? Math.max((lastDate - firstDate) / (365.25 * 86400000), .15) : .5;
  const historicalSlope = Math.max(-.5, Math.min(.5, (last.value - first.value) / durationYears));
  const rainSlope = ((100 - Number(inputs.rainfall)) / 10) * .10;
  const pumpSlope = (Number(inputs.pumping) / 10) * .12;
  const rechargeSlope = (Number(inputs.recharge) / 10) * -.06;
  const slope = historicalSlope + rainSlope + pumpSlope + rechargeSlope;
  const baselineSlope = historicalSlope;
  const points = Array.from({ length: months + 1 }, (_, month) => ({
    month,
    date: month === 0 ? last.date : null,
    scenario: last.value + slope * (month / 12),
    baseline: last.value + baselineSlope * (month / 12),
    spread: .15 * (month / 12),
  }));
  return { measured, points, delta: slope - baselineSlope, slope, historicalSlope, base: last.value };
}

function chartLinesMarkup(points, opts = {}) {
  if (!points.length) return '';
  const values = points.flatMap((point) => [point.scenario, point.baseline, point.scenario - point.spread, point.scenario + point.spread]);
  const min = Math.min(0, ...values); const max = Math.max(8, ...values); const x0 = 22; const x1 = 780; const y0 = 18; const y1 = 278;
  const x = (i) => x0 + (i / Math.max(points.length - 1, 1)) * (x1 - x0);
  const y = (value) => y0 + (Number(value) - min) / Math.max(max - min, .01) * (y1 - y0);
  let markup = '';
  [0, 2, 4, 6, 8].filter((value) => value <= max).forEach((value) => { markup += `<line class="forecast-grid" x1="${x0}" y1="${y(value)}" x2="${x1}" y2="${y(value)}"/>${svgText(x0 - 7, y(value) + 3, `${value}m`, 'forecast-axis-label', 'end')}`; });
  const up = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.scenario - p.spread)}`).join(' ');
  const down = [...points].reverse().map((p, ri) => { const i = points.length - 1 - ri; return `L${x(i)},${y(p.scenario + p.spread)}`; }).join(' ');
  markup += `<path class="forecast-range" d="${up} ${down} Z"/>`;
  const basePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.baseline)}`).join(' ');
  const scenarioPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.scenario)}`).join(' ');
  markup += `<path class="forecast-baseline" d="${basePath}"/><path class="forecast-scenario" d="${scenarioPath}"/>`;
  const monthLabels = opts.monthLabels || ['Now', '3 mo', '6 mo', '9 mo', '12 mo'];
  [0, 3, 6, 9, 12].forEach((i, labelIndex) => {
    const index = Math.min(i, points.length - 1);
    markup += svgText(x(index), y1 + 20, monthLabels[labelIndex] || `${i} mo`, 'forecast-axis-label');
  });
  if (opts.showMeasured !== false) {
    const measurePoints = opts.measured || [];
    if (measurePoints.length) {
      const maxVal = max;
      measurePoints.forEach((row) => {
        const count = measurePoints.length;
        const xx = count === 1 ? x(0) : x(Math.round((measurePoints.indexOf(row) / Math.max(count - 1, 1)) * 0));
        const offset = count === 1 ? 0 : measurePoints.indexOf(row) / (count - 1) * (x(0) - 4);
        const mx = x(0) - offset;
        markup += `<circle class="measured-dot" cx="${mx}" cy="${y(row.value)}" r="4"><title>${escapeHTML(displayDate(row.date))}: ${Number(row.value).toFixed(2)} m bgl</title></circle>`;
      });
    }
  }
  return markup;
}

function chartMarkup(well, projection, options = {}) {
  const values = [...projection.points.map((point) => point.scenario), ...projection.measured.map((row) => row.value)];
  const minVal = Math.max(0, Math.min(...values) - .3);
  const maxVal = Math.max(...values) + .3;
  const range = Math.max(maxVal - minVal, 1);
  const x0 = 20; const x1 = options.viewBoxWidth || 760; const y0 = 15; const y1 = options.viewBoxHeight || 280;
  const px = (i, total) => x0 + (i / Math.max(total - 1, 1)) * (x1 - x0);
  const py = (v) => y0 + ((Number(v) - minVal) / range) * (y1 - y0);
  let markup = '';
  for (let i = 0; i <= 4; i += 1) {
    const val = minVal + range * i / 4;
    const yy = py(val);
    markup += `<line class="forecast-grid" x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}"/>${svgText(x0 - 6, yy + 3, val.toFixed(1), 'forecast-axis-label', 'end')}`;
  }
  const scenario = projection.points;
  const upper = scenario.map((p, i) => `${i ? 'L' : 'M'}${px(i, scenario.length)},${py(p.scenario - p.spread)}`).join(' ');
  const lower = [...scenario].reverse().map((p, reverseIndex) => { const i = scenario.length - 1 - reverseIndex; return `L${px(i, scenario.length)},${py(p.scenario + p.spread)}`; }).join(' ');
  markup += `<path class="forecast-range" d="${upper} ${lower} Z"/>`;
  const baseline = scenario.map((p, i) => `${i ? 'L' : 'M'}${px(i, scenario.length)},${py(p.baseline)}`).join(' ');
  const projected = scenario.map((p, i) => `${i ? 'L' : 'M'}${px(i, scenario.length)},${py(p.scenario)}`).join(' ');
  markup += `<path class="forecast-baseline" d="${baseline}"/><path class="forecast-scenario" d="${projected}"/>`;
  const measures = projection.measured;
  measures.forEach((row, i) => {
    const xx = measures.length === 1 ? x0 : x0 + (i / Math.max(measures.length - 1, 1)) * 110;
    markup += `<circle class="measured-dot" cx="${xx}" cy="${py(row.value)}" r="4"><title>${escapeHTML(displayDate(row.date))}: ${Number(row.value).toFixed(2)} m bgl</title></circle>`;
  });
  const labels = ['Now', '3 mo', '6 mo', '9 mo', '12 mo'];
  [0, 3, 6, 9, 12].forEach((month, i) => markup += svgText(px(month, scenario.length), y1 + 20, labels[i], 'forecast-axis-label'));
  return markup;
}

function renderForecastPage() {
  const chart = $('#forecastChart');
  if (!chart) return;
  const inputs = getInputs();
  const wells = allWells();
  const select = $('#forecastWell');
  select.innerHTML = wells.map((well) => `<option value="${escapeHTML(well.name)}|${escapeHTML(well.origin)}">${escapeHTML(well.name)} · ${escapeHTML(well.origin === 'Imported in this browser' ? 'your data' : 'CGWB sample')}</option>`).join('');
  const chosen = wells.find((well) => well.name === inputs.well) || selectedWell();
  select.value = `${chosen.name}|${chosen.origin}`;
  $('#rainfallInput').value = inputs.rainfall;
  $('#pumpingInput').value = inputs.pumping;
  $('#rechargeInput').value = inputs.recharge;

  const update = () => {
    const well = allWells().find((item) => `${item.name}|${item.origin}` === select.value) || allWells()[0];
    const current = { rainfall: Number($('#rainfallInput').value), pumping: Number($('#pumpingInput').value), recharge: Number($('#rechargeInput').value), well: well.name };
    writeStore(KEYS.inputs, current); setSelected(well);
    setText('#rainfallOutput', `${current.rainfall}%`); setText('#pumpingOutput', `${current.pumping > 0 ? '+' : ''}${current.pumping}%`); setText('#rechargeOutput', `${current.recharge}%`);
    setText('#forecastTitle', `${well.name} · 12-month scenario`);
    const projection = scenarioProjection(well, current);
    chart.innerHTML = chartMarkup(well, projection, { viewBoxWidth: 780, viewBoxHeight: 287 });
    const delta = projection.delta;
    setText('#projectionDelta', `${delta > 0 ? '+' : ''}${delta.toFixed(2)} m`);
    setText('#projectionInterpretation', delta > .05 ? 'Under these assumptions, the simulated water depth increases relative to the baseline path.' : delta < -.05 ? 'Under these assumptions, the simulated water depth decreases relative to the baseline path.' : 'Current assumptions keep the scenario close to the baseline path.');
  };
  [select, $('#rainfallInput'), $('#pumpingInput'), $('#rechargeInput')].forEach((control) => control.addEventListener('input', update));
  $('#resetForecast').addEventListener('click', () => { $('#rainfallInput').value = 100; $('#pumpingInput').value = 0; $('#rechargeInput').value = 0; update(); showToast('Forecast assumptions reset'); });
  $('#exportForecast').addEventListener('click', () => {
    const well = allWells().find((item) => `${item.name}|${item.origin}` === select.value);
    const current = { rainfall: Number($('#rainfallInput').value), pumping: Number($('#pumpingInput').value), recharge: Number($('#rechargeInput').value) };
    const projection = scenarioProjection(well, current);
    const rows = [['type', 'month', 'depth_m_bgl', 'source_or_status'], ...projection.measured.map((row) => ['observed', row.date, row.value, well.origin]), ...projection.points.map((point) => ['scenario_projection', `+${point.month} months`, point.scenario.toFixed(3), 'illustrative model'])];
    downloadFile('aquifer-atlas-forecast.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  });
  $('#sendScenario').addEventListener('click', () => { writeStore(KEYS.inputs, { rainfall: Number($('#rainfallInput').value), pumping: Number($('#pumpingInput').value), recharge: Number($('#rechargeInput').value), well: select.value.split('|')[0] }); window.location.href = 'scenarios.html'; });
  update();
}

function renderScenarioPage() {
  const chart = $('#scenarioChart');
  if (!chart) return;
  const inputs = getInputs();
  const wells = allWells();
  $('#scenarioWell').innerHTML = wells.map((well) => `<option value="${escapeHTML(well.name)}|${escapeHTML(well.origin)}">${escapeHTML(well.name)}</option>`).join('');
  const selected = wells.find((well) => well.name === inputs.well) || selectedWell();
  $('#scenarioWell').value = `${selected.name}|${selected.origin}`;
  $('#scenarioRainfall').value = inputs.rainfall; $('#scenarioPumping').value = inputs.pumping; $('#scenarioRecharge').value = inputs.recharge;
  const values = () => ({ rainfall: Number($('#scenarioRainfall').value), pumping: Number($('#scenarioPumping').value), recharge: Number($('#scenarioRecharge').value), well: $('#scenarioWell').value.split('|')[0] });

  const run = (showMessage = false) => {
    const current = values();
    const well = wells.find((item) => `${item.name}|${item.origin}` === $('#scenarioWell').value) || wells[0];
    writeStore(KEYS.inputs, current); setSelected(well);
    setText('#scenarioRainfallOutput', `${current.rainfall}%`); setText('#scenarioPumpingOutput', `${current.pumping > 0 ? '+' : ''}${current.pumping}%`); setText('#scenarioRechargeOutput', `${current.recharge}%`);
    setText('#resultName', $('#scenarioName').value || 'Untitled scenario');
    setText('#resultRainfall', `${current.rainfall}%`); setText('#resultPumping', `${current.pumping > 0 ? '+' : ''}${current.pumping}%`); setText('#resultRecharge', `${current.recharge}%`);
    const projection = scenarioProjection(well, current);
    const baseline = scenarioProjection(well, { rainfall: 100, pumping: 0, recharge: 0 });
    const points = projection.points.map((point, i) => ({ ...point, baseline: baseline.points[i]?.scenario ?? point.baseline }));
    chart.innerHTML = chartMarkup(well, { ...projection, points }, { viewBoxWidth: 620, viewBoxHeight: 193, measured: false });
    const delta = projection.delta;
    $('#scenarioDelta').innerHTML = `${delta > 0 ? '+' : ''}${delta.toFixed(2)} <small>m</small>`;
    setText('#scenarioDirection', delta > .05 ? '↑ Deeper under this scenario' : delta < -.05 ? '↓ Shallower under this scenario' : '≈ Near baseline');
    $('#scenarioDirection').className = `result-direction ${delta > .05 ? 'result-risk' : delta < -.05 ? 'result-benefit' : ''}`;
    if (showMessage) showToast('Scenario recalculated with the local model');
  };

  $$('.preset-card').forEach((button) => button.addEventListener('click', () => {
    $$('.preset-card').forEach((item) => item.classList.toggle('selected', item === button));
    const preset = button.dataset.preset;
    const config = preset === 'dry' ? { name: 'Drier, higher demand', rainfall: 75, pumping: 15, recharge: 0 } : preset === 'recharge' ? { name: 'Recharge and conserve', rainfall: 105, pumping: -20, recharge: 60 } : { name: 'Reference season', rainfall: 100, pumping: 0, recharge: 0 };
    $('#scenarioName').value = config.name; $('#scenarioRainfall').value = config.rainfall; $('#scenarioPumping').value = config.pumping; $('#scenarioRecharge').value = config.recharge; run();
  }));
  ['#scenarioRainfall', '#scenarioPumping', '#scenarioRecharge', '#scenarioWell'].forEach((selector) => $(selector).addEventListener('input', run));
  $('#runScenario').addEventListener('click', () => run(true));
  $('#resetScenario').addEventListener('click', () => { $('#scenarioName').value = 'Reference season'; $('#scenarioRainfall').value = 100; $('#scenarioPumping').value = 0; $('#scenarioRecharge').value = 0; $$('.preset-card').forEach((button) => button.classList.toggle('selected', button.dataset.preset === 'baseline')); run(); showToast('Scenario planner reset'); });
  $('#saveScenario').addEventListener('click', () => {
    const current = values();
    const saved = readStore(KEYS.saved, []);
    saved.unshift({ ...current, name: $('#scenarioName').value.trim() || 'Untitled scenario', savedAt: new Date().toISOString() });
    writeStore(KEYS.saved, saved.slice(0, 12)); renderSavedScenarios(); showToast('Scenario saved in this browser');
  });
  $('#downloadScenario').addEventListener('click', () => {
    const current = values(); const well = wells.find((item) => `${item.name}|${item.origin}` === $('#scenarioWell').value) || wells[0];
    const projection = scenarioProjection(well, current);
    const rows = [['name', 'well', 'rainfall_percent', 'pumping_change_percent', 'recharge_effort_percent', 'month', 'scenario_depth_m_bgl', 'baseline_depth_m_bgl'], ...projection.points.map((point) => [$('#scenarioName').value, well.name, current.rainfall, current.pumping, current.recharge, point.month, point.scenario.toFixed(3), point.baseline.toFixed(3)])];
    downloadFile('aquifer-atlas-scenario.csv', rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  });
  renderSavedScenarios(); run();
}

function renderSavedScenarios() {
  const target = $('#savedList');
  if (!target) return;
  const saved = readStore(KEYS.saved, []);
  setText('#savedCount', `${saved.length} saved`);
  if (!saved.length) { target.innerHTML = '<div class="saved-empty"><span>↗</span><b>No saved scenarios yet.</b><small>Save the inputs above to compare them later in this browser.</small></div>'; return; }
  target.innerHTML = saved.map((item, index) => `<div class="saved-row" data-index="${index}"><b>${escapeHTML(item.name)}</b><span>Rain ${item.rainfall}%</span><span>Pump ${item.pumping > 0 ? '+' : ''}${item.pumping}%</span><span>Recharge ${item.recharge}%</span><button data-load="${index}">Load</button><button class="delete-saved" data-delete="${index}" aria-label="Delete ${escapeHTML(item.name)}">Remove</button></div>`).join('');
  $$('[data-load]', target).forEach((button) => button.addEventListener('click', () => {
    const item = readStore(KEYS.saved, [])[Number(button.dataset.load)];
    if (!item) return;
    $('#scenarioName').value = item.name; $('#scenarioRainfall').value = item.rainfall; $('#scenarioPumping').value = item.pumping; $('#scenarioRecharge').value = item.recharge; $('#scenarioWell').value = `${item.well}|${allWells().find((well) => well.name === item.well)?.origin || ''}`; window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#runScenario').click();
  }));
  $$('[data-delete]', target).forEach((button) => button.addEventListener('click', () => { const updated = readStore(KEYS.saved, []); updated.splice(Number(button.dataset.delete), 1); writeStore(KEYS.saved, updated); renderSavedScenarios(); showToast('Saved scenario removed'); }));
}

function renderEvidencePage() {
  if (!$('#downloadSources')) return;
  const notes = {
    dataset: baseData.title,
    source: baseData.sourceUrl,
    observation_periods: baseData.dates,
    unit: 'metres below ground level (m bgl)',
    bundled_rows: baseData.observations.length,
    missing_data: 'Source dashes are preserved as null; no values are imputed.',
    map: 'Schematic only; no surveyed coordinates are bundled.',
    method: 'Bounded slope plus explicit rainfall, pumping, and recharge sensitivity factors. Assumptions are illustrative, not locally calibrated.',
    limitations: ['historical small sample', 'not a live feed', 'not an official groundwater assessment', 'not a water allocation recommendation'],
  };
  $('#downloadSources').addEventListener('click', () => downloadFile('aquifer-atlas-source-notes.json', JSON.stringify(notes, null, 2), 'application/json'));
  $('#copyCitation').addEventListener('click', async () => {
    const citation = `Central Ground Water Board. ${baseData.title}. Observation rounds: Aug 2021, Nov 2021, Jan 2022. Unit: metres below ground level (m bgl). Small prototype sample; scenario projections are illustrative and not a current groundwater assessment. ${baseData.sourceUrl}`;
    try { await navigator.clipboard.writeText(citation); showToast('Citation copied to clipboard'); }
    catch { downloadFile('aquifer-atlas-citation.txt', citation); showToast('Clipboard unavailable; citation downloaded instead'); }
  });
}

function globalInteractions() {
  $$('[data-open-about]').forEach((button) => button.addEventListener('click', () => { const dialog = $('#aboutDialog'); if (dialog?.showModal) dialog.showModal(); else showToast('A free public-data groundwater research prototype for Thane.'); }));
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  $('#aboutDialog')?.addEventListener('click', (event) => { if (event.target === $('#aboutDialog')) $('#aboutDialog').close(); });
  $('.mobile-menu')?.addEventListener('click', () => {
    const nav = $('.top-nav'); const open = nav.classList.toggle('mobile-open');
    $('.mobile-menu').setAttribute('aria-expanded', String(open));
    $('.mobile-menu').textContent = open ? '×' : '☰';
  });
}

globalInteractions();
const page = document.body.dataset.page;
if (page === 'overview') renderOverview();
if (page === 'wells') renderWellsPage();
if (page === 'forecast') renderForecastPage();
if (page === 'scenarios') renderScenarioPage();
if (page === 'evidence') renderEvidencePage();
