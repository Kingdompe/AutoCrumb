/**
 * AutoCrumb Options Page Script
 */

function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error('AutoCrumb: sendMessage failed', message.action, err);
    return null;
  }
}

// ─── Tab Navigation ──────────────────────────────────────────────────────

function setupTabs() {
  for (const link of $$('.nav-link')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;

      $$('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $(`tab-${tab}`).classList.add('active');
    });
  }
}

// ─── Settings ────────────────────────────────────────────────────────────

const SETTING_KEYS = [
  'enabled', 'cleanupDelay', 'cleanOnDomainChange', 'cleanOnStartup',
  'cleanExpiredCookies', 'showNotifications', 'showBadgeCount',
  'enableContextMenus', 'cleanLocalStorage', 'cleanIndexedDB',
  'cleanCache', 'cleanServiceWorkers',
];

async function loadSettings() {
  const settings = await sendMessage({ action: 'getSettings' });
  if (!settings) return;

  for (const key of SETTING_KEYS) {
    const el = $(`setting-${key}`);
    if (!el) continue;

    if (el.type === 'checkbox') {
      el.checked = settings[key];
    } else {
      el.value = settings[key];
    }
  }
}

function setupSettingsListeners() {
  for (const key of SETTING_KEYS) {
    const el = $(`setting-${key}`);
    if (!el) continue;

    el.addEventListener('change', async () => {
      const value = el.type === 'checkbox' ? el.checked :
                    el.type === 'number' ? Number(el.value) : el.value;
      await sendMessage({ action: 'saveSettings', settings: { [key]: value } });
    });
  }
}

// ─── Expressions ─────────────────────────────────────────────────────────

async function loadExpressions() {
  const expressions = await sendMessage({ action: 'getExpressions' });
  renderExpressions(expressions || []);
}

function renderExpressions(expressions, filter = '') {
  const tbody = $('expressions-tbody');

  let filtered = expressions;
  if (filter) {
    filtered = expressions.filter(e =>
      e.pattern.toLowerCase().includes(filter.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">${
      filter ? 'No matching expressions' : 'No expressions yet. Add one above or right-click any page.'
    }</td></tr>`;
    return;
  }

  // Sort: whitelist first, then greylist, then alphabetical
  filtered.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'whitelist' ? -1 : 1;
    return a.pattern.localeCompare(b.pattern);
  });

  tbody.innerHTML = '';
  for (const expr of filtered) {
    const tr = document.createElement('tr');
    const date = new Date(expr.createdAt).toLocaleDateString();
    const typeClass = expr.type === 'whitelist' ? 'badge-green' : 'badge-yellow';

    tr.innerHTML = `
      <td><code>${escapeHtml(expr.pattern)}</code></td>
      <td><span class="badge ${typeClass}">${expr.type}</span></td>
      <td class="text-muted">${date}</td>
      <td><button class="btn-remove" data-pattern="${escapeHtml(expr.pattern)}" title="Remove">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button></td>
    `;

    tbody.appendChild(tr);
  }

  // Attach remove handlers
  for (const btn of tbody.querySelectorAll('.btn-remove')) {
    btn.addEventListener('click', async () => {
      await sendMessage({ action: 'removeExpression', pattern: btn.dataset.pattern });
      loadExpressions();
    });
  }
}

function setupExpressionForm() {
  $('btn-add').addEventListener('click', async () => {
    const pattern = $('input-expression').value.trim();
    const type = $('select-type').value;

    if (!pattern) return;

    await sendMessage({ action: 'addExpression', pattern, type });
    $('input-expression').value = '';
    loadExpressions();
  });

  $('input-expression').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-add').click();
  });

  $('input-filter').addEventListener('input', async () => {
    const filter = $('input-filter').value;
    const expressions = await sendMessage({ action: 'getExpressions' });
    renderExpressions(expressions, filter);
  });
}

// ─── Import / Export ─────────────────────────────────────────────────────

function setupImportExport() {
  $('btn-export').addEventListener('click', async () => {
    const data = await sendMessage({ action: 'exportData' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autocrumb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('input-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const status = $('import-status');
    status.textContent = 'Importing...';
    status.className = 'import-status';

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await sendMessage({ action: 'importData', data });
      status.textContent = `Imported ${result.imported} expressions (${result.format} format)`;
      status.className = 'import-status success';
      loadExpressions();
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      status.className = 'import-status error';
    }
  });

  $('btn-reset').addEventListener('click', async () => {
    if (!confirm('This will delete all your rules and reset all settings. Are you sure?')) return;

    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    location.reload();
  });
}

// ─── Statistics ──────────────────────────────────────────────────────────

async function loadStats() {
  const [stats, expressions, log] = await Promise.all([
    sendMessage({ action: 'getStats' }),
    sendMessage({ action: 'getExpressions' }),
    sendMessage({ action: 'getActivityLog' }),
  ]);

  if (!stats || !expressions) return;
  const safeLog = log || [];

  $('stat-total').textContent = stats.totalCookiesDeleted.toLocaleString();
  $('stat-cleanups').textContent = stats.totalCleanups.toLocaleString();
  $('stat-domains').textContent = Object.keys(stats.deletionsByDomain).length.toLocaleString();
  $('stat-rules').textContent = expressions.length.toLocaleString();

  // Top domains
  const topDomains = $('top-domains');
  const sorted = Object.entries(stats.deletionsByDomain)
    .filter(([d]) => d !== '_manual')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    topDomains.innerHTML = '<div class="empty-state">No data yet</div>';
  } else {
    const maxCount = sorted[0][1];
    topDomains.innerHTML = sorted.map(([domain, count]) => `
      <div class="domain-row">
        <span class="domain-name">${escapeHtml(domain)}</span>
        <div class="domain-bar-container">
          <div class="domain-bar" style="width: ${(count / maxCount * 100)}%"></div>
        </div>
        <span class="domain-count">${count.toLocaleString()}</span>
      </div>
    `).join('');
  }

  // Activity log
  const logContainer = $('full-activity-log');
  if (!safeLog || safeLog.length === 0) {
    logContainer.innerHTML = '<div class="empty-state">No activity yet</div>';
  } else {
    logContainer.innerHTML = safeLog.map(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      const domain = entry.domain || (entry.domains ? `${entry.domains} sites` : 'manual');
      const typeLabel = entry.type === 'auto_clean' ? 'Auto' :
                        entry.type === 'manual_clean' ? 'Manual' : 'Startup';
      return `
        <div class="log-entry">
          <span class="log-type log-type--${entry.type}">${typeLabel}</span>
          <span class="log-text">${entry.cookiesDeleted} cookies from ${escapeHtml(domain)}</span>
          <span class="log-time">${time}</span>
        </div>
      `;
    }).join('');
  }
}

function setupStatsActions() {
  $('btn-clear-log').addEventListener('click', async () => {
    if (!confirm('Clear the activity log?')) return;
    await chrome.storage.local.set({ activityLog: [] });
    loadStats();
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadSettings();
  setupSettingsListeners();
  loadExpressions();
  setupExpressionForm();
  setupImportExport();
  loadStats();
  setupStatsActions();
});
