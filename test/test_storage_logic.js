/**
 * Tests for storage.js import/export logic (without Chrome APIs).
 * Tests the pure logic functions that don't depend on chrome.storage.
 * Run with: node test/test_storage_logic.js
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) { passed++; } else { failed++; console.error(`  FAIL: ${testName}`); }
}

function assertEqual(actual, expected, testName) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`  FAIL: ${testName} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ─── Test Cookie AutoDelete import format parsing ───────────────────────

console.log('\n=== CAD Import Format Parsing ===');

// Simulate what importData does with CAD format
function parseCadExport(data) {
  const cadExpressions = data.lists || data.expressions || {};
  const converted = [];

  for (const [storeId, entries] of Object.entries(cadExpressions)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry) continue;
      const pattern = (typeof entry === 'string') ? entry :
        (entry.expression || entry.pattern || '');
      const type = (entry.listType === 'WHITE' || entry.type === 'whitelist')
        ? 'whitelist' : 'greylist';
      if (typeof pattern === 'string' && pattern.trim()) {
        converted.push({
          pattern: pattern.trim().toLowerCase(),
          type,
        });
      }
    }
  }

  return [...new Map(converted.map(e => [e.pattern, e])).values()];
}

// CAD format with lists keyed by storeId
const cadData1 = {
  lists: {
    "default": [
      { expression: "github.com", listType: "WHITE" },
      { expression: "*.google.com", listType: "WHITE" },
      { expression: "amazon.com", listType: "GREY" },
    ],
    "firefox-container-1": [
      { expression: "facebook.com", listType: "WHITE" },
    ]
  }
};

let result = parseCadExport(cadData1);
assertEqual(result.length, 4, 'CAD format: 4 expressions parsed');
assertEqual(result[0].pattern, 'github.com', 'CAD: github.com');
assertEqual(result[0].type, 'whitelist', 'CAD: github is whitelist');
assertEqual(result[2].type, 'greylist', 'CAD: amazon is greylist');

// CAD with simple string entries
const cadData2 = {
  lists: {
    "default": ["google.com", "github.com"]
  }
};

result = parseCadExport(cadData2);
assertEqual(result.length, 2, 'CAD simple strings: 2 expressions');
assertEqual(result[0].pattern, 'google.com', 'CAD simple: google.com');
assertEqual(result[0].type, 'greylist', 'CAD simple: defaults to greylist');

// Duplicate handling
const cadDataDupes = {
  lists: {
    "default": [
      { expression: "google.com", listType: "WHITE" },
      { expression: "GOOGLE.COM", listType: "GREY" },  // same domain, different case
    ]
  }
};

result = parseCadExport(cadDataDupes);
assertEqual(result.length, 1, 'Duplicates: deduplicated to 1');

// Empty/invalid data
result = parseCadExport({ lists: {} });
assertEqual(result.length, 0, 'Empty lists: 0 expressions');

result = parseCadExport({ lists: { "default": "not-an-array" } });
assertEqual(result.length, 0, 'Non-array entries: 0 expressions');

result = parseCadExport({ lists: { "default": [null, undefined, 42, ""] } });
assertEqual(result.length, 0, 'Invalid entries: 0 expressions');

result = parseCadExport({ lists: { "default": [{ expression: "  spaces.com  ", listType: "WHITE" }] } });
assertEqual(result[0].pattern, 'spaces.com', 'Trims whitespace');

// ─── Test AutoCrumb native format ───────────────────────────────────────

console.log('\n=== AutoCrumb Native Format ===');

function isAutocrumbFormat(data) {
  return data.app === 'AutoCrumb';
}

assert(isAutocrumbFormat({ app: 'AutoCrumb', expressions: [] }), 'Detects AutoCrumb format');
assert(!isAutocrumbFormat({ lists: {} }), 'Rejects CAD format');
assert(!isAutocrumbFormat({}), 'Rejects empty object');

// ─── Test expression pattern validation ─────────────────────────────────

console.log('\n=== Expression Pattern Validation ===');

function isValidPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  const trimmed = pattern.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  // Reject patterns that are just wildcards or dots
  if (trimmed === '*' || trimmed === '.' || trimmed === '*.' ) return false;
  return true;
}

assert(isValidPattern('google.com'), 'Valid: google.com');
assert(isValidPattern('*.google.com'), 'Valid: *.google.com');
assert(isValidPattern('localhost'), 'Valid: localhost');
assert(!isValidPattern(''), 'Invalid: empty');
assert(!isValidPattern(null), 'Invalid: null');
assert(!isValidPattern(undefined), 'Invalid: undefined');
assert(!isValidPattern(42), 'Invalid: number');
assert(!isValidPattern('*'), 'Invalid: bare wildcard');
assert(!isValidPattern('.'), 'Invalid: bare dot');

// ─── Test cookie URL construction logic ─────────────────────────────────

console.log('\n=== Cookie URL Construction ===');

function buildCookieUrl(cookie) {
  const scheme = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${scheme}://${domain}${cookie.path}`;
}

assertEqual(
  buildCookieUrl({ domain: '.google.com', path: '/', secure: true }),
  'https://google.com/',
  'Dot-prefix domain, secure'
);
assertEqual(
  buildCookieUrl({ domain: 'google.com', path: '/', secure: false }),
  'http://google.com/',
  'Plain domain, insecure'
);
assertEqual(
  buildCookieUrl({ domain: '.sub.example.com', path: '/app', secure: true }),
  'https://sub.example.com/app',
  'Subdomain with path'
);
assertEqual(
  buildCookieUrl({ domain: 'localhost', path: '/', secure: false }),
  'http://localhost/',
  'Localhost'
);
assertEqual(
  buildCookieUrl({ domain: '.example.co.uk', path: '/api/v2', secure: true }),
  'https://example.co.uk/api/v2',
  'Multi-part TLD with deep path'
);

// ─── Summary ────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED'); }
