// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
const loadedPanels = {};

window.loadPanel = function(panelId) {
  if (loadedPanels[panelId]) return;
  loadedPanels[panelId] = true;

  if (panelId === 'overview') {
    loadOverview();
    loadDemoCase();
  } else if (panelId === 'problems') {
    loadProblems();
  } else if (panelId === 'whatif') {
    loadCorrectedOEE();
  } else if (panelId === 'oee-trend') {
    loadTrend();
  } else if (panelId === 'anomaly') {
    loadHealth();
    loadMitsubishi();
  } else if (panelId === 'data-quality') {
    loadDataQuality();
  }
};

loadPanel('overview');


