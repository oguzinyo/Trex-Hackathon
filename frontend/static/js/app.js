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
    <circle cx="23" cy="23" r="${r}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="4"/>
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

    // Üretken makinelerin OEE'sini sub-text'e ekle (P>0 olanlar)
    const productive = data.filter(m => m.total_pieces > 0);
    if (productive.length > 0 && $('#kpi-oee-sub')) {
      const prodAvgOEE = productive.reduce((s, m) => s + (m.avg_oee || 0), 0) / productive.length;
      $('#kpi-oee-sub').innerHTML = `${data.length} makine · <span style="color:var(--good);font-weight:700">Üretken ${productive.length}: ${(prodAvgOEE * 100).toFixed(1)}%</span>`;
    }

    $('#badge-critical').innerHTML = `<span class="badge-dot"></span> ${critCount} Kritik`;
    $('#badge-machines').innerHTML = `<span class="badge-dot"></span> ${data.length} Makine`;

    // ── Controller bazlı gruplandırma ──
    const groups = {};
    data.forEach(m => {
      const ctrl = m.controller || 'Unknown';
      (groups[ctrl] = groups[ctrl] || []).push(m);
    });

    // Controller metadata — display name, icon, color
    const ctrlMeta = {
      'FanucFocas': { label: 'Fanuc', sub: 'FanucFocas Collector', color: '#3b82f6', bg: 'rgba(59,130,246,.08)' },
      'MitsubishiCnc': { label: 'Mitsubishi CNC', sub: 'MitsubishiCnc Collector', color: '#10b981', bg: 'rgba(16,185,129,.08)' },
      'LibPlc': { label: 'Nukon', sub: 'LibPlc Collector', color: '#f59e0b', bg: 'rgba(245,158,11,.08)' },
      'Unknown': { label: 'Diğer', sub: '—', color: '#6b7280', bg: 'rgba(107,114,128,.08)' },
    };

    const orderedCtrls = ['FanucFocas', 'MitsubishiCnc', 'LibPlc', 'Unknown'].filter(c => groups[c]);

    const renderMachineCard = (m) => {
      const meta = ctrlMeta[m.controller] || ctrlMeta['Unknown'];
      return `
      <div class="card m-card st-${m.status}" onclick="openMachinePanel('${escapeHtml(m.machine)}')">
        <div class="m-bar"></div>
        ${healthRing(m.health_score, m.status)}
        <div class="m-name">${escapeHtml(m.machine)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span class="m-status ${m.status}">${m.status === 'critical' ? 'KRİTİK' : m.status === 'warning' ? 'UYARI' : 'NORMAL'}</span>
          <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${meta.bg};color:${meta.color};font-weight:700;letter-spacing:.3px" data-tip="${escapeHtml(m.controller || '')} controller">${meta.label}</span>
        </div>
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
      </div>`;
    };

    el.innerHTML = orderedCtrls.map(ctrl => {
      const meta = ctrlMeta[ctrl] || ctrlMeta['Unknown'];
      const machines = groups[ctrl];
      const machineCount = machines.length;
      const crit = machines.filter(m => m.status === 'critical').length;
      const totPieces = machines.reduce((s, m) => s + (m.total_pieces || 0), 0);
      const avgOEE = machines.reduce((s, m) => s + (m.avg_oee || 0), 0) / machineCount;
      return `
        <div class="ctrl-group" style="margin-bottom:24px">
          <div class="ctrl-group-header" style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:${meta.bg};border:1px solid ${meta.color}33;border-radius:12px;margin-bottom:12px">
            <div style="width:44px;height:44px;border-radius:10px;background:${meta.color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;letter-spacing:.5px">${meta.label.charAt(0)}</div>
            <div style="flex:1">
              <div style="font-weight:800;font-size:16px;color:${meta.color};letter-spacing:-.2px">${meta.label}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${meta.sub} · ${machineCount} makine</div>
            </div>
            <div style="display:flex;gap:18px;align-items:center">
              <div style="text-align:right">
                <div style="font-size:18px;font-weight:800;color:${avgOEE > 0.02 ? 'var(--good)' : 'var(--critical)'}">${(avgOEE * 100).toFixed(1)}%</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Ort. OEE</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:18px;font-weight:800">${fmtK(totPieces)}</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Toplam Parça</div>
              </div>
              ${crit > 0 ? `<div style="text-align:right"><div style="font-size:18px;font-weight:800;color:var(--critical)">${crit}</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Kritik</div></div>` : ''}
            </div>
          </div>
          <div class="grid g4">${machines.map(renderMachineCard).join('')}</div>
        </div>`;
    }).join('');
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
    <div class="fin-item" data-tip="Yatırımın geri dönüş süresi"><div class="fin-val">${fin.payback_days < 1 ? '< 1g' : fin.payback_days + 'g'}</div><div class="fin-lbl">Geri Ödeme</div></div>`;
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
          x: { ticks: { color: '#6b7280', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { ticks: { color: '#6b7280', callback: v => v + '%', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' }, min: -10, max: 100 }
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
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1f2937', borderColor: '#374151', borderWidth: 1, titleColor: '#fff', bodyColor: '#fff' } },
        scales: {
          x: { max: 100, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
          y: { ticks: { color: '#1f2937', font: { size: 11, weight: '600' } }, grid: { display: false } }
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
        scales: { r: { min: 0, max: 100, ticks: { color: '#6b7280', backdropColor: 'transparent', font: { size: 9 } }, grid: { color: 'rgba(0,0,0,.08)' }, angleLines: { color: 'rgba(0,0,0,.08)' }, pointLabels: { color: '#374151', font: { size: 11, weight: '600' } } } }
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
            <div style="display:grid;grid-template-columns:30px 100px 1fr 60px;gap:10px;align-items:center;padding:8px;background:rgba(0,0,0,.025);border-radius:8px">
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
          <div style="display:grid;grid-template-columns:1fr 120px 60px;gap:12px;padding:10px 12px;background:rgba(0,0,0,.025);border-radius:8px;align-items:center">
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
          <div class="exec-stat-item"><div class="exec-stat-val">${(pot.current_avg_oee * 100).toFixed(1)}%</div><div class="exec-stat-lbl">Mevcut OEE <span style="color:var(--muted);font-weight:500;text-transform:none">(${pot.machines.length} üretken makine)</span></div></div>
          <div class="exec-arrow">→</div>
          <div class="exec-stat-item"><div class="exec-stat-val">${(pot.corrected_avg_oee * 100).toFixed(1)}%</div><div class="exec-stat-lbl">Hedef OEE <span style="color:var(--muted);font-weight:500;text-transform:none">(düzeltmeler sonrası)</span></div></div>
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
            <div><div style="font-size:11px;color:var(--muted)">Yatırım Geri Dönüş</div><div style="font-weight:800;font-size:18px;margin-top:4px;color:var(--good)">${fin.payback_days < 1 ? '< 1 gün' : fin.payback_days + ' gün'}</div></div>
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
  { id: 'RCA', label: 'RCA', desc: '17 problem + istatistiksel confidence' },
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
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${financial ? 'Geri ödeme: ' + (financial.payback_days < 1 ? '< 1' : financial.payback_days) + ' gün' : ''}</div>
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
        ${alarms.length ? alarms.map(a => `<div style="padding:8px;background:rgba(0,0,0,.025);border-radius:6px;margin-bottom:4px;font-size:11px">
          <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:10px">${escapeHtml(String(a.time).slice(0, 19))}</div>
          <div style="font-weight:600;margin-top:2px">${escapeHtml(a.alarm)}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:11px">—</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Duruşlar (${stops.length})</div>
        ${stops.length ? stops.map(s => `<div style="padding:8px;background:rgba(0,0,0,.025);border-radius:6px;margin-bottom:4px;font-size:11px">
          <div style="font-weight:600">${s.duration_min} dk · ${s.is_planned ? 'Planlı' : 'Plansız'}</div>
          <div style="color:var(--muted);font-size:10px;margin-top:2px">${escapeHtml(s.stop_reason || '—')}</div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:11px">—</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Program Bağlamı (${programs.length})</div>
        ${programs.length ? programs.map(p => `<div style="padding:8px;background:rgba(0,0,0,.025);border-radius:6px;margin-bottom:4px;font-size:11px">
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
        <div style="display:flex;gap:12px;padding:10px 12px;background:rgba(0,0,0,.025);border-radius:8px;margin-bottom:6px;align-items:center">
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
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:18px;padding:16px;background:rgba(0,0,0,.025);border-radius:10px">
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
        <div style="display:grid;grid-template-columns:50px 1fr 120px 80px;gap:12px;padding:12px;background:rgba(0,0,0,.025);border-radius:8px;align-items:center">
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
// PANEL: LIVE — Power BI tarzı canlı izleme
// ════════════════════════════════════════════

// Yarım daire gauge (kırmızı → sarı → yeşil gradient)
function pbiGauge(value, size = 'big') {
  const pct = Math.max(0, Math.min(100, value));
  const w = size === 'mini' ? 200 : 240;
  const h = size === 'mini' ? 100 : 140;
  const cx = w / 2, cy = h - 10;
  const r = size === 'mini' ? 75 : 95;
  // 180° → 0° (sol → sağ)
  const angle = Math.PI - (pct / 100) * Math.PI;
  const px = +(cx + r * Math.cos(angle)).toFixed(2);
  const py = +(cy - r * Math.sin(angle)).toFixed(2);
  // Yay max 180° olduğu için large-arc-flag DAİMA 0 olmalı.
  // pct>50 iken 1 yapmak SVG'yi ters yönden 360° yayla doldurup taşmaya neden olur.
  const sw = size === 'mini' ? 12 : 16;
  // viewBox'ı stroke'un yarısı kadar genişlet — kenarlarda taşmasın
  const pad = sw / 2;
  return `<svg viewBox="${-pad} ${-pad} ${w + sw} ${h + sw}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="ggrad-${size}-${Math.round(value)}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="50%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
    </defs>
    <path d="M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="#e5e7eb" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
    <path d="M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${px} ${py}" stroke="url(#ggrad-${size}-${Math.round(value)})" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// Mock üretim verisi — gerçek makine isimleri
const PBI_MOCK_MACHINES = [
  { name: 'Makine 1', ctrl: 'FanucFocas', state: 'running', wo: 'WO-1661', product: 'P-2034', oee: 92, perf: 89, qual: 100, partsToday: 387, partsTarget: 420, partsRate: 48 },
  { name: 'Makine 2', ctrl: 'FanucFocas', state: 'waiting', wo: 'WO-1661', product: 'P-2034', oee: 0, perf: 0, qual: 100, partsToday: 0, partsTarget: 350, partsRate: 0 },
  { name: 'Makine 3', ctrl: 'FanucFocas', state: 'running', wo: 'WO-1452', product: 'P-1908', oee: 78, perf: 81, qual: 99, partsToday: 312, partsTarget: 400, partsRate: 39 },
  { name: 'Makine 5', ctrl: 'FanucFocas', state: 'running', wo: 'WO-1661', product: 'P-2034', oee: 65, perf: 72, qual: 98, partsToday: 261, partsTarget: 400, partsRate: 33 },
  { name: 'Makine 7', ctrl: 'MitsubishiCnc', state: 'running', wo: 'WO-1812', product: 'P-2210', oee: 88, perf: 91, qual: 100, partsToday: 354, partsTarget: 400, partsRate: 44 },
  { name: 'Makine 8', ctrl: 'MitsubishiCnc', state: 'idle', wo: '—', product: '—', oee: 0, perf: 0, qual: 0, partsToday: 0, partsTarget: 0, partsRate: 0 },
  { name: 'Makine 9', ctrl: 'FanucFocas', state: 'running', wo: 'WO-2103', product: 'P-2451', oee: 71, perf: 76, qual: 99, partsToday: 285, partsTarget: 400, partsRate: 35 },
  { name: 'TurboCut 400', ctrl: 'LibPlc', state: 'waiting', wo: 'WO-1808', product: 'P-2018', oee: 0, perf: 1, qual: 0, partsToday: 0, partsTarget: 200, partsRate: 0 },
];

// Mock duruş nedenleri ve aktif iş emirleri
const PBI_MOCK_STOP_REASONS = [
  { reason: 'İş Bekleme', minutes: 187, color: '#ef4444' },
  { reason: 'Operatör Yok', minutes: 124, color: '#f59e0b' },
  { reason: 'Plansız Bakım', minutes: 89, color: '#ef4444' },
  { reason: 'Takım Değişimi', minutes: 64, color: '#3b82f6' },
  { reason: 'Malzeme Bekleme', minutes: 47, color: '#f59e0b' },
];

const PBI_MOCK_ACTIVE_WO = [
  { machine: 'Makine 1', product: 'P-2034', total: 420, done: 387, status: 'running' },
  { machine: 'Makine 7', product: 'P-2210', total: 400, done: 354, status: 'running' },
  { machine: 'Makine 3', product: 'P-1908', total: 400, done: 312, status: 'running' },
  { machine: 'Makine 9', product: 'P-2451', total: 400, done: 285, status: 'running' },
  { machine: 'Makine 5', product: 'P-2034', total: 400, done: 261, status: 'running' },
];

// Saatlik üretim mock — son 12 saat
const PBI_MOCK_HOURLY = [38, 42, 31, 45, 52, 41, 0, 0, 28, 47, 51, 49];

async function loadLive() {
  const el = $('#live-content');

  // Streaming aktifse oradan veri çek; yoksa mock
  let streamingActive = false;
  let liveFeed = null;
  try {
    const status = await fetch('/api/streaming/status').then(r => r.json()).catch(() => null);
    if (status && status.running) {
      streamingActive = true;
      liveFeed = await fetch('/api/streaming/feed').then(r => r.json()).catch(() => null);
    }
  } catch (e) { }

  // Mevcut tarih / saat
  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Mock toplam değerler (Trex screenshot tarzı)
  const totals = {
    workTotal: '3g 9s 21d',
    stopTotal: '1g 3s 30d',
    workNet: '13s 7d 43d',
    planned: '1g 3s 7d',
    unplanned: '23d',
    netRatio: 66.2,
    plannedRatio: 33.3,
    unplannedRatio: 0.5,
    overallOee: 99,
  };

  // OEE Sıralaması (mock)
  const ranking = PBI_MOCK_MACHINES
    .filter(m => m.oee > 0)
    .sort((a, b) => b.oee - a.oee)
    .slice(0, 6);

  // Eğer streaming aktifse "Critical" makineleri kart state'lerinde göster
  let liveOverrides = {};
  if (liveFeed && liveFeed.machines) {
    liveFeed.machines.forEach(m => {
      liveOverrides[m.machine] = m.status;
    });
  }

  // Mock toplam göstergeler — top KPI strip
  const runningCount = PBI_MOCK_MACHINES.filter(m => m.state === 'running').length;
  const totalParts = PBI_MOCK_MACHINES.reduce((s, m) => s + m.partsToday, 0);
  const targetParts = PBI_MOCK_MACHINES.reduce((s, m) => s + m.partsTarget, 0);
  const totalAlarms = streamingActive && liveFeed ? liveFeed.machines.reduce((s, m) => s + (m.alarms_in_window || 0), 0) : 7;
  const totalStops = streamingActive && liveFeed ? liveFeed.machines.reduce((s, m) => s + (m.stops_in_window || 0), 0) : 42;
  const partsCompletionPct = ((totalParts / Math.max(targetParts, 1)) * 100).toFixed(1);

  el.innerHTML = `
    <!-- TOOLBAR -->
    <div class="pbi-toolbar">
      <span class="pbi-toolbar-date">${dateStr}</span>
      <span class="pbi-refresh">
        SON YENİLEME · <span class="pbi-refresh-time" id="pbi-clock">${timeStr}</span>
      </span>
      <span style="margin:0 6px;color:var(--muted);font-size:11px">•</span>
      <span style="font-size:11px;color:var(--muted)">Veri kaynağı:</span>
      <span style="font-size:11px;font-weight:700;color:${streamingActive ? 'var(--good)' : 'var(--warning)'}">
        ${streamingActive ? '🟢 Canlı Streaming (Watchdog aktif)' : '🟡 Mock (Demo modu)'}
      </span>
      <div class="pbi-spacer"></div>
      ${streamingActive ?
      '<button class="header-btn" onclick="toggleStreaming(false)" style="color:var(--critical);border-color:rgba(239,68,68,.2)">⏹ Streaming Durdur</button>' :
      '<button class="header-btn" onclick="toggleStreaming(true)" style="color:var(--good);border-color:rgba(16,185,129,.2)">▶ Streaming Başlat</button>'
    }
      <span class="pbi-status-badge">Çalışıyor</span>
    </div>

    <!-- ÜST KPI STRİP (4 kutu) -->
    <div class="pbi-stat-strip">
      <div class="pbi-stat good">
        <div class="pbi-stat-icon">⚙</div>
        <div class="pbi-stat-label">Aktif Makine</div>
        <div class="pbi-stat-value">${runningCount} / ${PBI_MOCK_MACHINES.length}</div>
        <div class="pbi-stat-sub">${PBI_MOCK_MACHINES.length - runningCount} bekliyor</div>
      </div>
      <div class="pbi-stat accent">
        <div class="pbi-stat-icon">📦</div>
        <div class="pbi-stat-label">Bugünkü Üretim</div>
        <div class="pbi-stat-value">${totalParts.toLocaleString('tr-TR')}</div>
        <div class="pbi-stat-sub">Hedefin %${partsCompletionPct}'i</div>
      </div>
      <div class="pbi-stat ${totalAlarms > 5 ? 'bad' : totalAlarms > 0 ? 'warn' : 'good'}">
        <div class="pbi-stat-icon">🔔</div>
        <div class="pbi-stat-label">Anlık Alarm</div>
        <div class="pbi-stat-value">${totalAlarms}</div>
        <div class="pbi-stat-sub">Son 15 dakika</div>
      </div>
      <div class="pbi-stat warn">
        <div class="pbi-stat-icon">⏸</div>
        <div class="pbi-stat-label">Plansız Duruş</div>
        <div class="pbi-stat-value">${totalStops}</div>
        <div class="pbi-stat-sub">Son 15 dakika</div>
      </div>
    </div>

    <!-- ÜST: OEE + ZAMAN DAĞILIMI -->
    <div class="grid g2" style="margin-bottom:16px">

      <!-- SOL: Genel OEE + Sıralama -->
      <div class="pbi-panel">
        <div class="pbi-panel-head">
          <div class="pbi-panel-title">Genel OEE</div>
          <div class="pbi-panel-link">Detaylar →</div>
        </div>
        <div style="display:grid;grid-template-columns:240px 1fr;gap:24px;align-items:center">
          <div>
            <div class="pbi-gauge">
              ${pbiGauge(totals.overallOee)}
              <div class="pbi-gauge-value" style="color:var(--good)">${totals.overallOee}%</div>
              <div class="pbi-gauge-label">Kullanılabilirlik</div>
            </div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-weight:700;font-size:13px">
              <span style="font-size:14px">🏆</span> OEE Sıralaması
            </div>
            ${ranking.map((m, i) => `
              <div class="pbi-rank">
                <span class="pbi-rank-num">${i + 1}.</span>
                <div>
                  <div style="font-weight:600;font-size:12px;margin-bottom:3px">${m.code}</div>
                  <div class="pbi-rank-bar"><div class="pbi-rank-bar-fill" style="width:${m.oee}%"></div></div>
                </div>
                <span class="pbi-rank-val" style="color:${m.oee > 80 ? 'var(--good)' : m.oee > 60 ? 'var(--warning)' : 'var(--critical)'}">${m.oee}%</span>
              </div>`).join('')}
            <div style="font-size:11px;color:var(--accent);margin-top:8px;font-weight:600;cursor:pointer">▾ Daha fazla göster (${PBI_MOCK_MACHINES.length - ranking.length})</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
          <div>
            <div style="font-size:11px;color:var(--muted);font-weight:600">OEE</div>
            <div style="font-size:24px;font-weight:800;margin:2px 0">${totals.overallOee}%</div>
            <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:${totals.overallOee}%;background:var(--accent)"></div></div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);font-weight:600">Performans <span style="color:var(--accent)">→</span></div>
            <div style="font-size:24px;font-weight:800;margin:2px 0">0%</div>
            <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:0%"></div></div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);font-weight:600">Kalite <span style="color:var(--accent)">→</span></div>
            <div style="font-size:24px;font-weight:800;margin:2px 0">100%</div>
            <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:100%;background:var(--accent)"></div></div>
          </div>
        </div>
      </div>

      <!-- SAĞ: Genel Kullanılabilirlik (Donut + KPI side strip) -->
      <div class="pbi-panel">
        <div class="pbi-panel-head">
          <div class="pbi-panel-title">Genel Kullanılabilirlik</div>
          <div class="pbi-panel-link">Duruşlar →</div>
        </div>
        <div style="display:grid;grid-template-columns:140px 220px 140px;gap:16px;align-items:center;justify-content:center">
          <div>
            <div class="pbi-side-kpi work">
              <div class="pbi-side-kpi-label" style="color:var(--good)">Çalışma Süresi</div>
              <div class="pbi-side-kpi-value">${totals.workTotal}</div>
            </div>
            <div class="pbi-side-kpi stop-total">
              <div class="pbi-side-kpi-label" style="color:var(--warning)">Toplam Duruş</div>
              <div class="pbi-side-kpi-value">${totals.stopTotal}</div>
            </div>
            <div class="pbi-side-kpi work-net">
              <div class="pbi-side-kpi-label" style="color:var(--good)">Net Çalışma Süresi</div>
              <div class="pbi-side-kpi-value">${totals.workNet}</div>
            </div>
          </div>

          <div class="pbi-donut-wrap">
            <svg viewBox="0 0 100 100" style="transform:rotate(-90deg);width:100%;height:100%">
              <circle cx="50" cy="50" r="40" stroke="#10b981" stroke-width="14" fill="none" stroke-dasharray="${totals.netRatio * 2.51} 251.3"/>
              <circle cx="50" cy="50" r="40" stroke="#f59e0b" stroke-width="14" fill="none" stroke-dasharray="${totals.plannedRatio * 2.51} 251.3" stroke-dashoffset="-${totals.netRatio * 2.51}"/>
              <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="14" fill="none" stroke-dasharray="${totals.unplannedRatio * 2.51} 251.3" stroke-dashoffset="-${(totals.netRatio + totals.plannedRatio) * 2.51}"/>
            </svg>
            <div class="pbi-donut-center">
              <div class="pbi-donut-value">${totals.netRatio}%</div>
              <div class="pbi-donut-lbl">Net Çalışma Süresi</div>
            </div>
          </div>

          <div>
            <div class="pbi-side-kpi planned">
              <div class="pbi-side-kpi-label" style="color:var(--warning)">Planlı Duruş</div>
              <div class="pbi-side-kpi-value">${totals.planned}</div>
            </div>
            <div class="pbi-side-kpi unplanned">
              <div class="pbi-side-kpi-label" style="color:var(--critical)">Plansız Duruş</div>
              <div class="pbi-side-kpi-value">${totals.unplanned}</div>
            </div>
          </div>
        </div>

        <!-- Zaman Dağılımı çubuk -->
        <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--accent)">
              <span>⏱</span> Zaman Dağılımı <span style="color:var(--accent)">→</span>
            </div>
            <span style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${totals.workTotal}</span>
          </div>
          <div class="pbi-time-bar">
            <div style="flex:${totals.netRatio};background:var(--good)"></div>
            <div style="flex:${totals.plannedRatio};background:var(--warning)"></div>
            <div style="flex:${totals.unplannedRatio};background:var(--critical)"></div>
          </div>
          <div class="pbi-time-legend">
            <span class="pbi-time-legend-item"><span class="pbi-time-legend-dot" style="background:var(--good)"></span>Net Çalışma Süresi <strong style="color:var(--text);margin-left:3px">${totals.netRatio}%</strong> · ${totals.workNet}</span>
            <span class="pbi-time-legend-item"><span class="pbi-time-legend-dot" style="background:var(--warning)"></span>Planlı Duruş <strong style="color:var(--text);margin-left:3px">${totals.plannedRatio}%</strong> · ${totals.planned}</span>
            <span class="pbi-time-legend-item"><span class="pbi-time-legend-dot" style="background:var(--critical)"></span>Plansız Duruş <strong style="color:var(--text);margin-left:3px">${totals.unplannedRatio}%</strong> · ${totals.unplanned}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ORTA: SAATLIK ÜRETİM + EN ÇOK DURUŞLAR -->
    <div class="grid g2" style="margin-bottom:16px">
      <div class="pbi-panel">
        <div class="pbi-panel-head">
          <div class="pbi-panel-title">⏱ Saatlik Üretim (son 12 saat)</div>
          <div class="pbi-panel-link">Detaylar →</div>
        </div>
        <div class="pbi-hour-chart">
          ${PBI_MOCK_HOURLY.map((v, i) => {
        const maxH = Math.max(...PBI_MOCK_HOURLY, 1);
        const h = (v / maxH) * 100;
        const isCurrent = i === PBI_MOCK_HOURLY.length - 1;
        return `<div class="pbi-hour-bar ${isCurrent ? 'current' : ''}" style="height:${h}%" data-tip="${v} parça"></div>`;
      }).join('')}
        </div>
        <div class="pbi-hour-labels">
          ${PBI_MOCK_HOURLY.map((_, i) => {
        const hr = new Date().getHours() - (PBI_MOCK_HOURLY.length - 1 - i);
        const h = (hr + 24) % 24;
        return `<span>${h.toString().padStart(2, '0')}</span>`;
      }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:12px">
          <div><span style="color:var(--muted)">Saatlik ort.:</span> <strong>${Math.round(PBI_MOCK_HOURLY.reduce((s, v) => s + v, 0) / PBI_MOCK_HOURLY.length)}</strong> parça</div>
          <div><span style="color:var(--muted)">Şu an:</span> <strong style="color:var(--good)">${PBI_MOCK_HOURLY[PBI_MOCK_HOURLY.length - 1]}</strong> parça/saat</div>
          <div><span style="color:var(--muted)">En yüksek:</span> <strong>${Math.max(...PBI_MOCK_HOURLY)}</strong> parça</div>
        </div>
      </div>

      <div class="pbi-panel">
        <div class="pbi-panel-head">
          <div class="pbi-panel-title">⛔ En Çok Duruş Nedenleri (bugün)</div>
          <div class="pbi-panel-link">Tümü →</div>
        </div>
        ${(() => {
        const maxMin = Math.max(...PBI_MOCK_STOP_REASONS.map(r => r.minutes));
        return PBI_MOCK_STOP_REASONS.map(r => `
            <div class="pbi-reason-row">
              <div class="pbi-reason-name">${r.reason}</div>
              <div class="pbi-reason-bar"><div class="pbi-reason-bar-fill" style="width:${(r.minutes / maxMin) * 100}%;background:${r.color}"></div></div>
              <div class="pbi-reason-val">${r.minutes}dk</div>
            </div>`).join('');
      })()}
      </div>
    </div>

    <!-- AKTİF İŞ EMİRLERİ -->
    <div class="pbi-panel" style="margin-bottom:16px">
      <div class="pbi-panel-head">
        <div class="pbi-panel-title">📋 Aktif İş Emirleri</div>
        <div class="pbi-panel-link">${PBI_MOCK_ACTIVE_WO.length} aktif emir →</div>
      </div>
      <div style="display:grid;grid-template-columns:80px 100px 130px 1fr 70px;gap:10px;padding:8px 8px 10px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;border-bottom:1px solid var(--border)">
        <span>Makine</span><span>Emir No</span><span>Ürün</span><span>İlerleme</span><span>Durum</span>
      </div>
      ${PBI_MOCK_ACTIVE_WO.map(w => {
        const pct = Math.round((w.done / w.total) * 100);
        return `
          <div class="pbi-wo-row" style="grid-template-columns:80px 100px 130px 1fr 70px" onclick="openMachinePanel('${w.machine}')">
            <span class="pbi-wo-machine">${w.machine}</span>
            <span class="pbi-wo-product">WO-${1000 + Math.floor(Math.random() * 999)}</span>
            <span class="pbi-wo-product">${w.product}</span>
            <div class="pbi-wo-progress">
              <div class="pbi-wo-progress-bar"><div class="pbi-wo-progress-fill" style="width:${pct}%"></div></div>
              <span class="pbi-wo-progress-text">${w.done}/${w.total}</span>
            </div>
            <span class="pbi-wo-status" style="background:var(--good-bg);color:var(--good)">${pct}%</span>
          </div>`;
      }).join('')}
    </div>

    <!-- ALT: MAKİNE KARTLARI (gerçek isimler) -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:14px;font-weight:700">Makineler (${PBI_MOCK_MACHINES.length})</div>
      <div style="font-size:11px;color:var(--muted)">Detay için kart üzerine tıkla</div>
    </div>
    <div class="grid g3" id="pbi-machine-grid">
      ${PBI_MOCK_MACHINES.map(m => {
        let state = m.state;
        let stateLbl = state === 'running' ? 'Çalışıyor' : state === 'waiting' ? 'İş Bekliyor' : 'Boşta';
        if (liveOverrides[m.name]) {
          const s = liveOverrides[m.name];
          if (s === 'critical') { state = 'waiting'; stateLbl = 'KRİTİK (Live)'; }
          else if (s === 'warning') { state = 'idle'; stateLbl = 'UYARI (Live)'; }
        }
        const ctrlColor = m.ctrl === 'FanucFocas' ? '#3b82f6' : m.ctrl === 'MitsubishiCnc' ? '#10b981' : '#f59e0b';

        return `
        <div class="pbi-mcard" onclick="openMachinePanel('${m.name}')">
          <div class="pbi-mcard-head">
            <div>
              <div class="pbi-mcard-name">${m.name}</div>
              <div style="font-size:10px;color:${ctrlColor};font-weight:700;margin-top:2px">${m.ctrl}</div>
            </div>
            <span class="pbi-mcard-state pbi-state-${state}">${stateLbl}</span>
          </div>
          <div class="pbi-mcard-wo"># İş Emri: <strong>${m.wo}</strong> · ${m.product}</div>
          <div class="pbi-mcard-gauge">
            ${pbiGauge(m.oee, 'mini')}
            <div class="pbi-mcard-gauge-val" style="color:${m.oee > 80 ? 'var(--good)' : m.oee > 50 ? 'var(--warning)' : 'var(--critical)'}">${m.oee}%</div>
          </div>
          <div class="pbi-mcard-gauge-lbl">Kullanılabilirlik</div>

          <div class="pbi-mcard-metrics">
            <div class="pbi-mcard-metric">
              <div class="pbi-mcard-metric-lbl">OEE</div>
              <div class="pbi-mcard-metric-val">${m.oee}%</div>
              <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:${m.oee}%;background:${m.oee > 50 ? 'var(--accent)' : 'var(--critical)'}"></div></div>
            </div>
            <div class="pbi-mcard-metric">
              <div class="pbi-mcard-metric-lbl">Üretim</div>
              <div class="pbi-mcard-metric-val">${m.partsToday}</div>
              <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:${m.partsTarget > 0 ? Math.min(100, (m.partsToday / m.partsTarget) * 100) : 0}%;background:var(--good)"></div></div>
            </div>
            <div class="pbi-mcard-metric">
              <div class="pbi-mcard-metric-lbl">Hızı</div>
              <div class="pbi-mcard-metric-val">${m.partsRate}/h</div>
              <div class="pbi-mcard-metric-bar"><div class="pbi-mcard-metric-bar-fill" style="width:${m.partsRate * 2}%;background:var(--accent)"></div></div>
            </div>
          </div>
          <div class="pbi-mcard-foot"><a>Detayları gör →</a></div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Clock update
  if (window._pbiClockTimer) clearInterval(window._pbiClockTimer);
  window._pbiClockTimer = setInterval(() => {
    const el = $('#pbi-clock');
    if (!el) { clearInterval(window._pbiClockTimer); return; }
    el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);
}

// ════════════════════════════════════════════
// MACHINE SIDE PANEL
// ════════════════════════════════════════════
async function openMachinePanel(machineName) {
  const overlay = $('#side-overlay');
  const panel = $('#side-panel');
  const body = $('#sp-body');
  overlay.classList.add('active');
  panel.classList.add('active');

  // Header — placeholder
  $('#sp-title').textContent = machineName;
  $('#sp-sub').textContent = 'Veriler yükleniyor...';

  body.innerHTML = '<div class="loading"><div class="spinner"></div><br>Makine detayları getiriliyor...</div>';

  try {
    // Veriyi paralel çek
    const [healthData, problemsData] = await Promise.all([
      api('/api/health').catch(() => []),
      api('/api/problems').catch(() => []),
    ]);

    const machineHealth = healthData.find(m => m.machine === machineName);
    const machineProblems = problemsData.filter(p =>
      String(p.machine || '').includes(machineName) ||
      String(p.evidence || '').toLowerCase().includes(machineName.toLowerCase())
    ).slice(0, 5);

    // Streaming feed varsa
    let liveState = null;
    let mlRisk = null;
    try {
      const feed = await fetch('/api/streaming/feed/' + encodeURIComponent(machineName)).then(r => r.ok ? r.json() : null).catch(() => null);
      if (feed && feed.current) liveState = feed.current;
    } catch (e) { }
    try {
      const ml = await fetch('/api/predictive/cycle-failure/' + encodeURIComponent(machineName)).then(r => r.ok ? r.json() : null).catch(() => null);
      if (ml && ml.status === 'trained') mlRisk = ml;
    } catch (e) { }

    // Mock makine bilgisi
    const mockData = PBI_MOCK_MACHINES.find(m => m.name === machineName) || {};

    // Header'ı güncelle
    const status = machineHealth?.status || 'unknown';
    const statusLabel = { critical: 'KRİTİK', warning: 'UYARI', good: 'NORMAL' }[status] || 'BİLİNMİYOR';
    $('#sp-sub').innerHTML = `
      <span class="sp-status ${status}">${statusLabel}</span>
      <span style="color:var(--muted);margin-left:10px;font-size:11px">${machineHealth?.controller || mockData.ctrl || 'Unknown'} controller</span>
    `;

    // İçerik
    const oeeDisp = machineHealth ? (machineHealth.avg_oee * 100).toFixed(1) : (mockData.oee || 0);
    const aDisp = machineHealth ? (machineHealth.avg_A * 100).toFixed(1) : '—';
    const healthScore = machineHealth?.health_score ?? 0;

    body.innerHTML = `
      <!-- ANLIK METRİKLER -->
      <div class="sp-section">
        <div class="sp-section-title">📊 Anlık Metrikler</div>
        <div class="sp-metric-grid">
          <div class="sp-metric">
            <div class="sp-metric-label">OEE</div>
            <div class="sp-metric-value" style="color:${oeeDisp > 30 ? 'var(--good)' : 'var(--critical)'}">${oeeDisp}%</div>
          </div>
          <div class="sp-metric">
            <div class="sp-metric-label">Availability</div>
            <div class="sp-metric-value">${aDisp}%</div>
          </div>
          <div class="sp-metric">
            <div class="sp-metric-label">Health Score</div>
            <div class="sp-metric-value" style="color:${healthScore > 50 ? 'var(--good)' : healthScore > 20 ? 'var(--warning)' : 'var(--critical)'}">${Math.round(healthScore)}</div>
          </div>
        </div>
      </div>

      <!-- ÜRETİM DURUMU -->
      <div class="sp-section">
        <div class="sp-section-title">📦 Üretim Durumu</div>
        <div class="sp-row"><span class="sp-row-key">Bugünkü Üretim</span><span class="sp-row-val">${(mockData.partsToday || 0).toLocaleString('tr-TR')} parça</span></div>
        <div class="sp-row"><span class="sp-row-key">Hedef</span><span class="sp-row-val">${(mockData.partsTarget || 0).toLocaleString('tr-TR')} parça</span></div>
        <div class="sp-row"><span class="sp-row-key">Hız</span><span class="sp-row-val">${mockData.partsRate || 0} parça/saat</span></div>
        <div class="sp-row"><span class="sp-row-key">Aktif İş Emri</span><span class="sp-row-val">${mockData.wo || '—'}</span></div>
        <div class="sp-row"><span class="sp-row-key">Ürün</span><span class="sp-row-val">${mockData.product || '—'}</span></div>
        <div class="sp-row"><span class="sp-row-key">Toplam Üretim (9 ay)</span><span class="sp-row-val">${(machineHealth?.total_pieces || 0).toLocaleString('tr-TR')}</span></div>
      </div>

      ${liveState ? `
      <!-- ANLIK CANLI DURUM -->
      <div class="sp-section">
        <div class="sp-section-title">📡 Streaming (son 15dk)</div>
        <div class="sp-row"><span class="sp-row-key">Pencere Alarmları</span><span class="sp-row-val" style="color:${liveState.alarms_in_window > 0 ? 'var(--critical)' : 'var(--good)'}">${liveState.alarms_in_window || 0}</span></div>
        <div class="sp-row"><span class="sp-row-key">Pencere Duruşları</span><span class="sp-row-val" style="color:${liveState.stops_in_window > 0 ? 'var(--warning)' : 'var(--good)'}">${liveState.stops_in_window || 0}</span></div>
        ${liveState.cycle_avg_ms ? `<div class="sp-row"><span class="sp-row-key">Ortalama Cycle</span><span class="sp-row-val">${(liveState.cycle_avg_ms / 1000).toFixed(1)}s</span></div>` : ''}
        ${liveState.cycle_samples ? `<div class="sp-row"><span class="sp-row-key">Cycle Sample</span><span class="sp-row-val">${liveState.cycle_samples}</span></div>` : ''}
      </div>
      ` : ''}

      ${mlRisk ? `
      <!-- ML RİSK SKORU -->
      <div class="sp-section">
        <div class="sp-section-title">🤖 Predictive ML (Random Forest)</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;font-weight:600">Mevcut Risk: <span style="color:${mlRisk.risk_level === 'HIGH' ? 'var(--critical)' : mlRisk.risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--good)'}">${mlRisk.risk_level}</span></span>
          <span style="font-size:14px;font-weight:800">${Math.round((mlRisk.current_risk_score || 0) * 100)}%</span>
        </div>
        <div class="sp-risk-meter">
          <div class="sp-risk-marker" style="left:${(mlRisk.current_risk_score || 0) * 100}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:4px">
          <span>DÜŞÜK</span><span>ORTA</span><span>YÜKSEK</span>
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px">
          <div><div style="color:var(--muted)">AUC</div><div style="font-weight:800">${(mlRisk.metrics?.auc_roc * 100 || 0).toFixed(0)}%</div></div>
          <div><div style="color:var(--muted)">F1</div><div style="font-weight:800">${(mlRisk.metrics?.f1 * 100 || 0).toFixed(0)}%</div></div>
          <div><div style="color:var(--muted)">Precision</div><div style="font-weight:800">${(mlRisk.metrics?.precision * 100 || 0).toFixed(0)}%</div></div>
          <div><div style="color:var(--muted)">Recall</div><div style="font-weight:800">${(mlRisk.metrics?.recall * 100 || 0).toFixed(0)}%</div></div>
        </div>
      </div>
      ` : ''}

      <!-- ALARM DURUMU -->
      <div class="sp-section">
        <div class="sp-section-title">🔔 Alarm Geçmişi</div>
        <div class="sp-row">
          <span class="sp-row-key">Toplam Alarm (9 ay)</span>
          <span class="sp-row-val" style="color:${(machineHealth?.alarm_count || 0) > 50 ? 'var(--critical)' : (machineHealth?.alarm_count || 0) > 0 ? 'var(--warning)' : 'var(--good)'}">${machineHealth?.alarm_count || 0}</span>
        </div>
        <div class="sp-row">
          <span class="sp-row-key">Plansız Duruş Toplam</span>
          <span class="sp-row-val">${(machineHealth?.stop_hours || 0).toFixed(0)}h</span>
        </div>
      </div>

      ${machineProblems.length > 0 ? `
      <!-- TESPİT EDİLEN SORUNLAR -->
      <div class="sp-section">
        <div class="sp-section-title">⚠ Tespit Edilen Sorunlar (${machineProblems.length})</div>
        ${machineProblems.map(p => `
          <div class="sp-alarm-item" style="background:${p.severity === 'critical' ? 'var(--critical-bg)' : p.severity === 'high' ? 'var(--warning-bg)' : 'var(--blue-bg)'};border-left-color:${p.severity === 'critical' ? 'var(--critical)' : p.severity === 'high' ? 'var(--warning)' : 'var(--blue)'}">
            <div class="sp-alarm-time">P${p.id} · ${(p.severity || '').toUpperCase()} · Confidence ${Math.round((p.confidence || 0) * 100)}%</div>
            <div class="sp-alarm-msg" style="color:${p.severity === 'critical' ? 'var(--critical)' : p.severity === 'high' ? 'var(--warning)' : 'var(--blue)'}">${escapeHtml(p.title)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5">${escapeHtml(p.evidence || '')}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- AKSİYONLAR -->
      <div class="sp-section">
        <div class="sp-section-title">⚡ Hızlı Aksiyon</div>
        <div class="sp-action-row">
          <button class="sp-action-btn" onclick="closeMachinePanel();setTimeout(()=>{activatePanel('oee-trend');setTimeout(()=>{$('#trend-machine').value='${machineName}';loadTrend()},100)},300)">📈 OEE Trend</button>
          <button class="sp-action-btn ghost" onclick="closeMachinePanel();setTimeout(()=>{activatePanel('agent');setTimeout(()=>{$('#agent-machine').value='${machineName}';runAgent()},200)},300)">🤖 AI Analiz</button>
        </div>
        <div class="sp-action-row">
          <button class="sp-action-btn ghost" onclick="closeMachinePanel();setTimeout(()=>activatePanel('predictive'),300)">🔮 Tahmin</button>
          <button class="sp-action-btn ghost" onclick="window.print()">🖨 Yazdır</button>
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--critical);padding:20px">Hata: ${err.message}</div>`;
  }
}

function closeMachinePanel() {
  $('#side-overlay').classList.remove('active');
  $('#side-panel').classList.remove('active');
}

// ESC ile kapat
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#side-panel').classList.contains('active')) {
    closeMachinePanel();
  }
});

window.openMachinePanel = openMachinePanel;
window.closeMachinePanel = closeMachinePanel;

async function toggleStreaming(start) {
  const url = `/api/streaming/${start ? 'start' : 'stop'}`;
  try {
    await fetch(url, { method: 'POST' });
    toast(start ? 'Streaming başlatıldı — Watchdog 10sn\'de bir tarayacak' : 'Streaming durduruldu', start ? 'success' : 'info');
    setTimeout(() => loadLive(), 1500);
  } catch (e) {
    toast('İşlem başarısız: ' + e.message, 'error');
  }
}

window.toggleStreaming = toggleStreaming;

// ════════════════════════════════════════════
// PANEL: VISION — Multi-Agent + Power BI Senaryosu
// ════════════════════════════════════════════
// Live control panel render — vizyon sekmesindeki canlı kontrol kısmı
async function renderVisionLivePanel() {
  const el = $('#vision-live-content');
  if (!el) return;

  try {
    const status = await fetch('/api/streaming/status').then(r => r.json());
    const running = status.running;
    const sched = status.scheduler || {};
    const wdog = sched.watchdog || {};
    const lookahead = sched.lookahead || {};
    const notifStats = status.notifier || { total: 0, unread: 0 };

    // Bus events
    const events = await fetch('/api/streaming/events?limit=12').then(r => r.json()).catch(() => ({ items: [], stats: {} }));
    const busStats = events.stats || {};

    // Notifications
    const notifs = await fetch('/api/streaming/notifications?limit=8').then(r => r.json()).catch(() => ({ items: [] }));

    // Live feed
    const feed = await fetch('/api/streaming/feed').then(r => r.json()).catch(() => ({ machines: [] }));
    const critical = feed.machines ? feed.machines.filter(m => m.status === 'critical').length : 0;
    const warning = feed.machines ? feed.machines.filter(m => m.status === 'warning').length : 0;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

        <!-- AGENT STATUS -->
        <div style="padding:16px;background:${running ? 'rgba(16,185,129,.06)' : 'rgba(245,158,11,.06)'};border:1px solid ${running ? 'rgba(16,185,129,.18)' : 'rgba(245,158,11,.18)'};border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:10px;height:10px;border-radius:50%;background:${running ? 'var(--good)' : 'var(--warning)'};animation:${running ? 'pulse 1.5s infinite' : 'none'}"></div>
              <div style="font-size:13px;font-weight:700">${running ? 'Streaming AKTİF' : 'Streaming KAPALI'}</div>
            </div>
            ${running ?
        '<button class="header-btn" onclick="toggleStreaming(false);setTimeout(()=>renderVisionLivePanel(),1500)" style="color:var(--critical);border-color:rgba(239,68,68,.2);font-size:11px">⏹ Durdur</button>' :
        '<button class="header-btn" onclick="toggleStreaming(true);setTimeout(()=>renderVisionLivePanel(),1500)" style="color:var(--good);border-color:rgba(16,185,129,.2);font-size:11px">▶ Başlat</button>'
      }
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="padding:10px;background:var(--card);border-radius:8px;border:1px solid var(--border)">
              <div style="font-size:11px;color:var(--muted);font-weight:600">🔍 Watchdog</div>
              <div style="display:flex;justify-content:space-between;align-items:end;margin-top:4px">
                <div style="font-size:18px;font-weight:800;color:${wdog.running ? 'var(--good)' : 'var(--muted)'}">${wdog.run_count || 0}</div>
                <div style="font-size:10px;color:var(--muted)">${wdog.interval_sec || 10}sn</div>
              </div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">${wdog.last_run_iso ? 'Son: ' + wdog.last_run_iso.split(' ')[1] : 'Henüz çalışmadı'}</div>
            </div>
            <div style="padding:10px;background:var(--card);border-radius:8px;border:1px solid var(--border)">
              <div style="font-size:11px;color:var(--muted);font-weight:600">🔮 Lookahead</div>
              <div style="display:flex;justify-content:space-between;align-items:end;margin-top:4px">
                <div style="font-size:18px;font-weight:800;color:${lookahead.running ? 'var(--accent)' : 'var(--muted)'}">${lookahead.run_count || 0}</div>
                <div style="font-size:10px;color:var(--muted)">${lookahead.interval_sec || 30}sn</div>
              </div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">${lookahead.last_run_iso ? 'Son: ' + lookahead.last_run_iso.split(' ')[1] : 'Henüz çalışmadı'}</div>
            </div>
          </div>
        </div>

        <!-- ANLIK ETKİ -->
        <div style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
          <div style="font-size:13px;font-weight:700;margin-bottom:14px">Anlık Tespit</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            <div style="text-align:center;padding:8px;background:var(--critical-bg);border-radius:8px">
              <div style="font-size:22px;font-weight:800;color:var(--critical)">${critical}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Kritik</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--warning-bg);border-radius:8px">
              <div style="font-size:22px;font-weight:800;color:var(--warning)">${warning}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Uyarı</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--accent-glow);border-radius:8px">
              <div style="font-size:22px;font-weight:800;color:var(--accent)">${busStats.history_size || 0}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Event</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--good-bg);border-radius:8px">
              <div style="font-size:22px;font-weight:800;color:var(--good)">${notifStats.unread || 0}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Bildirim</div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:11px;color:var(--muted);text-align:center">
            ${running ? '🟢 Her ' + (wdog.interval_sec || 10) + ' saniyede bir tarama yapılıyor' : 'Sistemi başlatın → otomatik tarama başlasın'}
          </div>
        </div>
      </div>

      <!-- EVENT FEED + NOTIFICATIONS -->
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:14px">

        <!-- EVENT BUS LOG -->
        <div style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700">
              <span>📡</span> Event Bus (canlı)
            </div>
            <span style="font-size:10px;color:var(--muted)">${(events.items || []).length} son event</span>
          </div>
          <div style="max-height:280px;overflow-y:auto;font-family:'JetBrains Mono',monospace">
            ${(events.items || []).length === 0 ?
        '<div style="text-align:center;padding:30px 0;color:var(--muted);font-size:12px">Henüz event yok — streaming başlatıldığında akış burada görünür</div>' :
        events.items.map(e => {
          const time = (e.ts_iso || '').split(' ')[1] || '';
          const p = e.payload || {};
          let detail = '';
          if (e.type === 'threshold.breach') detail = `${p.machine || ''} · ${p.metric || ''}=${p.value || ''}`;
          else if (e.type === 'health.degraded') detail = `${p.machine || ''} · ${p.from || ''} → ${p.to || ''}`;
          else if (e.type === 'notification') detail = `${p.machine || ''} · ${(p.title || '').slice(0, 40)}`;
          else if (e.type === 'scan.completed') detail = `${p.scanned_machines || 0} makine taradı`;
          else if (e.type === 'risk.high' || e.type === 'risk.medium') detail = `${p.machine || ''} · risk %${Math.round((p.risk_score || 0) * 100)}`;
          else detail = JSON.stringify(p).slice(0, 50);
          let color = 'var(--muted)';
          if (e.type.includes('critical') || e.type === 'risk.high' || e.type === 'health.degraded') color = 'var(--critical)';
          else if (e.type === 'risk.medium' || e.type === 'threshold.breach') color = 'var(--warning)';
          else if (e.type === 'notification') color = 'var(--accent)';
          else if (e.type === 'scan.completed') color = 'var(--good)';
          return `<div style="display:grid;grid-template-columns:60px 140px 1fr;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);font-size:11px;align-items:center">
                  <span style="color:var(--muted);font-size:10px">${time}</span>
                  <span style="color:${color};font-weight:700;font-size:10px">${e.type}</span>
                  <span style="color:var(--text);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(detail)}</span>
                </div>`;
        }).join('')}
          </div>
        </div>

        <!-- NOTIFICATIONS -->
        <div style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700">
              <span>🔔</span> Bildirimler
            </div>
            ${notifStats.unread > 0 ? `<span style="background:var(--critical);color:#fff;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700">${notifStats.unread} yeni</span>` : ''}
          </div>
          <div style="max-height:280px;overflow-y:auto">
            ${(notifs.items || []).length === 0 ?
        '<div style="text-align:center;padding:30px 0;color:var(--muted);font-size:12px">Henüz bildirim yok</div>' :
        notifs.items.map(n => {
          const color = n.severity === 'critical' ? 'var(--critical)' : n.severity === 'warning' ? 'var(--warning)' : 'var(--accent)';
          const bg = n.severity === 'critical' ? 'var(--critical-bg)' : n.severity === 'warning' ? 'var(--warning-bg)' : 'var(--accent-glow)';
          return `<div style="padding:10px 12px;background:${bg};border-left:3px solid ${color};border-radius:6px;margin-bottom:6px;font-size:11px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                    <span style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace">${(n.ts_iso || '').split(' ')[1] || ''}</span>
                    <span style="font-size:9px;color:${color};font-weight:700">${(n.severity || '').toUpperCase()}</span>
                  </div>
                  <div style="font-weight:700;color:${color};font-size:11px">${escapeHtml(n.title || '')}</div>
                  <div style="color:var(--muted);font-size:10px;margin-top:2px">${escapeHtml(n.body || '')}</div>
                </div>`;
        }).join('')}
          </div>
        </div>
      </div>

      <!-- PRESCRIBER DENEME -->
      <div style="padding:16px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700">
            <span>💡</span> Prescriber Agent — Anlık Tavsiye
          </div>
          <div style="display:flex;gap:6px">
            <select id="prescribe-machine" class="wf-select" style="width:auto;min-width:130px;padding:6px 10px;font-size:11px">
              <option>Makine 1</option><option>Makine 2</option><option>Makine 3</option>
              <option>Makine 5</option><option>Makine 7</option><option>Makine 8</option>
              <option>Makine 9</option>
            </select>
            <button class="header-btn" onclick="runPrescribe()" style="font-size:11px;color:var(--good);border-color:rgba(16,185,129,.2)">▶ Tavsiye Al</button>
          </div>
        </div>
        <div id="prescribe-result" style="font-size:12px">
          <div style="text-align:center;padding:20px 0;color:var(--muted)">Bir makine seç ve "Tavsiye Al" butonuna tıkla → prescriber agent anlık tavsiye üretsin</div>
        </div>
      </div>
    `;

  } catch (e) {
    el.innerHTML = `<div style="padding:16px;background:var(--critical-bg);color:var(--critical);border-radius:10px;font-size:13px">Streaming sistemi yüklenemedi: ${e.message}</div>`;
  }
}

// Prescriber agent çağrısı
async function runPrescribe() {
  const machine = $('#prescribe-machine').value;
  const el = $('#prescribe-result');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const r = await fetch('/api/streaming/prescribe/' + encodeURIComponent(machine)).then(r => r.json());
    if (r.error) {
      el.innerHTML = `<div style="padding:14px;background:var(--warning-bg);color:var(--warning);border-radius:8px;font-size:12px">⚠ ${r.error}</div>`;
      return;
    }
    const urgencyColor = r.urgency === 'act_now' ? 'var(--critical)' : r.urgency === 'monitor_close' ? 'var(--warning)' : 'var(--good)';
    const urgencyLbl = r.urgency === 'act_now' ? 'HEMEN AKSİYON' : r.urgency === 'monitor_close' ? 'YAKIN TAKİP' : 'NORMAL';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="padding:5px 12px;background:${urgencyColor};color:#fff;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.3px">${urgencyLbl}</span>
        <span style="color:var(--muted);font-size:11px">${r.machine} · ${(r.ts_iso || '').split(' ')[1] || ''}</span>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:8px">Aksiyonlar (${r.actions.length})</div>
        ${r.actions.map((a, i) => `
          <div style="display:grid;grid-template-columns:38px 1fr 60px;gap:10px;padding:10px;background:var(--subtle);border-radius:8px;margin-bottom:6px;align-items:center">
            <div style="width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">${i + 1}</div>
            <div>
              <div style="font-weight:700;font-size:12px">${escapeHtml(a.step || '')}</div>
              <div style="color:var(--muted);font-size:11px;margin-top:2px">${escapeHtml(a.action || '')}</div>
            </div>
            <div style="text-align:right;font-weight:700;font-size:12px;color:var(--accent)">${a.eta_minutes}dk</div>
          </div>
        `).join('')}
      </div>
      ${r.rationale && r.rationale.length ? `
        <div style="padding:10px 12px;background:var(--accent-glow);border-left:2px solid var(--accent);border-radius:6px">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700;margin-bottom:4px">Gerekçeler</div>
          ${r.rationale.map(rt => `<div style="font-size:11px;color:var(--text2);padding:2px 0">• ${escapeHtml(rt)}</div>`).join('')}
        </div>
      ` : ''}
      ${r.snapshot_summary ? `
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px">
          <div style="text-align:center;padding:6px;background:var(--subtle);border-radius:5px">
            <div style="color:var(--muted)">Status</div>
            <div style="font-weight:800;margin-top:2px;color:${r.snapshot_summary.status === 'critical' ? 'var(--critical)' : r.snapshot_summary.status === 'warning' ? 'var(--warning)' : 'var(--good)'}">${(r.snapshot_summary.status || '?').toUpperCase()}</div>
          </div>
          <div style="text-align:center;padding:6px;background:var(--subtle);border-radius:5px">
            <div style="color:var(--muted)">Alarm</div>
            <div style="font-weight:800;margin-top:2px">${r.snapshot_summary.alarms_in_window || 0}</div>
          </div>
          <div style="text-align:center;padding:6px;background:var(--subtle);border-radius:5px">
            <div style="color:var(--muted)">Duruş</div>
            <div style="font-weight:800;margin-top:2px">${r.snapshot_summary.stops_in_window || 0}</div>
          </div>
          <div style="text-align:center;padding:6px;background:var(--subtle);border-radius:5px">
            <div style="color:var(--muted)">ML Risk</div>
            <div style="font-weight:800;margin-top:2px">${r.snapshot_summary.ml_risk_level || 'LOW'}</div>
          </div>
        </div>
      ` : ''}
    `;
  } catch (e) {
    el.innerHTML = `<div style="padding:14px;background:var(--critical-bg);color:var(--critical);border-radius:8px">Hata: ${e.message}</div>`;
  }
}

window.renderVisionLivePanel = renderVisionLivePanel;
window.runPrescribe = runPrescribe;

// 12 Agent tanım datası
const AGENT_DEFINITIONS = {
  batch: [
    { id: 'detector', name: 'Detector', icon: '🔎', color: '#3b82f6', role: 'Sağlık Skoru', desc: 'Tüm makineler için 0-100 arası sağlık skoru hesaplar (OEE, A, alarm, duruş ağırlıklı).', io: 'Input: machine? · Output: health_scores[], critical_machines[]' },
    { id: 'rca', name: 'RCA', icon: '🧠', color: '#ef4444', role: 'Kök Neden', desc: '17 problemi tarar, her birine veriden hesaplanmış confidence ekler (Wilson CI, IQR, Mann-Whitney).', io: 'Input: machine? · Output: problems[], top_issue, confidence' },
    { id: 'context', name: 'EventContext', icon: '📍', color: '#f59e0b', role: 'Olay Penceresi', desc: 'Seçilen olayın ±15dk içindeki alarm, duruş, iş emri ve program kanıtlarını toplar.', io: 'Input: machine, rca · Output: event, alarms[], stoppages[]' },
    { id: 'whatif', name: 'WhatIf', icon: '🔮', color: '#10b981', role: 'OEE Simülasyon', desc: 'RCA top_issue\\\'a göre senaryo seçer: reduce_unplanned / reclassify / fix_cycle / corrected.', io: 'Input: machine, rca · Output: scenarios[], total_oee_improvement' },
    { id: 'financial', name: 'Financial', icon: '💰', color: '#10b981', role: 'Finansal Etki', desc: 'OEE delta\\\'sını ₺/gün ve yıllık fayda olarak hesaplar. Varsayım etiketli — her sayı şeffaf.', io: 'Input: whatif · Output: impact, assumptions, assumption_based=true' },
    { id: 'prioritizer', name: 'Prioritizer', icon: '⭐', color: '#8b5cf6', role: 'Önceliklendirme', desc: 'severity × confidence × impact × feasibility formülüyle aksiyonları sıralar.', io: 'Input: rca, whatif, financial · Output: top_actions[] (skor + ETA)' },
    { id: 'reporter', name: 'Reporter', icon: '📝', color: '#3b82f6', role: 'LLM Rapor', desc: 'Ollama (qwen2.5:14b) ile 8 başlıklı Türkçe rapor üretir. LLM düşerse fallback rapor.', io: 'Input: tüm agent çıktıları · Output: report, status (success/fallback)' },
    { id: 'critic', name: 'Critic', icon: '🔍', color: '#10b981', role: 'Halüsinasyon Kontrolü', desc: 'Rapordaki sayıları kanıt setiyle karşılaştırır. Uydurma sayıları yakalar.', io: 'Input: report, tüm kanıtlar · Output: score 0-100, issues[], verification_rate' },
  ],
  streaming: [
    { id: 'watchdog', name: 'Watchdog', icon: '🐕', color: '#ef4444', role: 'Sürekli Tarama', desc: 'Her 10 saniyede tüm makineleri tarar, eşik geçişlerinde event yayar.', io: 'Tetik: timer 10sn · Event: health.degraded, threshold.breach, scan.completed' },
    { id: 'lookahead', name: 'Lookahead', icon: '🔭', color: '#f59e0b', role: 'Predictive Risk', desc: '30 saniyede bir Random Forest (AUC 0.999) ile gelecek 15dk arıza riski tahmini.', io: 'Tetik: timer 30sn · Event: risk.high, risk.medium · ML: RF classifier' },
    { id: 'notifier', name: 'Notifier', icon: '🔔', color: '#3b82f6', role: 'Bildirim Merkezi', desc: 'Event bus\\\'a abone, kritik olayları operatör/müdür için bildirime dönüştürür.', io: 'Subscribe: health.degraded, risk.* · Output: notification queue' },
    { id: 'prescriber', name: 'Prescriber', icon: '💡', color: '#10b981', role: 'Anlık Tavsiye', desc: 'Tahmin değil tavsiye verir: "Şimdi şunu yap" — ETA dakika ile birlikte.', io: 'Input: machine · Output: actions[] (step, action, eta_min), rationale[]' },
  ]
};

function renderAgentCard(a, family) {
  const familyColor = family === 'batch' ? '#3b82f6' : '#10b981';
  const familyLbl = family === 'batch' ? 'BATCH' : 'STREAMING';
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;transition:all .2s;cursor:default" onmouseover="this.style.borderColor='${a.color}';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='translateY(0)'">
      <div style="display:flex;align-items:start;gap:12px">
        <div style="width:44px;height:44px;background:${a.color}1A;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${a.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:800;font-size:15px;color:${a.color}">${a.name}</span>
            <span style="font-size:9px;font-weight:700;padding:2px 6px;background:${familyColor}1A;color:${familyColor};border-radius:4px;letter-spacing:.3px">${familyLbl}</span>
          </div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-top:2px">${a.role}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.55;margin-top:10px">${a.desc}</div>
      <div style="margin-top:10px;padding:8px 10px;background:var(--subtle);border-radius:6px;font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;line-height:1.6;border-left:2px solid ${a.color}">${a.io}</div>
    </div>
  `;
}

function loadVision() {
  const el = $('#vision-content');
  el.innerHTML = `
    <!-- COMPACT HERO -->
    <div style="background:linear-gradient(135deg,rgba(16,185,129,.06),rgba(59,130,246,.06));border:1px solid rgba(16,185,129,.15);border-radius:12px;padding:24px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:10px;color:var(--good);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">MULTI-AGENT SİSTEM</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-.4px;margin-bottom:6px;background:linear-gradient(135deg,#10b981,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">12 Agent · 2 Mimari</div>
          <div style="font-size:13px;color:var(--muted);line-height:1.5;max-width:600px">
            <strong style="color:var(--text)">8 Batch agent</strong> tarihsel veriyi 30sn'de analiz eder. <strong style="color:var(--text)">4 Streaming agent</strong> sürekli çalışır, eşik geçişlerinde anlık tepki verir.
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <div style="text-align:center;padding:10px 16px;background:rgba(59,130,246,.08);border-radius:10px;border:1px solid rgba(59,130,246,.18)">
            <div style="font-size:24px;font-weight:800;color:var(--accent)">8</div>
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Batch</div>
          </div>
          <div style="text-align:center;padding:10px 16px;background:rgba(16,185,129,.08);border-radius:10px;border:1px solid rgba(16,185,129,.18)">
            <div style="font-size:24px;font-weight:800;color:var(--good)">4</div>
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Stream</div>
          </div>
          <div style="text-align:center;padding:10px 18px;background:linear-gradient(135deg,#3b82f6,#10b981);border-radius:10px">
            <div style="font-size:28px;font-weight:800;color:#fff">12</div>
            <div style="font-size:9px;color:#fff;text-transform:uppercase;letter-spacing:.4px;font-weight:700;opacity:.9">Toplam</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════ CANLI SİSTEM DURUMU ════════ -->
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="font-size:15px;font-weight:800;letter-spacing:-.3px">⚡ Canlı Sistem Durumu</div>
        <span style="font-size:9px;color:var(--good);background:var(--good-bg);padding:3px 10px;border-radius:6px;font-weight:700;letter-spacing:.4px;border:1px solid rgba(16,185,129,.2)">GERÇEK ÇALIŞAN SİSTEM</span>
        <div style="flex:1"></div>
        <button class="header-btn" onclick="renderVisionLivePanel()" style="font-size:11px" data-tip="Yenile">↻</button>
      </div>
      <div id="vision-live-content">
        <div class="loading"><div class="spinner"></div><br>Yükleniyor...</div>
      </div>
    </div>

    <!-- ════════ 12 AGENT TANIMI ════════ -->
    <div style="margin-bottom:20px">
      <div style="font-size:15px;font-weight:800;letter-spacing:-.3px;margin-bottom:6px">🤖 12 Agent Tanımları</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Her agent'ın net sorumluluğu, girdi/çıktısı ve hangi mimaride çalıştığı:</div>

      <!-- BATCH SECTION -->
      <div style="display:flex;align-items:center;gap:10px;margin:18px 0 10px">
        <div style="font-size:13px;font-weight:800;color:var(--accent)">📦 Batch Pipeline (8)</div>
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace">src/agents/</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">
        ${AGENT_DEFINITIONS.batch.map(a => renderAgentCard(a, 'batch')).join('')}
      </div>

      <!-- STREAMING SECTION -->
      <div style="display:flex;align-items:center;gap:10px;margin:24px 0 10px">
        <div style="font-size:13px;font-weight:800;color:var(--good)">📡 Streaming Pipeline (4)</div>
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace">streaming/agents/</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">
        ${AGENT_DEFINITIONS.streaming.map(a => renderAgentCard(a, 'streaming')).join('')}
      </div>
    </div>

    <!-- ════════ ARKADA STATIC ════════ -->
    <div style="padding:14px 18px;background:var(--subtle);border-radius:10px;border:1px solid var(--border);font-size:12px;color:var(--text2);line-height:1.7">
      <div style="font-weight:700;margin-bottom:4px">📐 Mimari Felsefe</div>
      <strong style="color:var(--accent)">Batch:</strong> Senkron pipeline, request → 30sn → rapor.
      <strong style="color:var(--good);margin-left:8px">Streaming:</strong> Pub/Sub event bus, sürekli çalışır, &lt;5sn'de bildirim.
      <span style="color:var(--muted);margin-left:8px">Her ikisi bağımsız, ortak DB üzerinden çalışır.</span>
    </div>
  `;

  // Canlı paneli render et + her 8 saniyede bir auto-refresh
  renderVisionLivePanel();
  if (window._visionAutoRefresh) clearInterval(window._visionAutoRefresh);
  window._visionAutoRefresh = setInterval(() => {
    if ($('#vision').classList.contains('active')) {
      renderVisionLivePanel();
    } else {
      clearInterval(window._visionAutoRefresh);
      window._visionAutoRefresh = null;
    }
  }, 8000);
}

// Geriye kalan eski içerik (deprecated, kullanılmıyor):
const _LEGACY_VISION_HTML = `<!--
<div style="display:flex;align-items:start;justify-content:space-between;gap:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--good);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">VİZYON · PRODUCTION SENARYOSU</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;margin-bottom:10px;background:linear-gradient(135deg,#10b981,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Power BI + 12 Agent — Anlık Akış</div>
          <div style="font-size:13px;color:var(--muted);line-height:1.7;max-width:760px">
            Şu anki sistem 9 aylık batch veriyi 30 saniyede özetliyor.
            Power BI'a bağlanırsa <strong style="color:var(--text)">aynı 8 agent 5 saniyede gerçek zamanlı çalışır</strong>.
            Operatör alarm duymadan 90 saniye önce push bildirim alır, müdür Power BI'da tile turuncuya döndüğünde arkada zaten RCA tamamlanmıştır.
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:6px;min-width:160px">
          <div style="padding:10px;background:rgba(16,185,129,.08);border-radius:8px;border:1px solid rgba(16,185,129,.18);text-align:center">
            <div style="font-size:22px;font-weight:800;color:var(--good)">< 5s</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Tetik → Rapor</div>
          </div>
          <div style="padding:10px;background:rgba(59,130,246,.08);border-radius:8px;border:1px solid rgba(59,130,246,.18);text-align:center">
            <div style="font-size:22px;font-weight:800;color:var(--accent)">10s</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Watchdog Frekansı</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════ CANLI MULTI-AGENT KONTROL PANELİ ════════ -->
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="font-size:16px;font-weight:800;letter-spacing:-.3px">⚡ Canlı Multi-Agent Kontrol Paneli</div>
        <span style="font-size:10px;color:var(--good);background:var(--good-bg);padding:3px 10px;border-radius:6px;font-weight:700;letter-spacing:.4px;border:1px solid rgba(16,185,129,.2)">GERÇEK ÇALIŞAN SİSTEM</span>
        <div style="flex:1"></div>
        <button class="header-btn" onclick="renderVisionLivePanel()" style="font-size:11px" data-tip="Manuel yenile">↻ Yenile</button>
      </div>
      <div id="vision-live-content">
        <div class="loading"><div class="spinner"></div><br>Streaming sistemi durumu yükleniyor...</div>
      </div>
    </div>

    <!-- KARŞILAŞTIRMA TABLOSU -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:var(--blue-bg);color:var(--blue)">⇄</div> Batch vs Anlık — Ne Değişir?</div>
      <table class="cmp-comp-table">
        <tr>
          <th></th><th>Mevcut (Batch)</th><th>Power BI + Anlık</th>
        </tr>
        <tr><td>Veri</td><td>9 ay tarihsel CSV</td><td class="cmp-comp-good">Saniyelik telemetri stream</td></tr>
        <tr><td>Tetikleme</td><td>Kullanıcı butona basar</td><td class="cmp-comp-good">Olay / threshold otomatik tetikler</td></tr>
        <tr><td>Cevap süresi</td><td>30 saniye</td><td class="cmp-comp-good">< 5 saniye</td></tr>
        <tr><td>Görev</td><td>"Geçmişi açıkla"</td><td class="cmp-comp-good">"Gelecek 30dk'da ne yap?"</td></tr>
        <tr><td>Kim için</td><td>Müdür raporu</td><td class="cmp-comp-good">Operatör anlık karar</td></tr>
      </table>
    </div>

    <!-- ANLIK SENARYO TIMELINE -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:var(--critical-bg);color:var(--critical)">⏱</div> Anlık Senaryo — 5 Dakikalık Olay Akışı</div>
      <div class="card-subtitle">Makine 1'de yaklaşan AIR PRESSURE alarmı için sistem nasıl davranır:</div>
      <div style="margin-left:8px">
        <div class="timeline-event good">
          <span class="timeline-time">07:42</span>
          <span class="timeline-msg"><strong>Watchdog</strong>: Makine 1 cycle time normal, hiçbir uyarı yok</span>
        </div>
        <div class="timeline-event warning">
          <span class="timeline-time">07:43</span>
          <span class="timeline-msg"><strong>Watchdog</strong>: Compressed air sensor değerleri <span style="color:var(--warning);font-weight:700">düşmeye başladı</span></span>
        </div>
        <div class="timeline-event warning">
          <span class="timeline-time">07:44</span>
          <span class="timeline-msg"><strong>Lookahead Agent</strong>: P(AIR PRESSURE | 5dk) = <strong style="color:var(--critical)">0.91</strong> → Power BI tile turuncuya döner</span>
        </div>
        <div class="timeline-event warning">
          <span class="timeline-time">07:44:30</span>
          <span class="timeline-msg"><strong>Notifier</strong>: Operatör Mehmet'in tablete <strong>push bildirim</strong>: "Kompresör drenaj kontrol et — 30 saniye"</span>
        </div>
        <div class="timeline-event critical">
          <span class="timeline-time">07:45:12</span>
          <span class="timeline-msg" style="color:var(--critical);font-weight:700">🔔 AIR PRESSURE FAILED alarm çaldı</span>
        </div>
        <div class="timeline-event critical">
          <span class="timeline-time">07:45:13</span>
          <span class="timeline-msg"><strong>TriggeredRCA</strong>: 247. tekrar, kompresör startup pattern (confidence <strong>0.897</strong>)</span>
        </div>
        <div class="timeline-event">
          <span class="timeline-time">07:45:18</span>
          <span class="timeline-msg"><strong>Prescriber</strong>: "Bu sefer kompresör değil <strong>drenaj valfi</strong> — geçmişte aynı pattern 8 kez tekrar etmiş, valf değişiminden sonra sıfırlandı."</span>
        </div>
        <div class="timeline-event">
          <span class="timeline-time">07:46</span>
          <span class="timeline-msg"><strong>Live WhatIf</strong>: "Hemen müdahale edersen <strong>12 dk duruş</strong>, ertelersen <strong>14 saat</strong>"</span>
        </div>
        <div class="timeline-event good">
          <span class="timeline-time">07:46:30</span>
          <span class="timeline-msg"><strong>Reporter</strong>: Müdüre 1 sayfa e-mail draft hazır ✓</span>
        </div>
      </div>
    </div>

    <!-- YENİ AGENT'LAR -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:linear-gradient(135deg,#10b981,#3b82f6);color:#fff">+</div> Eklenmesi Gereken 4 Yeni Agent</div>
      <div class="card-subtitle">Mevcut 8 agent'a ek olarak streaming için:</div>
      <div class="grid g2" style="gap:14px;margin-top:12px">
        <div class="agent-role-card">
          <span class="agent-role-tag tag-new">YENİ</span>
          <div style="font-weight:700;font-size:15px;margin-bottom:6px">🔍 Watchdog Agent</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px">Sürekli scan, threshold takibi</div>
          <div style="font-size:11px;color:var(--text2);background:var(--subtle);padding:8px 10px;border-radius:6px"><strong>Tetik:</strong> Cron / 10sn timer · <strong>Çıktı:</strong> "Makine 7 cycle time son 5dk'da %30 ↑"</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-new">YENİ</span>
          <div style="font-weight:700;font-size:15px;margin-bottom:6px">🔮 Lookahead Agent</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px">Predictive ML risk akışı (sliding window)</div>
          <div style="font-size:11px;color:var(--text2);background:var(--subtle);padding:8px 10px;border-radius:6px"><strong>Tetik:</strong> Cron / 5dk timer · <strong>Çıktı:</strong> "P(arıza | 30dk) = 0.78 → HIGH"</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-new">YENİ</span>
          <div style="font-weight:700;font-size:15px;margin-bottom:6px">📤 Notifier Agent</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px">Push/SMS/Slack/Teams bildirimleri</div>
          <div style="font-size:11px;color:var(--text2);background:var(--subtle);padding:8px 10px;border-radius:6px"><strong>Tetik:</strong> Event-driven · <strong>Çıktı:</strong> Operatöre uygun kanalda mesaj</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-new">YENİ</span>
          <div style="font-weight:700;font-size:15px;margin-bottom:6px">💡 Prescriber Agent</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px">"Tahmin" değil "tavsiye" — prescriptive</div>
          <div style="font-size:11px;color:var(--text2);background:var(--subtle);padding:8px 10px;border-radius:6px"><strong>Tetik:</strong> Operatör sorusu · <strong>Çıktı:</strong> "Feed rate'i %15 düşür → cycle time %20 azalır"</div>
        </div>
      </div>
    </div>

    <!-- ANLIK SENARYO ROLES -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:var(--accent-glow);color:var(--accent)">🤖</div> Mevcut 8 Agent'ın Anlık Rolleri</div>
      <div class="grid g3" style="gap:12px;margin-top:12px">
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">Detector → Streaming Health</div>
          <div style="font-size:11px;color:var(--muted)">Her 10sn yeniden hesap, threshold geçişleri</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">RCA → Triggered RCA</div>
          <div style="font-size:11px;color:var(--muted)">Alarm anında 0sn gecikme ile pattern eşleşme</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">EventContext → Live Window</div>
          <div style="font-size:11px;color:var(--muted)">Olay öncesi ±5dk canlı pencere</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">WhatIf → Live Intervention</div>
          <div style="font-size:11px;color:var(--muted)">"Şimdi durdurursan ne olur?" anlık simülasyon</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">Financial → Live ROI</div>
          <div style="font-size:11px;color:var(--muted)">Vardiya başına anlık ROI hesabı</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">Prioritizer → Fleet Coord.</div>
          <div style="font-size:11px;color:var(--muted)">Tüm makineleri görür, yük dengeler</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">Reporter → Vardiya Raporu</div>
          <div style="font-size:11px;color:var(--muted)">8 saatlik vardiya bitiminde otomatik LLM raporu</div>
        </div>
        <div class="agent-role-card">
          <span class="agent-role-tag tag-existing">MEVCUT</span>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">Critic → Shift Comparator</div>
          <div style="font-size:11px;color:var(--muted)">"Bu vardiya önceki ile kıyasla iyileşmiş mi?"</div>
        </div>
      </div>
    </div>

    <!-- POWER BI ENTEGRASYON ŞEMASI -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:var(--warning-bg);color:var(--warning)">🔌</div> Power BI Entegrasyon Mimarisi</div>
      <pre style="background:var(--subtle);padding:16px;border-radius:10px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.7;color:var(--text2);overflow-x:auto;border:1px solid var(--border)">┌─────────────────────────────────────────────────────┐
│  POWER BI DASHBOARD                                 │
│  ┌──────────┬──────────┬──────────┐                │
│  │ Makine 1 │ Makine 2 │ Makine 7 │ ← tile'lar    │
│  │  🟢 RUN  │  🟢 RUN  │  🟡 RISK │                │
│  └─────┬────┴──────────┴────┬─────┘                │
└────────┼─────────────────────┼────────────────────┘
         │ tıkla              │ tıkla
         ▼                     ▼
   ┌────────────────────────────────────────┐
   │  ANLIK AGENT PANELİ (iframe / popup)   │
   │  → "Bu makine için 12 agent çalıştır"  │
   │  → 5 saniye içinde rapor               │
   └────────────────────────────────────────┘

ARKAPLAN (sürekli çalışan):
   • WATCHDOG her 10sn DB'yi tarar
   • Eşik geçişi → trigger → otomatik rapor → e-mail/Slack
   • LOOKAHEAD her 5 dk → risk skoru tile'larda güncellenir</pre>
    </div>

    <!-- ROADMAP -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><div class="icon" style="background:var(--good-bg);color:var(--good)">🗺</div> Ürünleştirme Yol Haritası</div>
      <div style="display:grid;gap:10px;margin-top:12px">
        <div class="vision-step">
          <div class="vision-step-num">1</div>
          <div>
            <div class="vision-step-title">Faz 1 — 1 ay <span style="color:var(--good);font-size:11px;margin-left:6px">MVP</span></div>
            <div class="vision-step-sub">Mevcut batch sistem + Power BI DirectQuery bağlantısı + iframe agent paneli</div>
          </div>
        </div>
        <div class="vision-step">
          <div class="vision-step-num">2</div>
          <div>
            <div class="vision-step-title">Faz 2 — 2 ay</div>
            <div class="vision-step-sub">Watchdog + Lookahead agent'ları, her 10sn scan, eşik geçişi event'leri</div>
          </div>
        </div>
        <div class="vision-step">
          <div class="vision-step-num">3</div>
          <div>
            <div class="vision-step-title">Faz 3 — 3 ay</div>
            <div class="vision-step-sub">Notifier (push/SMS/Slack) + Power BI özel custom visual'ları</div>
          </div>
        </div>
        <div class="vision-step">
          <div class="vision-step-num">4</div>
          <div>
            <div class="vision-step-title">Faz 4 — 6 ay</div>
            <div class="vision-step-sub">Prescriber agent + LLM fine-tuning fabrika lingosu üzerinde</div>
          </div>
        </div>
        <div class="vision-step">
          <div class="vision-step-num">5</div>
          <div>
            <div class="vision-step-title">Faz 5 — 12 ay <span style="color:var(--accent);font-size:11px;margin-left:6px">EDGE</span></div>
            <div class="vision-step-sub">Edge deployment — agent'lar her makinenin yanında çalışır, latency 50ms</div>
          </div>
        </div>
      </div>
    </div>

    <!-- NEDEN FARK YARATIR -->
    <div class="card">
      <div class="card-title"><div class="icon" style="background:linear-gradient(135deg,#10b981,#3b82f6);color:#fff">🥇</div> Neden Bu Yaklaşım Farkı Yaratır</div>
      <table class="cmp-comp-table" style="margin-top:12px">
        <tr>
          <th>Yöntem</th><th>Eksiği</th>
        </tr>
        <tr><td>Sadece Power BI</td><td class="cmp-comp-bad">Olayı gösterir, nedenini bilmez</td></tr>
        <tr><td>Sadece ML modeli</td><td class="cmp-comp-bad">Risk skoru verir, ne yapacağını söylemez</td></tr>
        <tr><td>Sadece LLM (ChatGPT)</td><td class="cmp-comp-bad">DB bağlantısı yok, kanıtsız tahmin</td></tr>
        <tr style="background:var(--good-bg)"><td style="color:var(--good);font-weight:800">Power BI + 12 Agent</td><td class="cmp-comp-good" style="font-weight:700">Görür ✓ Açıklar ✓ Tahmin eder ✓ Önerir ✓ Doğrular ✓</td></tr>
      </table>
      <div style="margin-top:18px;padding:16px;background:linear-gradient(135deg,rgba(16,185,129,.06),rgba(59,130,246,.06));border-left:3px solid var(--good);border-radius:8px;font-size:13px;font-style:italic;color:var(--text2);line-height:1.7">
        "Power BI gözünüz, 12 Agent beyninizdir. Görüyor olmak yetmiyor — anlamak, tahmin etmek ve önermek gerekiyor."
      </div>
    </div>
-->`;

// ════════════════════════════════════════════
// COMMAND PALETTE
// ════════════════════════════════════════════
const COMMANDS = [
  { id: 'overview', name: 'Fabrika Genel Bakış', icon: '⌂', shortcut: '1' },
  { id: 'live', name: 'Canlı İzleme (Power BI tarzı)', icon: '📡' },
  { id: 'problems', name: 'Problem Listesi', icon: '!', shortcut: '2' },
  { id: 'whatif', name: 'What-If Simülasyonu', icon: '?', shortcut: '3' },
  { id: 'oee-trend', name: 'OEE Trend Analizi', icon: '~', shortcut: '4' },
  { id: 'anomaly', name: 'ML Anomali Tespiti', icon: 'M', shortcut: '5' },
  { id: 'predictive', name: 'Predictive ML (RF + Forecast)', icon: 'P', shortcut: '6' },
  { id: 'data-quality', name: 'Veri Kalitesi', icon: 'V', shortcut: '7' },
  { id: 'compare', name: 'Makine Karşılaştırma', icon: '⚖', shortcut: '8' },
  { id: 'timeline', name: 'Alarm Timeline', icon: '⏱', shortcut: '9' },
  { id: 'executive', name: 'Yönetici Özeti', icon: '★' },
  { id: 'vision', name: 'AI Operations', icon: 'AI' },
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
loaders.live = loadLive;
loaders.problems = loadProblems;
loaders.whatif = loadCorrectedOEE;
loaders['oee-trend'] = loadTrend;
loaders.anomaly = loadHealth;
loaders.predictive = loadPredictive;
loaders['data-quality'] = loadDataQuality;
loaders.compare = loadCompare;
loaders.timeline = loadTimeline;
loaders.executive = loadExecutive;
loaders.vision = loadVision;

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
