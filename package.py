#!/usr/bin/env python3
"""
Package AutoCrumb extension for Chrome Web Store submission.
Creates a .zip with only the files needed for distribution.
"""

import zipfile
import os
import sys

EXTENSION_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_NAME = "autocrumb-v1.0.0.zip"

# Allowlist of files to include
INCLUDE = [
    "manifest.json",
    "background.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "options/options.html",
    "options/options.css",
    "options/options.js",
    "welcome/welcome.html",
    "welcome/welcome.css",
    "welcome/welcome.js",
    "utils/domain.js",
    "utils/storage.js",
    "utils/cookies.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "_locales/en/messages.json",
]

def package():
    output_path = os.path.join(EXTENSION_DIR, OUTPUT_NAME)

    if os.path.exists(output_path):
        os.remove(output_path)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for rel_path in INCLUDE:
            full_path = os.path.join(EXTENSION_DIR, rel_path)
            if not os.path.exists(full_path):
                print(f"  WARNING: Missing file: {rel_path}")
                continue
            zf.write(full_path, rel_path)
            print(f"  + {rel_path}")

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nPackaged: {OUTPUT_NAME} ({size_kb:.1f} KB)")
    print(f"Files included: {len(INCLUDE)}")

if __name__ == "__main__":
    package()
