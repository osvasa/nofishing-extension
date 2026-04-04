(function() {
  const key = 'sb-pbdlyfdcrqeddqixbqoy-auth-token';
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const session = JSON.parse(raw);
      if (session && session.access_token) {
        chrome.runtime.sendMessage({
          type: 'SUPABASE_SESSION',
          session: session
        });
      }
    } catch(e) {}
  }
})();
