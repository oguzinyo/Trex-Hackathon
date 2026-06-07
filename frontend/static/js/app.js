/* ════════════════════════════════════════════
   CNC Anomaly Intelligence — Application v2.1
   ════════════════════════════════════════════ */

const API = '';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ════════ HTTP HELPER ════════
async function api(path) {
  try {
    const r = await fetch(API + path);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

const fmt = (n, d = 1) => n != null ? Number(n).toFixed(d) : '--';
const fmtK = (n) => {
  if (n == null) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toString();
};
const fmtMoney = (n) => n != null ? Math.round(n).toLocaleString('tr-TR') + '₺' : '--';
const escapeHtml = (s) => (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ════════ TOAST SYSTEM ════════
let toastEl;
function toast(msg, type = 'info', duration = 3500) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast-container';
    document.body.appendChild(toastEl);
  }
  const icons = { success: '✓', error: '!', info: 'i', warning: '⚠' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-icon">${icons[type]}</div><div>${escapeHtml(msg)}</div>`;
  toastEl.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, duration);
}

// ════════ SKELETON ════════
const skeleton = (n = 3) => `<div class="grid g3">${Array.from({ length: n }).map(() => `
  <div class="skel-card card">
    <div class="skeleton skel-line lg w50"></div>
    <div class="skeleton skel-line w70"></div>
    <div class="skeleton skel-line"></div>
    <div class="skeleton skel-line w50"></div>
  </div>`).join('')}</div>`;

// ════════ HEALTH RING ════════
function healthRing(score, status) {
  const colors = { critical: '#f87171', warning: '#fbbf24', good: '#34d399' };
  const c = colors[status] || '#6b7280';
  const r = 17, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(score, 100) / 100) * circ;
  return `<div class="health-ring"><svg width="46" height="46" viewBox="0 0 46 46">
    <circle cx="23" cy="23" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="4"/>
    <circle cx="23" cy="23" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg><div class="score" style="color:${c}">${Math.round(score)}</div></div>`;
}

function confidenceBar(c) {
  const pct = Math.round((c || 0) * 100);
  const cls = c < 0.5 ? 'conf-very-low' : c < 0.7 ? 'conf-low' : '';
  return `<span class="conf-bar ${cls}" data-tip="RCA güven skoru — kanıtın gücüne göre">
    <span class="conf-track"><span class="conf-fill" style="width:${pct}%"></span></span>
    <span>${pct}%</span>
  </span>`;
}

const areaLabels = {
  availability: 'Availability', performance: 'Performance', data_quality: 'Veri Kalitesi',
  maintenance: 'Bakım', program_quality: 'Program', response_time: 'Tepki Süresi',
  operator_behavior: 'Operatör Davranışı', sensor_coverage: 'Sensör Kapsama',
  unknown: 'Diğer'
};
const areaBadge = (a) => `<span class="area-badge area-${a || 'unknown'}">${areaLabels[a] || a || '—'}</span>`;

// ════════ TAB ROUTING ════════
const loaders = {};
function activatePanel(id) {
  $$('.tab[data-panel]').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === id));
  if (loaders[id] && !loaders[`${id}_loaded`]) {
    loaders[id]();
    loaders[`${id}_loaded`] = true;
  }
  history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════
// PANEL 1: OVERVIEW
// ════════════════════════════════════════════
async function loadOverview() {
  const el = $('#health-cards');
  el.innerHTML = skeleton(6);
  try {
    const data = await api('/api/health');

    const totalPieces = data.reduce((s, m) => s + (m.total_pieces || 0), 0);
    const totalAlarms = data.reduce((s, m) => s + (m.alarm_count || 0), 0);
    const totalDown = data.reduce((s, m) => s + (m.stop_hours || 0), 0);
    const avgOEE = data.reduce((s, m) => s + (m.avg_oee || 0), 0) / data.length;
    const avgA = data.reduce((s, m) => s + (m.avg_A || 0), 0) / data.length;
    const critCount = data.filter(m => m.status === 'critical').length;

    $('#kpi-oee').textContent = (avgOEE * 100).toFixed(1) + '%';
    $('#kpi-oee').style.color = avgOEE > 0.3 ? 'var(--good)' : 'var(--critical)';
    $('#kpi-pieces').textContent = totalPieces.toLocaleString('tr-TR');
    $('#kpi-alarms').textContent = totalAlarms;
    $('#kpi-downtime').textContent = Math.round(totalDown).toLocaleString('tr-TR') + 'h';
    $('#kpi-avail').textContent = (avgA * 100).toFixed(1) + '%';
    $('#kpi-avail').style.color = avgA > 0.5 ? 'var(--good)' : 'var(--warning)';

    $('#badge-critical').innerHTML = `<span class="badge-dot"></span> ${critCount} Kritik`;
    $('#badge-machines').innerHTML = `<span class="badge-dot"></span> ${data.length} Makine`;

    el.innerHTML = `<div class="grid g4">${data.map(m => `
      <div class="card m-card st-${m.status}" onclick="goToTrend('${escapeHtml(m.machine)}')">
        <div class="m-bar"></div>
        ${healthRing(m.health_score, m.status)}
        <div class="m-name">${m.machine}</div>
        <div class="m-status ${m.status}">${m.status === 'critical' ? 'KRİTİK' : m.status === 'warning' ? 'UYARI' : 'NORMAL'}</div>
        <div class="m-metrics">
          <div class="m-metric" data-tip="OEE = A × P × Q">
            <div class="mv" style="color:${m.avg_oee > 0.02 ? 'var(--good)' : 'var(--critical)'}">${(m.avg_oee * 100).toFixed(1)}%</div>
            <div class="ml">OEE</div>
          </div>
          <div class="m-metric" data-tip="Toplam üretilen parça">
            <div class="mv">${fmtK(m.total_pieces)}</div>
            <div class="ml">Parça</div>
          </div>
          <div class="m-metric" data-tip="MES alarm sayısı">
            <div class="mv" style="color:${m.alarm_count > 0 ? 'var(--critical)' : 'var(--muted)'}">${m.alarm_count}</div>
            <div class="ml">Alarm</div>
          </div>
        </div>
        <div class="m-footer">
          <span>A: ${(m.avg_A * 100).toFixed(1)}%</span>
          <span>Duruş: ${m.stop_hours.toFixed(0)}h</span>
        </div>
      </div>`).join('')}</div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--critical);padding:20px">Yükleme hatası: ${e.message}</p>`;
  }
}

function goToTrend(machine) {
  activatePanel('oee-trend');
  setTimeout(() => { $('#trend-machine').value = machine; loadTrend(); }, 50);
}

// ════════════════════════════════════════════
// PANEL 2: PROBLEMS (zenginleştirilmiş — confidence + area + evidence)
// ════════════════════════════════════════════
let allProblems = [];
async function loadProblems() {
  const el = $('#problem-cards');
  el.innerHTML = skeleton(6);
  try {
    allProblems = await api('/api/problems');
    renderProblems(allProblems);

    const c = allProblems.filter(p => p.severity === 'critical').length;
    const h = allProblems.filter(p => p.severity === 'high').length;
    const m = allProblems.filter(p => p.severity === 'medium').length;
    $('#filter-all').textContent = `Tümü (${allProblems.length})`;
    $('#filter-critical').textContent = `Kritik (${c})`;
    $('#filter-high').textContent = `Yüksek (${h})`;
    $('#filter-medium').textContent = `Orta (${m})`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }
}

function renderProblems(data) {
  const el = $('#problem-cards');
  if (!data.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center">Bu filtrede problem yok</p>';
    return;
  }
  el.innerHTML = `<div class="grid g3">${data.map(p => {
    if (p.error) return `<div class="card p-card"><div class="p-title">Problem #${p.id}: Hata</div><p style="color:var(--muted)">${p.error}</p></div>`;
    const sevLabel = { critical: 'KRİTİK', high: 'YÜKSEK', medium: 'ORTA' }[p.severity] || '';
    const evidence = p.evidence_items || [];
    return `
    <div class="card p-card sev-${p.severity}" onclick="this.classList.toggle('expanded')">
      <div class="p-head">
        <div class="p-title">${escapeHtml(p.title)}</div>
        <span class="p-badge">#${p.id} ${sevLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
        ${areaBadge(p.impact_area)}
        ${p.confidence != null ? confidenceBar(p.confidence) : ''}
      </div>
      <div class="p-machine">${escapeHtml(p.machine || '')}</div>
      <div class="p-evidence">${escapeHtml(p.evidence || '')}</div>
      ${evidence.length > 1 ? `<div class="evidence-list"><ul>${evidence.slice(1).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
      <div class="p-rootcause"><strong>Kök Neden:</strong> ${escapeHtml(p.root_cause || '')}</div>
      <div class="p-solution"><strong>Çözüm:</strong> ${escapeHtml(p.solution || '')}</div>
      <div class="p-expand">▾ Çözümü göster</div>
    </div>`;
  }).join('')}</div>`;
}

function filterProblems(sev, btn) {
  $$('#sev-filters .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (sev === 'all') renderProblems(allProblems);
  else renderProblems(allProblems.filter(p => p.severity === sev));
}
function filterByArea(area, btn) {
  $$('#sev-filters .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderProblems(allProblems.filter(p => p.impact_area === area));
}

// ════════════════════════════════════════════
// PANEL 3: WHAT-IF
// ════════════════════════════════════════════
async function runWhatIf() {
  const machine = $('#wf-machine').value;
  const scenario = $('#wf-scenario').value;
  const pct = $('#wf-pct').value;
  const el = $('#whatif-result');
  const btn = $('#wf-btn');

  btn.disabled = true; btn.textContent = 'Hesaplanıyor...';
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const urls = {
    'reduce-unplanned': `/api/whatif/reduce-unplanned?machine=${encodeURIComponent(machine)}&reduction_pct=${pct}`,
    'reclassify-planned': `/api/whatif/reclassify-planned?machine=${encodeURIComponent(machine)}&reclassify_pct=${pct}`,
    'fix-cycle-time': `/api/whatif/fix-cycle-time?machine=${encodeURIComponent(machine)}`,
    'scrap-rate': `/api/whatif/scrap-rate?machine=${encodeURIComponent(machine)}&scrap_pct=${pct}`,
  };

  try {
    const data = await api(urls[scenario]);
    if (!data.length) {
      el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px">Bu makine için yeterli veri yok</p>';
      btn.disabled = false; btn.textContent = 'Simülasyonu Çalıştır';
      return;
    }
    const d = data[0];
    el.innerHTML = `
      <div class="wf-result">
        <div class="wf-box before">
          <div class="wf-label">Mevcut</div>
          <div class="wf-val" style="color:var(--critical)">${(d.before.OEE * 100).toFixed(2)}%</div>
          <div class="wf-sub">A=${(d.before.A * 100).toFixed(1)}% · P=${(d.before.P * 100).toFixed(1)}%</div>
        </div>
        <div class="wf-box after">
          <div class="wf-label">Sonra</div>
          <div class="wf-val" style="color:var(--good)">${(d.after.OEE * 100).toFixed(2)}%</div>
          <div class="wf-sub">A=${(d.after.A * 100).toFixed(1)}% · P=${(d.after.P * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div class="wf-delta">+${(d.delta_oee * 100).toFixed(2)} pp OEE${d.recovered_hours ? ' · Günde ' + d.recovered_hours + ' saat kazanç' : ''}</div>
      <p style="text-align:center;font-size:11px;color:var(--muted);margin-top:10px">${d.scenario} — ${d.day}</p>`;

    if (d.delta_oee > 0) await updateFinancial(d.delta_oee, machine);
    toast(`+${(d.delta_oee * 100).toFixed(1)}pp OEE iyileşmesi`, 'success');
  } catch (e) {
    el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }
  btn.disabled = false; btn.textContent = 'Simülasyonu Çalıştır';
}

async function updateFinancial(deltaOee, machine) {
  const margin = $('#fa-margin').value;
  const hour = $('#fa-hour').value;
  const down = $('#fa-down').value;
  const interv = $('#fa-interv').value;
  const url = `/api/whatif/financial?delta_oee=${deltaOee}&machine=${encodeURIComponent(machine)}` +
    `&contribution_margin_per_piece=${margin}&machine_hour_cost=${hour}` +
    `&downtime_cost_per_hour=${down}&intervention_cost=${interv}`;
  const fin = await api(url);
  $('#financial-result').innerHTML = `
    <div class="fin-item" data-tip="OEE iyileştirmesinden günlük kazanılan saat"><div class="fin-val">${fin.recovered_hours_per_day}h</div><div class="fin-lbl">Saat/Gün</div></div>
    <div class="fin-item"><div class="fin-val">${fin.extra_pieces_per_day}</div><div class="fin-lbl">Parça/Gün</div></div>
    <div class="fin-item" data-tip="Net = kazanç + duruş tasarrufu - amortisman"><div class="fin-val">${fmtMoney(fin.net_benefit_per_day)}</div><div class="fin-lbl">Net Fayda/Gün</div></div>
    <div class="fin-item"><div class="fin-val">${fmtMoney(fin.gross_benefit_per_day)}</div><div class="fin-lbl">Brüt Kazanç</div></div>
    <div class="fin-item"><div class="fin-val">${fmtMoney(fin.downtime_saving_per_day)}</div><div class="fin-lbl">Duruş Tasarrufu</div></div>
    <div class="fin-item" data-tip="Yatırımın geri dönüş süresi"><div class="fin-val">${fin.payback_days}g</div><div class="fin-lbl">Geri Ödeme</div></div>`;
}

async function loadCorrectedOEE() {
  const el = $('#corrected-oee');
  el.innerHTML = skeleton(6);
  const machines = ['Makine 1', 'Makine 2', 'Makine 3', 'Makine 5', 'Makine 7', 'Makine 9'];
  let html = '';
  for (const m of machines) {
    try {
      const r = await api(`/api/whatif/corrected-oee?machine=${encodeURIComponent(m)}`);
      if (r.error) continue;
      const imp = r.avg_improvement * 100;
      html += `<div class="card" style="border-left:3px solid ${imp > 20 ? 'var(--good)' : imp > 10 ? 'var(--warning)' : 'var(--muted)'}">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">${m}</div>
        <div style="display:flex;justify-content:space-between;align-items:end">
          <div><div style="font-size:11px;color:var(--muted)">Mevcut</div>
            <div style="font-size:22px;font-weight:800;color:var(--critical)">${(r.avg_current_oee * 100).toFixed(1)}%</div></div>
          <div style="font-size:20px;color:var(--muted);padding:0 8px">→</div>
          <div><div style="font-size:11px;color:var(--muted)">Düzeltilmiş</div>
            <div style="font-size:22px;font-weight:800;color:var(--good)">${(r.avg_corrected_oee * 100).toFixed(1)}%</div></div>
        </div>
        <div style="margin-top:10px;padding:8px 12px;background:var(--good-bg);border-radius:8px;text-align:center;font-size:12px;font-weight:700;color:var(--good)">+${imp.toFixed(1)} pp</div>
      </div>`;
    } catch (e) { }
  }
  el.innerHTML = `<div class="grid g3">${html || '<p style="color:var(--muted)">Veri yok</p>'}</div>`;
}

// ════════════════════════════════════════════
// PANEL 4: OEE TREND
// ════════════════════════════════════════════
let trendChart = null;
async function loadTrend() {
  const machine = $('#trend-machine').value;
  try {
    const data = await api(`/api/oee/${encodeURIComponent(machine)}`);
    const ctx = $('#trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();

    const last = data[data.length - 1] || {};
    $('#trend-kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Son Hafta OEE</div><div class="kpi-value">${fmt((last.avg_oee || 0) * 100)}%</div></div>
      <div class="kpi"><div class="kpi-label">Son Hafta Üretim</div><div class="kpi-value">${(last.pieces || 0).toLocaleString('tr-TR')}</div></div>
      <div class="kpi"><div class="kpi-label">Veri Süresi</div><div class="kpi-value">${data.length}</div><div class="kpi-sub">hafta</div></div>`;

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.week),
        datasets: [
          { label: 'OEE', data: data.map(d => (d.avg_oee * 100).toFixed(2)), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,.08)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2.5 },
          { label: 'Availability', data: data.map(d => (d.avg_A * 100).toFixed(2)), borderColor: '#34d399', borderDash: [6, 4], tension: .4, pointRadius: 0, borderWidth: 1.5 },
          { label: 'Performance', data: data.map(d => (d.avg_P * 100).toFixed(2)), borderColor: '#fbbf24', borderDash: [6, 4], tension: .4, pointRadius: 0, borderWidth: 1.5 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#6b7280', usePointStyle: true, padding: 20, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#6b7280', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.03)' } },
          y: { ticks: { color: '#6b7280', callback: v => v + '%', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.03)' }, min: -10, max: 100 }
        }
      }
    });
  } catch (e) { }
}

// ════════════════════════════════════════════
// PANEL 5: ML ANOMALY
// ════════════════════════════════════════════
async function loadHealth() {
  try {
    const data = await api('/api/health');
    const ctx = $('#healthChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.machine),
        datasets: [{
          data: data.map(d => d.health_score),
          backgroundColor: data.map(d => d.status === 'critical' ? 'rgba(248,113,113,.7)' : d.status === 'warning' ? 'rgba(251,191,36,.7)' : 'rgba(52,211,153,.7)'),
          borderRadius: 8, barThickness: 22
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1f2e', borderColor: '#2d3548', borderWidth: 1 } },
        scales: {
          x: { max: 100, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.03)' } },
          y: { ticks: { color: '#e4e7f1', font: { size: 11, weight: '600' } }, grid: { display: false } }
        }
      }
    });

    const spikes = await api('/api/anomalies/counters/spikes');
    $('#counter-spikes').innerHTML = spikes.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-weight:600;font-size:13px">${s.machine}</div>
          <div style="font-size:11px;color:var(--muted)">${s.total_events.toLocaleString()} event</div></div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:15px;color:${s.spike_count > 0 ? 'var(--critical)' : 'var(--good)'}">${s.spike_count} spike</div>
          <div style="font-size:11px;color:var(--muted)">üst sınır: ${(s.upper_bound || 0).toLocaleString()}</div>
        </div></div>`).join('');

    loadMitsubishi();
  } catch (e) { }
}

async function loadMitsubishi() {
  try {
    const data = await api('/api/anomalies/mitsubishi/Makine%207');
    const a = data.analysis || {};
    let html = '';
    if (a.cycle_time) {
      const ct = a.cycle_time;
      html += `<div class="card" style="border-left:3px solid var(--accent)">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">Cycle Time</div>
        <div style="font-size:11px;color:var(--muted)">Normal ortalama</div>
        <div style="font-size:24px;font-weight:800;color:var(--good)">${ct.normal_avg_sec}s</div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">Anomali ortalama</div>
        <div style="font-size:18px;font-weight:700;color:var(--critical)">${ct.anomaly_avg_sec}s</div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted)">${ct.anomaly_count.toLocaleString()} anomali (${ct.anomaly_pct}%)</div>
      </div>`;
    }
    if (a.axis_X) {
      html += `<div class="card" style="border-left:3px solid var(--blue)">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">X Ekseni</div>
        <div style="font-size:11px;color:var(--muted)">Çalışma aralığı</div>
        <div style="font-size:20px;font-weight:800">${a.axis_X.range_mm.toFixed(1)} mm</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">[${a.axis_X.min.toFixed(1)} ~ ${a.axis_X.max.toFixed(1)}]</div>
        <div style="margin-top:8px;font-size:11px;color:${a.axis_X.outlier_pct > 2 ? 'var(--critical)' : 'var(--muted)'}">${a.axis_X.outlier_count} outlier (${a.axis_X.outlier_pct}%)</div>
      </div>`;
    }
    if (a.run_status) {
      let s = '';
      for (const [k, v] of Object.entries(a.run_status))
        s += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;font-size:12px">${k}</span>
          <span style="font-size:12px;color:var(--muted)">${v.transitions} geçiş</span></div>`;
      html += `<div class="card" style="border-left:3px solid var(--warning)">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">Run Status</div>${s}</div>`;
    }
    $('#mitsubishi-result').innerHTML = `<div class="grid g3">${html || '<p style="color:var(--muted)">Veri yok</p>'}</div>`;
  } catch (e) { }
}

// ════════════════════════════════════════════
// PANEL 6: DATA QUALITY
// ════════════════════════════════════════════
async function loadDataQuality() {
  try {
    const dq = await api('/api/data-quality');
    $('#dq-issues').innerHTML = dq.issues.map(i => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        <span style="padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;
          ${i.severity === 'critical' ? 'background:var(--critical-bg);color:var(--critical)' : i.severity === 'high' ? 'background:var(--warning-bg);color:var(--warning)' : 'background:var(--blue-bg);color:var(--blue)'}">${i.severity.toUpperCase()}</span>
        <span style="font-weight:600;font-size:13px;min-width:100px">${i.machine}</span>
        <span style="font-size:12px;color:var(--muted)">${escapeHtml(i.detail)}</span>
      </div>`).join('');

    $('#dq-oee').innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr style="color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.4px">
        <th style="text-align:left;padding:8px 4px">Makine</th><th>Gün</th><th>Geçerli</th><th>Neg</th><th>OEE</th><th>A</th><th>P</th></tr>
      ${dq.oee_quality.map(r => `<tr style="border-top:1px solid var(--border)">
        <td style="padding:8px 4px;font-weight:600">${r.machine}</td>
        <td style="text-align:center">${r.total_days}</td>
        <td style="text-align:center;color:var(--good)">${r.valid_days}</td>
        <td style="text-align:center;color:${r.negative_days > 0 ? 'var(--critical)' : 'var(--muted)'}">${r.negative_days}</td>
        <td style="text-align:center">${r.clean_avg_oee != null ? (r.clean_avg_oee * 100).toFixed(1) + '%' : '—'}</td>
        <td style="text-align:center">${r.avg_A != null ? (r.avg_A * 100).toFixed(1) + '%' : '—'}</td>
        <td style="text-align:center;color:${r.avg_P != null && r.avg_P < 0.01 ? 'var(--critical)' : 'var(--text)'}">${r.avg_P != null ? (r.avg_P * 100).toFixed(1) + '%' : '—'}</td>
      </tr>`).join('')}</table>`;

    $('#dq-sensors').innerHTML = dq.sensor_coverage.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-weight:600;font-size:13px">${s.machine}</div>
          <div style="font-size:10px;color:var(--muted)">${s.first_reading} → ${s.last_reading}</div></div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:15px;color:${s.signal_count > 5 ? 'var(--good)' : 'var(--warning)'}">${s.signal_count} sinyal</div>
          <div style="font-size:10px;color:var(--muted)">${s.total_readings.toLocaleString()} okuma</div></div></div>`).join('');

    const st = dq.stoppage_summary;
    $('#dq-stops').innerHTML = `
      <div class="fin-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="fin-item"><div class="fin-val">${Number(st.planned || 0).toLocaleString()}</div><div class="fin-lbl">Planlı</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--critical)">${Number(st.unplanned || 0).toLocaleString()}</div><div class="fin-lbl">Plansız</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--warning)">${st.system_offline}</div><div class="fin-lbl">System Offline</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--critical)">${st.long_unplanned}</div><div class="fin-lbl">>48h Plansız</div></div>
      </div>
      <div style="margin-top:12px;padding:10px;background:var(--critical-bg);border-radius:8px;font-size:12px;color:var(--critical)">
        ${Number(st.unplanned_hours || 0).toLocaleString()}h plansız duruş — önemli kısmı yanlış sınıflandırılmış.
      </div>`;

    $('#dq-cycle').innerHTML = dq.cycle_time_quality.map(c => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:12px">${c.machine}</span>
        <span style="font-size:12px">
          <span style="color:var(--muted)">${c.workorders} iş</span>
          ${c.cycle_mismatch > 0 ? `<span style="color:var(--critical);font-weight:700;margin-left:8px">${c.cycle_mismatch} uyumsuz</span>` : '<span style="color:var(--good);margin-left:8px">OK</span>'}
        </span></div>`).join('');
  } catch (e) { }
}

// ════════════════════════════════════════════
// PANEL 7: COMPARE
// ════════════════════════════════════════════
async function loadCompare() {
  const el = $('#compare-content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const c = await api('/api/compare?machines=Makine 1,Makine 2,Makine 3,Makine 5,Makine 7,Makine 9');
    const machines = c.machines;
    if (!machines.length) { el.innerHTML = '<p style="color:var(--muted)">Veri yok</p>'; return; }

    const maxOEE = Math.max(...machines.map(m => m.avg_oee || 0)) || 1;
    const maxPieces = Math.max(...machines.map(m => m.pieces || 0)) || 1;
    const maxAlarms = Math.max(...machines.map(m => m.alarms || 0)) || 1;
    const maxDown = Math.max(...machines.map(m => m.unplanned_h || 0)) || 1;

    el.innerHTML = `
      <div class="card">
        <div class="card-title"><div class="icon" style="background:var(--blue-bg);color:var(--blue)">⚖</div> Makine Karşılaştırma</div>
        <div class="card-subtitle">Makineler yan yana — performans, üretim, alarm, duruş</div>
        <div style="overflow-x:auto">
        <table class="cmp-table">
          <tr><th>Makine</th><th>Controller</th><th>OEE</th><th>A</th><th>P</th><th>Üretim</th><th>Alarm</th><th>Plansız</th></tr>
          ${machines.map(m => `<tr>
            <td style="font-weight:700">${m.machine}</td>
            <td style="color:var(--muted);font-size:12px">${m.controller || '—'}</td>
            <td><span class="cmp-bar" style="width:${(m.avg_oee || 0) / maxOEE * 80}px;background:var(--accent)"></span>
              <strong>${m.avg_oee != null ? (m.avg_oee * 100).toFixed(1) + '%' : '—'}</strong></td>
            <td style="color:${m.avg_A > 0.5 ? 'var(--good)' : 'var(--warning)'}">${m.avg_A != null ? (m.avg_A * 100).toFixed(1) + '%' : '—'}</td>
            <td style="color:${m.avg_P > 0.3 ? 'var(--good)' : 'var(--critical)'}">${m.avg_P != null ? (m.avg_P * 100).toFixed(1) + '%' : '—'}</td>
            <td><span class="cmp-bar" style="width:${(m.pieces || 0) / maxPieces * 80}px;background:var(--good)"></span>${(m.pieces || 0).toLocaleString('tr-TR')}</td>
            <td><span class="cmp-bar" style="width:${(m.alarms || 0) / maxAlarms * 80}px;background:var(--critical)"></span>
              <span style="color:${m.alarms > 50 ? 'var(--critical)' : 'var(--text)'}">${m.alarms}</span></td>
            <td><span class="cmp-bar" style="width:${(m.unplanned_h || 0) / maxDown * 80}px;background:var(--warning)"></span>${(m.unplanned_h || 0).toLocaleString('tr-TR')}h</td>
          </tr>`).join('')}
        </table></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title"><div class="icon" style="background:var(--accent-glow);color:var(--accent)">⊙</div> Radar Karşılaştırma</div>
        <div class="chart-wrap" style="height:420px"><canvas id="radarChart"></canvas></div>
      </div>`;

    const ctx = $('#radarChart').getContext('2d');
    const colors = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#c084fc'];
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['OEE', 'Availability', 'Performance', 'Üretim', 'Düşük Alarm', 'Düşük Duruş'],
        datasets: machines.map((m, i) => ({
          label: m.machine,
          data: [(m.avg_oee || 0) * 100, (m.avg_A || 0) * 100, (m.avg_P || 0) * 100,
            ((m.pieces || 0) / maxPieces) * 100, (1 - (m.alarms || 0) / maxAlarms) * 100, (1 - (m.unplanned_h || 0) / maxDown) * 100],
          borderColor: colors[i % 6], backgroundColor: colors[i % 6] + '20', borderWidth: 2, pointRadius: 3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#6b7280', padding: 14, font: { size: 11 } } } },
        scales: { r: { min: 0, max: 100, ticks: { color: '#6b7280', backdropColor: 'transparent', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.06)' }, angleLines: { color: 'rgba(255,255,255,.06)' }, pointLabels: { color: '#c5c9d6', font: { size: 11, weight: '600' } } } }
      }
    });
  } catch (e) { el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`; }
}

// ════════════════════════════════════════════
// PANEL 8: TIMELINE
// ════════════════════════════════════════════
async function loadTimeline() {
  const el = $('#timeline-content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const t = await api('/api/timeline?days=60');
    const byDay = {};
    t.daily_by_machine.forEach(d => {
      if (!byDay[d.day]) byDay[d.day] = { day: d.day, machines: [], total: 0 };
      byDay[d.day].machines.push({ name: d.machine, alarms: d.alarms });
      byDay[d.day].total += d.alarms;
    });
    const days = Object.values(byDay).sort((a, b) => new Date(b.day) - new Date(a.day));
    const hotDaySet = new Set(t.hot_days.slice(0, 5).map(d => d.day));
    const colors = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#c084fc', '#fb923c', '#a3e635'];

    el.innerHTML = `
      <div class="grid g3" style="margin-bottom:20px">
        <div class="kpi"><div class="kpi-label">Toplam Alarm Tipi</div><div class="kpi-value">${t.total_alarm_types}</div></div>
        <div class="kpi"><div class="kpi-label">Toplam Alarm (${t.days_window}g)</div><div class="kpi-value" style="color:var(--critical)">${t.total_alarms.toLocaleString('tr-TR')}</div></div>
        <div class="kpi"><div class="kpi-label">Yoğun Günler</div><div class="kpi-value">${t.hot_days.length}</div><div class="kpi-sub">3+ makine etkilendi</div></div>
      </div>
      <div class="grid g2">
        <div class="card">
          <div class="card-title"><div class="icon" style="background:var(--critical-bg);color:var(--critical)">🔥</div> En Yoğun 10 Gün</div>
          <div style="display:grid;gap:6px">
          ${t.hot_days.map((h, i) => `
            <div style="display:grid;grid-template-columns:30px 100px 1fr 60px;gap:10px;align-items:center;padding:8px;background:rgba(255,255,255,.02);border-radius:8px">
              <span style="font-weight:800;color:var(--muted)">#${i + 1}</span>
              <span style="font-size:12px;font-weight:600">${h.day}</span>
              <div style="height:6px;background:linear-gradient(90deg,var(--critical),var(--warning));border-radius:3px;width:${Math.min(100, h.total_alarms / t.hot_days[0].total_alarms * 100)}%"></div>
              <span style="text-align:right;font-weight:800;color:var(--critical)">${h.total_alarms}</span>
            </div>`).join('')}</div>
        </div>
        <div class="card">
          <div class="card-title"><div class="icon" style="background:var(--accent-glow);color:var(--accent)">📅</div> Günlük Dağılım</div>
          <div class="timeline">
          ${days.slice(0, 30).map(d => {
      const isHot = hotDaySet.has(d.day);
      return `<div class="timeline-day ${isHot ? 'hot' : ''}">
                <div class="timeline-day-date">${d.day}</div>
                <div class="timeline-day-bar">
                  ${d.machines.map((m, i) => `<div style="width:${(m.alarms / d.total) * 100}%;background:${colors[i % colors.length]}" title="${m.name}: ${m.alarms}"></div>`).join('')}
                </div>
                <div class="timeline-count" style="color:${isHot ? 'var(--critical)' : 'var(--text)'}">${d.total}</div>
              </div>`;
    }).join('')}</div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title"><div class="icon" style="background:var(--warning-bg);color:var(--warning)">🔔</div> En Çok Görülen Alarmlar</div>
        <div style="display:grid;gap:8px">
        ${t.top_alarms_recent.slice(0, 12).map(a => `
          <div style="display:grid;grid-template-columns:1fr 120px 60px;gap:12px;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:8px;align-items:center">
            <div style="font-size:12px;font-weight:600">${escapeHtml(a.alarm)}</div>
            <div style="font-size:11px;color:var(--accent)">${a.machine}</div>
            <div style="font-size:14px;font-weight:800;text-align:right;color:var(--critical)">${a.count}</div>
          </div>`).join('')}</div>
      </div>`;
  } catch (e) { el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`; }
}

// ════════════════════════════════════════════
// PANEL 9: EXECUTIVE SUMMARY
// ════════════════════════════════════════════
async function loadExecutive() {
  const el = $('#executive-content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div><br>Yönetici özeti hazırlanıyor...</div>`;
  try {
    const e = await api('/api/executive');
    const fo = e.fabric_overview, pot = e.potential, fin = e.financial, kpi = e.kpi_critical;

    el.innerHTML = `
      <div class="exec-hero">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:20px">
          <div>
            <div class="exec-hero-title">Fabrika Performans Özeti</div>
            <div class="exec-hero-sub">
              ${fo.days_analyzed} gün boyunca ${fo.total_machines} CNC makinesi analiz edildi.
              Toplam ${fo.total_pieces_produced.toLocaleString('tr-TR')} parça üretildi,
              ${fo.unplanned_hours.toLocaleString('tr-TR')} saat plansız duruş tespit edildi.
            </div>
          </div>
          <button onclick="window.print()" class="header-btn" data-tip="Raporu yazdır veya PDF olarak kaydet"><span>🖨</span> Yazdır</button>
        </div>
        <div class="exec-big-stat">
          <div class="exec-stat-item"><div class="exec-stat-val">${(pot.current_avg_oee * 100).toFixed(1)}%</div><div class="exec-stat-lbl">Mevcut OEE</div></div>
          <div class="exec-arrow">→</div>
          <div class="exec-stat-item"><div class="exec-stat-val">${(pot.corrected_avg_oee * 100).toFixed(1)}%</div><div class="exec-stat-lbl">Hedef OEE (Düzeltmeler Sonrası)</div></div>
          <div class="exec-arrow">=</div>
          <div class="exec-stat-item">
            <div class="exec-stat-val" style="background:linear-gradient(135deg,#fbbf24,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent">+${(pot.improvement_pp * 100).toFixed(1)} pp</div>
            <div class="exec-stat-lbl">~${fmtMoney(fin.annual_benefit_total)} ek değer/yıl <span class="assumption-tag">varsayım</span></div>
          </div>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:20px">
        <div class="card">
          <div class="card-title"><div class="icon" style="background:var(--critical-bg);color:var(--critical)">!</div> Kritik Bulgular</div>
          <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:12px">
            <div class="kpi"><div class="kpi-label">Tespit Edilen Problem</div><div class="kpi-value" style="color:var(--accent)">${kpi.problems_detected}</div></div>
            <div class="kpi"><div class="kpi-label">Kritik Seviye</div><div class="kpi-value" style="color:var(--critical)">${kpi.critical_problems}</div></div>
            <div class="kpi"><div class="kpi-label">Yüksek Seviye</div><div class="kpi-value" style="color:var(--warning)">${kpi.high_problems}</div></div>
            <div class="kpi"><div class="kpi-label">Veri Kalitesi</div><div class="kpi-value" style="color:var(--warning)">${kpi.data_quality_issues}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><div class="icon" style="background:var(--good-bg);color:var(--good)">$</div> Finansal Etki <span class="assumption-tag">varsayım</span></div>
          <div style="font-size:42px;font-weight:800;background:linear-gradient(135deg,#34d399,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px">${fmtMoney(fin.annual_benefit_total)}</div>
          <div style="color:var(--muted);font-size:12px;margin-top:4px">Tahmini yıllık net fayda (${fin.machines_count} makine)</div>
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><div style="font-size:11px;color:var(--muted)">Makine Başı Günlük</div><div style="font-weight:800;font-size:18px;margin-top:4px">${fmtMoney(fin.daily_net_benefit_per_machine)}</div></div>
            <div><div style="font-size:11px;color:var(--muted)">Yatırım Geri Dönüş</div><div style="font-weight:800;font-size:18px;margin-top:4px;color:var(--good)">${fin.payback_days} gün</div></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-title"><div class="icon" style="background:linear-gradient(135deg,var(--accent2),var(--purple));color:#fff">★</div> Öncelikli Aksiyon Planı</div>
        <div class="card-subtitle">ROI sırasına göre — uygulamaya başlanması gereken sıra:</div>
        ${e.top_actions.map(a => `
          <div class="action-item">
            <div class="action-priority">${a.priority}</div>
            <div class="action-content">
              <div class="action-title">${escapeHtml(a.title)}</div>
              <div class="action-scope">${escapeHtml(a.scope)}</div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:10px">${escapeHtml(a.impact)}</div>
              <div class="action-meta">
                <span class="gain">${a.estimated_oee_gain}</span>
                <span class="effort">Efor: ${a.effort}</span>
                <span class="money">~${fmtMoney(a.estimated_annual_benefit_try)}/yıl</span>
              </div>
            </div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title"><div class="icon" style="background:var(--warning-bg);color:var(--warning)">⚡</div> En Acil 5 Problem</div>
        <div class="grid g2" style="gap:12px">
        ${e.top_problems.map(p => `
          <div class="card p-card sev-${p.severity}" style="padding:16px;cursor:default">
            <div class="p-head"><div class="p-title">${escapeHtml(p.title)}</div><span class="p-badge">${(p.severity || '').toUpperCase()}</span></div>
            <div class="p-machine">${escapeHtml(p.machine || '')}</div>
            <div class="p-evidence" style="margin-top:8px">${escapeHtml(p.evidence || '')}</div>
          </div>`).join('')}</div>
      </div>`;
  } catch (e) { el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`; }
}

// ════════════════════════════════════════════
// PANEL 10: AI AGENT (7 agent pipeline)
// ════════════════════════════════════════════
const AGENTS = [
  { id: 'Detector', label: 'Detector', desc: 'Sağlık skoru tespiti' },
  { id: 'RCA', label: 'RCA', desc: '12 problem + istatistiksel confidence' },
  { id: 'EventContext', label: 'EventContext', desc: 'Olay penceresi kanıtları' },
  { id: 'WhatIf', label: 'What-If', desc: 'RCA\'ya bağlı senaryolar' },
  { id: 'Financial', label: 'Financial', desc: 'Varsayımsal iş etkisi' },
  { id: 'Prioritizer', label: 'Prioritizer', desc: 'Aksiyon önceliklendirme' },
  { id: 'Reporter', label: 'Reporter', desc: 'Ollama LLM Türkçe rapor' },
  { id: 'Critic', label: 'Critic', desc: 'Halüsinasyon ve etiket doğrulama' },
];

async function runAgent() {
  const machine = $('#agent-machine').value;
  const btn = $('#agent-btn');
  const pipelineEl = $('#agent-pipeline');
  const reportEl = $('#agent-report');

  btn.disabled = true; btn.textContent = "Agent'lar çalışıyor...";
  $('#reporter-status-badge').innerHTML = '';

  pipelineEl.innerHTML = AGENTS.map(a => `
    <div class="agent-pipeline-item" id="pipe-${a.id}">
      <div class="pipe-icon" id="picon-${a.id}">·</div>
      <div><div class="pipe-name">${a.label} Agent</div><div class="pipe-status" id="pstat-${a.id}">${a.desc}</div></div>
    </div>`).join('');

  let step = 0;
  const stepLabels = [
    'Sağlık skoru hesaplanıyor...',
    'Statistical engine ile confidence hesaplanıyor...',
    'Olay penceresi ve çevre kanıtları toplanıyor...',
    'RCA\'ya bağlı What-If senaryoları çalıştırılıyor...',
    'Varsayımsal finansal etki hesaplanıyor...',
    'Aksiyonlar skorlanıp sıralanıyor...',
    'LLM rapor üretiyor (~30sn)...',
    'Critic raporu kanıt setiyle karşılaştırıyor...',
  ];
  const intv = setInterval(() => {
    if (step < AGENTS.length) {
      const a = AGENTS[step];
      $(`#picon-${a.id}`).className = 'pipe-icon running';
      $(`#picon-${a.id}`).textContent = '⟳';
      $(`#pstat-${a.id}`).textContent = stepLabels[step];
      if (step > 0) markDone(AGENTS[step - 1].id);
      step++;
    }
  }, 2500);

  try {
    const url = machine ? `/api/agent/analyze?machine=${encodeURIComponent(machine)}` : '/api/agent/analyze';
    const data = await api(url);
    clearInterval(intv);
    AGENTS.forEach(a => markDone(a.id));

    const report = data.final_report || 'Rapor üretilemedi';
    const reporterPipe = (data.pipeline || []).find(p => p.agent === 'Reporter');
    const reporterStatus = reporterPipe?.result?.status || 'success';
    $('#reporter-status-badge').innerHTML = `<span class="reporter-status ${reporterStatus}">${reporterStatus === 'fallback' ? 'LLM YEDEK' : reporterStatus === 'error' ? 'HATA' : 'LLM OK'}</span>`;

    reportEl.innerHTML = `
      <div style="margin-bottom:12px">
        <span style="display:inline-block;padding:4px 12px;background:var(--good-bg);border-radius:6px;font-size:11px;color:var(--good);font-weight:600;border:1px solid rgba(52,211,153,.15)">
          Hedef: ${data.target_machine || 'Tüm fabrika'}
        </span>
      </div>
      <div class="agent-report" style="white-space:pre-wrap">${escapeHtml(report).replace(/(\n)?###?\s*/g, '<br><strong style="font-size:14px">').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</div>`;

    renderAgentDetails(data);
    renderEventContext(data);
    renderPrioritizer(data);
    renderCritic(data);
    toast('AI analizi tamamlandı', 'success');
  } catch (err) {
    clearInterval(intv);
    reportEl.innerHTML = `<p style="color:var(--critical)">Hata: ${err.message}</p>`;
  }
  btn.disabled = false; btn.textContent = 'Analizi Başlat';
}

function markDone(id) {
  const icon = $(`#picon-${id}`);
  const stat = $(`#pstat-${id}`);
  if (icon) { icon.className = 'pipe-icon done'; icon.textContent = '✓'; }
  if (stat) { stat.textContent = 'Tamamlandı'; stat.className = 'pipe-status done'; }
}

function renderAgentDetails(data) {
  $('#agent-details-card').hidden = false;
  const summary = data.summary || {};
  const detector = summary.detector || {};
  const financial = summary.financial || {};
  const topActions = summary.top_actions || [];

  $('#agent-details').innerHTML = `
    <div class="card" style="border-left:3px solid var(--critical)">
      <div class="card-title" style="font-size:13px">Detector</div>
      <div style="font-size:32px;font-weight:800;color:var(--critical)">${detector.critical_count || 0}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Kritik Makine</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${(detector.critical_machines || []).join(', ') || '-'}</div>
    </div>
    <div class="card" style="border-left:3px solid var(--accent)">
      <div class="card-title" style="font-size:13px">RCA</div>
      <div style="font-size:32px;font-weight:800;color:var(--accent)">${summary.rca_problem_count || 0}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Eşleşen Problem</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Confidence + Impact area dahil</div>
    </div>
    <div class="card" style="border-left:3px solid var(--good)">
      <div class="card-title" style="font-size:13px">Financial <span class="assumption-tag">varsayım</span></div>
      <div style="font-size:32px;font-weight:800;color:var(--good)">${financial ? fmtMoney(financial.net_benefit_per_day) : '—'}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Günlük Net Fayda</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${financial ? 'Geri ödeme: ' + financial.payback_days + ' gün' : ''}</div>
    </div>`;
}

function renderEventContext(data) {
  const pipe = (data.pipeline || []).find(p => p.agent === 'EventContext');
  if (!pipe || !pipe.result) return;
  const r = pipe.result;
  if (r.status === 'no_event' || !r.event) { $('#event-context-card').hidden = true; return; }
  $('#event-context-card').hidden = false;

  const evidenceChips = (r.evidence || []).map(e => `<span class="evidence-chip">${escapeHtml(e)}</span>`).join('');
  const alarms = (r.alarms || []).slice(0, 6);
  const stops = (r.stoppages || []).slice(0, 4);
  const programs = (r.programs || []).slice(0, 3);

  $('#event-context-content').innerHTML = `
    <div class="event-window">
      <div class="event-headline">${escapeHtml(r.event.alarm)}</div>
      <div class="event-meta">${escapeHtml(r.event.time)} · ${escapeHtml(r.machine)} · Pencere: ${r.context_window}</div>
      <div style="margin-top:10px">${evidenceChips}</div>
    </div>
    <div class="grid g3">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Pencere Alarmları (${alarms.length})</div>
        ${alarms.length ? alarms.map(a => `<div style="padding:8px;background:rgba(255,255,255,.02);border-radius:6px;margin-bottom:4px;font-size:11px">
          <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:10px">${escapeHtml(String(a.time).slice(0, 19))}</div>
          <div style="font-weight:600;margin-top:2px">${escapeHtml(a.alarm)}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:11px">—</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Duruşlar (${stops.length})</div>
        ${stops.length ? stops.map(s => `<div style="padding:8px;background:rgba(255,255,255,.02);border-radius:6px;margin-bottom:4px;font-size:11px">
          <div style="font-weight:600">${s.duration_min} dk · ${s.is_planned ? 'Planlı' : 'Plansız'}</div>
          <div style="color:var(--muted);font-size:10px;margin-top:2px">${escapeHtml(s.stop_reason || '—')}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:11px">—</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Program Bağlamı (${programs.length})</div>
        ${programs.length ? programs.map(p => `<div style="padding:8px;background:rgba(255,255,255,.02);border-radius:6px;margin-bottom:4px;font-size:11px">
          <div style="font-family:'JetBrains Mono',monospace;font-weight:600">${escapeHtml(String(p.program || '—').slice(0, 30))}</div>
          <div style="color:var(--muted);font-size:10px;margin-top:2px">${escapeHtml(p.signal || '')}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:11px">—</div>'}
      </div>
    </div>`;
}

function renderCritic(data) {
  const cr = data.critic_review || (data.pipeline || []).find(p => p.agent === 'Critic')?.result;
  if (!cr) { $('#critic-card').hidden = true; return; }
  $('#critic-card').hidden = false;

  const status = cr.status || 'unknown';
  const statusColor = status === 'ok' ? 'good' : status === 'warning' ? 'warning' : 'critical';
  const statusLabel = status === 'ok' ? 'GEÇTİ' : status === 'warning' ? 'UYARI' : 'BAŞARISIZ';

  $('#critic-status-badge').innerHTML = `<span class="reporter-status ${statusColor === 'good' ? 'success' : statusColor === 'warning' ? 'fallback' : 'error'}">${statusLabel} · ${cr.score}/100</span>`;

  const stats = cr.stats || {};
  const issues = cr.issues || [];

  $('#critic-content').innerHTML = `
    <div class="grid g3" style="margin-bottom:14px;gap:10px">
      <div class="fin-item" data-tip="Rapordaki sayıların kanıt setinde olma oranı">
        <div class="fin-val" style="color:${cr.verification_rate > 0.7 ? 'var(--good)' : 'var(--warning)'}">${(cr.verification_rate * 100).toFixed(0)}%</div>
        <div class="fin-lbl">Verification Rate</div>
      </div>
      <div class="fin-item"><div class="fin-val">${stats.numbers_in_report || 0}</div><div class="fin-lbl">Rapordaki Sayı</div></div>
      <div class="fin-item"><div class="fin-val" style="color:var(--good)">${stats.verified_numbers || 0}</div><div class="fin-lbl">Doğrulandı</div></div>
    </div>
    ${issues.length ? `
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:8px">Tespit Edilen Sorunlar (${issues.length})</div>
      ${issues.map(i => `
        <div style="display:flex;gap:12px;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:8px;margin-bottom:6px;align-items:center">
          <span style="padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;
            ${i.severity === 'critical' ? 'background:var(--critical-bg);color:var(--critical)' : i.severity === 'high' ? 'background:var(--warning-bg);color:var(--warning)' : 'background:var(--blue-bg);color:var(--blue)'}">${i.severity.toUpperCase()}</span>
          <div>
            <div style="font-weight:600;font-size:12px">${i.type.replace(/_/g, ' ')}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(i.detail || '')}</div>
          </div>
        </div>`).join('')}
    ` : `<div style="padding:14px;background:var(--good-bg);border-left:2px solid var(--good);border-radius:8px;font-size:13px;color:var(--good)">✓ Rapor kanıt setiyle tutarlı, hiçbir sorun tespit edilmedi.</div>`}
    <div style="margin-top:12px;padding:10px 12px;background:rgba(99,102,241,.04);border-radius:8px;font-size:11px;color:var(--text2);font-style:italic">
      → ${escapeHtml(cr.recommendation || '')}
    </div>`;
}

function renderPrioritizer(data) {
  const pipe = (data.pipeline || []).find(p => p.agent === 'Prioritizer');
  if (!pipe || !pipe.result) return;
  const actions = pipe.result.top_actions || [];
  if (!actions.length) { $('#prioritizer-card').hidden = true; return; }
  $('#prioritizer-card').hidden = false;

  $('#prioritizer-content').innerHTML = actions.map((a, i) => `
    <div class="prio-row">
      <div class="prio-rank">${i + 1}</div>
      <div>
        <div class="prio-title">${escapeHtml(a.title)}</div>
        <div class="prio-sub">${escapeHtml(a.recommended_action || '').slice(0, 120)}</div>
      </div>
      <div>${areaBadge(a.impact_area)}</div>
      <div class="prio-conf">${confidenceBar(a.confidence)}</div>
      <div class="prio-score" data-tip="severity × confidence × impact × feasibility">${a.score}</div>
    </div>`).join('');
}

// ════════════════════════════════════════════
// PANEL: PREDICTIVE ML
// ════════════════════════════════════════════
async function loadPredictive() {
  // 1. Cycle time failure model
  const cycleEl = $('#cycle-model-content');
  cycleEl.innerHTML = '<div class="loading"><div class="spinner"></div><br>Random Forest eğitiliyor...</div>';
  try {
    const m = await api('/api/predictive/cycle-failure/Makine%207');
    if (m.status !== 'trained') {
      cycleEl.innerHTML = `<p style="color:var(--warning)">Model eğitilemedi: ${m.status}</p>`;
    } else {
      const lvl = m.risk_level;
      const lvlColor = lvl === 'HIGH' ? 'var(--critical)' : lvl === 'MEDIUM' ? 'var(--warning)' : 'var(--good)';
      cycleEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:18px;padding:16px;background:rgba(255,255,255,.02);border-radius:10px">
          <div style="font-size:42px;font-weight:800;color:${lvlColor};line-height:1">${(m.current_risk_score * 100).toFixed(0)}%</div>
          <div>
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Mevcut Risk</div>
            <div style="font-size:20px;font-weight:800;color:${lvlColor};margin-top:2px">${lvl}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Son ${m.lookback_minutes}dk pencere üzerinden</div>
          </div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
          <div class="fin-item" data-tip="ROC eğrisinin altındaki alan — sınıflandırma performansı"><div class="fin-val" style="color:var(--good)">${(m.metrics.auc_roc * 100).toFixed(1)}%</div><div class="fin-lbl">AUC-ROC</div></div>
          <div class="fin-item"><div class="fin-val">${(m.metrics.f1 * 100).toFixed(1)}%</div><div class="fin-lbl">F1 Score</div></div>
          <div class="fin-item"><div class="fin-val">${(m.metrics.precision * 100).toFixed(1)}%</div><div class="fin-lbl">Precision</div></div>
          <div class="fin-item"><div class="fin-val">${(m.metrics.recall * 100).toFixed(1)}%</div><div class="fin-lbl">Recall</div></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px;font-weight:700">En Önemli Özellikler</div>
        ${m.feature_importance.slice(0, 5).map(([name, imp]) => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12px">
            <span style="min-width:90px;font-weight:600">${name}</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${imp * 100 * 3}%;background:linear-gradient(90deg,var(--accent),var(--purple))"></div>
            </div>
            <span style="min-width:50px;text-align:right;color:var(--muted);font-family:'JetBrains Mono',monospace">${(imp * 100).toFixed(1)}%</span>
          </div>`).join('')}
        <div style="margin-top:14px;padding:10px 12px;background:rgba(99,102,241,.06);border-left:2px solid var(--accent);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.6">
          <strong>Eğitim:</strong> ${m.train_samples} sample, ${m.test_samples} test · ${m.positives} pozitif, ${m.negatives} negatif<br>
          ${m.interpretation}
        </div>`;
    }
  } catch (e) {
    cycleEl.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }

  // 2. Alarm forecast
  const fcEl = $('#forecast-content');
  fcEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const f = await api('/api/predictive/alarm-forecast/Makine%201?keyword=AIR%20PRESSURE');
    if (f.status !== 'success') {
      fcEl.innerHTML = `<p style="color:var(--warning)">Yetersiz veri: ${f.status}</p>`;
    } else {
      const nextDate = new Date(f.expected_next_alarm_median);
      fcEl.innerHTML = `
        <div style="padding:16px;background:linear-gradient(135deg,var(--warning-bg),transparent);border:1px solid rgba(251,191,36,.15);border-radius:10px;margin-bottom:16px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Bir Sonraki Tahmini Alarm</div>
          <div style="font-size:24px;font-weight:800;color:var(--warning)">${nextDate.toLocaleString('tr-TR')}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px;font-family:'JetBrains Mono',monospace">Tercih edilen saat: ${f.preferred_hour}:00 (%${(f.preferred_hour_share * 100).toFixed(1)} payı)</div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
          <div class="fin-item"><div class="fin-val" style="color:var(--good)">${(f.forecast_confidence * 100).toFixed(0)}%</div><div class="fin-lbl">Tahmin Güveni</div></div>
          <div class="fin-item"><div class="fin-val">${f.total_alarms}</div><div class="fin-lbl">Geçmiş Veri</div></div>
          <div class="fin-item"><div class="fin-val">${f.median_interval_hours}h</div><div class="fin-lbl">Median Aralık</div></div>
          <div class="fin-item"><div class="fin-val">${f.p95_interval_hours.toFixed(0)}h</div><div class="fin-lbl">P95 Aralık</div></div>
        </div>
        <div style="margin-top:14px;padding:10px 12px;background:rgba(99,102,241,.06);border-left:2px solid var(--accent);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.6">
          <strong>Yöntem:</strong> ${f.method}<br>
          <strong>Pencere:</strong> ${new Date(f.expected_next_window[0]).toLocaleString('tr-TR')} → ${new Date(f.expected_next_window[1]).toLocaleString('tr-TR')}
        </div>`;
    }
  } catch (e) {
    fcEl.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }

  // 3. Statistical confidences
  const confEl = $('#conf-content');
  confEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const all = await api('/api/statistics/confidences');
    let html = `<div style="display:grid;gap:8px">`;
    for (const [pid, c] of Object.entries(all).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const conf = c.confidence || 0;
      const conf_class = conf < 0.5 ? 'conf-very-low' : conf < 0.7 ? 'conf-low' : '';
      html += `
        <div style="display:grid;grid-template-columns:50px 1fr 120px 80px;gap:12px;padding:12px;background:rgba(255,255,255,.02);border-radius:8px;align-items:center">
          <div style="font-weight:800;color:var(--muted)">P${pid}</div>
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">${escapeHtml(c.method || '')}</div>
            <div style="font-size:13px;font-weight:600">${escapeHtml(c.evidence || '')}</div>
          </div>
          <div style="font-size:11px;color:var(--muted);text-align:right">n = <strong style="color:var(--text)">${(c.sample_size || 0).toLocaleString('tr-TR')}</strong></div>
          <div class="conf-bar ${conf_class}" style="justify-content:flex-end">
            <span class="conf-track" style="width:60px"><span class="conf-fill" style="width:${conf * 100}%"></span></span>
            <span style="font-family:'JetBrains Mono',monospace">${(conf * 100).toFixed(0)}%</span>
          </div>
        </div>`;
    }
    html += '</div>';
    confEl.innerHTML = html;
  } catch (e) {
    confEl.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }
}

// ════════════════════════════════════════════
// COMMAND PALETTE
// ════════════════════════════════════════════
const COMMANDS = [
  { id: 'overview', name: 'Fabrika Genel Bakış', icon: '⌂', shortcut: '1' },
  { id: 'problems', name: 'Problem Listesi', icon: '!', shortcut: '2' },
  { id: 'whatif', name: 'What-If Simülasyonu', icon: '?', shortcut: '3' },
  { id: 'oee-trend', name: 'OEE Trend Analizi', icon: '~', shortcut: '4' },
  { id: 'anomaly', name: 'ML Anomali Tespiti', icon: 'M', shortcut: '5' },
  { id: 'predictive', name: 'Predictive ML (RF + Forecast)', icon: 'P', shortcut: '6' },
  { id: 'data-quality', name: 'Veri Kalitesi', icon: 'V', shortcut: '7' },
  { id: 'compare', name: 'Makine Karşılaştırma', icon: '⚖', shortcut: '8' },
  { id: 'timeline', name: 'Alarm Timeline', icon: '⏱', shortcut: '9' },
  { id: 'executive', name: 'Yönetici Özeti', icon: '★' },
  { id: 'agent', name: 'AI Agent Analizi', icon: 'A', shortcut: '0' },
  { id: '__print', name: 'Raporu Yazdır', icon: '🖨', action: () => window.print() },
  { id: '__clear-cache', name: 'Cache Temizle', icon: '✕', action: async () => { await fetch('/api/cache/clear', { method: 'POST' }); toast('Cache temizlendi — sayfa yenileniyor', 'success'); setTimeout(() => location.reload(), 800); } },
  { id: '__refresh', name: 'Sayfayı Yenile', icon: '↻', action: () => location.reload() },
];

let cmdSelected = 0;
function openCmd() { $('#cmd-overlay').classList.add('active'); $('#cmd-input').value = ''; $('#cmd-input').focus(); cmdSelected = 0; renderCmdList(''); }
function closeCmd() { $('#cmd-overlay').classList.remove('active'); }
function renderCmdList(filter) {
  const f = (filter || '').toLowerCase();
  const filtered = COMMANDS.filter(c => c.name.toLowerCase().includes(f));
  if (cmdSelected >= filtered.length) cmdSelected = 0;
  $('#cmd-list').innerHTML = filtered.map((c, i) => `
    <div class="cmd-item ${i === cmdSelected ? 'selected' : ''}" onclick="runCmd(${i})">
      <div class="cmd-icon">${c.icon}</div>
      <div class="cmd-name">${c.name}</div>
      ${c.shortcut ? `<span class="cmd-shortcut">${c.shortcut}</span>` : ''}
    </div>`).join('');
  return filtered;
}
function runCmd(idx) {
  const filtered = COMMANDS.filter(c => c.name.toLowerCase().includes(($('#cmd-input').value || '').toLowerCase()));
  const cmd = filtered[idx];
  if (!cmd) return;
  if (cmd.action) cmd.action();
  else activatePanel(cmd.id);
  closeCmd();
}

// ════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); $('#cmd-overlay').classList.contains('active') ? closeCmd() : openCmd(); return; }
  if (e.key === 'Escape' && $('#cmd-overlay').classList.contains('active')) { closeCmd(); return; }
  if ($('#cmd-overlay').classList.contains('active')) {
    const filter = $('#cmd-input').value;
    const filtered = COMMANDS.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelected = (cmdSelected + 1) % filtered.length; renderCmdList(filter); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelected = (cmdSelected - 1 + filtered.length) % filtered.length; renderCmdList(filter); }
    if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSelected); }
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const map = { '1': 'overview', '2': 'problems', '3': 'whatif', '4': 'oee-trend', '5': 'anomaly', '6': 'predictive', '7': 'data-quality', '8': 'compare', '9': 'timeline', '0': 'agent' };
  if (map[e.key]) activatePanel(map[e.key]);
});

// ════════════════════════════════════════════
// LOADERS REGISTRY
// ════════════════════════════════════════════
loaders.overview = loadOverview;
loaders.problems = loadProblems;
loaders.whatif = loadCorrectedOEE;
loaders['oee-trend'] = loadTrend;
loaders.anomaly = loadHealth;
loaders.predictive = loadPredictive;
loaders['data-quality'] = loadDataQuality;
loaders.compare = loadCompare;
loaders.timeline = loadTimeline;
loaders.executive = loadExecutive;

// ════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════
Object.assign(window, { activatePanel, runWhatIf, runAgent, filterProblems, filterByArea, loadTrend, openCmd, closeCmd, runCmd, goToTrend });

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  $$('.tab[data-panel]').forEach(t => t.addEventListener('click', () => activatePanel(t.dataset.panel)));
  if (location.hash) activatePanel(location.hash.slice(1));
  loadOverview();
  loaders.overview_loaded = true;

  if ($('#wf-pct')) $('#wf-pct').addEventListener('input', e => { $('#wf-pct-label').textContent = e.target.value + '%'; });
  if ($('#cmd-input')) $('#cmd-input').addEventListener('input', e => { cmdSelected = 0; renderCmdList(e.target.value); });

  // Auto-recalculate financial when assumptions change
  ['fa-margin', 'fa-hour', 'fa-down', 'fa-interv'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', () => toast('Varsayımlar güncellendi — yeniden simüle edin', 'info', 2500));
  });

  setTimeout(() => toast('Ctrl+K ile hızlı ara · 1-0 ile sekme geçişi', 'info', 5000), 1500);
});
