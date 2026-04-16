# AutoCrumb — Chrome Web Store Listing

## Name
AutoCrumb — Auto Delete Cookies on Tab Close

## Short Description (132 chars max)
Automatically delete cookies when you close tabs. Whitelist sites you trust. Privacy made simple. Free & unlimited.

## Detailed Description

**AutoCrumb automatically deletes cookies when you close a tab — so trackers don't follow you across the web.**

Built as a modern, Manifest V3 replacement for Cookie AutoDelete. No limits, no paywalls, no compromise.

### How it works

1. Browse normally — while a tab is open, its cookies are safe
2. Close a tab — AutoCrumb waits 15 seconds (configurable), then checks if any other tab uses the same domain
3. If no tab is open and the domain isn't whitelisted → cookies are deleted automatically

### Core Features

- **Unlimited whitelist** — protect cookies for sites you trust (Gmail, GitHub, banking). No slot limits, ever.
- **Greylist** — temporary protection for shopping or banking sessions, cleaned on browser restart
- **Wildcard rules** — `*.google.com` covers Gmail, Drive, YouTube, and all Google services in one rule
- **Cookie count badge** — see how many cookies each site has at a glance
- **Color-coded icon** — green (whitelisted), yellow (greylisted), red (unprotected)
- **Right-click menu** — whitelist or greylist any page in two clicks
- **Manual clean** — one-click cleanup of all non-whitelisted cookies
- **Activity log** — see exactly what was deleted and when
- **Import from Cookie AutoDelete** — migrate your existing rules in seconds
- **Cloud sync** — your rules sync automatically across all your Chrome devices
- **Keyboard shortcuts** — Alt+Shift+C (toggle), Alt+Shift+W (whitelist), Alt+Shift+X (clean)

### Advanced Options

- Configurable cleanup delay (0-3600 seconds)
- Clean on domain change within a tab
- Clean on browser startup
- Optional: clean LocalStorage, IndexedDB, Cache, Service Workers
- Full import/export of rules and settings
- Statistics dashboard

### Privacy First

AutoCrumb is 100% local. No external servers, no analytics, no data collection. Your browsing data never leaves your machine. We only need cookies and tabs permissions to do our job.

### Why AutoCrumb?

Cookie AutoDelete was the gold standard for cookie management — until Chrome's Manifest V3 migration killed it. The developer never updated it, and 200,000+ users were left without protection.

AutoCrumb picks up where CAD left off: same core concept, built from scratch for Manifest V3, with a modern UI and features CAD users always requested (cloud sync, keyboard shortcuts, wildcard rules).

**Free. Unlimited. No account required.**

---

## Category
Productivity

## Language
English

## Single Purpose Description
AutoCrumb automatically deletes browser cookies for websites when the user closes all tabs for that website, unless the user has added the website to their whitelist or greylist.

## Permission Justifications

### cookies
Required to read and delete cookies for websites when their tabs are closed. This is the core functionality of the extension.

### tabs
Required to track which websites are open in tabs, so we know when to delete cookies (only after all tabs for a domain are closed). Also needed to display the correct cookie count badge for the active tab.

### storage
Required to save user preferences (whitelist, greylist, settings) and sync them across Chrome devices using chrome.storage.sync.

### alarms
Required to schedule delayed cookie cleanup after a tab is closed (default 15 seconds), giving users time to reopen accidentally closed tabs before cookies are deleted.

### contextMenus
Required to add "Whitelist this site" and "Greylist this site" options to the right-click context menu for quick access.

### notifications
Required to show a brief notification after automatic cookie cleanup, so users know how many cookies were deleted and for which domain.

### browsingData
Required for optional advanced cleanup features: clearing localStorage, IndexedDB, Cache, and Service Workers for cleaned domains (disabled by default, user must opt in).

### host_permissions: <all_urls>
AutoCrumb needs host permission for all URLs because it must be able to read and delete cookies for ANY website the user visits. Cookie management requires matching the cookie's domain, and since users browse arbitrary websites, we cannot pre-specify which domains to support. We do NOT read page content, inject scripts, or modify web pages — we only interact with the cookies API.

## Screenshots needed
1. Popup showing current site with cookie count and whitelist/greylist buttons
2. Options page — Rules tab with expression list
3. Options page — Settings tab with toggle switches
4. Welcome page — onboarding wizard step 1
5. Context menu showing right-click whitelist options

## Promotional images
- Small promo tile: 440x280
- Marquee promo tile: 1400x560
