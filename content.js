// ── NøFishing AI — Content Script ──

(function () {
  let overlayEl = null;

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function createOverlay(data) {
    removeOverlay();

    chrome.storage.local.get(['firstName'], function(stored) {
      buildOverlay(data, stored.firstName || null);
    });
  }

  function buildOverlay(data, firstName) {
    const isDanger = data.level === 'danger';
    const iconUrl = chrome.runtime.getURL('icons/fish-no-symbol-red.png');
    const logoUrl = chrome.runtime.getURL('icons/logo.png');
    const dangerMsg = firstName
      ? escapeHtml(firstName) + ', this site is actively trying to steal your passwords, financial information, and personal data. Do not type anything. Leave now.'
      : 'This site is actively trying to steal your passwords, financial information, and personal data. Do not type anything. Leave now.';

    overlayEl = document.createElement('div');
    overlayEl.id = 'nofishing-overlay';
    overlayEl.className = isDanger ? 'nf-danger' : 'nf-warning';

    const reasonsList = (data.reasons || [])
      .map((r) => '<li>' + escapeHtml(r) + '</li>')
      .join('');

    overlayEl.innerHTML = `
      <div class="nf-overlay-inner">
        <div class="nf-card-header">
          <img src="${logoUrl}" alt="NøFishing AI" class="nf-logo" />
          <div class="nf-divider"></div>
        </div>

        <div class="nf-card-body">
          <div class="nf-icon-ring">
            <img src="${iconUrl}" alt="Warning" class="nf-shield-icon" />
          </div>

          <h1 class="nf-title">${isDanger ? 'PHISHING DETECTED' : 'SUSPICIOUS SITE'}</h1>
          <p class="nf-subtitle">${isDanger
            ? dangerMsg
            : 'This site shows signs of being potentially unsafe. Proceed with caution.'
          }</p>

          <div class="nf-url-box">
            <span class="nf-url-label">Flagged URL</span>
            <span class="nf-url-value">${escapeHtml(truncateUrl(data.url || window.location.href, 80))}</span>
          </div>

          <div class="nf-score-bar">
            <span class="nf-score-label">Threat Score</span>
            <div class="nf-score-track">
              <div class="nf-score-fill" style="width: ${Math.min(data.score, 100)}%"></div>
            </div>
            <span class="nf-score-value">${data.score}/100</span>
          </div>

          ${reasonsList ? `
            <div class="nf-reasons">
              <span class="nf-reasons-label">Why this was flagged</span>
              <ul class="nf-reasons-list">${reasonsList}</ul>
            </div>
          ` : ''}

          <div class="nf-branding">Protected by NøFishing AI</div>
        </div>

        <div class="nf-card-footer">
          <div class="nf-divider" style="margin-bottom:16px"></div>
          <div class="nf-actions">
            ${isDanger
              ? '<button class="nf-btn nf-btn-close">CLOSE THIS SITE</button>'
              : `<button class="nf-btn nf-btn-close">LEAVE THIS SITE</button>
                 <button class="nf-btn nf-btn-proceed">I understand the risk — proceed</button>`
            }
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlayEl);

    // Track threats blocked
    chrome.storage.local.get('threatsBlocked', (data) => {
      chrome.storage.local.set({threatsBlocked: (data.threatsBlocked||0)+1});
    });

    // Wire up buttons
    const closeBtn = overlayEl.querySelector('.nf-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Navigate to a safe page
        window.location.href = 'about:blank';
      });
    }

    const proceedBtn = overlayEl.querySelector('.nf-btn-proceed');
    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        removeOverlay();
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncateUrl(url, max) {
    if (url.length <= max) return url;
    return url.substring(0, max) + '…';
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'showOverlay') {
      createOverlay(msg);
    }
  });
})();

// Layer 1: Immediate browser security signal detection
(function() {
  if (window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1') {

    // Check if background already flagged this page; if not, request HTTP warning relay
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response && response.activated && response.level === 'safe') {
          // Background scored safe but page is HTTP — ask background to relay warning overlay
          chrome.runtime.sendMessage({
            action: 'relayHttpWarning',
            url: window.location.href
          });
        }
      });
    }, 1000);
  }
})();
