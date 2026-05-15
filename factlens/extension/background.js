// Background service worker (Manifest V3)
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({enabled: true});
  chrome.storage.session.set({factlensStats: {verified:0, misleading:0, disputed:0}});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg.type === 'UPDATE_STATS'){
    const verdict = String(msg.verdict || 'disputed').toLowerCase();
    chrome.storage.session.get({factlensStats: {verified:0, misleading:0, disputed:0}}, (res) => {
      const stats = res.factlensStats || {verified:0, misleading:0, disputed:0};
      if(verdict === 'verified') stats.verified++;
      else if(verdict === 'misleading' || verdict === 'false') stats.misleading++;
      else stats.disputed++;
      chrome.storage.session.set({factlensStats: stats});
    });
  }

  if(msg.type === 'getState'){
    chrome.storage.local.get({enabled:true}, (res)=> sendResponse({enabled: res.enabled}));
    return true;
  }

  if(msg.type === 'setEnabled'){
    const enabled = !!msg.enabled;
    chrome.storage.local.set({enabled});
  }

  if(msg.type === 'resetStats'){
    chrome.storage.session.set({factlensStats: {verified:0, misleading:0, disputed:0}});
  }

});
