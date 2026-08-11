# 🛑 Class Silence Guard

> Automatically closes Chrome after 2 minutes of continuous silence in your online class tab.

---

## 📦 Install (Unpacked / Dev Mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Select this folder (`class-silence-guard/`)
5. 📌 Pin the extension to your toolbar for quick access

---

## 🚀 How to Use

1. Open your class tab (Zoom, Google Meet, Teams, YouTube, etc.)
2. Make sure it's the **active tab** in the active window
3. Click the extension icon → **Start Monitoring**
4. 🔔 Grant tab-capture permission when Chrome asks (first time only)
5. Sit back and relax — monitoring runs in the background 📊

> 💡 Reopen the popup anytime to check current status

---

## 🧪 Testing (Without Waiting 2 Minutes)

Temporarily lower these values in `offscreen.js`:

```js
SILENCE_LIMIT_MS = 10000  // 10 seconds
WARNING_MS = 5000         // 5 seconds
```

Then set them back to `120000` / `10000` for real use.

### 🎵 Simulating Audio States

| Action | Result |
|--------|--------|
| Pause a video / mute tab | ✅ Detects silence |
| Play music or video | 🔄 Resets timer |
| Quiet lecturer / background noise | ⚙️ Adjust `SILENCE_THRESHOLD` (default `0.02`) |

---

## ⚠️ Known Pitfalls

### 🚫 Chrome Can't Truly "Quit"

There's no `chrome.quit()` API. This extension closes all windows via `chrome.windows.remove()`:

| OS | Behavior |
|----|----------|
| 🪟 Windows / 🐧 Linux | Terminates Chrome process *(unless "Continue running background apps" is enabled)* |
| 🍎 macOS | App stays running in Dock (no windows) — normal macOS behavior |

### 🎤 Tab Must Be Active

- You must click **Start Monitoring** while the class tab is focused
- Can't auto-start or capture background tabs

### 🔇 Muting Side Effect

Capturing a tab's audio stream silences it *unless* reconnected. This extension **does** reconnect via `audioContext.destination` — so you'll still hear your class 🎧

### 📌 One Tab at a Time

Only captures a single target tab per session. Stop and restart on the new tab if you switch.

### 🔄 rAF Throttling

Hidden pages throttle `requestAnimationFrame`. This extension uses `setInterval` instead — don't switch to rAF or detection will stall!

### 💤 Service Worker Eviction

MV3 service workers can sleep after ~30s inactivity. This extension uses event-driven message listeners (not polling), so it wakes up correctly.

### 🔔 System Sounds Don't Interfere

tabCapture only captures the **target tab's audio**, not system-wide notifications.

### 💥 All Windows Close!

This forcibly closes **all** your Chrome windows — including unrelated work. The 10-second warning notification exists to prevent accidental closure mid-lecture.

---

## 📁 File Structure

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest & permissions |
| `background.js` | Service worker — orchestration, notifications, window closing |
| `offscreen.html` / `offscreen.js` | Hidden document doing AudioContext/AnalyserNode work |
| `popup.html` / `popup.css` / `popup.js` | Visible UI — waveform, timer, start/stop button |

---

## 🛠️ Customization Tips

- **Adjust sensitivity:** Modify `SILENCE_THRESHOLD` in `offscreen.js`
- **Change timeout:** Modify `SILENCE_LIMIT_MS` and `WARNING_MS`
- **Add logging:** Check service worker console for debugging

---

**Made with ❤️ for sleepy students everywhere**