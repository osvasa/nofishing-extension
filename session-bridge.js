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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_SESSION') {
    const key = 'sb-pbdlyfdcrqeddqixbqoy-auth-token';
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const session = JSON.parse(raw);
        sendResponse({ session });
      } catch(e) {
        sendResponse({ session: null });
      }
    } else {
      sendResponse({ session: null });
    }
  }
  return true;
});

window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'nofishing-payment' && event.data.type === 'CLOSE_TAB') {
    chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
  }
});
