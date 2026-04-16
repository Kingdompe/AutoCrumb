/**
 * Storage utilities for AutoCrumb.
 * Manages whitelist, greylist, settings, and runtime state.
 */

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  cleanupDelay: 15,           // seconds before cleanup after tab close
  cleanOnDomainChange: false,
  cleanOnStartup: false,
  cleanExpiredCookies: false,
  showNotifications: true,
  showBadgeCount: true,
  enableContextMenus: true,
  // Site data cleanup
  cleanLocalStorage: false,
  cleanIndexedDB: false,
  cleanCache: false,
  cleanServiceWorkers: false,
};

/**
 * Expression object shape:
 * {
 *   pattern: "*.github.com",
 *   type: "whitelist" | "greylist",
 *   createdAt: 1713300000000,
 *   cookieNames: []  // optional: filter to specific cookies
 * }
 */

// ─── Sync Storage (settings + expressions, syncs across devices) ─────────

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await chrome.storage.sync.set({ settings: merged });
  return merged;
}

export async function getExpressions() {
  const { expressions } = await chrome.storage.sync.get({ expressions: [] });
  return expressions;
}

export async function saveExpressions(expressions) {
  await chrome.storage.sync.set({ expressions });
}

export async function addExpression(pattern, type) {
  const expressions = await getExpressions();

  // Don't add duplicates
  const existing = expressions.find(e => e.pattern.toLowerCase() === pattern.toLowerCase());
  if (existing) {
    // Update type if different
    if (existing.type !== type) {
      existing.type = type;
      await saveExpressions(expressions);
    }
    return expressions;
  }

  expressions.push({
    pattern: pattern.toLowerCase(),
    type,
    createdAt: Date.now(),
    cookieNames: [],
  });

  await saveExpressions(expressions);
  return expressions;
}

export async function removeExpression(pattern) {
  const expressions = await getExpressions();
  const filtered = expressions.filter(e => e.pattern.toLowerCase() !== pattern.toLowerCase());
  await saveExpressions(filtered);
  return filtered;
}

export async function getWhitelist() {
  const expressions = await getExpressions();
  return expressions.filter(e => e.type === 'whitelist');
}

export async function getGreylist() {
  const expressions = await getExpressions();
  return expressions.filter(e => e.type === 'greylist');
}

// ─── Session Storage (runtime state, survives SW restart) ────────────────

export async function getTabMap() {
  const { tabMap } = await chrome.storage.session.get({ tabMap: {} });
  return tabMap;
}

export async function saveTabMap(tabMap) {
  await chrome.storage.session.set({ tabMap });
}

export async function getDomainTabCount() {
  const { domainTabCount } = await chrome.storage.session.get({ domainTabCount: {} });
  return domainTabCount;
}

export async function saveDomainTabCount(domainTabCount) {
  await chrome.storage.session.set({ domainTabCount });
}

// ─── Local Storage (stats + logs, persistent) ────────────────────────────

export async function getStats() {
  const { stats } = await chrome.storage.local.get({
    stats: {
      totalCookiesDeleted: 0,
      totalCleanups: 0,
      deletionsByDomain: {},
    }
  });
  return stats;
}

export async function incrementStats(domain, cookieCount) {
  const stats = await getStats();
  stats.totalCookiesDeleted += cookieCount;
  stats.totalCleanups += 1;
  stats.deletionsByDomain[domain] = (stats.deletionsByDomain[domain] || 0) + cookieCount;
  await chrome.storage.local.set({ stats });
  return stats;
}

export async function getActivityLog() {
  const { activityLog } = await chrome.storage.local.get({ activityLog: [] });
  return activityLog;
}

export async function addActivityLog(entry) {
  const log = await getActivityLog();
  log.unshift({
    ...entry,
    timestamp: Date.now(),
  });
  // Keep last 100 entries
  if (log.length > 100) log.length = 100;
  await chrome.storage.local.set({ activityLog: log });
  return log;
}

export async function clearActivityLog() {
  await chrome.storage.local.set({ activityLog: [] });
}

// ─── Import / Export ─────────────────────────────────────────────────────

/**
 * Export all user data as JSON.
 */
export async function exportData() {
  const [settings, expressions, stats] = await Promise.all([
    getSettings(),
    getExpressions(),
    getStats(),
  ]);
  return {
    version: 1,
    app: 'AutoCrumb',
    exportedAt: new Date().toISOString(),
    settings,
    expressions,
    stats,
  };
}

/**
 * Import data from JSON. Supports AutoCrumb format and Cookie AutoDelete format.
 */
export async function importData(data) {
  if (!data) throw new Error('No data to import');

  // AutoCrumb native format
  if (data.app === 'AutoCrumb') {
    if (data.settings) await saveSettings(data.settings);
    if (data.expressions) await saveExpressions(data.expressions);
    return { imported: (data.expressions || []).length, format: 'AutoCrumb' };
  }

  // Cookie AutoDelete format — convert expressions
  if (data.lists || data.expressions) {
    const cadExpressions = data.lists || data.expressions || {};
    const converted = [];

    for (const [storeId, entries] of Object.entries(cadExpressions)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const pattern = entry.expression || entry.pattern || entry;
        const type = (entry.listType === 'WHITE' || entry.type === 'whitelist')
          ? 'whitelist' : 'greylist';
        if (typeof pattern === 'string' && pattern.trim()) {
          converted.push({
            pattern: pattern.trim().toLowerCase(),
            type,
            createdAt: Date.now(),
            cookieNames: entry.cookieNames || [],
          });
        }
      }
    }

    // Deduplicate
    const unique = [...new Map(converted.map(e => [e.pattern, e])).values()];
    const existing = await getExpressions();
    const existingPatterns = new Set(existing.map(e => e.pattern));
    const newOnes = unique.filter(e => !existingPatterns.has(e.pattern));
    await saveExpressions([...existing, ...newOnes]);

    return { imported: newOnes.length, format: 'CookieAutoDelete' };
  }

  throw new Error('Unrecognized import format');
}
