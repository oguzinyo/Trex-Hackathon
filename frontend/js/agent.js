// ══════════════════════════════════════════
// PANEL 6: AI AGENT
// ══════════════════════════════════════════
async function runAgent() {
  const machine = document.getElementById('agent-machine').value;
  const btn = document.getElementById('agent-btn');
  const pipelineEl = document.getElementById('agent-pipeline');
  const reportEl = document.getElementById('agent-report');

  btn.disabled = true;
  btn.textContent = 'Agent\'lar çalışıyor...';

  const agents = [
    {id:'Detector', label:'Detector Agent', desc:'Isolation Forest anomali taraması'},
    {id:'RCA', label:'RCA Agent', desc:'17 problemle kök neden eşleştirme'},
    {id:'EventContext', label:'Event Context Agent', desc:'[-15dk,+5dk] kanıt penceresi'},
    {id:'WhatIf', label:'What-If Agent', desc:'RCA bağlantılı OEE simülasyonu'},
    {id:'Financial', label:'Financial Agent', desc:'Varsayımsal iş etkisi'},
    {id:'Prioritizer', label:'Prioritizer Agent', desc:'Aksiyon öncelik skoru'},
    {id:'Reporter', label:'Reporter Agent', desc:'Ollama LLM ile Türkçe rapor'},
  ];

  pipelineEl.innerHTML = agents.map(a => `
    <div class="agent-pipeline-item" id="pipe-${a.id}">
      <div class="pipe-icon" id="picon-${a.id}">--</div>
      <div>
        <div class="pipe-name">${a.label}</div>
        <div class="pipe-status" id="pstat-${a.id}">${a.desc}</div>
      </div>
    </div>
  `).join('');

  // Animation
  let step = 0;
  const stepLabels = ['ML anomali taraması yapılıyor...','Kök nedenler eşleştiriliyor...','Olay bağlamı toplanıyor...','RCA bağlantılı What-If hesaplanıyor...','Finansal varsayımlar uygulanıyor...','Aksiyonlar önceliklendiriliyor...','LLM rapor üretiyor...'];
  const intv = setInterval(() => {
    if (step < agents.length) {
      const a = agents[step];
      document.getElementById(`picon-${a.id}`).className = 'pipe-icon running';
      document.getElementById(`picon-${a.id}`).textContent = '...';
      document.getElementById(`pstat-${a.id}`).textContent = stepLabels[step];
      if (step > 0) {
        const prev = agents[step-1];
        document.getElementById(`picon-${prev.id}`).className = 'pipe-icon done';
        document.getElementById(`picon-${prev.id}`).textContent = 'OK';
        document.getElementById(`pstat-${prev.id}`).textContent = 'Tamamlandı';
        document.getElementById(`pstat-${prev.id}`).className = 'pipe-status done';
      }
      step++;
    }
  }, 3500);

  try {
    const url = machine ? `/api/agent/analyze?machine=${encodeURIComponent(machine)}` : '/api/agent/analyze';
    const data = await api(url);
    clearInterval(intv);

    agents.forEach(a => {
      document.getElementById(`picon-${a.id}`).className = 'pipe-icon done';
      document.getElementById(`picon-${a.id}`).textContent = 'OK';
      document.getElementById(`pstat-${a.id}`).textContent = 'Tamamlandı';
      document.getElementById(`pstat-${a.id}`).className = 'pipe-status done';
    });

    const report = data.final_report || 'Rapor üretilemedi';
    reportEl.innerHTML = `
      <div style="margin-bottom:12px">
        <span style="display:inline-block;padding:4px 12px;background:var(--good-bg);border-radius:6px;font-size:11px;color:var(--good);font-weight:600;border:1px solid rgba(52,211,153,.15)">
          Hedef: ${data.target_machine || 'Tüm fabrika'}
        </span>
      </div>
      <div class="agent-report" style="white-space:pre-wrap">${report.replace(/###\s*/g,'<br><strong style="font-size:14px">').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}</div>
    `;

    const detCard = document.getElementById('agent-details-card');
    detCard.hidden = false;
    const summary = data.summary || {};
    const detector = summary.detector || {};
    const financial = summary.financial || {};
    const eventContext = summary.event_context || {};
    const event = eventContext.event || {};
    const topActions = summary.top_actions || [];
    const pipe = data.pipeline || [];
    const rcaStep = pipe.find(function(p) { return p.agent === 'RCA'; }) || {};
    const whatifStep = pipe.find(function(p) { return p.agent === 'WhatIf'; }) || {};
    const rcaRes = rcaStep.result || {};
    const whatifRes = whatifStep.result || {};
    const topIssue = rcaRes.top_issue || {};
    const bestScenario = (whatifRes.scenarios || []).sort((a,b)=>(b.delta_oee||0)-(a.delta_oee||0))[0] || {};
    const hasFinancial = summary.financial != null;

    document.getElementById('agent-details').innerHTML = `
      <div class="card" style="border-left:3px solid var(--critical)">
        <div class="card-title" style="font-size:13px">Detector</div>
        <div style="font-size:32px;font-weight:800;color:var(--critical)">${detector.critical_count || 0}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Kritik Makine</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${(detector.critical_machines||[]).join(', ') || '-'}</div>
      </div>
      <div class="card" style="border-left:3px solid var(--accent)">
        <div class="card-title" style="font-size:13px">RCA</div>
        <div style="font-size:13px;font-weight:700;color:var(--accent)">${topIssue.title || (summary.rca_problem_count || 0) + ' problem'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">Confidence: ${topIssue.confidence != null ? Math.round(topIssue.confidence*100)+'%' : '-'} | Etki: ${topIssue.impact_area || '-'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${(topIssue.evidence_items||[]).slice(0,2).join('<br>') || 'Kanıt bilgisi yok'}</div>
      </div>
      <div class="card" style="border-left:3px solid var(--good)">
        <div class="card-title" style="font-size:13px">What-If</div>
        <div style="font-size:13px;font-weight:700;color:var(--good)">${bestScenario.scenario || 'Senaryo yok'}</div>
        <div style="font-size:24px;font-weight:800;color:var(--good);margin-top:6px">${bestScenario.delta_oee != null ? '+'+(bestScenario.delta_oee*100).toFixed(2)+' pp' : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${bestScenario.reason || 'RCA bağlantılı senaryo seçimi'}</div>
      </div>
      <div class="card" style="border-left:3px solid var(--blue)">
        <div class="card-title" style="font-size:13px">Event Context</div>
        <div style="font-size:13px;font-weight:700;color:var(--blue)">${event.alarm || 'Alarm yok'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${event.time || ''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${(eventContext.evidence||[]).slice(0,2).join('<br>') || 'Kanıt penceresi boş'}</div>
      </div>
      <div class="card" style="border-left:3px solid var(--warning)">
        <div class="card-title" style="font-size:13px">Top Aksiyon</div>
        <div style="font-size:13px;font-weight:700;color:var(--warning)">${topActions[0] ? topActions[0].title : '-'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">Skor: ${topActions[0] && topActions[0].score != null ? topActions[0].score : '-'} | Confidence: ${topActions[0] && topActions[0].confidence != null ? topActions[0].confidence : '-'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">Alan: ${topActions[0] ? topActions[0].impact_area : '-'}</div>
      </div>
      <div class="card" style="border-left:3px solid var(--accent)">
        <div class="card-title" style="font-size:13px">Finansal & Varsayım</div>
        <div style="font-size:22px;font-weight:800;color:var(--good)">${hasFinancial ? Number(financial.net_benefit_per_day||0).toLocaleString('tr-TR')+'₺' : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Günlük net fayda | ${hasFinancial ? 'Geri ödeme: '+financial.payback_days+' gün' : 'finansal etki yok'}</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.8;margin-top:8px">Dataset finansal veri içermez. Marj, duruş maliyeti ve müdahale maliyeti varsayımsal katmandır.</div>
      </div>
    `;
  } catch(e) {
    clearInterval(intv);
    reportEl.innerHTML = `<p style="color:var(--critical)">Hata: ${e.message}</p>`;
  }

  btn.disabled = false;
  btn.textContent = 'Analizi Başlat';
}


