# Wox Firefox extension

After installing this Firefox add-on, you can search opened tabs and switch to them from [Wox](https://github.com/Wox-launcher/Wox).

This add-on uses the same WebSocket protocol as [Wox.Chrome.Extension](https://github.com/Wox-launcher/Wox.Chrome.Extension), so it works with the existing Wox `browser` system plugin.

# Install

## 1. Temporary add-on (development)

1. Build this repository (`npm install && npm run build`) or download a release zip and unzip it.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `manifest.json` inside the unzipped / `dist` folder.

Temporary add-ons are removed when Firefox restarts.

## 2. From a release zip

1. Download the latest `wox-firefox-extension.zip` from [Releases](https://github.com/Wox-launcher/Wox.Firefox.Extension/releases).
2. Unzip it.
3. Load it as a temporary add-on (see above), or sign it through [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) for a permanent install.

# Usage

1. Install and run [Wox](https://github.com/Wox-launcher/Wox).
2. Install this add-on and confirm the popup shows `Connected: yes`.
3. In Wox, type `browser` plus part of a tab title or URL, then press Enter to switch to that tab.

The default WebSocket port is `34988`. If you change the port in Wox plugin settings, set the same value in this add-on's popup.
