// ── NøFishing AI — Welcome / Onboarding Script ──

(function () {
  // Step navigation
  function showStep(id) {
    document.querySelectorAll('.step').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // Step 1 → Step 2
  document.getElementById('btn-get-started').addEventListener('click', () => {
    showStep('step-account');
  });

  // Toggle signup ↔ login
  document.getElementById('btn-go-login').addEventListener('click', () => {
    showStep('step-login');
  });
  document.getElementById('btn-go-signup').addEventListener('click', () => {
    showStep('step-account');
  });

  // Password toggle
  const pwField = document.getElementById('field-password');
  const pwEye = document.getElementById('pw-eye');
  const pwEyeOff = document.getElementById('pw-eye-off');

  document.getElementById('toggle-pw').addEventListener('click', () => {
    const isPassword = pwField.type === 'password';
    pwField.type = isPassword ? 'text' : 'password';
    pwEye.classList.toggle('hidden', isPassword);
    pwEyeOff.classList.toggle('hidden', !isPassword);
  });

  // ── Validation Helpers ──

  function clearFieldError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    input.classList.remove('error');
    error.classList.add('hidden');
    error.textContent = '';
  }

  function setFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    input.classList.add('error');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  // Clear errors on input
  ['field-name', 'field-email', 'field-password'].forEach((id) => {
    const errorId = 'error-' + id.replace('field-', '');
    document.getElementById(id).addEventListener('input', () => clearFieldError(id, errorId));
  });

  ['login-email', 'login-password'].forEach((id) => {
    const errorId = 'login-error-' + id.replace('login-', '');
    document.getElementById(id).addEventListener('input', () => clearFieldError(id, errorId));
  });

  // ── Create Account ──

  document.getElementById('account-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('field-name').value.trim();
    const email = document.getElementById('field-email').value.trim();
    const password = document.getElementById('field-password').value;

    let valid = true;

    if (!name) {
      setFieldError('field-name', 'error-name', 'This field is required');
      valid = false;
    }
    if (!email) {
      setFieldError('field-email', 'error-email', 'This field is required');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('field-email', 'error-email', 'Please enter a valid email address');
      valid = false;
    }
    if (!password) {
      setFieldError('field-password', 'error-password', 'This field is required');
      valid = false;
    } else if (password.length < 6) {
      setFieldError('field-password', 'error-password', 'Password must be at least 6 characters');
      valid = false;
    }

    if (!valid) return;

    // Save account locally (in a real app this would hit a backend)
    const btnText = document.getElementById('btn-create-text');
    const btnLoading = document.getElementById('btn-create-loading');
    const btn = document.getElementById('btn-create-account');

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    // Store user data
    chrome.storage.local.set({
      user: { name, email, createdAt: Date.now() },
    }, () => {
      setTimeout(() => {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        showStep('step-plan');
      }, 800);
    });
  });

  // ── Sign In ──

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const loginError = document.getElementById('login-error');

    let valid = true;
    loginError.classList.add('hidden');

    if (!email) {
      setFieldError('login-email', 'login-error-email', 'This field is required');
      valid = false;
    }
    if (!password) {
      setFieldError('login-password', 'login-error-password', 'This field is required');
      valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-login-text');
    const btnLoading = document.getElementById('btn-login-loading');

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    // Check if this user exists in storage
    chrome.storage.local.get('user', (data) => {
      setTimeout(() => {
        if (data.user && data.user.email === email) {
          btn.disabled = false;
          btnText.classList.remove('hidden');
          btnLoading.classList.add('hidden');

          // Check if already paid
          chrome.storage.local.get('activated', (res) => {
            if (res.activated) {
              // Already activated — close welcome
              window.close();
            } else {
              showStep('step-plan');
            }
          });
        } else {
          btn.disabled = false;
          btnText.classList.remove('hidden');
          btnLoading.classList.add('hidden');
          loginError.textContent = 'No account found with this email. Please create one first.';
          loginError.classList.remove('hidden');
        }
      }, 600);
    });
  });

  // ── Plan Selection → Stripe Checkout ──

  // In production, these would be real Stripe Checkout session URLs created via your backend.
  // For now, they redirect to payment-success.html to simulate the flow.
  const STRIPE_URLS = {
    monthly: null, // Replace with real Stripe Checkout URL
    yearly: null,  // Replace with real Stripe Checkout URL
  };

  document.querySelectorAll('.btn-plan').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      const stripeUrl = STRIPE_URLS[plan];

      // Store selected plan
      chrome.storage.local.set({ selectedPlan: plan });

      if (stripeUrl) {
        // Redirect to Stripe Checkout
        window.location.href = stripeUrl;
      } else {
        // No Stripe URL configured — go to local success page (dev mode)
        window.location.href = chrome.runtime.getURL('payment-success.html') + '?plan=' + plan;
      }
    });
  });
})();
