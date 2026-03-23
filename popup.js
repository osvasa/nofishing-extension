// ── NøFishing AI — Popup Script ──

const SUPABASE_URL = 'https://pbdlyfdcrqeddqixbqoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rezQfX2x_cmLfB7iFu6vJg_BRJAPrjp';

let supabase = null;

document.addEventListener('DOMContentLoaded', () => {

  // Initialize Supabase (CDN may not be loaded yet in some cases)
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  console.log('Supabase client:', supabase ? 'initialized' : 'FAILED');

  // ── TESTING: Force reset on every popup open ──
  chrome.storage.local.clear();
  if (supabase) supabase.auth.signOut();
  console.log('TESTING: session cleared, starting from plan selection');

  // ── View switching ──

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ── Plan selection buttons ──

  const btnMonthly = document.getElementById('btn-plan-monthly');
  const btnYearly = document.getElementById('btn-plan-yearly');

  function selectPlan(plan) {
    if (plan === 'monthly') {
      btnMonthly.classList.add('selected');
      btnYearly.classList.remove('selected');
    } else {
      btnYearly.classList.add('selected');
      btnMonthly.classList.remove('selected');
    }
    chrome.storage.local.set({ selectedPlan: plan }, () => {
      setTimeout(() => showView('view-welcome'), 150);
    });
  }

  btnMonthly.addEventListener('click', () => selectPlan('monthly'));
  btnYearly.addEventListener('click', () => selectPlan('yearly'));

  // ── Navigation buttons ──

  document.getElementById('btn-go-login').addEventListener('click', () => showView('view-login'));
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

  // Reset button for testing
  document.getElementById('btn-reset-test').addEventListener('click', async () => {
    if (supabase) await supabase.auth.signOut();
    chrome.storage.local.clear(() => {
      showView('view-plan');
    });
  });

  // ── Signup form ──

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
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

    const btn = document.getElementById('btn-signup-submit');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    if (!supabase) {
      showFieldError('s-email', 'err-s-email', 'Service unavailable. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Sign up';
      return;
    }

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) {
        console.log('Signup error:', JSON.stringify(authError));
        btn.disabled = false;
        btn.textContent = 'Sign up';
        showFieldError('s-email', 'err-s-email', authError.message);
        return;
      }

      // Get selected plan from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['selectedPlan'], resolve);
      });
      const selectedPlan = storageData.selectedPlan || 'monthly';

      // Insert profile into profiles table
      await supabase.from('profiles').insert({
        id: authData.user.id,
        first_name: first,
        last_name: last,
        email: email,
        plan: selectedPlan,
        activated: false,
      });

      // Store in chrome.storage.local
      chrome.storage.local.set({
        user: { firstName: first, lastName: last, email: email },
        firstName: first,
        selectedPlan: selectedPlan,
        activated: false,
      });

      // Open payment tab
      paymentEmail = email;
      openPaymentTab();

      // Show waiting view
      showView('view-waiting');

    } catch (err) {
      showFieldError('s-email', 'err-s-email', 'Something went wrong. Please try again.');
    }

    btn.disabled = false;
    btn.textContent = 'Sign up';
  });

  // ── Login form ──

  document.getElementById('login-form').addEventListener('submit', async (e) => {
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

    if (!supabase) {
      const banner = document.getElementById('login-error-banner');
      banner.textContent = 'Service unavailable. Please try again.';
      banner.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Log in';
      return;
    }

    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        btn.disabled = false;
        btn.textContent = 'Log in';
        const banner = document.getElementById('login-error-banner');
        banner.textContent = authError.message;
        banner.classList.add('show');
        return;
      }

      // Check profiles table for activated status
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, activated, plan')
        .eq('id', authData.user.id)
        .single();

      if (profile) {
        chrome.storage.local.set({
          user: { firstName: profile.first_name, email: email },
          firstName: profile.first_name,
          selectedPlan: profile.plan || 'monthly',
          activated: profile.activated || false,
        });

        if (profile.activated) {
          loadActiveView();
        } else {
          paymentEmail = email;
          showView('view-waiting');
        }
      } else {
        paymentEmail = email;
        showView('view-waiting');
      }

    } catch (err) {
      const banner = document.getElementById('login-error-banner');
      banner.textContent = 'Something went wrong. Please try again.';
      banner.classList.add('show');
    }

    btn.disabled = false;
    btn.textContent = 'Log in';
  });

  // ── Active view ──

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

  // ── Initial load: check Supabase session ──

  async function initPopup() {
    if (!supabase) {
      // Fallback to chrome.storage if Supabase not available
      chrome.storage.local.get(['user', 'activated'], (data) => {
        if (data.activated === true) {
          loadActiveView();
        } else if (data.user && data.activated === false) {
          paymentEmail = data.user.email || '';
          showView('view-waiting');
        }
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // User is signed in — check profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, activated, plan, email')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          chrome.storage.local.set({
            user: { firstName: profile.first_name, email: profile.email },
            firstName: profile.first_name,
            selectedPlan: profile.plan || 'monthly',
            activated: profile.activated || false,
          });

          if (profile.activated) {
            loadActiveView();
          } else {
            paymentEmail = profile.email || session.user.email;
            showView('view-waiting');
          }
        } else {
          paymentEmail = session.user.email;
          showView('view-waiting');
        }
      }
      // If no session: view-plan is already showing (has .active class in HTML)
    } catch (err) {
      // Fallback to chrome.storage if Supabase is unreachable
      chrome.storage.local.get(['user', 'activated'], (data) => {
        if (data.activated === true) {
          loadActiveView();
        } else if (data.user && data.activated === false) {
          paymentEmail = data.user.email || '';
          showView('view-waiting');
        }
      });
    }
  }

  initPopup();

});
