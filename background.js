// ── NøFishing AI — Background Service Worker ──

// Extension installed — try to open popup automatically (Chrome 127+)
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.action && chrome.action.openPopup) {
    chrome.action.openPopup().catch(() => {});
  }

  // Generate unique device ID on first install
  chrome.storage.local.get(['deviceId', 'totalTrackersBlocked'], (data) => {
    if (!data.deviceId) {
      chrome.storage.local.set({ deviceId: crypto.randomUUID() });
    }
    if (data.totalTrackersBlocked === undefined) {
      chrome.storage.local.set({ totalTrackersBlocked: 0 });
    }
  });
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
  'ups.com', 'www.ups.com', 'fedex.com', 'www.fedex.com',
  'dhl.com', 'www.dhl.com', 'usps.com', 'www.usps.com',
  'ebay.com', 'www.ebay.com',
  'zoom.com', 'www.zoom.com',
  'office.com', 'www.office.com', 'live.com', 'www.live.com',
  'hotmail.com', 'www.hotmail.com', 'outlook.com', 'www.outlook.com',
]);

function extractRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const ccSLDs = [
    'co.uk', 'com.au', 'co.nz', 'co.za', 'com.br', 'co.jp',
    'co.in', 'com.mx', 'co.kr', 'com.sg', 'com.hk', 'org.uk', 'net.au',
  ];
  const lastTwo = parts.slice(-2).join('.');
  if (parts.length >= 3 && ccSLDs.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
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
    reasons.push('This site uses a raw IP address instead of a real domain name — a classic scam trick');
  }

  // 2. Suspicious TLD
  const tld = '.' + hostname.split('.').pop();
  if (SUSPICIOUS_TLDS.includes(tld)) {
    score += 20;
    reasons.push('This site uses a cheap, untrustworthy web address (' + tld + ') commonly used by scammers');
  }

  // 3. Excessive subdomains (more than 3 parts)
  const domainParts = hostname.split('.');
  if (domainParts.length > 3) {
    score += 15;
    reasons.push('This site has an unusually complex web address designed to look legitimate');
  }

  // 4. Hyphens in domain (common in phishing)
  const mainDomain = domainParts.slice(0, -1).join('.');
  const hyphenCount = (mainDomain.match(/-/g) || []).length;
  if (hyphenCount >= 2) {
    score += 15;
    reasons.push('Scammers use multiple hyphens in web addresses to impersonate real brands');
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
    reasons.push('This web address is loaded with phishing trigger words — a major red flag');
  } else if (keywordHits >= 1) {
    score += 10 * keywordHits;
    reasons.push(keywordHits > 1 ? 'This web address contains multiple words commonly used to steal passwords' : 'This web address contains a word commonly used in phishing scams');
  }

  // 6. Typosquatting detection via Levenshtein distance
  const rootDomain = extractRootDomain(hostname);
  for (const legit of POPULAR_DOMAINS) {
    if (rootDomain === legit) continue;
    const dist = levenshtein(rootDomain.replace(/\.[^.]+$/, ''), legit.replace(/\.[^.]+$/, ''));
    if (dist > 0 && dist <= 2) {
      score += 35;
      reasons.push('This site has a web address almost identical to ' + legit + ' — designed to trick you');
      break;
    }
  }

  // 7. Brand name in subdomain but different root domain
  for (const legit of POPULAR_DOMAINS) {
    const brand = legit.replace(/\.[^.]+$/, '');
    if (hostname.includes(brand) && extractRootDomain(hostname) !== legit) {
      score += 30;
      reasons.push('This site is pretending to be ' + brand + ' but it\'s a fake');
      break;
    }
  }

  // 8. URL shortener
  if (URL_SHORTENERS.some((s) => hostname === s || hostname.endsWith('.' + s))) {
    score += 15;
    reasons.push('This link has been hidden behind a URL shortener — scammers do this to disguise dangerous destinations');
  }

  // 9. Punycode / internationalized domain (homograph attack)
  if (hostname.startsWith('xn--')) {
    score += 30;
    reasons.push('This site uses special characters to disguise its web address and impersonate a trusted brand');
  }

  // 10. Very long URL (common in phishing kits)
  if (fullUrl.length > 200) {
    score += 10;
    reasons.push('This web address is unusually long — scammers do this to hide what site you\'re really visiting');
  }

  // 11. @ symbol in URL (credential prefix trick)
  if (fullUrl.includes('@')) {
    score += 25;
    reasons.push('This web address contains an @ symbol — a trick used to disguise the real destination');
  }

  // 12. Data URI or javascript protocol in href
  if (parsedUrl.protocol === 'data:' || parsedUrl.protocol === 'javascript:') {
    score += 50;
    reasons.push('This link uses a dangerous protocol that can run malicious code on your device');
  }

  // 13. HTTP on sensitive-looking page
  if (parsedUrl.protocol === 'http:' && keywordHits > 0) {
    score += 15;
    reasons.push('This site is asking for sensitive information without encryption — your data would be exposed');
  }

  // 14. Double extension or encoded characters in path
  if (pathname.match(/\.(html|php|asp)\./)) {
    score += 20;
    reasons.push('This site uses a fake file extension in its address to disguise malicious content');
  }
  if (fullUrl.includes('%00') || fullUrl.includes('%2e%2e')) {
    score += 25;
    reasons.push('This site uses a fake file extension in its address to disguise malicious content');
  }

  // ── Smishing URL Pattern Detection ──

  // 15. Fake delivery scams
  const deliveryBrands = ['tracking', 'delivery', 'shipment', 'package', 'parcel', 'usps', 'fedex', 'ups', 'dhl'];
  const deliveryActions = ['update', 'confirm', 'verify', 'hold', 'failed', 'reschedule', 'fee', 'pay'];
  if (deliveryBrands.some((w) => fullUrl.includes(w)) && deliveryActions.some((w) => fullUrl.includes(w))) {
    score += 25;
    reasons.push('This site is impersonating a delivery company to steal your payment information');
  }

  // 16. Fake toll/fine scams
  const tollKeywords = ['toll', 'ezpass', 'sunpass', 'fastrak', 'violation', 'fine', 'citation'];
  const tollActions = ['pay', 'due', 'unpaid', 'overdue', 'balance'];
  if (tollKeywords.some((w) => fullUrl.includes(w)) && tollActions.some((w) => fullUrl.includes(w))) {
    score += 30;
    reasons.push('This site is impersonating a toll or government service to steal your money');
  }

  // 17. Fake bank/financial SMS scams
  const bankAlerts = ['alert', 'notification', 'security', 'unusual', 'suspicious'];
  const bankTargets = ['account', 'banking', 'card', 'transaction', 'transfer'];
  if (bankAlerts.some((w) => fullUrl.includes(w)) && bankTargets.some((w) => fullUrl.includes(w))) {
    score += 25;
    reasons.push('This site is pretending to be your bank to steal your login credentials');
  }

  // 18. Fake subscription renewal scams
  const subBrands = ['netflix', 'amazon', 'apple', 'spotify', 'hulu', 'disney'];
  const subActions = ['renew', 'renewal', 'billing', 'update', 'expire', 'suspended', 'verify'];
  const subBrandDomains = { netflix: 'netflix.com', amazon: 'amazon.com', apple: 'apple.com', spotify: 'spotify.com', hulu: 'hulu.com', disney: 'disney.com' };
  const matchedSubBrand = subBrands.find((w) => fullUrl.includes(w));
  if (matchedSubBrand && subActions.some((w) => fullUrl.includes(w))) {
    if (rootDomain !== subBrandDomains[matchedSubBrand]) {
      score += 20;
      reasons.push('This site is impersonating ' + matchedSubBrand + ' to steal your payment details');
    }
  }

  // 19. Fake prize/winner scams
  const prizeKeywords = ['winner', 'won', 'prize', 'reward', 'gift', 'congratulation', 'selected', 'chosen'];
  const prizeActions = ['claim', 'collect', 'redeem', 'free'];
  if (prizeKeywords.some((w) => fullUrl.includes(w)) && prizeActions.some((w) => fullUrl.includes(w))) {
    score += 35;
    reasons.push('This is a fake prize scam designed to steal your personal information');
  }

  // ── Crypto & Investment Scam Detection ──

  const cryptoTokens = ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'usdt', 'wallet', 'coin', 'token', 'defi'];

  // 20. Fake crypto trading platform
  const tradingKeywords = ['trade', 'trading', 'invest', 'investment', 'profit', 'returns', 'yield', 'earn'];
  if (tradingKeywords.some((w) => fullUrl.includes(w)) && cryptoTokens.some((w) => fullUrl.includes(w))) {
    if (!SAFE_DOMAINS.has(hostname) && !SAFE_DOMAINS.has(rootDomain)) {
      score += 35;
      reasons.push('This site is a fake cryptocurrency platform designed to steal your money');
    }
  }

  // 21. Fake crypto giveaway
  const giveawayKeywords = ['giveaway', 'airdrop', 'free', 'bonus', 'double'];
  const giveawayCrypto = ['bitcoin', 'btc', 'eth', 'crypto', 'coin', 'token'];
  if (giveawayKeywords.some((w) => fullUrl.includes(w)) && giveawayCrypto.some((w) => fullUrl.includes(w))) {
    score += 40;
    reasons.push('This is a fake crypto giveaway — a common scam to steal your wallet or money');
  }

  // 22. Guaranteed returns scam
  const guaranteedKeywords = ['guaranteed', 'guarantee', 'risk-free', 'riskfree', '100%', 'daily-profit', 'daily-returns', 'passive-income', 'get-rich'];
  if (guaranteedKeywords.some((w) => fullUrl.includes(w))) {
    score += 40;
    reasons.push('This site promises guaranteed investment returns — a guaranteed scam');
  }

  // 23. Pig butchering / romance investment scam
  const pigButcherKeywords = ['investment-club', 'trading-group', 'vip-trading', 'private-trading', 'exclusive-trade', 'members-only', 'insider-trade'];
  if (pigButcherKeywords.some((w) => fullUrl.includes(w))) {
    score += 30;
    reasons.push('This site shows signs of a romance investment scam — one of the most financially devastating scams');
  }

  // 24. Fake exchange/wallet
  const exchangeActions = ['withdraw', 'withdrawal', 'deposit', 'stake', 'staking', 'mining', 'miner', 'pool'];
  const exchangeCrypto = ['crypto', 'bitcoin', 'btc', 'eth', 'wallet', 'coin'];
  const legitExchanges = ['coinbase.com', 'binance.com', 'kraken.com', 'crypto.com', 'gemini.com', 'blockchain.com'];
  if (exchangeActions.some((w) => fullUrl.includes(w)) && exchangeCrypto.some((w) => fullUrl.includes(w))) {
    if (!legitExchanges.includes(rootDomain)) {
      score += 35;
      reasons.push('This site is impersonating a crypto exchange to steal your funds');
    }
  }

  // ── Calendar Scam Detection ──

  // 25. Google Calendar phishing relay
  const calendarInviteWords = ['invite', 'event', 'meeting', 'schedule'];
  const calendarRedirectWords = ['click', 'link', 'redirect', 'go', 'url', 'visit'];
  if (fullUrl.includes('calendar') && calendarInviteWords.some((w) => fullUrl.includes(w)) && calendarRedirectWords.some((w) => fullUrl.includes(w))) {
    score += 35;
    reasons.push('This link came through Google Calendar — a new trick scammers use to bypass email filters');
  }

  // 26. Google Forms/Drawings used as phishing relay
  const formsHosts = ['docs.google.com', 'forms.gle', 'forms.google.com'];
  const formsPathWords = ['forms', 'drawings'];
  const formsScamWords = ['prize', 'winner', 'verify', 'confirm', 'account', 'suspend', 'bitcoin', 'crypto', 'payment', 'invoice', 'overdue'];
  if (formsHosts.includes(hostname) && formsPathWords.some((w) => pathname.includes(w)) && formsScamWords.some((w) => fullUrl.includes(w))) {
    score += 30;
    reasons.push('This link is routing through Google Forms to disguise a phishing destination');
  }

  // 27. ICS/calendar file download from suspicious domain
  const legitCalendarDomains = ['google.com', 'apple.com', 'microsoft.com', 'outlook.com', 'yahoo.com', 'zoom.us', 'calendly.com'];
  if (pathname.endsWith('.ics') && !legitCalendarDomains.includes(rootDomain)) {
    score += 35;
    reasons.push('This calendar file is from an untrusted source and may add malicious events to your calendar');
  }

  // 28. Fake meeting/webinar link
  const meetingBrands = ['zoom', 'teams', 'webex', 'meet', 'gotomeeting', 'webinar'];
  const meetingScamWords = ['free', 'prize', 'winner', 'claim', 'verify', 'account', 'suspended', 'bitcoin', 'crypto', 'urgent', 'immediate'];
  const legitMeetingDomains = ['zoom.us', 'microsoft.com', 'webex.com', 'google.com', 'gotomeeting.com'];
  if (meetingBrands.some((w) => fullUrl.includes(w)) && meetingScamWords.some((w) => fullUrl.includes(w))) {
    if (!legitMeetingDomains.includes(rootDomain)) {
      score += 25;
      reasons.push('This site is impersonating a video meeting platform to steal your credentials');
    }
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

// ── Error Navigation Listener (catches failed/down phishing domains) ──

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const active = await isActivated();
  if (!active) return;

  const result = analyzeUrl(details.url);
  tabResults[details.tabId] = { url: details.url, ...result };

  updateBadge(details.tabId, result.level);

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

// ── External message listener (from nofishing.ai website) ──

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACTIVATE_SESSION') {
    chrome.storage.local.set({
      activated: true,
      externalActivation: true,
    });
    sendResponse({ success: true });
  }
});

// ── Session bridge listener (from session-bridge.js on nofishing.ai) ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUPABASE_SESSION' && message.session) {
    chrome.storage.local.set({
      supabaseSession: message.session,
      sessionEmail: message.session.user?.email,
    });
  }

  if (message.type === 'CLOSE_TAB' && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});

// ── Content Blocking (Ad/Tracker Blocking) ──

// Initialize default state
chrome.storage.local.get(['contentBlockingEnabled'], (data) => {
  if (data.contentBlockingEnabled === undefined) {
    chrome.storage.local.set({ contentBlockingEnabled: true });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'toggleContentBlocking') {
    const enabled = msg.enabled;
    chrome.storage.local.set({ contentBlockingEnabled: enabled });

    if (enabled) {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['blocklist'],
      }).then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    } else {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['blocklist'],
      }).then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    }
    return true;
  }

  if (msg.action === 'getBlockedCount') {
    chrome.storage.local.get(['totalTrackersBlocked'], (data) => {
      sendResponse({ count: data.totalTrackersBlocked || 0 });
    });
    return true;
  }
});

// ── Ads Blocked Counter (webRequest observer) ──

const BLOCKED_DOMAINS = [
  'googleadservices.com', 'googlesyndication.com', 'doubleclick.net',
  'googletagmanager.com', 'google-analytics.com', 'googletagservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  'facebook.net', 'connect.facebook.net', 'pixel.facebook.com',
  'amazon-adsystem.com', 'aax.amazon.com',
  'outbrain.com', 'taboola.com', 'scorecardresearch.com', 'quantserve.com',
  'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com', 'cdn.segment.com',
  'amplitude.com', 'heapanalytics.com', 'fullstory.com', 'crazyegg.com',
  'mouseflow.com', 'clarity.ms', 'criteo.com', 'criteo.net',
  'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'indexexchange.com', 'bidswitch.net',
  'sharethrough.com', 'smartadserver.com', 'mediavine.com',
  'moatads.com', 'doubleverify.com', 'adsafeprotected.com',
  'adform.net', 'advertising.com', 'contextweb.com', 'mathtag.com',
  'serving-sys.com', 'demdex.net', 'omtrdc.net', 'everesttech.net',
  'bluekai.com', 'krxd.net', 'exelator.com', 'rlcdn.com',
  'eyeota.net', 'tapad.com', 'agkn.com', 'bounceexchange.com',
  'turn.com', 'adroll.com', 'steelhousemedia.com',
  'matomo.cloud', 'newrelic.com', 'nr-data.net',
  'intercom.io', 'intercomcdn.com', 'drift.com',
  'hs-analytics.net', 'hs-banner.com', 'optimizely.com',
  'kissmetrics.com', 'chartbeat.com', 'parsely.com',
  'treasuredata.com', 'branch.io', 'appsflyer.com', 'adjust.com',
  'mxpnl.com', 'onesignal.com', 'pushwoosh.com',
  'adcolony.com', 'inmobi.com', 'mopub.com',
  'conviva.com', 'liadm.com', 'pippio.com',
  'yieldmo.com', 'smaato.net', 'revjet.com',
  'lijit.com', 'sovrn.com',
];

let contentBlockingCache = true;

// Keep cached state in sync
chrome.storage.local.get(['contentBlockingEnabled'], (data) => {
  contentBlockingCache = data.contentBlockingEnabled !== false;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.contentBlockingEnabled) {
    contentBlockingCache = changes.contentBlockingEnabled.newValue !== false;
  }
});

function matchesBlockedDomain(hostname) {
  for (const domain of BLOCKED_DOMAINS) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!contentBlockingCache) return;

      try {
        const url = new URL(details.url);
        if (matchesBlockedDomain(url.hostname)) {
          chrome.storage.local.get(['totalTrackersBlocked'], (data) => {
            chrome.storage.local.set({ totalTrackersBlocked: (data.totalTrackersBlocked || 0) + 1 });
          });
        }
      } catch { /* invalid URL, ignore */ }
    },
    { urls: ['<all_urls>'], types: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'stylesheet', 'font', 'media', 'websocket', 'other'] }
  );
}

// ── Device Registration ──

function getDeviceName() {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  if (ua.includes('Mac OS X')) os = 'Mac';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('CrOS')) os = 'ChromeOS';

  let browser = 'Unknown Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Chrome/')) browser = 'Chrome';

  return os + ' — ' + browser;
}

function registerDevice() {
  chrome.storage.local.get(['deviceId', 'user', 'activated', 'deviceRegistered'], (data) => {
    if (!data.activated || !data.user || !data.user.email || !data.deviceId) return;

    const email = data.user.email;
    const deviceId = data.deviceId;
    const deviceName = getDeviceName();

    fetch('https://nofishing.ai/api/register-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        device_id: deviceId,
        device_type: 'desktop',
        device_name: deviceName,
      }),
    })
    .then((res) => res.json())
    .then((result) => {
      if (result.success) {
        chrome.storage.local.set({ deviceRegistered: true });
      } else if (result.error === 'device_limit_reached') {
        chrome.storage.local.set({ deviceLimitReached: true, registeredDevices: result.devices });
      }
    })
    .catch(() => { /* network error — will retry on next navigation */ });
  });
}

// Register device on activation and periodically update last_seen
chrome.storage.onChanged.addListener((changes) => {
  if (changes.activated && changes.activated.newValue === true) {
    registerDevice();
  }
});

// Also attempt registration on service worker startup (covers restarts)
chrome.storage.local.get(['activated'], (data) => {
  if (data.activated) {
    registerDevice();
  }
});

// Message handler for device management from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'removeDevice') {
    chrome.storage.local.get(['user'], (data) => {
      if (!data.user || !data.user.email || !msg.deviceId) {
        sendResponse({ ok: false });
        return;
      }

      fetch('https://nofishing.ai/api/remove-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.user.email,
          device_id: msg.deviceId,
        }),
      })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          chrome.storage.local.remove(['deviceLimitReached', 'registeredDevices']);
          registerDevice(); // Re-register this device now that a slot is free
        }
        sendResponse({ ok: result.success });
      })
      .catch(() => sendResponse({ ok: false }));
    });
    return true;
  }

  if (msg.action === 'getDeviceInfo') {
    chrome.storage.local.get(['deviceId', 'deviceRegistered', 'deviceLimitReached', 'registeredDevices'], (data) => {
      sendResponse({
        deviceId: data.deviceId || null,
        deviceRegistered: data.deviceRegistered || false,
        deviceLimitReached: data.deviceLimitReached || false,
        registeredDevices: data.registeredDevices || [],
        deviceName: getDeviceName(),
      });
    });
    return true;
  }
});
