// ══════════════════════════════════════════
// PANEL 5: ML ANOMALY
// ══════════════════════════════════════════
async function loadHealth() {
  try {
    const data = await api('/api/health');
    const ctx = document.getElementById('healthChart').getContext('2d');
    new Chart(ctx, {
      type:'bar',
      data:{
        labels: data.map(d=>d.machine),
        datasets:[{
          label:'Sağlık Skoru',
          data: data.map(d=>d.health_score),
          backgroundColor: data.map(d=> d.status==='critical'?'rgba(248,113,113,.7)':d.status==='warning'?'rgba(251,191,36,.7)':'rgba(52,211,153,.7)'),
          borderRadius:8, barThickness:22
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#1a1f2e',borderColor:'#2d3548',borderWidth:1} },
        scales:{
          x:{ max:100, ticks:{color:'#6b7280',font:{size:10}}, grid:{color:'rgba(255,255,255,.03)'} },
          y:{ ticks:{color:'#e4e7f1',font:{size:11,weight:'600'}}, grid:{display:false} }
        }
      }
    });

    const spikes = await api('/api/anomalies/counters/spikes');
    document.getElementById('counter-spikes').innerHTML = spikes.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:600;font-size:13px">${s.machine}</div>
          <div style="font-size:11px;color:var(--muted)">${s.total_events.toLocaleString()} event</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:15px;color:${s.spike_count>0?'var(--critical)':'var(--good)'}">${s.spike_count} spike</div>
          <div style="font-size:11px;color:var(--muted)">max: ${(s.upper_bound||0).toLocaleString()}</div>
        </div>
      </div>
    `).join('');
  } catch(e) { console.error('Health error:', e); }
}


