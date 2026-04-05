// ── NøFishing AI — Popup Script ──

const SUPABASE_URL = 'https://pbdlyfdcrqeddqixbqoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rezQfX2x_cmLfB7iFu6vJg_BRJAPrjp';

let sbClient = null;

document.addEventListener('DOMContentLoaded', () => {

  // Initialize Supabase
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
      btnMonthly.textContent = '✓ Monthly';
      btnYearly.classList.remove('selected');
      btnYearly.textContent = 'Select Yearly';
    } else {
      btnYearly.classList.add('selected');
      btnYearly.textContent = '✓ Yearly';
      btnMonthly.classList.remove('selected');
      btnMonthly.textContent = 'Select Monthly';
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
  ['s-first', 's-last', 's-email', 's-confirm-email', 's-password'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      clearFieldError(id, 'err-' + id);
      document.getElementById('signup-error-banner').classList.remove('show');
    });
  });

  document.getElementById('s-terms').addEventListener('change', () => {
    document.getElementById('err-s-terms').classList.remove('show');
    document.getElementById('terms-container').style.cssText = '';
  });

  // Password eye toggle
  const toggleBtn = document.getElementById('btn-toggle-password');
  const passwordInput = document.getElementById('s-password');
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      document.getElementById('eye-icon').innerHTML = isHidden
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });
  }

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

  document.getElementById('btn-open-payment').addEventListener('click', () => {
    openPaymentTab();
  });

  // ── Signup form ──

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    ['s-first', 's-last', 's-email', 's-confirm-email', 's-password'].forEach((id) => {
      clearFieldError(id, 'err-' + id);
    });
    document.getElementById('err-s-terms').classList.remove('show');
    document.getElementById('signup-error-banner').classList.remove('show');

    const first = document.getElementById('s-first').value.trim();
    const last = document.getElementById('s-last').value.trim();
    const email = document.getElementById('s-email').value.trim();
    const confirmEmail = document.getElementById('s-confirm-email').value.trim();
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
    if (!confirmEmail) {
      showFieldError('s-confirm-email', 'err-s-confirm-email', 'Please confirm your email'); valid = false;
    } else if (confirmEmail !== email) {
      showFieldError('s-confirm-email', 'err-s-confirm-email', 'Emails do not match'); valid = false;
    }
    if (!password) {
      showFieldError('s-password', 'err-s-password', 'Password is required'); valid = false;
    } else if (password.length < 6) {
      showFieldError('s-password', 'err-s-password', 'Must be at least 6 characters'); valid = false;
    }
    if (!terms) {
      document.getElementById('err-s-terms').classList.add('show');
      document.getElementById('terms-container').style.cssText = 'border: 2px solid #EC220C; border-radius: 4px; padding: 4px;';
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
      await sbClient.from('profiles').insert({
        id: authData.user.id,
        first_name: first,
        last_name: last,
        email: email,
        plan: selectedPlan,
        activated: false,
      });

      chrome.storage.local.set({
        user: { firstName: first, lastName: last, email: email },
        firstName: first,
        selectedPlan: selectedPlan,
        activated: false,
      });

      // Persist session tokens for popup reopen
      if (authData.session) {
        chrome.storage.local.set({
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          userId: authData.user.id,
        });
      }

      // Send welcome email (fire and forget)
      fetch('https://nofishing.ai/api/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, first_name: first }),
      }).catch(() => {});

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

      // Persist session tokens
      if (authData.session) {
        chrome.storage.local.set({
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          userId: authData.user.id,
        });
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
    if (!paymentEmail) return;

    let pollCount = 0;

    pollingInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > 120) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        return;
      }

      try {
        const res = await fetch('https://nofishing.ai/api/check-activation?email=' + encodeURIComponent(paymentEmail));
        const data = await res.json();

        if (data.activated) {
          clearInterval(pollingInterval);
          pollingInterval = null;

          chrome.storage.local.set({
            user: { firstName: data.first_name || '', email: paymentEmail },
            firstName: data.first_name || '',
            selectedPlan: data.plan || 'monthly',
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

    if (sbClient && email !== '—') {
      try {
        const { data: profile } = await sbClient
          .from('profiles')
          .select('id, created_at, plan, next_renewal')
          .eq('email', email)
          .single();

        if (profile && profile.created_at) {
          const createdDate = new Date(profile.created_at);
          const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

          document.getElementById('settings-member-since').textContent =
            months[createdDate.getMonth()] + ' ' + createdDate.getDate() + ', ' + createdDate.getFullYear();

          const days = Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / 86400000) + 1);
          document.getElementById('settings-days').textContent = days;

          // Renewal date
          if (profile.next_renewal) {
            const renewalDate = new Date(profile.next_renewal);
            document.getElementById('settings-renews').textContent =
              months[renewalDate.getMonth()] + ' ' + renewalDate.getDate() + ', ' + renewalDate.getFullYear();
          } else {
            const renewalDate = new Date(createdDate);
            if ((profile.plan || plan) === 'yearly') {
              renewalDate.setFullYear(renewalDate.getFullYear() + 1);
            } else {
              renewalDate.setMonth(renewalDate.getMonth() + 1);
            }
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

          if (profile.id) {
            const clean = profile.id.replace(/-/g, '');
            document.getElementById('settings-license').textContent =
              'NFAI-' + clean.substring(0, 4).toUpperCase() + '-' + clean.substring(4, 8).toUpperCase();
          }

          document.getElementById('settings-coverage').textContent = 'All websites · Real-time AI · 1 device';
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
    // Fast path: check local storage first
    const localData = await new Promise((resolve) => {
      chrome.storage.local.get(['activated', 'user', 'paymentEmail'], resolve);
    });

    if (localData.activated === true) {
      loadActiveView();
      return;
    }

    if (!sbClient) {
      if (localData.user && localData.user.email) {
        paymentEmail = localData.user.email;
        showView('view-waiting');
        startActivationPolling();
      }
      return;
    }

    try {
      const { data: { session } } = await sbClient.auth.getSession();

      if (session) {
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
      } else {
        // No session — try to restore from stored tokens
        const tokenData = await new Promise((resolve) => {
          chrome.storage.local.get(['accessToken', 'refreshToken'], resolve);
        });

        if (tokenData.accessToken && tokenData.refreshToken) {
          try {
            const { data: restored } = await sbClient.auth.setSession({
              access_token: tokenData.accessToken,
              refresh_token: tokenData.refreshToken,
            });
            if (restored.session) {
              const { data: profile } = await sbClient
                .from('profiles')
                .select('first_name, activated, plan, email')
                .eq('id', restored.session.user.id)
                .single();
              if (profile && profile.activated) {
                chrome.storage.local.set({ activated: true });
                loadActiveView();
              } else if (profile) {
                paymentEmail = profile.email || restored.session.user.email;
                showView('view-waiting');
                startActivationPolling();
              }
              return;
            }
          } catch (e) {
            // Token restore failed
          }
        }

        // Check if user was mid-signup
        if (localData.user && localData.user.email && localData.activated === false) {
          paymentEmail = localData.user.email;
          showView('view-waiting');
          startActivationPolling();
        }
      }
    } catch (err) {
      if (localData.user && localData.user.email && localData.activated === false) {
        paymentEmail = localData.user.email;
        showView('view-waiting');
        startActivationPolling();
      }
    }
  }

  initPopup();

});
