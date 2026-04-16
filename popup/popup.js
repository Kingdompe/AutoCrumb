/**
 * AutoCrumb Popup Script
 */

// ─── Helpers ─────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error('AutoCrumb: sendMessage failed', message.action, err);
    return null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Render ──────────────────────────────────────────────────────────────

async function render() {
  const data = await sendMessage({ action: 'getPopupData' });
  if (!data) return; // Background SW not ready

  // Enabled state
  const toggleBtn = $('btn-toggle');
  if (data.enabled) {
    toggleBtn.classList.remove('off');
    toggleBtn.classList.add('on');
    $('disabled-banner').classList.add('hidden');
  } else {
    toggleBtn.classList.add('off');
    toggleBtn.classList.remove('on');
    $('disabled-banner').classList.remove('hidden');
  }

  // Site info
  $('site-domain').textContent = data.hostname || 'No site detected';
  $('cookie-count').textContent = data.cookieCount;

  // List badge
  const badge = $('list-badge');
  badge.textContent = data.listStatus === 'none' ? 'unprotected' : data.listStatus;
  badge.className = 'list-badge list-badge--' + data.listStatus;

  // Matched expression
  if (data.matchedExpression) {
    $('matched-section').classList.remove('hidden');
    $('matched-pattern').textContent = data.matchedExpression;
  } else {
    $('matched-section').classList.add('hidden');
  }

  // Suggestions (quick-add buttons)
  renderSuggestions(data);

  // Activity log
  const log = await sendMessage({ action: 'getActivityLog' });
  renderActivityLog(log || []);
}

function renderSuggestions(data) {
  const container = $('suggestions-container');
  container.innerHTML = '';

  if (!data.hostname) return;

  for (const suggestion of data.suggestions) {
    const row = document.createElement('div');
    row.className = 'suggestion-row';

    const label = document.createElement('code');
    label.className = 'suggestion-label';
    label.textContent = suggestion;

    const btnWhite = document.createElement('button');
    btnWhite.className = 'btn-sm btn-whitelist';
    btnWhite.textContent = '+ Whitelist';
    btnWhite.addEventListener('click', () => addToList(suggestion, 'whitelist'));

    const btnGrey = document.createElement('button');
    btnGrey.className = 'btn-sm btn-greylist';
    btnGrey.textContent = '+ Greylist';
    btnGrey.addEventListener('click', () => addToList(suggestion, 'greylist'));

    row.appendChild(label);
    row.appendChild(btnWhite);
    row.appendChild(btnGrey);
    container.appendChild(row);
  }
}

function renderActivityLog(log) {
  const container = $('activity-log');

  if (!log || log.length === 0) {
    container.innerHTML = '<div class="activity-empty">No recent activity</div>';
    return;
  }

  // Show last 5 entries
  const recent = log.slice(0, 5);
  container.innerHTML = '';

  for (const entry of recent) {
    const item = document.createElement('div');
    item.className = 'activity-item';

    const icon = entry.type === 'manual_clean' ? 'M' : entry.type === 'startup_clean' ? 'S' : 'A';
    const domain = entry.domain || (entry.domains ? `${entry.domains} sites` : 'unknown');

    item.innerHTML = `
      <span class="activity-icon activity-icon--${escapeHtml(entry.type)}">${icon}</span>
      <span class="activity-text">${escapeHtml(String(entry.cookiesDeleted))} cookies — ${escapeHtml(domain)}</span>
      <span class="activity-time">${escapeHtml(timeAgo(entry.timestamp))}</span>
    `;

    container.appendChild(item);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────

async function addToList(pattern, type) {
  await sendMessage({ action: 'addExpression', pattern, type });
  render();
}

async function toggleEnabled() {
  const data = await sendMessage({ action: 'getPopupData' });
  await sendMessage({ action: 'saveSettings', settings: { enabled: !data.enabled } });
  render();
}

async function cleanNow() {
  const btn = $('btn-clean');
  btn.disabled = true;
  btn.textContent = 'Cleaning...';

  const result = await sendMessage({ action: 'manualClean', includeOpenTabs: false });

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    Deleted ${result.deleted} cookies
  `;

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Clean Now
    `;
    render();
  }, 2000);
}

async function removeMatchedRule() {
  const pattern = $('matched-pattern').textContent;
  if (pattern) {
    await sendMessage({ action: 'removeExpression', pattern });
    render();
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  render();

  $('btn-toggle').addEventListener('click', toggleEnabled);
  $('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  $('btn-clean').addEventListener('click', cleanNow);
  $('btn-remove-match').addEventListener('click', removeMatchedRule);
});
