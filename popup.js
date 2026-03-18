// SlackGuard Popup v1.0.3

document.addEventListener('DOMContentLoaded', async () => {

  function timeAgo(ts) {
    if (!ts) return null;
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function getRiskCopy(level) {
    switch (level) {
      case 'high':   return { label: 'HIGH RISK',   sub: 'Admins can export all DMs and private messages without notifying you.' };
      case 'medium': return { label: 'MEDIUM RISK', sub: 'Exports possible under limited circumstances. Use caution.' };
      case 'low':    return { label: 'LOW RISK',    sub: 'Your workspace plan has very limited export capabilities.' };
      default:       return { label: 'Scanning...', sub: 'Open a Slack workspace tab to detect your risk level.' };
    }
  }

  async function render() {
    const data = await chrome.storage.local.get(null);
    const level = data.riskLevel || 'unknown';
    const { label, sub } = getRiskCopy(level);

    document.getElementById('status-container').className = `status-card ${level}`;
    const riskText = document.getElementById('risk-text');
    riskText.className   = `risk-title ${level}`;
    riskText.textContent = label;
    document.getElementById('risk-sub').textContent = sub;

    const planBadge = document.getElementById('plan-badge');
    if (data.planName && data.planName !== 'Unknown') {
      planBadge.textContent   = data.planName;
      planBadge.style.display = 'inline-block';
    } else {
      planBadge.style.display = 'none';
    }

    // safe DOM build
    const reasonsList = document.getElementById('reasons');
    reasonsList.textContent = '';
    (data.riskReasons || []).forEach(r => { const li = document.createElement('li'); li.textContent = r; reasonsList.appendChild(li); });
    //
      (data.riskReasons || []).map(r => `<li>${r}</li>`).join('');

    const ago = timeAgo(data.lastChecked);
    document.getElementById('last-checked').textContent =
      ago ? `Last scanned: ${ago}` : 'Not yet scanned — open Slack to begin';
  }

  await render();

  // Re-scan
  document.getElementById('btn-rescan').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const btn = document.getElementById('btn-rescan');
    if (tab && tab.url && tab.url.includes('slack.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' });
      btn.textContent = 'Scanning...';
      setTimeout(async () => { await render(); btn.textContent = 'Re-scan'; }, 4000);
    } else {
      btn.textContent = 'Open Slack first';
      setTimeout(() => { btn.textContent = 'Re-scan'; }, 2000);
    }
  });

  // Restore dismissed banner
  document.getElementById('btn-show-banner').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_DISMISS' });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('slack.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_BANNER' });
    }
    window.close();
  });

  // Stealth toggle button — same as keyboard shortcut but from popup
  document.getElementById('btn-stealth').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const btn = document.getElementById('btn-stealth');
    if (tab && tab.url && tab.url.includes('slack.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_STEALTH' });
      btn.textContent = btn.textContent === 'Hide' ? 'Show' : 'Hide';
    } else {
      btn.textContent = 'Open Slack';
      setTimeout(() => { btn.textContent = 'Hide'; }, 2000);
    }
  });

  // Open settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://slack.com/account/workspace-settings#retention' });
  });

});
