// ── NøFishing AI — Popup Script ──

document.addEventListener('DOMContentLoaded', () => {

  // ── View switching ──

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ── Plan selection buttons ──

  document.getElementById('btn-plan-monthly').addEventListener('click', () => {
    chrome.storage.local.set({ selectedPlan: 'monthly' }, () => {
      showView('view-welcome');
    });
  });

  document.getElementById('btn-plan-yearly').addEventListener('click', () => {
    chrome.storage.local.set({ selectedPlan: 'yearly' }, () => {
      showView('view-welcome');
    });
  });

  // ── Navigation buttons ──

  // Welcome → Login
  document.getElementById('btn-go-login').addEventListener('click', () => showView('view-login'));

  // Login → Welcome/Signup
  document.getElementById('btn-go-signup').addEventListener('click', () => showView('view-welcome'));

  // ── Helpers ──

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function showFieldError(inputId, errId, message) {
    document.getElementById(inputId).classList.add('input-error');
    const err = document.getElementById(errId);
    err.textContent = message;
    err.classList.add('show');
  }

  function clearFieldError(inputId, errId) {
    document.getElementById(inputId).classList.remove('input-error');
    document.getElementById(errId).classList.remove('show');
  }

  // Clear errors on typing — signup fields
  ['s-first', 's-last', 's-email', 's-password'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      clearFieldError(id, 'err-' + id);
    });
  });

  // Clear terms error when checkbox changes
  document.getElementById('s-terms').addEventListener('change', () => {
    document.getElementById('err-s-terms').classList.remove('show');
  });

  // Clear errors on typing — login fields
  ['l-email', 'l-password'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      clearFieldError(id, 'err-' + id);
      document.getElementById('login-error-banner').classList.remove('show');
    });
  });

  // ── Payment URL helper ──

  let paymentEmail = '';

  function openPaymentTab() {
    chrome.storage.local.get(['selectedPlan'], (data) => {
      const plan = data.selectedPlan || 'monthly';
      const url = 'https://nofishing.ai/payment?email=' + encodeURIComponent(paymentEmail) + '&plan=' + plan;
      chrome.tabs.create({ url: url });
    });
  }

  // "Open Payment Page" button on waiting screen
  document.getElementById('btn-open-payment').addEventListener('click', () => {
    openPaymentTab();
  });

  // ── Signup form (Step 2 → Step 3) ──

  document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();

    // Clear all errors
    ['s-first', 's-last', 's-email', 's-password'].forEach((id) => {
      clearFieldError(id, 'err-' + id);
    });
    document.getElementById('err-s-terms').classList.remove('show');

    const first = document.getElementById('s-first').value.trim();
    const last = document.getElementById('s-last').value.trim();
    const email = document.getElementById('s-email').value.trim();
    const password = document.getElementById('s-password').value;
    const terms = document.getElementById('s-terms').checked;

    let valid = true;

    if (!first) { showFieldError('s-first', 'err-s-first', 'First name is required'); valid = false; }
    if (!last) { showFieldError('s-last', 'err-s-last', 'Last name is required'); valid = false; }
    if (!email) {
      showFieldError('s-email', 'err-s-email', 'Email is required'); valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError('s-email', 'err-s-email', 'Enter a valid email'); valid = false;
    }
    if (!password) {
      showFieldError('s-password', 'err-s-password', 'Password is required'); valid = false;
    } else if (password.length < 6) {
      showFieldError('s-password', 'err-s-password', 'Must be at least 6 characters'); valid = false;
    }
    if (!terms) {
      document.getElementById('err-s-terms').classList.add('show');
      valid = false;
    }

    if (!valid) return;

    // Disable button
    const btn = document.getElementById('btn-signup-submit');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    // Save user to storage — activated: false (payment not done yet)
    chrome.storage.local.set({
      user: { firstName: first, lastName: last, email: email },
      firstName: first,
      activated: false,
    }, () => {
      // Store email for payment URL
      paymentEmail = email;

      // Open payment tab
      openPaymentTab();

      // Show waiting view
      showView('view-waiting');

      // Reset button
      btn.disabled = false;
      btn.textContent = 'Sign up';
    });
  });

  // ── Login form (Step 6) ──

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();

    ['l-email', 'l-password'].forEach((id) => clearFieldError(id, 'err-' + id));
    document.getElementById('login-error-banner').classList.remove('show');

    const email = document.getElementById('l-email').value.trim();
    const password = document.getElementById('l-password').value;

    let valid = true;

    if (!email) {
      showFieldError('l-email', 'err-l-email', 'Email is required'); valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError('l-email', 'err-l-email', 'Enter a valid email'); valid = false;
    }
    if (!password) {
      showFieldError('l-password', 'err-l-password', 'Password is required'); valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('btn-login-submit');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    // Check if user exists in storage
    chrome.storage.local.get(['user', 'activated'], (data) => {
      if (!data.user || data.user.email !== email) {
        // No account found
        btn.disabled = false;
        btn.textContent = 'Log in';
        const banner = document.getElementById('login-error-banner');
        banner.textContent = 'No account found with this email. Please sign up first.';
        banner.classList.add('show');
        return;
      }

      if (data.activated === true) {
        // Already activated — go straight to protection status
        loadActiveView();
      } else {
        // Account exists but not paid — show waiting screen
        paymentEmail = email;
        showView('view-waiting');
      }

      btn.disabled = false;
      btn.textContent = 'Log in';
    });
  });

  // ── Active view (Step 5) ──

  function loadActiveView() {
    showView('view-active');

    chrome.runtime.sendMessage({ action: 'getStatus' }, (res) => {
      if (chrome.runtime.lastError || !res) return;

      const label = document.getElementById('active-label');
      const desc = document.getElementById('active-desc');
      const urlBox = document.getElementById('active-url');
      const scoreBar = document.getElementById('active-score');
      const scoreFill = document.getElementById('active-score-fill');
      const scoreVal = document.getElementById('active-score-val');
      const reasonsBox = document.getElementById('active-reasons');
      const reasonsList = document.getElementById('active-reasons-list');

      // URL
      if (res.url) {
        try {
          const u = new URL(res.url);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            urlBox.textContent = u.hostname + u.pathname;
            urlBox.classList.remove('hidden');
          }
        } catch { /* ignore */ }
      }

      // Status
      if (res.level === 'danger') {
        label.className = 'status-label danger';
        label.textContent = 'Threat Detected';
        desc.textContent = 'This site has been identified as dangerous. Leave immediately.';
      } else if (res.level === 'warning') {
        label.className = 'status-label warning';
        label.textContent = 'Suspicious Site';
        desc.textContent = 'This site shows potential signs of being unsafe.';
      } else {
        label.className = 'status-label safe';
        label.textContent = 'Site is Safe';
        desc.textContent = 'No threats detected on this page.';
      }

      // Score bar
      if (res.score > 0) {
        scoreBar.classList.remove('hidden');
        scoreFill.style.width = Math.min(res.score, 100) + '%';
        scoreVal.textContent = res.score + '/100';

        if (res.score >= 60) {
          scoreFill.className = 'score-bar-fill danger';
        } else if (res.score >= 30) {
          scoreFill.className = 'score-bar-fill warn';
        } else {
          scoreFill.className = 'score-bar-fill';
        }
      }

      // Reasons
      if (res.reasons && res.reasons.length > 0) {
        reasonsBox.classList.remove('hidden');
        reasonsList.innerHTML = res.reasons
          .map((r) => '<li>' + escapeHtml(r) + '</li>')
          .join('');
      }
    });
  }

  // ── Initial load: decide which view to show ──

  chrome.storage.local.get(['user', 'activated'], (data) => {
    if (data.activated === true) {
      // Fully activated — show protection status
      loadActiveView();
    } else if (data.user && data.activated === false) {
      // Account exists but payment not done — show waiting screen
      paymentEmail = data.user.email || '';
      showView('view-waiting');
    }
    // Otherwise: no user — view-plan is already showing (has .active class in HTML)
  });

});
