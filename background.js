// SlackGuard Background Service Worker v1.0.3

const DEFAULT = {
  riskLevel: 'unknown',
  planType: 'unknown',
  canExportDMs: false,
  canExportPrivate: false,
  lastChecked: null,
  dismissed: false,
  stealthMode: false
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(DEFAULT);
});

// Keyboard shortcut — Alt+Shift+H (Win/Linux) or Cmd+Shift+H (Mac)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-stealth') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_STEALTH' });
      }
    });
  }
});

// SPA navigation — tell content script to re-scan
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.url && details.url.includes('slack.com')) {
    setTimeout(() => {
      chrome.tabs.sendMessage(details.tabId, { type: 'RESCAN' }).catch(() => {});
    }, 2000);
  }
}, { url: [{ hostContains: 'slack.com' }] });

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'WORKSPACE_DATA') {
    analyzeRisk(msg.data).then(result => {
      chrome.storage.local.set(result);
      sendResponse(result);
    });
    return true;
  }
  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(null, sendResponse);
    return true;
  }
  if (msg.type === 'DISMISS') {
    chrome.storage.local.set({ dismissed: true });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'RESET_DISMISS') {
    chrome.storage.local.set({ dismissed: false });
    sendResponse({ ok: true });
    return true;
  }
});

async function analyzeRisk(data) {
  const { planName, canExportAllChannels, canExportDMs, retentionEnabled, thirdPartyApps } = data;
  let riskLevel = 'low';
  let riskReasons = [];
  const plan = (planName || '').toLowerCase();

  let planType = 'free';
  if (plan.includes('enterprise') || plan.includes('grid')) planType = 'enterprise';
  else if (plan.includes('business') || plan.includes('plus')) planType = 'business';
  else if (plan.includes('pro') || plan.includes('standard')) planType = 'pro';

  if (planType === 'enterprise') {
    riskLevel = 'high';
    riskReasons.push('Enterprise Grid gives admins full self-serve DM export access');
  } else if (planType === 'business') {
    riskLevel = 'high';
    riskReasons.push('Business+ plan enables corporate export of all DMs and private channels');
  } else if (planType === 'pro') {
    riskLevel = 'medium';
    riskReasons.push('Pro plan allows export under limited circumstances');
  } else {
    riskLevel = 'low';
    riskReasons.push('Free plan has very limited export capabilities');
  }

  if (canExportAllChannels) { riskLevel = 'high'; riskReasons.push('Export tool is ENABLED for all channels including private ones'); }
  if (canExportDMs)         { riskLevel = 'high'; riskReasons.push('DM export capability is enabled on this workspace'); }

  if (thirdPartyApps && thirdPartyApps.length > 0) {
    const monitoring = thirdPartyApps.filter(app =>
      ['hanzo','global relay','smarsh','aware','proofpoint','mimecast','teramind','veriato']
        .some(m => app.toLowerCase().includes(m))
    );
    if (monitoring.length > 0) {
      riskLevel = 'high';
      riskReasons.push(`Monitoring app detected: ${monitoring.join(', ')}`);
    }
  }

  if (retentionEnabled) {
    if (riskLevel === 'low') riskLevel = 'medium';
    riskReasons.push('Message retention policy is active — messages are being archived');
  }

  return {
    riskLevel, planType,
    planName: planName || 'Unknown',
    canExportDMs: !!canExportDMs,
    canExportAllChannels: !!canExportAllChannels,
    retentionEnabled: !!retentionEnabled,
    riskReasons,
    lastChecked: Date.now(),
    dismissed: false,
    stealthMode: false
  };
}
