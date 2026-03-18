# 🛡️ SlackGuard — Is Your Boss Watching?

A privacy-focused browser extension that audits your Slack workspace and shows a real-time warning banner telling you exactly whether your DMs and private messages can be read by admins.

---

## 🧐 How It Works

Slack's official documentation confirms that privacy varies wildly by plan:

- **Free/Pro plans:** Admins generally cannot export DMs without legal process or specific consent.
- **Business+ plans:** Admins have a self-serve "Corporate Export" tool for ALL messages, including DMs.
- **Enterprise Grid:** Full admin access to all messages is a standard feature.
- **Third-party apps:** Integration with archiving tools (e.g., Hanzo, Smarsh) can record everything silently.

**SlackGuard** detects your plan type and active settings by reading the metadata Slack already loads in your browser. It then displays a colour-coded warning:

- 🔴 **High Risk** — Corporate exports are active; admins can read your DMs right now.
- 🟡 **Medium Risk** — Message retention is active or exports are possible under specific conditions.
- 🟢 **Low Risk** — Standard privacy; export capabilities are strictly limited.

---

## ⌨️ Stealth Mode (The "Boss Key")

Screen sharing in a meeting? Use the built-in hotkey to instantly hide/show the banner so no one else sees your privacy status:

- **Windows/Linux:** `Alt + Shift + H`
- **macOS:** `Cmd + Shift + H`

---

## 🛠️ Installation

### Chrome / Edge / Brave
1. Download this repository and unzip the folder.
2. Go to `chrome://extensions`.
3. Enable **Developer Mode** (top right toggle).
4. Click **Load unpacked** and select the `slackguard-extension` folder.

### Firefox
1. Go to `about:debugging` → **This Firefox**.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file from the project folder.

---

## 🔒 Privacy Guarantee

SlackGuard is built on the principle of absolute local privacy:

- **Zero Data Exfiltration:** No data is ever sent to a server.
- **No Message Reading:** The tool reads workspace *settings*, never your *message content*.
- **No Accounts:** No login, no tracking, no cookies.

Everything runs 100% locally in your browser.

---

## 📜 Privacy Policy

[Read our full privacy policy](https://github.com/obakerein/slackguard/blob/main/privacy-policy.md)

---

**Disclaimer:** SlackGuard is an educational tool provided "as-is." It interprets publicly available workspace settings. Always consult your company's official IT policies for the most accurate information. Not affiliated with Slack Technologies.
