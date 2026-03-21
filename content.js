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

    const isDanger = data.level === 'danger';
    const iconUrl = chrome.runtime.getURL('icons/fish-no-symbol-red.png');

    overlayEl = document.createElement('div');
    overlayEl.id = 'nofishing-overlay';
    overlayEl.className = isDanger ? 'nf-danger' : 'nf-warning';

    const reasonsList = (data.reasons || [])
      .map((r) => '<li>' + escapeHtml(r) + '</li>')
      .join('');

    overlayEl.innerHTML = `
      <div class="nf-overlay-inner">
        <div class="nf-icon-ring">
          <img src="${iconUrl}" alt="NøFishing AI" class="nf-shield-icon" />
        </div>

        <h1 class="nf-title">${isDanger ? 'PHISHING DETECTED' : 'SUSPICIOUS SITE'}</h1>
        <p class="nf-subtitle">${isDanger
          ? 'WARNING. This site is actively trying to steal your passwords, financial information, and personal data. Do not type anything. Leave immediately.'
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

        <div class="nf-actions">
          ${isDanger
            ? '<button class="nf-btn nf-btn-close">CLOSE THIS SITE</button>'
            : `<button class="nf-btn nf-btn-close">LEAVE THIS SITE</button>
               <button class="nf-btn nf-btn-proceed">I understand the risk — proceed</button>`
          }
        </div>

        <div class="nf-branding">Protected by NøFishing AI</div>
      </div>
    `;

    document.documentElement.appendChild(overlayEl);

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
