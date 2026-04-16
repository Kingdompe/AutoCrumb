/**
 * AutoCrumb — Background Service Worker
 *
 * Manages tab tracking, cookie cleanup on tab close, context menus,
 * keyboard commands, and alarm-based deferred cleanup.
 *
 * MV3 architecture: designed for service worker termination/resurrection.
 * All state is rebuilt from chrome.tabs.query() on wake.
 */

import { getHostname, getBaseDomain, findMatchingExpression, getSuggestions } from './utils/domain.js';
import {
  getSettings, saveSettings, getExpressions, addExpression, removeExpression,
  getTabMap, saveTabMap,
  getDomainTabCount, saveDomainTabCount,
  getStats, getActivityLog, addActivityLog, clearActivityLog,
  exportData, importData,
} from './utils/storage.js';
import { cleanDomain, countCookiesForHostname, manualCleanAll } from './utils/cookies.js';

// ─── State Management ────────────────────────────────────────────────────

let tabMap = {};           // tabId → hostname
let domainTabCount = {};   // hostname → number of open tabs
let initialized = false;

/**
 * Rebuild tab tracking state from actual open tabs.
 * Called on every SW wake-up.
 */
async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const tabs = await chrome.tabs.query({});
  tabMap = {};
  domainTabCount = {};

  for (const tab of tabs) {
    const hostname = getHostname(tab.url);
    if (hostname) {
      tabMap[tab.id] = hostname;
      domainTabCount[hostname] = (domainTabCount[hostname] || 0) + 1;
    }
  }

  await Promise.all([
    saveTabMap(tabMap),
    saveDomainTabCount(domainTabCount),
  ]);
}

// ─── Tab Event Handlers ──────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ensureInitialized();

  if (!changeInfo.url && changeInfo.status !== 'complete') return;

  const newHostname = getHostname(tab.url);
  const oldHostname = tabMap[tabId];

  // Same domain — nothing to do
  if (oldHostname === newHostname) return;

  // Decrement old domain count
  if (oldHostname) {
    domainTabCount[oldHostname] = Math.max(0, (domainTabCount[oldHostname] || 1) - 1);

    // If domain change cleanup is enabled and no more tabs open for old domain
    if (domainTabCount[oldHostname] === 0) {
      delete domainTabCount[oldHostname];

      const settings = await getSettings();
      if (settings.enabled && settings.cleanOnDomainChange) {
        scheduleCleanup(oldHostname, settings.cleanupDelay);
      }
    }
  }

  // Track new domain
  if (newHostname) {
    tabMap[tabId] = newHostname;
    domainTabCount[newHostname] = (domainTabCount[newHostname] || 0) + 1;
  } else {
    delete tabMap[tabId];
  }

  await Promise.all([
    saveTabMap(tabMap),
    saveDomainTabCount(domainTabCount),
  ]);

  // Update badge for the active tab
  updateBadge(tabId);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  await ensureInitialized();

  const hostname = getHostname(tab.url || tab.pendingUrl);
  if (hostname) {
    tabMap[tab.id] = hostname;
    domainTabCount[hostname] = (domainTabCount[hostname] || 0) + 1;
    await Promise.all([
      saveTabMap(tabMap),
      saveDomainTabCount(domainTabCount),
    ]);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await ensureInitialized();

  const hostname = tabMap[tabId];
  if (!hostname) return;

  // Clean up tracking
  delete tabMap[tabId];
  domainTabCount[hostname] = Math.max(0, (domainTabCount[hostname] || 1) - 1);

  const noMoreTabs = domainTabCount[hostname] === 0;
  if (noMoreTabs) {
    delete domainTabCount[hostname];
  }

  await Promise.all([
    saveTabMap(tabMap),
    saveDomainTabCount(domainTabCount),
  ]);

  // If no more tabs for this domain, schedule cleanup
  if (noMoreTabs) {
    const settings = await getSettings();
    if (settings.enabled) {
      scheduleCleanup(hostname, settings.cleanupDelay);
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await ensureInitialized();
  updateBadge(activeInfo.tabId);
});

// ─── Cleanup Scheduling ──────────────────────────────────────────────────

function scheduleCleanup(hostname, delaySec) {
  if (delaySec <= 0) {
    // Immediate cleanup
    performCleanup(hostname);
    return;
  }

  // chrome.alarms minimum is 30 seconds; for shorter delays, use a
  // direct setTimeout (may not survive SW termination, but for 15s it's fine)
  if (delaySec < 30) {
    setTimeout(() => performCleanup(hostname), delaySec * 1000);
  } else {
    chrome.alarms.create(`cleanup:${hostname}`, {
      delayInMinutes: delaySec / 60,
    });
  }
}

async function performCleanup(hostname) {
  // Re-verify no tabs are still open for this domain
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (getHostname(tab.url) === hostname) {
      return; // Tab reopened during delay — abort
    }
    // Also check base domain match
    if (getBaseDomain(getHostname(tab.url)) === getBaseDomain(hostname)) {
      return;
    }
  }

  const result = await cleanDomain(hostname);

  if (result.deleted > 0) {
    const settings = await getSettings();
    if (settings.showNotifications) {
      showNotification(hostname, result.deleted);
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('cleanup:')) {
    const hostname = alarm.name.slice('cleanup:'.length);
    await performCleanup(hostname);
  }

  if (alarm.name === 'startup-clean') {
    await startupClean();
  }
});

// ─── Badge ───────────────────────────────────────────────────────────────

async function updateBadge(tabId) {
  const settings = await getSettings();

  if (!settings.enabled) {
    await chrome.action.setBadgeText({ text: 'OFF', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#666666', tabId });
    return;
  }

  if (!settings.showBadgeCount) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const hostname = getHostname(tab.url);

    if (!hostname) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const count = await countCookiesForHostname(hostname);
    const text = count > 99 ? '99+' : count > 0 ? String(count) : '';

    // Determine color based on list status
    const expressions = await getExpressions();
    const match = findMatchingExpression(hostname, expressions);

    let color = '#ef4444'; // red — unprotected
    if (match?.type === 'whitelist') color = '#22c55e'; // green
    if (match?.type === 'greylist') color = '#eab308'; // yellow

    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
  } catch {
    // Tab may have been closed
  }
}

// ─── Notifications ───────────────────────────────────────────────────────

function showNotification(domain, count) {
  chrome.notifications.create(`clean-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'AutoCrumb',
    message: `Deleted ${count} cookie${count !== 1 ? 's' : ''} for ${domain}`,
    silent: true,
  });
}

// ─── Context Menus ───────────────────────────────────────────────────────

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'autocrumb-whitelist',
      title: 'AutoCrumb: Whitelist this site',
      contexts: ['page', 'frame'],
    });

    chrome.contextMenus.create({
      id: 'autocrumb-greylist',
      title: 'AutoCrumb: Greylist this site',
      contexts: ['page', 'frame'],
    });

    chrome.contextMenus.create({
      id: 'autocrumb-whitelist-wildcard',
      title: 'AutoCrumb: Whitelist *.domain',
      contexts: ['page', 'frame'],
    });

    chrome.contextMenus.create({
      id: 'autocrumb-greylist-wildcard',
      title: 'AutoCrumb: Greylist *.domain',
      contexts: ['page', 'frame'],
    });

    chrome.contextMenus.create({
      id: 'autocrumb-sep',
      type: 'separator',
      contexts: ['page', 'frame'],
    });

    chrome.contextMenus.create({
      id: 'autocrumb-clean-now',
      title: 'AutoCrumb: Clean cookies now',
      contexts: ['page', 'frame'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const hostname = getHostname(info.pageUrl || tab?.url);
  if (!hostname) return;

  const baseDomain = getBaseDomain(hostname);

  switch (info.menuItemId) {
    case 'autocrumb-whitelist':
      await addExpression(hostname, 'whitelist');
      break;
    case 'autocrumb-greylist':
      await addExpression(hostname, 'greylist');
      break;
    case 'autocrumb-whitelist-wildcard':
      await addExpression('*.' + baseDomain, 'whitelist');
      break;
    case 'autocrumb-greylist-wildcard':
      await addExpression('*.' + baseDomain, 'greylist');
      break;
    case 'autocrumb-clean-now':
      const result = await manualCleanAll(false);
      if (result.deleted > 0) {
        showNotification('all sites', result.deleted);
      }
      break;
  }

  // Update badge after list change
  if (tab?.id) updateBadge(tab.id);
});

// ─── Keyboard Commands ───────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const hostname = getHostname(tab.url);

  switch (command) {
    case 'toggle-active': {
      const settings = await getSettings();
      await saveSettings({ enabled: !settings.enabled });
      updateBadge(tab.id);
      showNotification('AutoCrumb', settings.enabled ? 'Disabled' : 'Enabled');
      break;
    }
    case 'whitelist-current': {
      if (hostname) {
        await addExpression(hostname, 'whitelist');
        updateBadge(tab.id);
      }
      break;
    }
    case 'clean-now': {
      const result = await manualCleanAll(false);
      if (result.deleted > 0) {
        showNotification('all sites', result.deleted);
      }
      break;
    }
  }
});

// ─── Message Handler (popup / options communication) ─────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  await ensureInitialized();

  switch (message.action) {
    case 'getPopupData': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const hostname = tab ? getHostname(tab.url) : '';
      const baseDomain = hostname ? getBaseDomain(hostname) : '';
      const expressions = await getExpressions();
      const match = hostname ? findMatchingExpression(hostname, expressions) : null;
      const cookieCount = hostname ? await countCookiesForHostname(hostname) : 0;
      const settings = await getSettings();
      const suggestions = hostname ? getSuggestions(hostname) : [];

      return {
        hostname,
        baseDomain,
        cookieCount,
        listStatus: match?.type || 'none',
        matchedExpression: match?.pattern || null,
        suggestions,
        enabled: settings.enabled,
        settings,
      };
    }

    case 'addExpression': {
      await addExpression(message.pattern, message.type);
      // Update badge on active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) updateBadge(tab.id);
      return { success: true };
    }

    case 'removeExpression': {
      await removeExpression(message.pattern);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) updateBadge(tab.id);
      return { success: true };
    }

    case 'manualClean': {
      const result = await manualCleanAll(message.includeOpenTabs || false);
      return result;
    }

    case 'getSettings': {
      return await getSettings();
    }

    case 'saveSettings': {
      const saved = await saveSettings(message.settings);
      // Refresh context menus if toggled
      if (message.settings.enableContextMenus !== undefined) {
        if (message.settings.enableContextMenus) {
          setupContextMenus();
        } else {
          chrome.contextMenus.removeAll();
        }
      }
      return saved;
    }

    case 'getExpressions': {
      return await getExpressions();
    }

    case 'getStats': {
      return await getStats();
    }

    case 'getActivityLog': {
      return await getActivityLog();
    }

    case 'exportData': {
      return await exportData();
    }

    case 'importData': {
      return await importData(message.data);
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ─── Startup / Install ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  initialized = false;
  await ensureInitialized();
  setupContextMenus();

  if (details.reason === 'install') {
    // Open welcome page on first install
    chrome.tabs.create({ url: 'welcome/welcome.html' });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  initialized = false;
  await ensureInitialized();
  setupContextMenus();

  const settings = await getSettings();
  if (settings.cleanOnStartup) {
    // Small delay to let tabs load
    chrome.alarms.create('startup-clean', { delayInMinutes: 0.5 });
  }
});

async function startupClean() {
  const result = await manualCleanAll(false);
  if (result.deleted > 0) {
    showNotification('Startup cleanup', result.deleted);
    await addActivityLog({
      type: 'startup_clean',
      cookiesDeleted: result.deleted,
      domains: result.domains,
    });
  }
}
