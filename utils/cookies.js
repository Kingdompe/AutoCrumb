/**
 * Cookie manipulation utilities for AutoCrumb.
 * Handles cookie enumeration, deletion, and CHIPS partitioning.
 */

import { getExpressions, getSettings, incrementStats, addActivityLog } from './storage.js';
import { getBaseDomain, findMatchingExpression, getHostname } from './domain.js';

/**
 * Build the full URL needed by chrome.cookies.remove().
 * The cookies API requires an exact URL (scheme + domain + path).
 */
function buildCookieUrl(cookie) {
  const scheme = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${scheme}://${domain}${cookie.path}`;
}

/**
 * Delete a single cookie, handling CHIPS partitioning.
 */
async function deleteCookie(cookie) {
  const details = {
    url: buildCookieUrl(cookie),
    name: cookie.name,
  };

  if (cookie.partitionKey) {
    details.partitionKey = cookie.partitionKey;
  }

  if (cookie.storeId) {
    details.storeId = cookie.storeId;
  }

  try {
    await chrome.cookies.remove(details);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all cookies for a domain (including subdomains via dot-prefix).
 */
export async function getCookiesForDomain(domain) {
  if (!domain) return [];

  try {
    // Get cookies for the exact domain and all subdomains
    const cookies = await chrome.cookies.getAll({ domain });
    return cookies;
  } catch {
    return [];
  }
}

/**
 * Count cookies for a hostname (used for badge display).
 */
export async function countCookiesForHostname(hostname) {
  if (!hostname) return 0;
  const cookies = await getCookiesForDomain(hostname);
  return cookies.length;
}

/**
 * Delete all cookies for a domain, respecting per-cookie-name filters.
 * Returns the number of cookies deleted.
 */
export async function deleteAllCookiesForDomain(domain, cookieNameFilter = []) {
  const cookies = await getCookiesForDomain(domain);
  if (cookies.length === 0) return 0;

  let deleted = 0;

  for (const cookie of cookies) {
    // If there's a cookie name filter, only delete matching cookies
    if (cookieNameFilter.length > 0 && !cookieNameFilter.includes(cookie.name)) {
      continue;
    }

    if (await deleteCookie(cookie)) {
      deleted++;
    }
  }

  return deleted;
}

/**
 * Clean cookies for a domain after checking whitelist/greylist.
 * This is the main cleanup function called by the background service worker.
 * Returns { deleted: number, skipped: boolean, reason: string }
 */
export async function cleanDomain(domain) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { deleted: 0, skipped: true, reason: 'disabled' };
  }

  const expressions = await getExpressions();
  const match = findMatchingExpression(domain, expressions);

  if (match && match.type === 'whitelist') {
    return { deleted: 0, skipped: true, reason: 'whitelisted' };
  }

  if (match && match.type === 'greylist') {
    return { deleted: 0, skipped: true, reason: 'greylisted' };
  }

  // Delete cookies ONLY for the specific domain that was closed.
  // We must NOT clean the base domain (e.g., google.com) when a subdomain
  // (e.g., analytics.google.com) is closed, as that would break other open
  // subdomains like mail.google.com.
  const cookieNameFilter = match ? (match.cookieNames || []) : [];
  let totalDeleted = await deleteAllCookiesForDomain(domain, cookieNameFilter);

  // Clean site data if enabled
  if (totalDeleted > 0 && (settings.cleanLocalStorage || settings.cleanCache ||
      settings.cleanIndexedDB || settings.cleanServiceWorkers)) {
    await cleanSiteData(domain, settings);
  }

  // Update stats
  if (totalDeleted > 0) {
    await incrementStats(domain, totalDeleted);
    await addActivityLog({
      type: 'auto_clean',
      domain,
      cookiesDeleted: totalDeleted,
    });
  }

  return { deleted: totalDeleted, skipped: false, reason: 'cleaned' };
}

/**
 * Clean site data (localStorage, IndexedDB, cache, service workers) for a domain.
 */
async function cleanSiteData(domain, settings) {
  const dataToRemove = {};

  if (settings.cleanLocalStorage) dataToRemove.localStorage = true;
  if (settings.cleanIndexedDB) dataToRemove.indexedDB = true;
  if (settings.cleanCache) dataToRemove.cacheStorage = true;
  if (settings.cleanServiceWorkers) dataToRemove.serviceWorkers = true;

  if (Object.keys(dataToRemove).length === 0) return;

  try {
    await chrome.browsingData.remove(
      { origins: [`https://${domain}`, `http://${domain}`] },
      dataToRemove
    );
  } catch {
    // browsingData API can fail for some origins — ignore silently
  }
}

/**
 * Manual clean: delete cookies for all non-whitelisted domains.
 * Optionally include domains with open tabs.
 */
export async function manualCleanAll(includeOpenTabs = false) {
  const settings = await getSettings();
  const expressions = await getExpressions();

  // Get all cookies
  const allCookies = await chrome.cookies.getAll({});
  const domainCookies = new Map();

  // Group cookies by base domain
  for (const cookie of allCookies) {
    const domain = cookie.domain.startsWith('.')
      ? cookie.domain.slice(1)
      : cookie.domain;
    const base = getBaseDomain(domain);

    if (!domainCookies.has(base)) {
      domainCookies.set(base, []);
    }
    domainCookies.get(base).push(cookie);
  }

  // Get open tab domains
  let openDomains = new Set();
  if (!includeOpenTabs) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      const hostname = getHostname(tab.url);
      if (hostname) {
        openDomains.add(getBaseDomain(hostname));
      }
    }
  }

  let totalDeleted = 0;
  const cleanedDomains = [];

  for (const [baseDomain, cookies] of domainCookies) {
    // Skip whitelisted
    const match = findMatchingExpression(baseDomain, expressions);
    if (match && match.type === 'whitelist') continue;

    // Skip open tab domains unless includeOpenTabs
    if (!includeOpenTabs && openDomains.has(baseDomain)) continue;

    // Delete all cookies for this domain
    for (const cookie of cookies) {
      if (await deleteCookie(cookie)) {
        totalDeleted++;
      }
    }

    if (cookies.length > 0) {
      cleanedDomains.push(baseDomain);

      // Clean site data too
      if (settings.cleanLocalStorage || settings.cleanCache) {
        await cleanSiteData(baseDomain, settings);
      }
    }
  }

  if (totalDeleted > 0) {
    await incrementStats('_manual', totalDeleted);
    await addActivityLog({
      type: 'manual_clean',
      domains: cleanedDomains,
      cookiesDeleted: totalDeleted,
    });
  }

  return { deleted: totalDeleted, domains: cleanedDomains.length };
}
