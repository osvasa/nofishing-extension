// ── NøFishing AI — Popup Script ──

const SUPABASE_URL = 'https://pbdlyfdcrqeddqixbqoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rezQfX2x_cmLfB7iFu6vJg_BRJAPrjp';

let sbClient = null;

document.addEventListener('DOMContentLoaded', () => {

  // Initialize Supabase (CDN may not be loaded yet in some cases)
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  console.log('Supabase client:', sbClient ? 'initialized' : 'FAILED');

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
      btnMonthly.innerHTML = '<span style="color:#EC220C;font-weight:700;">✓</span> Monthly';
      btnYearly.classList.remove('selected');
      btnYearly.textContent = 'Select';
    } else {
      btnYearly.classList.add('selected');
      btnYearly.innerHTML = '<span style="color:#EC220C;font-weight:700;">✓</span> Yearly';
      btnMonthly.classList.remove('selected');
      btnMonthly.textContent = 'Select';
    }
    chrome.storage.local.set({ selectedPlan: plan }, () => {
      setTimeout(() => {
        openPaymentTab();
        showView('view-waiting');
        startActivationPolling();
        setTimeout(() => window.close(), 1000);
      }, 150);
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

    if (!sbClient) {
      const banner = document.getElementById('signup-error-banner');
      banner.textContent = 'Service unavailable. Please try again.';
      banner.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Continue';
      return;
    }

    try {
      const { data: authData, error: authError } = await sbClient.auth.signUp({
        email,
        password,
        options: { data: { first_name: first, last_name: last } },
      });

      if (authError) {
        const banner = document.getElementById('signup-error-banner');
        banner.textContent = authError.message;
        banner.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Continue';
        return;
      }

      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['selectedPlan'], resolve);
      });
      const selectedPlan = storageData.selectedPlan || 'monthly';

      // Insert profile row
      const { error: insertError } = await sbClient.from('profiles').insert({
        id: authData.user.id,
        first_name: first,
        last_name: last,
        email: email,
        plan: selectedPlan,
        activated: false,
      });

      if (insertError) {
        console.error('Profile insert failed:', insertError);
        const banner = document.getElementById('signup-error-banner');
        banner.textContent = 'Account created but profile setup failed. Please contact support.';
        banner.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Continue';
        return;
      }

      chrome.storage.local.set({
        user: { firstName: first, lastName: last, email: email },
        firstName: first,
        selectedPlan: selectedPlan,
        activated: false,
      });

      paymentEmail = email;
      showView('view-plan');
    } catch (err) {
      const banner = document.getElementById('signup-error-banner');
      banner.textContent = 'Something went wrong. Please try again.';
      banner.classList.add('show');
    }

    btn.disabled = false;
    btn.textContent = 'Continue';
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

    if (!sbClient) {
      const banner = document.getElementById('login-error-banner');
      banner.textContent = 'Service unavailable. Please try again.';
      banner.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Log in';
      return;
    }

    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await sbClient.auth.signInWithPassword({
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
      const { data: profile } = await sbClient
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
          startActivationPolling();
        }
      } else {
        paymentEmail = email;
        showView('view-waiting');
        startActivationPolling();
      }

    } catch (err) {
      const banner = document.getElementById('login-error-banner');
      banner.textContent = 'Something went wrong. Please try again.';
      banner.classList.add('show');
    }

    btn.disabled = false;
    btn.textContent = 'Log in';
  });

  // ── Activation polling ──

  let pollingInterval = null;

  function startActivationPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    if (!sbClient || !paymentEmail) return;

    let pollCount = 0;

    pollingInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > 120) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        return;
      }

      try {
        const { data: profile } = await sbClient
          .from('profiles')
          .select('first_name, activated, plan')
          .eq('email', paymentEmail)
          .single();

        if (profile && profile.activated) {
          clearInterval(pollingInterval);
          pollingInterval = null;

          chrome.storage.local.set({
            user: { firstName: profile.first_name, email: paymentEmail },
            firstName: profile.first_name,
            selectedPlan: profile.plan || 'monthly',
            activated: true,
          });

          loadActiveView();
        }
      } catch (err) {
        // Ignore polling errors, will retry next interval
      }
    }, 5000);
  }

  // ── Active view ──

  function loadActiveView() {
    showView('view-active');

    // Load stats from storage
    chrome.storage.local.get(['sitesVisited', 'threatsBlocked'], (data) => {
      document.getElementById('stat-sites').textContent = data.sitesVisited || 0;
      document.getElementById('stat-threats').textContent = data.threatsBlocked || 0;
    });
  }

  // ── Settings view ──

  document.getElementById('btn-open-settings').addEventListener('click', async () => {
    showView('view-settings');

    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['user', 'selectedPlan', 'sitesVisited', 'threatsBlocked'], resolve);
    });

    const email = (data.user && data.user.email) || '—';
    const plan = data.selectedPlan || 'monthly';

    document.getElementById('settings-email').textContent = email;
    document.getElementById('settings-plan').textContent = plan === 'yearly' ? 'Yearly Protection $49.99/yr' : 'Monthly Protection $4.99/mo';
    document.getElementById('settings-sites').textContent = data.sitesVisited || 0;
    document.getElementById('settings-threats').textContent = data.threatsBlocked || 0;

    // Fetch profile from Supabase for dates
    if (sbClient && email !== '—') {
      try {
        const { data: profile } = await sbClient
          .from('profiles')
          .select('created_at, plan')
          .eq('email', email)
          .single();

        if (profile && profile.created_at) {
          const createdDate = new Date(profile.created_at);
          const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

          // Member since
          document.getElementById('settings-member-since').textContent =
            months[createdDate.getMonth()] + ' ' + createdDate.getDate() + ', ' + createdDate.getFullYear();

          // Days protected
          const days = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
          document.getElementById('settings-days').textContent = days;

          // Next renewal
          const renewalDate = new Date(createdDate);
          if ((profile.plan || plan) === 'yearly') {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
          } else {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
          }
          // Advance renewal past today
          while (renewalDate < new Date()) {
            if ((profile.plan || plan) === 'yearly') {
              renewalDate.setFullYear(renewalDate.getFullYear() + 1);
            } else {
              renewalDate.setMonth(renewalDate.getMonth() + 1);
            }
          }
          document.getElementById('settings-renews').textContent =
            months[renewalDate.getMonth()] + ' ' + renewalDate.getDate() + ', ' + renewalDate.getFullYear();
        }
      } catch (err) {
        // Supabase unavailable — leave defaults
      }
    }
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    showView('view-active');
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (sbClient) await sbClient.auth.signOut();
    chrome.storage.local.clear(() => {
      showView('view-welcome');
    });
  });

  // ── Initial load: check Supabase session ──

  async function initPopup() {
    if (!sbClient) {
      // Fallback to chrome.storage if Supabase not available
      chrome.storage.local.get(['user', 'activated'], (data) => {
        if (data.activated === true) {
          loadActiveView();
        } else if (data.user && data.activated === false) {
          paymentEmail = data.user.email || '';
          showView('view-waiting');
          startActivationPolling();
        }
      });
      return;
    }

    try {
      const { data: { session } } = await sbClient.auth.getSession();

      if (session) {
        // User is signed in — check profile
        const { data: profile } = await sbClient
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
            startActivationPolling();
          }
        } else {
          paymentEmail = session.user.email;
          showView('view-waiting');
          startActivationPolling();
        }
      }
      // If no session: view-welcome is already showing (has .active class in HTML)
    } catch (err) {
      // Fallback to chrome.storage if Supabase is unreachable
      chrome.storage.local.get(['user', 'activated'], (data) => {
        if (data.activated === true) {
          loadActiveView();
        } else if (data.user && data.activated === false) {
          paymentEmail = data.user.email || '';
          showView('view-waiting');
          startActivationPolling();
        }
      });
    }
  }

  initPopup();

});
