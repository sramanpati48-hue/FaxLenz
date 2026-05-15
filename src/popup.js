document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');
  const statusText = document.getElementById('statusText');
  const verifiedEl = document.getElementById('verified');
  const misleadingEl = document.getElementById('misleading');
  const disputedEl = document.getElementById('disputed');
  const resetBtn = document.getElementById('reset');

  function updateStatsDisplay(){
    chrome.storage.session.get({factlensStats: {verified:0, misleading:0, disputed:0}}, (res) => {
      const stats = res.factlensStats || {verified:0, misleading:0, disputed:0};
      verifiedEl.textContent = stats.verified || 0;
      misleadingEl.textContent = stats.misleading || 0;
      disputedEl.textContent = stats.disputed || 0;
    });
  }

  function refreshState(){
    chrome.storage.local.get({enabled:true}, (res) => {
      toggle.checked = !!res.enabled;
      statusText.textContent = res.enabled ? 'ON' : 'OFF';
    });
    updateStatsDisplay();
  }

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({enabled});
    statusText.textContent = enabled ? 'ON' : 'OFF';
  });

  resetBtn.addEventListener('click', () => {
    chrome.storage.session.set({factlensStats: {verified:0, misleading:0, disputed:0}});
    updateStatsDisplay();
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area === 'session' && changes.factlensStats){
      updateStatsDisplay();
    }
    if(area === 'local' && changes.enabled){
      toggle.checked = !!changes.enabled.newValue;
      statusText.textContent = changes.enabled.newValue ? 'ON' : 'OFF';
    }
  });

  refreshState();
});
