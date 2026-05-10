"""Cross-platform Chrome launcher with CDP debugging port."""
import os
import subprocess
import sys


def find_chrome() -> str | None:
    """Find the Chrome executable path."""
    if sys.platform == 'win32':
        candidates = [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
        ]
    elif sys.platform == 'darwin':
        candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ]
    else:
        candidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
        ]

    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        print("ERROR: Chrome not found. Please install Google Chrome.")
        sys.exit(1)

    print(f"Found Chrome: {chrome}")
    print("Starting Chrome with --remote-debugging-port=9222 ...")
    print("Verify at http://localhost:9222/json/version")
    print()

    subprocess.Popen([chrome, '--remote-debugging-port=9222'])


if __name__ == '__main__':
    main()
