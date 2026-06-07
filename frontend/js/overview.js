// ══════════════════════════════════════════
// PANEL 1: OVERVIEW
// ══════════════════════════════════════════
async function loadOverview() {
  try {
    const data = await api('/api/health');
    const el = document.getElementById('health-cards');

    // KPI hesapla
    const totalPieces = data.reduce((s,m) => s + (m.total_pieces||0), 0);
    const totalAlarms = data.reduce((s,m) => s + (m.alarm_count||0), 0);
    const totalDown = data.reduce((s,m) => s + (m.stop_hours||0), 0);
    const avgOEE = data.reduce((s,m) => s + (m.avg_oee||0), 0) / data.length;
    const avgA = data.reduce((s,m) => s + (m.avg_A||0), 0) / data.length;
    const critCount = data.filter(m => m.status === 'critical').length;

    document.getElementById('kpi-oee').textContent = (avgOEE*100).toFixed(1) + '%';
    document.getElementById('kpi-oee').style.color = avgOEE > 0.3 ? 'var(--good)' : 'var(--critical)';
    document.getElementById('kpi-pieces').textContent = totalPieces.toLocaleString('tr-TR');
    document.getElementById('kpi-alarms').textContent = totalAlarms;
    document.getElementById('kpi-downtime').textContent = Math.round(totalDown).toLocaleString('tr-TR') + 'h';
    document.getElementById('kpi-avail').textContent = (avgA*100).toFixed(1) + '%';
    document.getElementById('kpi-avail').style.color = avgA > 0.5 ? 'var(--good)' : 'var(--warning)';

    document.getElementById('badge-critical').textContent = critCount + ' Kritik';
    document.getElementById('badge-machines').textContent = data.length + ' Makine';

    el.innerHTML = data.map(m => `
      <div class="card m-card st-${m.status}">
        <div class="m-bar"></div>
        ${healthRing(m.health_score, m.status)}
        <div class="m-name">${m.machine}</div>
        <div class="m-status ${m.status}">${m.status === 'critical' ? 'KRİTİK' : m.status === 'warning' ? 'UYARI' : 'NORMAL'}</div>
        <div style="text-align:center;color:var(--muted);font-size:12px;margin:6px 24px 0!important">Kullanılabilirlik Skoru</div>
        <div style="margin:18px 24px 0!important;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;color:var(--text2);font-size:12px">
          <span># İş Emri Numarası:</span><span style="color:var(--accent)">${m.total_pieces > 0 ? fmtK(m.total_pieces) : '-'}</span>
        </div>
        <div class="m-metrics">
          <div class="m-metric">
            <div class="mv" style="color:${m.avg_oee>0.02?'var(--good)':'var(--critical)'}">${(m.avg_oee*100).toFixed(1)}%</div>
            <div class="ml">OEE</div>
          </div>
          <div class="m-metric">
            <div class="mv">${fmtK(m.total_pieces)}</div>
            <div class="ml">Üretim</div>
          </div>
          <div class="m-metric">
            <div class="mv" style="color:${m.alarm_count>0?'var(--critical)':'var(--muted)'}">${m.alarm_count}</div>
            <div class="ml">Alarm</div>
          </div>
        </div>
        <div class="m-footer">
          <span>A: ${(m.avg_A*100).toFixed(1)}%</span>
          <span>Duruş: ${m.stop_hours.toFixed(0)}h</span>
          <span style="color:var(--accent)">Detaylar →</span>
        </div>
      </div>
    `).join('');
  } catch(e) { console.error('Overview error:', e); }
}

async function loadDemoCase() {
  const demoEl = document.getElementById('demo-case');
  const timelineEl = document.getElementById('event-timeline');
  if (!demoEl || !timelineEl) return;

  try {
    const context = await api('/api/agent/context?machine=Makine%201');
    const event = context.event || {};
    const evidence = context.evidence || [];
    demoEl.innerHTML = [
      ['1', 'Kritik makineyi seç', 'Makine 1 üzerinde RCA kanıt penceresi açılır', 'Detector'],
      ['2', 'Kök nedeni kanıtla', event.alarm || 'AIR PRESSURE / duruş korelasyonu', 'RCA'],
      ['3', 'OEE etkisini simüle et', 'Plansız duruş azaltma veya corrected OEE senaryosu çalıştırılır', 'What-If'],
      ['4', 'İş değerine çevir', 'Varsayımsal marj/maliyet ile net fayda hesaplanır', 'Finance'],
    ].map(s => `
      <div class="demo-step">
        <div class="num">${s[0]}</div>
        <div><strong>${s[1]}</strong><span>${s[2]}</span></div>
        <div class="tag">${s[3]}</div>
      </div>
    `).join('');

    const rows = [];
    rows.push({time:'T-15 dk', title:'Bağlam Penceresi', body:'Olay öncesi alarm, program, sayaç ve duruş bağlamı toplanır.'});
    if (event.time || event.alarm) rows.push({time:'T0', title:event.alarm || 'Alarm', body:event.time || 'Olay zamanı'});
    if (context.stoppages && context.stoppages.length) {
      const s = context.stoppages[0];
      rows.push({time:'T0..T+5', title:s.stop_reason || 'Duruş', body:`${s.duration_min || '-'} dk | ${s.is_planned ? 'Planlı' : 'Plansız'}`});
    }
    rows.push({time:'T+5 dk', title:'Kanıt Özeti', body:evidence.length ? evidence.join(' | ') : 'Kanıt penceresi boş veya alarm bulunamadı.'});
    timelineEl.innerHTML = rows.map(r => `
      <div class="timeline-item">
        <div class="timeline-time">${r.time}</div>
        <div class="timeline-body"><strong>${r.title}</strong><span>${r.body}</span></div>
      </div>
    `).join('');
  } catch(e) {
    demoEl.innerHTML = `<p style="color:var(--critical);font-size:12px">Demo case yüklenemedi: ${e.message}</p>`;
    timelineEl.innerHTML = `<p style="color:var(--critical);font-size:12px">Timeline yüklenemedi: ${e.message}</p>`;
  }
}


