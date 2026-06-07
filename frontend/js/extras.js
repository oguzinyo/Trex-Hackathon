// ══════════════════════════════════════════
// CORRECTED OEE
// ══════════════════════════════════════════
async function loadCorrectedOEE() {
  const el = document.getElementById('corrected-oee');
  const machines = ['Makine 1','Makine 2','Makine 3','Makine 5','Makine 7','Makine 9'];
  let html = '';
  for (const m of machines) {
    try {
      const r = await api(`/api/whatif/corrected-oee?machine=${encodeURIComponent(m)}`);
      if (r.error) continue;
      const imp = r.avg_improvement * 100;
      html += `
        <div class="card" style="border-left:3px solid ${imp>20?'var(--good)':imp>10?'var(--warning)':'var(--muted)'}">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px">${m}</div>
          <div style="display:flex;justify-content:space-between;align-items:end">
            <div>
              <div style="font-size:11px;color:var(--muted)">Mevcut</div>
              <div style="font-size:22px;font-weight:800;color:var(--critical)">${(r.avg_current_oee*100).toFixed(1)}%</div>
            </div>
            <div style="font-size:20px;color:var(--muted);padding:0 8px">&rarr;</div>
            <div>
              <div style="font-size:11px;color:var(--muted)">Düzeltilmiş</div>
              <div style="font-size:22px;font-weight:800;color:var(--good)">${(r.avg_corrected_oee*100).toFixed(1)}%</div>
            </div>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:var(--good-bg);border-radius:6px;text-align:center;font-size:12px;font-weight:700;color:var(--good)">+${imp.toFixed(1)} pp</div>
        </div>`;
    } catch(e) {}
  }
  el.innerHTML = html || '<p style="color:var(--muted)">Veri yok</p>';
}

// ══════════════════════════════════════════
// MITSUBISHI SENSORS
// ══════════════════════════════════════════
async function loadMitsubishi() {
  try {
    const data = await api('/api/anomalies/mitsubishi/Makine%207');
    const el = document.getElementById('mitsubishi-result');
    const a = data.analysis || {};
    let html = '';

    if (a.cycle_time) {
      const ct = a.cycle_time;
      html += `
        <div class="card" style="border-left:3px solid var(--accent)">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">Cycle Time</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Normal ortalama</div>
          <div style="font-size:24px;font-weight:800;color:var(--good)">${ct.normal_avg_sec}s</div>
          <div style="font-size:11px;color:var(--muted);margin-top:8px">Anomali ortalama</div>
          <div style="font-size:18px;font-weight:700;color:var(--critical)">${ct.anomaly_avg_sec}s</div>
          <div style="margin-top:8px;font-size:11px;color:var(--muted)">${ct.anomaly_count.toLocaleString()} anomali (${ct.anomaly_pct}%)</div>
        </div>`;
    }
    if (a.axis_X) {
      html += `
        <div class="card" style="border-left:3px solid var(--blue)">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">X Ekseni</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Çalışma aralığı</div>
          <div style="font-size:20px;font-weight:800">${a.axis_X.range_mm.toFixed(1)} mm</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">[${a.axis_X.min.toFixed(1)} ~ ${a.axis_X.max.toFixed(1)}]</div>
          <div style="margin-top:8px;font-size:11px;color:${a.axis_X.outlier_pct>2?'var(--critical)':'var(--muted)'}">${a.axis_X.outlier_count} outlier (${a.axis_X.outlier_pct}%)</div>
        </div>`;
    }
    if (a.run_status) {
      let statusHtml = '';
      for (const [k,v] of Object.entries(a.run_status)) {
        statusHtml += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;font-size:12px">${k}</span>
          <span style="font-size:12px;color:var(--muted)">${v.transitions} geçiş</span>
        </div>`;
      }
      html += `
        <div class="card" style="border-left:3px solid var(--warning)">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">Run Status</div>
          ${statusHtml}
        </div>`;
    }
    el.innerHTML = html || '<p style="color:var(--muted)">Veri yok</p>';
  } catch(e) { console.error('Mitsubishi error:', e); }
}

// ══════════════════════════════════════════
// DATA QUALITY
// ══════════════════════════════════════════
async function loadDataQuality() {
  try {
    const dq = await api('/api/data-quality');

    // Issues
    const issEl = document.getElementById('dq-issues');
    issEl.innerHTML = dq.issues.map(i => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        <span style="padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;
          ${i.severity==='critical'?'background:var(--critical-bg);color:var(--critical)':i.severity==='high'?'background:var(--warning-bg);color:var(--warning)':'background:var(--blue-bg);color:var(--blue)'}">
          ${i.severity.toUpperCase()}
        </span>
        <span style="font-weight:600;font-size:13px;min-width:80px">${i.machine}</span>
        <span style="font-size:12px;color:var(--muted)">${i.detail}</span>
      </div>
    `).join('');

    // OEE Quality
    document.getElementById('dq-oee').innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr style="color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.4px">
        <th style="text-align:left;padding:8px 4px">Makine</th><th>Gün</th><th>Geçerli</th><th>Negatif</th><th>OEE</th><th>A</th><th>P</th>
      </tr>
      ${dq.oee_quality.map(r => `<tr style="border-top:1px solid var(--border)">
        <td style="padding:8px 4px;font-weight:600">${r.machine}</td>
        <td style="text-align:center">${r.total_days}</td>
        <td style="text-align:center;color:var(--good)">${r.valid_days}</td>
        <td style="text-align:center;color:${r.negative_days>0?'var(--critical)':'var(--muted)'}">${r.negative_days}</td>
        <td style="text-align:center">${r.clean_avg_oee!=null?(r.clean_avg_oee*100).toFixed(1)+'%':'—'}</td>
        <td style="text-align:center">${r.avg_A!=null?(r.avg_A*100).toFixed(1)+'%':'—'}</td>
        <td style="text-align:center;color:${r.avg_P!=null&&r.avg_P<0.01?'var(--critical)':'var(--text)'}">${r.avg_P!=null?(r.avg_P*100).toFixed(1)+'%':'—'}</td>
      </tr>`).join('')}
    </table>`;

    // Sensor coverage
    document.getElementById('dq-sensors').innerHTML = dq.sensor_coverage.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:600;font-size:13px">${s.machine}</div>
          <div style="font-size:10px;color:var(--muted)">${s.first_reading} ~ ${s.last_reading}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:15px;color:${s.signal_count>5?'var(--good)':'var(--warning)'}">${s.signal_count} sinyal</div>
          <div style="font-size:10px;color:var(--muted)">${s.total_readings.toLocaleString()} okuma</div>
        </div>
      </div>
    `).join('');

    // Stoppage classification
    const st = dq.stoppage_summary;
    document.getElementById('dq-stops').innerHTML = `
      <div class="fin-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="fin-item"><div class="fin-val">${Number(st.planned||0).toLocaleString()}</div><div class="fin-lbl">Planlı Duruş</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--critical)">${Number(st.unplanned||0).toLocaleString()}</div><div class="fin-lbl">Plansız Duruş</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--warning)">${st.system_offline}</div><div class="fin-lbl">System Offline</div></div>
        <div class="fin-item"><div class="fin-val" style="color:var(--critical)">${st.long_unplanned}</div><div class="fin-lbl">>48h Plansız</div></div>
      </div>
      <div style="margin-top:12px;padding:10px;background:var(--critical-bg);border-radius:8px;font-size:12px;color:var(--critical)">
        ${Number(st.unplanned_hours||0).toLocaleString()}h plansız duruş — bunun önemli bir kısmı tatil veya bakım olup yanlış sınıflandırılmış.
      </div>`;

    // Cycle time quality
    document.getElementById('dq-cycle').innerHTML = dq.cycle_time_quality.map(c => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:12px">${c.machine}</span>
        <span style="font-size:12px">
          <span style="color:var(--muted)">${c.workorders} iş emri</span>
          ${c.cycle_mismatch>0 ? `<span style="color:var(--critical);font-weight:700;margin-left:8px">${c.cycle_mismatch} uyumsuz</span>` : '<span style="color:var(--good);margin-left:8px">OK</span>'}
        </span>
      </div>
    `).join('');

  } catch(e) { console.error('DQ error:', e); }
}


