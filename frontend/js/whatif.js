// ══════════════════════════════════════════
// PANEL 3: WHAT-IF
// ══════════════════════════════════════════
document.getElementById('wf-pct').addEventListener('input', e => {
  document.getElementById('wf-pct-label').textContent = e.target.value + '%';
});

function getAssumptions() {
  return {
    margin: Number(document.getElementById('assumption-margin').value || 12),
    downtime: Number(document.getElementById('assumption-downtime').value || 80),
    intervention: Number(document.getElementById('assumption-intervention').value || 300),
  };
}

function renderWaterfall(d) {
  const el = document.getElementById('whatif-waterfall');
  if (!el || !d.before || !d.after) return;
  const before = Math.max(0, d.before.OEE || 0);
  const after = Math.max(0, d.after.OEE || 0);
  const delta = Math.max(0, d.delta_oee || 0);
  const max = Math.max(before, after, delta, 0.01);
  const row = function(label, value, cls) {
    const width = Math.max(3, Math.min(100, value / max * 100));
    return `<div class="wf-row"><strong>${label}</strong><div class="bar-track"><div class="bar ${cls}" style="width:${width}%"></div></div><span>${(value*100).toFixed(2)}%</span></div>`;
  };
  el.className = 'waterfall';
  el.innerHTML = `
    ${row('Mevcut OEE', before, 'before')}
    ${row('Delta', delta, 'delta')}
    ${row('Yeni OEE', after, '')}
  `;
}

async function runWhatIf() {
  const machine = document.getElementById('wf-machine').value;
  const scenario = document.getElementById('wf-scenario').value;
  const pct = document.getElementById('wf-pct').value;
  const el = document.getElementById('whatif-result');
  const btn = document.getElementById('wf-btn');
  const finEl = document.getElementById('financial-result');
  const waterfallEl = document.getElementById('whatif-waterfall');

  btn.disabled = true; btn.textContent = 'Hesaplanıyor...';
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  finEl.innerHTML = '<p style="color:var(--muted);font-size:12px">Senaryo sonucu pozitif etki üretirse finansal varsayım kartları burada gösterilir.</p>';
  if (waterfallEl) {
    waterfallEl.className = 'waterfall-empty';
    waterfallEl.textContent = 'Waterfall hesaplanıyor...';
  }

  let url;
  if (scenario === 'reduce-unplanned') url = `/api/whatif/reduce-unplanned?machine=${encodeURIComponent(machine)}&reduction_pct=${pct}`;
  else if (scenario === 'reclassify-planned') url = `/api/whatif/reclassify-planned?machine=${encodeURIComponent(machine)}&reclassify_pct=${pct}`;
  else if (scenario === 'fix-cycle-time') url = `/api/whatif/fix-cycle-time?machine=${encodeURIComponent(machine)}`;
  else url = `/api/whatif/scrap-rate?machine=${encodeURIComponent(machine)}&scrap_pct=${pct}`;

  try {
    const data = await api(url);
    if (!Array.isArray(data) || !data.length) {
      const msg = data && data.error ? data.error : 'Bu makine için yeterli veri yok';
      el.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px">${msg}</p>`;
      btn.disabled=false; btn.textContent='Simülasyonu Çalıştır'; return;
    }

    const d = data[0];
    renderWaterfall(d);
    el.innerHTML = `
      <div class="wf-result">
        <div class="wf-box before">
          <div class="wf-label">Mevcut</div>
          <div class="wf-val" style="color:var(--critical)">${(d.before.OEE*100).toFixed(2)}%</div>
          <div class="wf-sub">A=${(d.before.A*100).toFixed(1)}% &bull; P=${(d.before.P*100).toFixed(1)}%</div>
        </div>
        <div class="wf-box after">
          <div class="wf-label">Sonra</div>
          <div class="wf-val" style="color:var(--good)">${(d.after.OEE*100).toFixed(2)}%</div>
          <div class="wf-sub">A=${(d.after.A*100).toFixed(1)}% &bull; P=${(d.after.P*100).toFixed(1)}%</div>
        </div>
      </div>
      <div class="wf-delta">+${(d.delta_oee*100).toFixed(2)} pp OEE iyileştirme${d.recovered_hours ? ' &bull; Günde '+d.recovered_hours+' saat kazanç' : ''}</div>
      <p style="text-align:center;font-size:11px;color:var(--muted);margin-top:10px">${d.scenario} &mdash; ${d.day}</p>
    `;

    if (d.delta_oee > 0) {
      const a = getAssumptions();
      const fin = await api(`/api/whatif/financial?delta_oee=${d.delta_oee}&machine=${encodeURIComponent(machine)}&contribution_margin_per_piece=${a.margin}&downtime_cost_per_hour=${a.downtime}&intervention_cost=${a.intervention}`);
      document.getElementById('financial-result').innerHTML = `
        <div class="fin-item"><div class="fin-val">${fin.recovered_hours_per_day}h</div><div class="fin-lbl">Kazanılan Saat/Gün</div></div>
        <div class="fin-item"><div class="fin-val">${fin.extra_pieces_per_day}</div><div class="fin-lbl">Ekstra Parça/Gün</div></div>
        <div class="fin-item"><div class="fin-val">${Number(fin.net_benefit_per_day).toLocaleString('tr-TR')}₺</div><div class="fin-lbl">Net Fayda/Gün</div></div>
        <div class="fin-item"><div class="fin-val">${Number(fin.gross_benefit_per_day).toLocaleString('tr-TR')}₺</div><div class="fin-lbl">Brüt Kazanç</div></div>
        <div class="fin-item"><div class="fin-val">${Number(fin.downtime_saving_per_day).toLocaleString('tr-TR')}₺</div><div class="fin-lbl">Duruş Tasarrufu</div></div>
        <div class="fin-item"><div class="fin-val">${fin.payback_days} gün</div><div class="fin-lbl">Geri Ödeme</div></div>
        <div class="fin-item"><div class="fin-val">${a.margin}₺</div><div class="fin-lbl">Varsayım: Marj</div></div>
        <div class="fin-item"><div class="fin-val">${a.downtime}₺</div><div class="fin-lbl">Varsayım: Duruş/h</div></div>
        <div class="fin-item"><div class="fin-val">${a.intervention}₺</div><div class="fin-lbl">Varsayım: Müdahale</div></div>
      `;
    } else {
      finEl.innerHTML = '<p style="color:var(--muted);font-size:12px">Bu senaryo pozitif OEE artışı üretmediği için finansal etki hesaplanmadı.</p>';
    }
  } catch(e) {
    el.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
    finEl.innerHTML = '';
  }
  btn.disabled = false; btn.textContent = 'Simülasyonu Çalıştır';
}


