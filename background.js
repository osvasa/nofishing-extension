// ── NøFishing AI — Background Service Worker ──

// Extension installed — try to open popup automatically (Chrome 127+)
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.action && chrome.action.openPopup) {
    chrome.action.openPopup().catch(() => {});
  }
});

// ── Heuristic Engine ──

const POPULAR_DOMAINS = [
  'google.com', 'facebook.com', 'amazon.com', 'apple.com', 'microsoft.com',
  'netflix.com', 'paypal.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'github.com', 'yahoo.com', 'chase.com', 'bankofamerica.com',
  'wellsfargo.com', 'citibank.com', 'dropbox.com', 'spotify.com', 'zoom.us',
  'outlook.com', 'office.com', 'icloud.com', 'whatsapp.com', 'telegram.org',
  'coinbase.com', 'binance.com', 'stripe.com', 'shopify.com', 'ebay.com',
  'walmart.com', 'target.com', 'bestbuy.com', 'usps.com', 'ups.com',
  'fedex.com', 'dhl.com', 'irs.gov', 'ssa.gov',
];

const SUSPICIOUS_TLDS = [
  '.xyz', '.top', '.club', '.work', '.click', '.link', '.info', '.buzz',
  '.gq', '.ml', '.cf', '.tk', '.ga', '.pw', '.cc', '.ws', '.icu',
  '.cam', '.rest', '.monster', '.surf', '.sbs', '.cfd',
];

const PHISHING_KEYWORDS = [
  'login', 'signin', 'sign-in', 'verify', 'verification', 'secure',
  'account', 'update', 'confirm', 'banking', 'password', 'credential',
  'suspend', 'locked', 'unauthorized', 'alert', 'urgent', 'expire',
  'recover', 'restore', 'wallet', 'authenticate',
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'adf.ly', 'bl.ink', 'lnkd.in', 'rb.gy', 'cutt.ly',
  'shorturl.at', 'tiny.cc',
];

const SAFE_DOMAINS = new Set([
  'google.com', 'www.google.com', 'google.co.uk', 'accounts.google.com',
  'facebook.com', 'www.facebook.com', 'amazon.com', 'www.amazon.com',
  'apple.com', 'www.apple.com', 'microsoft.com', 'www.microsoft.com',
  'github.com', 'www.github.com', 'stackoverflow.com',
  'wikipedia.org', 'en.wikipedia.org', 'youtube.com', 'www.youtube.com',
  'reddit.com', 'www.reddit.com', 'twitter.com', 'x.com',
  'linkedin.com', 'www.linkedin.com', 'netflix.com', 'www.netflix.com',
  'spotify.com', 'open.spotify.com', 'discord.com', 'slack.com',
  'zoom.us', 'nytimes.com', 'bbc.com', 'cnn.com',
]);

function extractRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function analyzeUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { level: 'safe', score: 0, reasons: [] };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const fullUrl = parsedUrl.href.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  // Skip internal pages, extensions, new tabs
  if (
    parsedUrl.protocol === 'chrome:' ||
    parsedUrl.protocol === 'chrome-extension:' ||
    parsedUrl.protocol === 'about:' ||
    parsedUrl.protocol === 'edge:' ||
    parsedUrl.protocol === 'brave:' ||
    parsedUrl.protocol === 'file:' ||
    hostname === 'newtab' ||
    hostname === ''
  ) {
    return { level: 'safe', score: 0, reasons: [] };
  }

  // Known safe domains — skip analysis
  if (SAFE_DOMAINS.has(hostname) || SAFE_DOMAINS.has(extractRootDomain(hostname))) {
    return { level: 'safe', score: 0, reasons: [] };
  }

  let score = 0;
  const reasons = [];

  // 1. IP address as hostname
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    score += 40;
    reasons.push('IP address used instead of domain name');
  }

  // 2. Suspicious TLD
  const tld = '.' + hostname.split('.').pop();
  if (SUSPICIOUS_TLDS.includes(tld)) {
    score += 20;
    reasons.push('Suspicious top-level domain: ' + tld);
  }

  // 3. Excessive subdomains (more than 3 parts)
  const domainParts = hostname.split('.');
  if (domainParts.length > 3) {
    score += 15;
    reasons.push('Excessive subdomains (' + domainParts.length + ' levels)');
  }

  // 4. Hyphens in domain (common in phishing)
  const mainDomain = domainParts.slice(0, -1).join('.');
  const hyphenCount = (mainDomain.match(/-/g) || []).length;
  if (hyphenCount >= 2) {
    score += 15;
    reasons.push('Multiple hyphens in domain name');
  }

  // 5. Phishing keywords in hostname or path
  let keywordHits = 0;
  for (const kw of PHISHING_KEYWORDS) {
    if (hostname.includes(kw) || pathname.includes(kw)) {
      keywordHits++;
    }
  }
  if (keywordHits >= 3) {
    score += 30;
    reasons.push('Multiple phishing keywords detected (' + keywordHits + ')');
  } else if (keywordHits >= 1) {
    score += 10 * keywordHits;
    reasons.push('Phishing keyword' + (keywordHits > 1 ? 's' : '') + ' in URL');
  }

  // 6. Typosquatting detection via Levenshtein distance
  const rootDomain = extractRootDomain(hostname);
  for (const legit of POPULAR_DOMAINS) {
    if (rootDomain === legit) continue;
    const dist = levenshtein(rootDomain.replace(/\.[^.]+$/, ''), legit.replace(/\.[^.]+$/, ''));
    if (dist > 0 && dist <= 2) {
      score += 35;
      reasons.push('Domain similar to ' + legit + ' (possible typosquatting)');
      break;
    }
  }

  // 7. Brand name in subdomain but different root domain
  for (const legit of POPULAR_DOMAINS) {
    const brand = legit.replace(/\.[^.]+$/, '');
    if (hostname.includes(brand) && extractRootDomain(hostname) !== legit) {
      score += 30;
      reasons.push('Contains "' + brand + '" but hosted on different domain');
      break;
    }
  }

  // 8. URL shortener
  if (URL_SHORTENERS.some((s) => hostname === s || hostname.endsWith('.' + s))) {
    score += 15;
    reasons.push('URL shortener detected — destination unknown');
  }

  // 9. Punycode / internationalized domain (homograph attack)
  if (hostname.startsWith('xn--')) {
    score += 30;
    reasons.push('Internationalized domain name (possible homograph attack)');
  }

  // 10. Very long URL (common in phishing kits)
  if (fullUrl.length > 200) {
    score += 10;
    reasons.push('Unusually long URL (' + fullUrl.length + ' characters)');
  }

  // 11. @ symbol in URL (credential prefix trick)
  if (fullUrl.includes('@')) {
    score += 25;
    reasons.push('URL contains @ symbol (credential prefix trick)');
  }

  // 12. Data URI or javascript protocol in href
  if (parsedUrl.protocol === 'data:' || parsedUrl.protocol === 'javascript:') {
    score += 50;
    reasons.push('Dangerous protocol: ' + parsedUrl.protocol);
  }

  // 13. HTTP on sensitive-looking page
  if (parsedUrl.protocol === 'http:' && keywordHits > 0) {
    score += 15;
    reasons.push('Unencrypted connection on a login/verification page');
  }

  // 14. Double extension or encoded characters in path
  if (pathname.match(/\.(html|php|asp)\./)) {
    score += 20;
    reasons.push('Suspicious double file extension in URL path');
  }
  if (fullUrl.includes('%00') || fullUrl.includes('%2e%2e')) {
    score += 25;
    reasons.push('Encoded traversal characters in URL');
  }

  // Determine threat level
  let level = 'safe';
  if (score >= 60) {
    level = 'danger';
  } else if (score >= 30) {
    level = 'warning';
  }

  return { level, score, reasons };
}

// ── State Management ──

// Cache analysis results per tab
const tabResults = {};

async function isActivated() {
  const { activated } = await chrome.storage.local.get('activated');
  return activated === true;
}

// ── Navigation Listener ──

chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only analyze main frame
  if (details.frameId !== 0) return;

  const active = await isActivated();
  if (!active) return;

  const result = analyzeUrl(details.url);
  tabResults[details.tabId] = { url: details.url, ...result };

  // Increment sitesVisited counter
  chrome.storage.local.get(['sitesVisited'], (data) => {
    chrome.storage.local.set({ sitesVisited: (data.sitesVisited || 0) + 1 });
  });

  // Update badge
  updateBadge(details.tabId, result.level);

  // If dangerous or warning, notify content script
  if (result.level === 'danger' || result.level === 'warning') {
    try {
      await chrome.tabs.sendMessage(details.tabId, {
        action: 'showOverlay',
        level: result.level,
        score: result.score,
        reasons: result.reasons,
        url: details.url,
      });
    } catch {
      // Content script may not be ready yet — retry once
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(details.tabId, {
            action: 'showOverlay',
            level: result.level,
            score: result.score,
            reasons: result.reasons,
            url: details.url,
          });
        } catch { /* content script not available */ }
      }, 500);
    }
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabResults[tabId];
});

// ── Badge ──

function updateBadge(tabId, level) {
  const config = {
    danger:  { text: '!', color: '#EC220C' },
    warning: { text: '?', color: '#F59E0B' },
    safe:    { text: '',  color: '#22C55E' },
  };
  const c = config[level] || config.safe;
  chrome.action.setBadgeText({ text: c.text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: c.color, tabId });
}

// ── Message Handler ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getStatus') {
    // Popup requests current tab status
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ activated: false, level: 'safe', score: 0, reasons: [], url: '' });
        return;
      }

      const active = await isActivated();
      const tabId = tabs[0].id;
      const cached = tabResults[tabId];

      if (!active) {
        sendResponse({ activated: false, level: 'safe', score: 0, reasons: [], url: tabs[0].url || '' });
        return;
      }

      if (cached) {
        sendResponse({ activated: true, ...cached });
      } else {
        // Analyze on the fly
        const result = analyzeUrl(tabs[0].url || '');
        tabResults[tabId] = { url: tabs[0].url || '', ...result };
        updateBadge(tabId, result.level);
        sendResponse({ activated: true, url: tabs[0].url || '', ...result });
      }
    });
    return true; // async response
  }

  if (msg.action === 'activate') {
    chrome.storage.local.set({ activated: true, activatedAt: Date.now() }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'checkActivation') {
    isActivated().then((active) => {
      sendResponse({ activated: active });
    });
    return true;
  }

  if (msg.action === 'analyzeUrl') {
    const result = analyzeUrl(msg.url);
    sendResponse(result);
    return false;
  }

  if (msg.action === 'relayHttpWarning') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showOverlay',
          level: 'warning',
          score: 35,
          reasons: ['This site is not using a secure connection (HTTP). Your data could be intercepted.'],
          url: msg.url,
        }).catch(() => {});
      }
    });
    return false;
  }
});
