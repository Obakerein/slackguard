// SlackGuard Content Script v1.0.3

(function () {
  'use strict';

  let lastStatus = null;
  let scanTimeout = null;
  let currentWorkspaceId = null;
  let stealthMode = false;

  function init() {
    tryInitWithRetry(0);
    observeTitleChange();
  }

  // Retry until window.TS.boot_data is ready (Slack SPA race condition fix)
  function tryInitWithRetry(attempt) {
    if (attempt > 5) { scheduleScan(0); return; }
    if (window.TS && window.TS.boot_data) {
      scheduleScan(0);
    } else {
      setTimeout(() => tryInitWithRetry(attempt + 1), 800);
    }
  }

  function scheduleScan(delay) {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanWorkspace, delay);
  }

  // Lightweight title observer as SPA navigation fallback
  function observeTitleChange() {
    let lastUrl = location.href;
    let debounce;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        clearTimeout(debounce);
        debounce = setTimeout(() => scheduleScan(2000), 100);
      }
    });
    const titleEl = document.querySelector('title') || document.head;
    observer.observe(titleEl, { childList: true, subtree: true });
  }

  // Single unified message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RESCAN') {
      scheduleScan(500);
    }

    if (msg.type === 'SHOW_BANNER') {
      stealthMode = false;
      if (lastStatus) showBanner({ ...lastStatus, dismissed: false });
      else scheduleScan(500);
    }

    // STEALTH MODE — instant hide/show without removing from DOM
    // Triggered by Alt+Shift+H (Win) / Cmd+Shift+H (Mac)
    if (msg.type === 'TOGGLE_STEALTH') {
      const banner = document.getElementById('slackguard-banner');
      if (!banner) return;

      stealthMode = !stealthMode;

      if (stealthMode) {
        // Hide instantly — no animation, no trace
        banner.style.transition = 'none';
        banner.style.opacity = '0';
        banner.style.pointerEvents = 'none';
        banner.style.transform = 'translateY(-100%)';
      } else {
        // Restore smoothly
        banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        banner.style.opacity = '1';
        banner.style.pointerEvents = '';
        banner.style.transform = 'translateY(0)';
      }
    }
  });

  async function scanWorkspace() {
    const data = {};

    // Method 1: window.TS.boot_data (most reliable — Slack's own global)
    try {
      if (window.TS && window.TS.boot_data) {
        const bd = window.TS.boot_data;
        data.planName             = bd.plan_type || bd.plan || bd.tier || '';
        data.canExportDMs         = bd.can_export_dms || false;
        data.canExportAllChannels = bd.can_export_all_channels || false;
        data.retentionEnabled     = bd.retention_enabled || false;
        data.workspaceId          = bd.team_id || bd.enterprise_id || null;
      }
    } catch (e) {}

    // Method 2: Inline script regex fallback
    if (!data.planName) {
      try {
        const bootData = extractBootData();
        if (bootData) {
          data.planName             = bootData.plan || '';
          data.canExportDMs         = bootData.canExportDMs || false;
          data.canExportAllChannels = bootData.canExportAllChannels || false;
          data.retentionEnabled     = bootData.retentionEnabled || false;
          data.workspaceId          = bootData.workspaceId || null;
        }
      } catch (e) {}
    }

    // Per-workspace dismissed state reset
    if (data.workspaceId && data.workspaceId !== currentWorkspaceId) {
      currentWorkspaceId = data.workspaceId;
      await chrome.runtime.sendMessage({ type: 'RESET_DISMISS' });
    }

    // Method 3: Admin page text scan
    try {
      if (location.href.includes('workspace-settings') || location.href.includes('/admin')) {
        const t = document.body.innerText || '';
        if (!data.planName) {
          if (t.match(/enterprise\s*grid/i))  data.planName = 'Enterprise Grid';
          else if (t.match(/business\+/i))    data.planName = 'Business+';
          else if (t.match(/\bpro\b/i))       data.planName = 'Pro';
          else if (t.match(/\bfree\b/i))      data.planName = 'Free';
        }
        if (t.match(/export.*all.*channel/i))    data.canExportAllChannels = true;
        if (t.match(/export.*direct.*message/i)) data.canExportDMs = true;
        if (t.match(/retention.*enabled/i))      data.retentionEnabled = true;
      }
    } catch (e) {}

    // Method 4: Monitoring apps in sidebar
    try {
      const text = Array.from(document.querySelectorAll('a,[data-qa]'))
        .map(el => (el.textContent || el.getAttribute('data-qa') || '').toLowerCase()).join(' ');
      const found = ['hanzo','smarsh','global relay','aware','proofpoint','teramind']
        .filter(k => text.includes(k));
      if (found.length) data.thirdPartyApps = found;
    } catch (e) {}

    // Method 5: Fetch settings — first scan only
    if (!lastStatus) {
      try {
        const r = await fetch(
          `${location.protocol}//${location.host}/account/workspace-settings`,
          { credentials: 'include' }
        );
        if (r.ok) {
          const html = await r.text();
          if (!data.planName) {
            if (html.match(/enterprise.*grid/i))  data.planName = 'Enterprise Grid';
            else if (html.match(/business\+/i))   data.planName = 'Business+';
            else if (html.match(/\bpro\b/i))      data.planName = 'Pro';
          }
          if (html.match(/canExportAllChannels.*true/i)) data.canExportAllChannels = true;
          if (html.match(/canExportDMs.*true/i))         data.canExportDMs = true;
          if (html.match(/retentionEnabled.*true/i))     data.retentionEnabled = true;
        }
      } catch (e) {
        console.debug('[SlackGuard] Settings fetch skipped (CSP/network block)');
      }
    }

    chrome.runtime.sendMessage({ type: 'WORKSPACE_DATA', data }, (result) => {
      if (result) { lastStatus = result; showBanner(result); }
    });
  }

  function extractBootData() {
    for (const script of document.querySelectorAll('script:not([src])')) {
      const t = script.textContent || '';
      const planMatch      = t.match(/"plan(?:_type|Name|Tier)?"\s*:\s*"([^"]+)"/i);
      const exportMatch    = t.match(/"(?:can_export_dms|canExportDMs)"\s*:\s*(true|false)/i);
      const retentionMatch = t.match(/"(?:retention_enabled|retentionEnabled)"\s*:\s*(true|false)/i);
      const workspaceMatch = t.match(/"(?:team_id|enterprise_id)"\s*:\s*"([^"]+)"/i);
      if (planMatch || exportMatch) {
        return {
          plan:             planMatch      ? planMatch[1] : null,
          canExportDMs:     exportMatch    ? exportMatch[1] === 'true' : false,
          retentionEnabled: retentionMatch ? retentionMatch[1] === 'true' : false,
          workspaceId:      workspaceMatch ? workspaceMatch[1] : null
        };
      }
    }
    return null;
  }

  function showBanner(status) {
    const existing = document.getElementById('slackguard-banner');
    if (existing) existing.remove();
    if (status.dismissed) return;

    const icons  = { high: '⚠', medium: '◉', low: '✓' };
    const titles = {
      high:   'Your DMs can be read by admins',
      medium: 'Your messages may be accessible',
      low:    'Low monitoring risk detected'
    };

    const banner = document.createElement('div');
    banner.id = 'slackguard-banner';
    banner.className = `slackguard-banner slackguard-${status.riskLevel}`;

    const planStr   = status.planName && status.planName !== 'Unknown' ? `${status.planName} · ` : '';
    const reasonStr = status.riskReasons && status.riskReasons[0] ? status.riskReasons[0] : '';

    // Safe DOM construction — avoids innerHTML warning
    const iconEl = document.createElement('div');
    iconEl.className = 'sg-icon';
    iconEl.textContent = icons[status.riskLevel] || '?';

    const titleEl = document.createElement('span');
    titleEl.className = 'sg-title';
    titleEl.textContent = titles[status.riskLevel] || 'Scanning...';

    const subEl = document.createElement('span');
    subEl.className = 'sg-sub';
    subEl.textContent = planStr + reasonStr;

    const contentEl = document.createElement('div');
    contentEl.className = 'sg-content';
    contentEl.appendChild(titleEl);
    contentEl.appendChild(subEl);

    const hintEl = document.createElement('span');
    hintEl.className = 'sg-stealth-hint';
    hintEl.textContent = 'Alt+Shift+H to hide';

    const linkEl = document.createElement('a');
    linkEl.className = 'sg-link';
    linkEl.href = 'https://slack.com/account/workspace-settings#retention';
    linkEl.target = '_blank';
    linkEl.textContent = 'Check settings';

    const dismissEl = document.createElement('button');
    dismissEl.className = 'sg-dismiss';
    dismissEl.title = 'Dismiss — click extension icon to restore';
    dismissEl.textContent = '✕';

    banner.appendChild(iconEl);
    banner.appendChild(contentEl);
    banner.appendChild(hintEl);
    banner.appendChild(linkEl);
    banner.appendChild(dismissEl);

    banner.querySelector('.sg-dismiss').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DISMISS' });
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-100%)';
      setTimeout(() => banner.remove(), 300);
    });

    // Hover fade — banner becomes nearly invisible when someone looks over shoulder
    banner.addEventListener('mouseenter', () => {
      if (!stealthMode) banner.style.opacity = '0.12';
    });
    banner.addEventListener('mouseleave', () => {
      if (!stealthMode) banner.style.opacity = '1';
    });

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('sg-visible'));
  }

  init();
})();
