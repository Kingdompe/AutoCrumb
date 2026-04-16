/**
 * Comprehensive tests for domain.js utilities.
 * Run with: node test/test_domain.js
 */

import { getBaseDomain, getHostname, domainMatchesExpression, findMatchingExpression, getSuggestions } from '../utils/domain.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${testName}`);
  }
}

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${testName} — expected "${expected}", got "${actual}"`);
  }
}

// ─── getBaseDomain ──────────────────────────────────────────────────────

console.log('\n=== getBaseDomain ===');

// Standard domains
assertEqual(getBaseDomain('google.com'), 'google.com', 'simple domain');
assertEqual(getBaseDomain('mail.google.com'), 'google.com', 'subdomain');
assertEqual(getBaseDomain('deep.nested.mail.google.com'), 'google.com', 'deep subdomain');
assertEqual(getBaseDomain('example.org'), 'example.org', 'org TLD');

// Multi-part TLDs
assertEqual(getBaseDomain('bbc.co.uk'), 'bbc.co.uk', 'co.uk');
assertEqual(getBaseDomain('mail.bbc.co.uk'), 'bbc.co.uk', 'subdomain co.uk');
assertEqual(getBaseDomain('foo.com.au'), 'foo.com.au', 'com.au');
assertEqual(getBaseDomain('bar.foo.com.au'), 'foo.com.au', 'subdomain com.au');
assertEqual(getBaseDomain('example.co.jp'), 'example.co.jp', 'co.jp');

// Edge cases
assertEqual(getBaseDomain('localhost'), 'localhost', 'localhost');
assertEqual(getBaseDomain('myserver'), 'myserver', 'single label');
assertEqual(getBaseDomain(''), '', 'empty string');
assertEqual(getBaseDomain(null), '', 'null');
assertEqual(getBaseDomain(undefined), '', 'undefined');

// IP addresses
assertEqual(getBaseDomain('192.168.1.1'), '192.168.1.1', 'IPv4');
assertEqual(getBaseDomain('10.0.0.1'), '10.0.0.1', 'private IPv4');
assertEqual(getBaseDomain('::1'), '::1', 'IPv6 loopback');
assertEqual(getBaseDomain('[2001:db8::1]'), '[2001:db8::1]', 'IPv6 bracketed');

// Trailing dot
assertEqual(getBaseDomain('google.com.'), 'google.com', 'trailing dot');

// Case insensitivity
assertEqual(getBaseDomain('GOOGLE.COM'), 'google.com', 'uppercase');
assertEqual(getBaseDomain('Mail.Google.Com'), 'google.com', 'mixed case');

// Platform domains (in MULTI_PART_TLDS)
assertEqual(getBaseDomain('myapp.github.io'), 'myapp.github.io', 'github.io');
assertEqual(getBaseDomain('sub.myapp.github.io'), 'myapp.github.io', 'subdomain github.io');
assertEqual(getBaseDomain('myapp.herokuapp.com'), 'myapp.herokuapp.com', 'herokuapp.com');
assertEqual(getBaseDomain('myapp.vercel.app'), 'myapp.vercel.app', 'vercel.app');

// ─── getHostname ────────────────────────────────────────────────────────

console.log('\n=== getHostname ===');

assertEqual(getHostname('https://www.google.com/search?q=test'), 'www.google.com', 'full URL');
assertEqual(getHostname('http://localhost:3000/api'), 'localhost', 'localhost with port');
assertEqual(getHostname('https://192.168.1.1:8080'), '192.168.1.1', 'IP with port');
assertEqual(getHostname('chrome://extensions'), '', 'chrome:// URL');
assertEqual(getHostname('chrome-extension://abc123/popup.html'), '', 'chrome-extension:// URL');
assertEqual(getHostname('about:blank'), '', 'about:blank');
assertEqual(getHostname('edge://settings'), '', 'edge:// URL');
assertEqual(getHostname(''), '', 'empty string');
assertEqual(getHostname(null), '', 'null');
assertEqual(getHostname(undefined), '', 'undefined');
assertEqual(getHostname('not-a-url'), '', 'invalid URL');
assertEqual(getHostname('file:///home/user/test.html'), '', 'file:// URL');
assertEqual(getHostname('https://example.com'), 'example.com', 'https no path');
assertEqual(getHostname('http://example.com:80'), 'example.com', 'http with port 80');

// ─── domainMatchesExpression ────────────────────────────────────────────

console.log('\n=== domainMatchesExpression ===');

// Exact match
assert(domainMatchesExpression('google.com', 'google.com'), 'exact match');
assert(!domainMatchesExpression('mail.google.com', 'google.com'), 'subdomain != exact');
assert(!domainMatchesExpression('google.com', 'mail.google.com'), 'exact != subdomain');

// Wildcard match
assert(domainMatchesExpression('mail.google.com', '*.google.com'), 'wildcard subdomain');
assert(domainMatchesExpression('deep.mail.google.com', '*.google.com'), 'wildcard deep subdomain');
assert(domainMatchesExpression('google.com', '*.google.com'), 'wildcard matches base');
assert(!domainMatchesExpression('evil-google.com', '*.google.com'), 'no false positive: evil-google.com');
assert(!domainMatchesExpression('notgoogle.com', '*.google.com'), 'no false positive: notgoogle.com');
assert(!domainMatchesExpression('google.com.evil.com', '*.google.com'), 'no false positive: suffix attack');

// Dot-prefix (cookie style)
assert(domainMatchesExpression('mail.google.com', '.google.com'), 'dot-prefix subdomain');
assert(domainMatchesExpression('google.com', '.google.com'), 'dot-prefix base');

// Case insensitivity
assert(domainMatchesExpression('MAIL.GOOGLE.COM', '*.google.com'), 'wildcard case insensitive');
assert(domainMatchesExpression('mail.google.com', '*.GOOGLE.COM'), 'wildcard case insensitive expr');

// Edge cases
assert(!domainMatchesExpression('', '*.google.com'), 'empty domain');
assert(!domainMatchesExpression('google.com', ''), 'empty expression');
assert(!domainMatchesExpression(null, '*.google.com'), 'null domain');
assert(!domainMatchesExpression('google.com', null), 'null expression');

// ─── findMatchingExpression ─────────────────────────────────────────────

console.log('\n=== findMatchingExpression ===');

const expressions = [
  { pattern: 'mail.google.com', type: 'whitelist' },
  { pattern: '*.github.com', type: 'whitelist' },
  { pattern: '*.amazon.com', type: 'greylist' },
  { pattern: 'example.com', type: 'greylist' },
];

// Exact match takes priority
let match = findMatchingExpression('mail.google.com', expressions);
assertEqual(match?.pattern, 'mail.google.com', 'exact match priority');
assertEqual(match?.type, 'whitelist', 'exact match type');

// Wildcard match
match = findMatchingExpression('api.github.com', expressions);
assertEqual(match?.pattern, '*.github.com', 'wildcard match');

// No match
match = findMatchingExpression('evil.com', expressions);
assertEqual(match, null, 'no match returns null');

// Empty inputs
match = findMatchingExpression('', expressions);
assertEqual(match, null, 'empty domain');
match = findMatchingExpression('google.com', []);
assertEqual(match, null, 'empty expressions');
match = findMatchingExpression('google.com', null);
assertEqual(match, null, 'null expressions');

// ─── getSuggestions ─────────────────────────────────────────────────────

console.log('\n=== getSuggestions ===');

let suggestions = getSuggestions('mail.google.com');
assertEqual(suggestions.length, 2, 'subdomain gives 2 suggestions');
assertEqual(suggestions[0], 'mail.google.com', 'first is exact');
assertEqual(suggestions[1], '*.google.com', 'second is wildcard');

suggestions = getSuggestions('google.com');
assertEqual(suggestions.length, 1, 'base domain gives 1 suggestion');
assertEqual(suggestions[0], 'google.com', 'just the domain');

suggestions = getSuggestions('localhost');
assertEqual(suggestions.length, 1, 'localhost gives 1 suggestion');

suggestions = getSuggestions('');
assertEqual(suggestions.length, 0, 'empty gives 0 suggestions');

// ─── Summary ────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
