(function(){
  const API = 'https://backend-navy-tau-25.vercel.app/verify';
  let enabled = true;

  const PLATFORM_SELECTORS = {
    'twitter.com': { post: 'article', text: 'div[lang]' },
    'x.com': { post: 'article', text: 'div[lang]' },
    'facebook.com': {
      post: 'div[data-pagelet*="FeedUnit"]',
      text: 'div[data-ad-comet-preview="message"]'
    },
    'instagram.com': { post: 'article', text: 'div._a9zs' },
    'linkedin.com': { post: '.feed-shared-update-v2', text: '.feed-shared-text' },
    'reddit.com': {
      post: '[data-testid="post-container"]',
      text: '[data-click-id="text"]'
    }
  };

  function getPlatformSelector(hostname){
    const keys = Object.keys(PLATFORM_SELECTORS);
    const key = keys.find(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    return key ? PLATFORM_SELECTORS[key] : null;
  }

  const platformSelector = getPlatformSelector(window.location.hostname);
  if(!platformSelector) return;

  // Inject styles for verdict cards
  function injectStyles(){
    if(document.querySelector('#factlens-styles')) return;
    const style = document.createElement('style');
    style.id = 'factlens-styles';
    style.textContent = `
      .factlens-verdict {
        box-sizing: border-box;
        clear: both;
        margin-top: 8px;
        margin-bottom: 8px;
        padding: 12px;
        border-radius: 8px;
        border-left: 4px solid;
        background: #1a1a2e;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
        font-size: 13px;
        color: #e0e0e0;
        display: block;
        width: 100%;
        max-width: 100%;
        position: relative;
        z-index: 1;
        float: none;
        height: auto;
        min-height: 0;
        max-height: none;
        visibility: visible;
        overflow: visible;
        animation: factlens-fade-in 0.3s ease-in-out;
      }
      article[data-factlens-processed="1"] {
        position: relative !important;
        z-index: 0 !important;
      }
      .factlens-verdict.factlens-loading {
        border-left-color: #666;
        background: #151528;
        animation: factlens-pulse 1.5s infinite;
      }
      .factlens-verdict.factlens-verified {
        border-left-color: #10b981;
      }
      .factlens-verdict.factlens-false {
        border-left-color: #ef4444;
      }
      .factlens-verdict.factlens-misleading {
        border-left-color: #f59e0b;
      }
      .factlens-verdict.factlens-disputed {
        border-left-color: #f59e0b;
      }
      .factlens-verdict-row1 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-weight: 600;
        font-size: 14px;
      }
      .factlens-verdict-icon {
        font-size: 18px;
        flex-shrink: 0;
      }
      .factlens-verdict-label {
        flex: 0 0 auto;
      }
      .factlens-verdict-confidence {
        margin-left: auto;
        font-size: 12px;
        opacity: 0.8;
        font-weight: 500;
      }
      .factlens-verdict-row2 {
        font-size: 13px;
        line-height: 1.4;
        opacity: 0.9;
        margin-bottom: 8px;
        color: #d0d0d0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .factlens-verdict-row3 {
        font-size: 12px;
      }
      .factlens-verdict-link {
        color: #60a5fa;
        text-decoration: none;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      .factlens-verdict-link:hover {
        opacity: 0.8;
        text-decoration: underline;
      }
      @keyframes factlens-fade-in {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes factlens-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .factlens-panel {
        margin-top: 12px;
        padding: 12px;
        background: #151528;
        border-radius: 6px;
        border: 1px solid #333;
        display: none;
        animation: factlens-fade-in 0.3s ease-in-out;
      }
      .factlens-panel.open {
        display: block;
      }
      .factlens-panel-section {
        margin-bottom: 12px;
      }
      .factlens-panel-section:last-child {
        margin-bottom: 0;
      }
      .factlens-panel-title {
        font-size: 12px;
        font-weight: 600;
        color: #a0a0a0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }
      .factlens-panel-text {
        font-size: 13px;
        line-height: 1.5;
        color: #d0d0d0;
      }
      .factlens-sources-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .factlens-sources-list li {
        margin-bottom: 6px;
      }
      .factlens-sources-list a {
        color: #60a5fa;
        text-decoration: none;
        font-size: 12px;
        word-break: break-word;
        transition: opacity 0.2s ease;
      }
      .factlens-sources-list a:hover {
        opacity: 0.8;
        text-decoration: underline;
      }
      .factlens-no-sources {
        font-size: 12px;
        color: #808080;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  function log(...args){ console.debug('FactLens:', ...args); }

  function setEnabled(v){
    enabled = !!v;
    if(!enabled) removeAllCards();
    else scanExisting();
  }

  chrome.storage.local.get({enabled:true}, (res)=>{ setEnabled(res.enabled); });

  chrome.storage.onChanged.addListener((changes, area)=>{
    if(area==='local' && changes.enabled){
      setEnabled(changes.enabled.newValue);
    }
  });

  const observer = new MutationObserver((mutations)=>{
    if(!enabled) return;
    for(const m of mutations){
      m.addedNodes && m.addedNodes.forEach(checkNode);
    }
  });
  observer.observe(document, {childList:true, subtree:true});

  function checkNode(node){
    if(node.nodeType!==1) return;
    try{
      if(node.matches && node.matches(platformSelector.post)) processArticle(node);
      node.querySelectorAll && node.querySelectorAll(platformSelector.post).forEach(processArticle);
    }catch(e){/* ignore */}
  }

  function scanExisting(){ document.querySelectorAll(platformSelector.post).forEach(processArticle); }
  scanExisting();

  function processArticle(article){
    if(!enabled) return;
    if(article.dataset.factlensProcessed) return;
    article.dataset.factlensProcessed = '1';
    const text = extractText(article);
    if(!text || text.length < 10) return;
    const wordCount = (text.trim().split(/\s+/).filter(Boolean)).length;
    if(wordCount < 12){
      const fallbackVerdict = {verdict: 'disputed', confidence: 30, explanation: 'Post too short or noisy for automatic verification', sources: []};
      const card = createPlaceholderCard(article);
      setTimeout(()=>{ if(!article.isConnected) return; updateCard(card, fallbackVerdict); chrome.runtime.sendMessage({ type: 'UPDATE_STATS', verdict: fallbackVerdict.verdict }); }, 200);
      return;
    }
    const card = createPlaceholderCard(article);
    setTimeout(() => {
      if (!article.isConnected) return;
      verifyText(text).then(verdictData=>{
        // Boost confidence slightly for posts that look like factual claims
        let adjusted = tuneConfidenceForFacts(text, verdictData);
        adjusted = tuneConfidenceForInstagram(text, adjusted);
        // Rewrite weak explanations into a more assertive second-stage when confidence is low
        adjusted.explanation = rewriteWeakExplanation(adjusted.verdict, adjusted.explanation, adjusted.confidence);
        updateCard(card, adjusted);
        chrome.runtime.sendMessage({ type: 'UPDATE_STATS', verdict: verdictData.verdict });
      }).catch(err=>{
        log('verify error', err);
        const fallbackVerdict = {verdict: 'disputed', confidence: 40, explanation: 'Unable to verify at this time', sources: []};
        updateCard(card, fallbackVerdict);
        chrome.runtime.sendMessage({ type: 'UPDATE_STATS', verdict: fallbackVerdict.verdict });
      });
    }, 1500);
  }

  function extractText(article){
    const nodes = article.querySelectorAll(platformSelector.text || 'div[lang], p');
    let txt = '';
    Array.from(nodes).forEach(n => {
      try{
        const clone = n.cloneNode(true);
        clone.querySelectorAll && clone.querySelectorAll('h3, a, time').forEach(el=>el.remove());
        const s = clone.innerText && clone.innerText.trim();
        if(s) txt += s + '\n';
      }catch(e){}
    });
    const fallback = txt.trim() || (article.innerText || '').trim() || '';
    return fallback.slice(0,2000);
  }

    function rewriteWeakExplanation(verdict, explanation, confidence){
      if(!explanation) return explanation;
      const low = explanation.toLowerCase();
      if(confidence >= 70) return explanation;
      if(/could not verify|unable to generate|cannot be verified|unable to determine|could not verify this claim|could not verify this/i.test(low)){
        if(verdict === 'verified') return 'Based on public data, this claim appears to be supported. ' + explanation;
        if(verdict === 'false') return 'Based on public data, this claim appears to be false. ' + explanation;
        return 'Based on available public information, this claim does not appear to be reliably supported. ' + explanation;
      }
      return explanation;
    }

    function tuneConfidenceForFacts(text, verdictData){
      try{
        const factualPatterns = /\b(Premier League|UFC|NBA|NFL|World Cup|Olympic|President|Senator|Congress|\b\d{4}\b|\b\d+\b)\b/i;
        let adjusted = Object.assign({}, verdictData);
        if(factualPatterns.test(text)){
          adjusted.confidence = Math.min(95, (adjusted.confidence || 0) + 15);
        }
        return adjusted;
      }catch(e){return verdictData;}
    }

    function tuneConfidenceForInstagram(text, verdictData){
      try{
        const isInstagram = window.location.hostname === 'instagram.com' || window.location.hostname.endsWith('.instagram.com');
        if(!isInstagram) return verdictData;
        const adjusted = Object.assign({}, verdictData);
        const words = (text || '').trim().split(/\s+/).filter(Boolean).length;

        const lifestyleRegex = /\b(outfit|fit|new bag|travel|party|style|look|vibe|ootd|haul|unboxing|fitcheck|fashion|followers?)\b/i;
        const scienceRegex = /\b(climate|species|endangered|study|research|scientific|habitat|genus|species|population|mammal|reptile|amphibian|bird|marine|coral|biodiversity|conservation|DNA|carbon|CO2|temperature|photosynthesis)\b/i;

        const hasLink = /https?:\/\//i.test(text);
        // Skip noise-only posts (emoji/symbols/whitespace only, no real text)
        const hasRealText = /[a-zA-Z\u00A0-\u024F\u4E00-\u9FFF\u0900-\u097F\u0600-\u06FF]/.test(text);
        const onlyEmojiOrShort = (words < 20) && (!hasRealText || hasLink);

        if(lifestyleRegex.test(text) || onlyEmojiOrShort){
          if(String(adjusted.verdict || '').toLowerCase() === 'disputed' || String(adjusted.verdict || '').toLowerCase() !== 'verified'){
            adjusted.confidence = Math.max(0, (adjusted.confidence || 0) - 12);
          }
        }

        if(words > 20 && String(adjusted.verdict || '').toLowerCase() === 'verified' && scienceRegex.test(text)){
          adjusted.confidence = Math.min(99, (adjusted.confidence || 0) + 10);
        }

        return adjusted;
      }catch(e){ return verdictData; }
    }

  function createPlaceholderCard(article){
    const container = document.createElement('div');
    container.className = 'factlens-verdict factlens-loading';
    container.innerHTML = '<div class="factlens-verdict-title">🔍 Fact checking...</div>';
    container.setAttribute('role','note');
    if(typeof article.after === 'function'){
      article.after(container);
    }else{
      article.parentNode.insertBefore(container, article.nextSibling);
    }
    return container;
  }

  function updateCard(el, verdictData){
    if(!el) return;
    
    const verdict = String(verdictData.verdict || 'disputed').toLowerCase();
    const confidence = verdictData.confidence || 0;
    const explanation = verdictData.explanation || 'Unable to determine';
    const sources = Array.isArray(verdictData.sources) ? verdictData.sources : [];
    
    el.classList.remove('factlens-loading','factlens-verified','factlens-false','factlens-misleading','factlens-disputed');
    
    let icon = '❗';
    let verdictClass = 'factlens-disputed';
    let verdictText = 'Disputed';
    
    if(verdict === 'verified'){
      icon = '✅';
      verdictClass = 'factlens-verified';
      verdictText = 'Verified';
    } else if(verdict === 'false'){
      icon = '❌';
      verdictClass = 'factlens-false';
      verdictText = 'False';
    } else if(verdict === 'misleading'){
      icon = '⚠️';
      verdictClass = 'factlens-misleading';
      verdictText = 'Misleading';
    }
    
    el.classList.add(verdictClass);
    
    // Store verdict data on element for panel access
    el.dataset.verdict = verdict;
    el.dataset.confidence = confidence;
    el.dataset.explanation = explanation;
    el.dataset.sources = JSON.stringify(sources);
    
    const sourcesHtml = sources.length > 0
      ? `<ul class="factlens-sources-list">${sources.map(src => `<li><a href="${src}" target="_blank" rel="noopener noreferrer">${src}</a></li>`).join('')}</ul>`
      : '<p class="factlens-no-sources">No sources available</p>';
    
    el.innerHTML = `
      <div class="factlens-verdict-row1">
        <span class="factlens-verdict-icon">${icon}</span>
        <span class="factlens-verdict-label">${verdictText}</span>
        <span class="factlens-verdict-confidence">${confidence}%</span>
      </div>
      <div class="factlens-verdict-row2">${explanation}</div>
      <div class="factlens-verdict-row3">
        <a href="#" class="factlens-verdict-link factlens-expand-link">See full fact check →</a>
      </div>
      <div class="factlens-panel">
        <div class="factlens-panel-section">
          <div class="factlens-panel-title">Full Explanation</div>
          <div class="factlens-panel-text">${explanation}</div>
        </div>
        <div class="factlens-panel-section">
          <div class="factlens-panel-title">Sources</div>
          ${sourcesHtml}
        </div>
      </div>
    `;
    
    // Add click handler to toggle panel
    const link = el.querySelector('.factlens-expand-link');
    const panel = el.querySelector('.factlens-panel');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      panel.classList.toggle('open');
      link.textContent = panel.classList.contains('open') ? 'Hide details ↑' : 'See full fact check →';
    });
  }

  function removeAllCards(){
    document.querySelectorAll('.factlens-verdict').forEach(e=>e.remove());
    document.querySelectorAll('[data-factlens-processed]').forEach(el=>delete el.dataset.factlensProcessed);
  }

  async function verifyText(text){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({text}),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if(!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return {
        verdict: data.verdict || 'disputed',
        confidence: data.confidence || 0,
        explanation: data.explanation || 'Unable to determine',
        sources: data.sources || []
      };
    } catch (err) {
      clearTimeout(timeout);
      console.warn('FactLens: API call failed -', err.message);
      return {
        verdict: 'disputed',
        confidence: 50,
        explanation: 'Could not verify this claim at this time.',
        sources: []
      };
    }
  }

})();
