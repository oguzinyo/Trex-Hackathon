// ══════════════════════════════════════════
// PANEL 4: OEE TREND
// ══════════════════════════════════════════
let trendChart = null;
async function loadTrend() {
  const machine = document.getElementById('trend-machine').value;
  try {
    const data = await api(`/api/oee/${encodeURIComponent(machine)}`);
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();

    // Trend KPIs
    const last = data[data.length-1] || {};
    const first = data[0] || {};
    document.getElementById('trend-kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Son Hafta OEE</div><div class="kpi-value">${fmt(last.avg_oee*100)}%</div></div>
      <div class="kpi"><div class="kpi-label">Son Hafta Üretim</div><div class="kpi-value">${(last.pieces||0).toLocaleString('tr-TR')}</div></div>
      <div class="kpi"><div class="kpi-label">Haftalık Veri</div><div class="kpi-value">${data.length}</div><div class="kpi-sub">hafta</div></div>
    `;

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.week),
        datasets: [
          { label:'OEE', data:data.map(d=>(d.avg_oee*100).toFixed(2)), borderColor:'#818cf8', backgroundColor:'rgba(129,140,248,.08)', fill:true, tension:.4, pointRadius:2, borderWidth:2.5 },
          { label:'Availability', data:data.map(d=>(d.avg_A*100).toFixed(2)), borderColor:'#34d399', borderDash:[6,4], tension:.4, pointRadius:0, borderWidth:1.5 },
          { label:'Performance', data:data.map(d=>(d.avg_P*100).toFixed(2)), borderColor:'#fbbf24', borderDash:[6,4], tension:.4, pointRadius:0, borderWidth:1.5 },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ labels:{ color:'#6b7280', usePointStyle:true, pointStyle:'circle', padding:20, font:{size:11} } } },
        scales:{
          x:{ ticks:{color:'#6b7280',maxTicksLimit:12,font:{size:10}}, grid:{color:'rgba(255,255,255,.03)'} },
          y:{ ticks:{color:'#6b7280',callback:v=>v+'%',font:{size:10}}, grid:{color:'rgba(255,255,255,.03)'}, min:-10, max:100 }
        }
      }
    });
  } catch(e) { console.error('Trend error:', e); }
}


