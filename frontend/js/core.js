const API = '';

// ── Tab switching ──
function activatePanel(panelId) {
  document.querySelectorAll('.tab[data-panel]').forEach(t => t.classList.toggle('active', t.dataset.panel === panelId));
  document.querySelectorAll('.side-item[data-nav-panel]').forEach(t => t.classList.toggle('active', t.dataset.navPanel === panelId));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  if (window.loadPanel) window.loadPanel(panelId);
}

document.querySelectorAll('.tab[data-panel]').forEach(tab => {
  tab.addEventListener('click', () => activatePanel(tab.dataset.panel));
});

document.querySelectorAll('.side-item[data-nav-panel]').forEach(item => {
  item.addEventListener('click', () => activatePanel(item.dataset.navPanel));
});

function toast(message) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2600);
}

function setMachine(machine) {
  document.getElementById('selected-machine-label').textContent = machine;
  ['wf-machine', 'trend-machine', 'agent-machine'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.value = machine;
  });
  document.getElementById('machine-menu').hidden = true;
  toast(machine + ' seçildi. İlgili paneller bu makineyle çalışacak.');
}

function wireChromeControls() {
  const plantBtn = document.getElementById('plant-select');
  const plantMenu = document.getElementById('plant-menu');
  const machineBtn = document.getElementById('machine-select');
  const machineMenu = document.getElementById('machine-menu');
  const search = document.getElementById('global-search');
  const refresh = document.getElementById('refresh-dashboard');
  const status = document.getElementById('status-toggle');

  if (plantBtn) plantBtn.addEventListener('click', function() { plantMenu.hidden = !plantMenu.hidden; machineMenu.hidden = true; });
  if (machineBtn) machineBtn.addEventListener('click', function() { machineMenu.hidden = !machineMenu.hidden; plantMenu.hidden = true; });
  document.querySelectorAll('[data-plant]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelector('#plant-select span').textContent = btn.dataset.plant;
      plantMenu.hidden = true;
      toast(btn.dataset.plant + ' seçildi');
    });
  });
  document.querySelectorAll('[data-machine]').forEach(function(btn) {
    btn.addEventListener('click', function() { setMachine(btn.dataset.machine); });
  });

  document.getElementById('overview-back').addEventListener('click', function() { activatePanel('overview'); });
  document.getElementById('lang-toggle').addEventListener('click', function() { toast('Arayüz dili Türkçe olarak ayarlı.'); });
  document.getElementById('theme-toggle').addEventListener('click', function() {
    document.body.classList.toggle('light-mode');
    toast(document.body.classList.contains('light-mode') ? 'Açık tema etkin' : 'Koyu tema etkin');
  });
  document.getElementById('user-menu').addEventListener('click', function() { toast('Demo kullanıcı: admin'); });
  refresh.addEventListener('click', function() {
    loadedPanels.overview = false;
    loadPanel('overview');
    document.getElementById('last-refresh').textContent = new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    toast('Genel görünüm yenilendi');
  });
  status.addEventListener('click', function() {
    const paused = status.classList.toggle('paused');
    status.textContent = paused ? 'Beklemede' : 'Çalışıyor';
    toast(paused ? 'Demo durumu beklemeye alındı' : 'Demo durumu çalışıyor');
  });

  search.addEventListener('input', function() {
    document.querySelectorAll('.search-hit').forEach(function(el) { el.classList.remove('search-hit'); });
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const cards = Array.from(document.querySelectorAll('.card, .side-item'));
    const hit = cards.find(function(el) { return el.textContent.toLowerCase().includes(q); });
    if (hit) {
      hit.classList.add('search-hit');
      hit.scrollIntoView({behavior:'smooth', block:'center'});
    }
  });

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      search.focus();
    }
  });
}

wireChromeControls();

async function api(path) {
  const r = await fetch(API + path);
  const data = await r.json().catch(function() { return null; });
  if (!r.ok) {
    const msg = data && data.error ? data.error : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

function fmt(n, dec=1) { return n != null ? Number(n).toFixed(dec) : '--'; }
function fmtK(n) { if(n==null) return '--'; return n >= 1000 ? (n/1000).toFixed(1)+'K' : n.toString(); }
function fmtPct(n, dec=1) { return n != null ? (Number(n) * 100).toFixed(dec) + '%' : '--'; }

// ── SVG Health Ring ──
function healthRing(score, status) {
  const colors = {critical:'#f87171', warning:'#fbbf24', good:'#34d399'};
  const c = colors[status] || '#6b7280';
  const r = 16, circ = 2*Math.PI*r, offset = circ - (Math.min(score,100)/100)*circ;
  return `<div class="health-ring"><svg width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="4"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg><div class="score" style="color:${c}">${Math.round(score)}%</div></div>`;
}


