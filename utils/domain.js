/**
 * Domain matching utilities for AutoCrumb.
 * Handles eTLD+1 extraction, wildcard matching, and domain normalization.
 */

// Common two-part TLDs (co.uk, com.au, etc.)
const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'edu.au',
  'co.nz', 'net.nz', 'org.nz',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'co.kr', 'or.kr', 'ne.kr',
  'com.br', 'net.br', 'org.br',
  'com.cn', 'net.cn', 'org.cn',
  'co.in', 'net.in', 'org.in',
  'com.mx', 'org.mx', 'net.mx',
  'co.za', 'org.za', 'net.za',
  'com.ar', 'net.ar', 'org.ar',
  'co.il', 'org.il', 'net.il',
  'com.tr', 'org.tr', 'net.tr',
  'co.th', 'or.th', 'in.th',
  'com.sg', 'org.sg', 'net.sg',
  'com.hk', 'org.hk', 'net.hk',
  'co.id', 'or.id', 'web.id',
  'com.my', 'org.my', 'net.my',
  'com.ph', 'org.ph', 'net.ph',
  'com.tw', 'org.tw', 'net.tw',
  'com.ua', 'org.ua', 'net.ua',
  'com.pl', 'org.pl', 'net.pl',
  'co.de', 'com.de',
  'com.fr', 'org.fr', 'net.fr',
  'co.it', 'org.it',
  'com.es', 'org.es', 'nom.es',
  'com.pt', 'org.pt', 'net.pt',
  'com.ru', 'org.ru', 'net.ru',
  'co.ke', 'or.ke',
  'co.tz', 'or.tz',
  'co.ug',
  'com.ng', 'org.ng', 'net.ng',
  'com.eg', 'org.eg', 'net.eg',
  'github.io', 'herokuapp.com', 'vercel.app', 'netlify.app',
  'pages.dev', 'web.app', 'firebaseapp.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
]);

/**
 * Extract the base domain (eTLD+1) from a hostname.
 * Examples:
 *   "mail.google.com" → "google.com"
 *   "foo.bar.co.uk" → "bar.co.uk"
 *   "localhost" → "localhost"
 *   "192.168.1.1" → "192.168.1.1"
 */
export function getBaseDomain(hostname) {
  if (!hostname) return '';

  // Remove trailing dot
  hostname = hostname.replace(/\.$/, '').toLowerCase();

  // IP addresses — return as-is
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    return hostname;
  }

  // localhost
  if (hostname === 'localhost' || !hostname.includes('.')) {
    return hostname;
  }

  const parts = hostname.split('.');

  // Check for multi-part TLDs
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(lastTwo)) {
      return parts.slice(-3).join('.');
    }
  }

  // Standard: return last two parts
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return hostname;
}

/**
 * Extract hostname from a URL string.
 * Returns empty string for chrome://, about:, etc.
 */
export function getHostname(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:' ||
        parsed.protocol === 'about:' || parsed.protocol === 'edge:') {
      return '';
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Check if a domain matches an expression.
 * Supports:
 *   - Exact match: "github.com" matches "github.com"
 *   - Wildcard subdomain: "*.github.com" matches "foo.github.com", "bar.foo.github.com"
 *   - Dot-prefixed (cookie style): ".github.com" treated as "*.github.com"
 */
export function domainMatchesExpression(domain, expression) {
  if (!domain || !expression) return false;

  domain = domain.toLowerCase().replace(/\.$/, '');
  expression = expression.toLowerCase().replace(/\.$/, '');

  // Exact match
  if (domain === expression) return true;

  // Dot-prefix → wildcard
  if (expression.startsWith('.')) {
    expression = '*' + expression;
  }

  // Wildcard match: *.example.com
  if (expression.startsWith('*.')) {
    const suffix = expression.slice(2);
    // Match the suffix itself and any subdomain
    return domain === suffix || domain.endsWith('.' + suffix);
  }

  return false;
}

/**
 * Find the first matching expression from a list for a given domain.
 * Returns the expression object or null.
 */
export function findMatchingExpression(domain, expressions) {
  if (!domain || !expressions || expressions.length === 0) return null;

  // Try exact match first (higher priority)
  for (const expr of expressions) {
    if (domain === expr.pattern.toLowerCase()) return expr;
  }

  // Then wildcard matches
  for (const expr of expressions) {
    if (expr.pattern.startsWith('*.') || expr.pattern.startsWith('.')) {
      if (domainMatchesExpression(domain, expr.pattern)) return expr;
    }
  }

  return null;
}

/**
 * Generate expression suggestions for a hostname.
 * e.g., "mail.google.com" → ["mail.google.com", "*.google.com"]
 */
export function getSuggestions(hostname) {
  if (!hostname) return [];

  const base = getBaseDomain(hostname);
  const suggestions = [hostname];

  if (hostname !== base) {
    suggestions.push('*.' + base);
  }

  return suggestions;
}
