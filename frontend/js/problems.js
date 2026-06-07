// ══════════════════════════════════════════
// PANEL 2: PROBLEMS
// ══════════════════════════════════════════
let allProblems = [];
async function loadProblems() {
  try {
    allProblems = await api('/api/problems');
    renderProblems(allProblems);
  } catch(e) { console.error('Problems error:', e); }
}

function renderProblems(data) {
  const el = document.getElementById('problem-cards');
  el.innerHTML = data.map(p => {
    if (p.error) return `<div class="card p-card"><div class="p-title">Problem #${p.id}: Hata</div><p style="color:var(--muted)">${p.error}</p></div>`;
    const sevLabel = {critical:'KRİTİK',high:'YÜKSEK',medium:'ORTA'}[p.severity]||'';
    const confidence = p.confidence != null ? Number(p.confidence) : null;
    const confLabel = confidence != null ? Math.round(confidence * 100) + '% confidence' : 'confidence yok';
    const confClass = confidence != null && confidence >= .8 ? 'good' : 'warn';
    const evidence = (p.evidence_items || []).slice(0, 2).map(e => `<div>• ${e}</div>`).join('');
    const scenarios = (p.recommended_whatif_scenarios || []).join(', ') || '-';
    return `
    <div class="card p-card sev-${p.severity}" onclick="this.classList.toggle('expanded')">
      <div class="p-head">
        <div class="p-title">${p.title}</div>
        <span class="p-badge">#${p.id} ${sevLabel}</span>
      </div>
      <div class="p-machine">${p.machine}</div>
      <div class="p-evidence">${p.evidence}</div>
      <div class="p-meta">
        <span class="p-chip ${confClass}">${confLabel}</span>
        <span class="p-chip">Etki: ${p.impact_area || '-'}</span>
        <span class="p-chip">What-If: ${scenarios}</span>
      </div>
      ${evidence ? `<div class="p-evidence-list"><strong>Kanıt zinciri</strong>${evidence}</div>` : ''}
      <div class="p-rootcause"><strong>Kök Neden:</strong> ${p.root_cause}</div>
      <div class="p-solution"><strong>Çözüm:</strong> ${p.solution}</div>
      <div class="p-expand">Çözümü görmek için tıklayın</div>
    </div>`;
  }).join('');
}

function filterProblems(sev, btn) {
  document.querySelectorAll('#sev-filters .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (sev === 'all') renderProblems(allProblems);
  else renderProblems(allProblems.filter(p => p.severity === sev));
}


