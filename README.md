# Class Silence Guard

Detects silence in the current tab's audio and closes Chrome after 2 minutes
of continuous silence.

## Install (unpacked, for development/personal use)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select this folder (`class-silence-guard/`).
5. Pin the extension icon to your toolbar for quick access.

## Use

1. Open your class (Zoom web client, Google Meet, Teams, YouTube, etc.) in a tab.
2. Make sure that tab is the **active tab in the active window**.
3. Click the extension icon, then **Start Monitoring**.
4. Chrome will ask for the tab-capture permission the first time — allow it.
5. Leave the class running. You can close the popup; detection keeps
   running in the background. Reopen the popup anytime to check status.

## Testing without waiting a full 2 minutes

Temporarily lower `SILENCE_LIMIT_MS` and `WARNING_MS` in `offscreen.js`
(e.g. `10000` / `5000`) while testing, then set them back for real use.

To simulate audio states:
- **Silence:** play a tab with no audio, or pause a YouTube video.
- **Sound:** play any audio/video, or open
  `https://www.youtube.com/watch?v=` any music video and toggle pause/play
  to see the waveform react and the timer reset.
- **Threshold tuning:** background hum, fan noise, or a very quiet lecturer
  mic can sit right at the edge of `SILENCE_THRESHOLD` in `offscreen.js`
  (default `0.02`). If it's falsely detecting silence during quiet speech,
  lower the threshold; if it's never detecting silence during genuine
  silence (background noise/hiss), raise it slightly.

## Known pitfalls

- **"Closing Chrome" isn't a real API.** There's no `chrome.quit()`. This
  extension closes every open window via `chrome.windows.remove()`, which:
  - On **Windows/Linux**: this does terminate the Chrome process, *unless*
    the user has enabled "Continue running background apps when Chrome is
    closed" in Settings — check that if it doesn't fully quit.
  - On **macOS**: closing all windows does **not** quit the app (normal
    macOS behavior) — Chrome stays running in the Dock with no windows.
    There's no extension API to force-quit on macOS.
- **tabCapture requires a user gesture and the active tab.** You must click
  "Start Monitoring" while the class tab is focused/active — you can't
  start capture on a background tab, and you can't auto-start on page load
  without the user clicking something in the extension UI first.
- **Muting side effect:** capturing a tab's audio stream silences it for
  the user unless the stream is explicitly reconnected to
  `audioContext.destination`. This extension does that in `offscreen.js` —
  if you modify the audio graph, keep that connection or you'll go deaf
  mid-lecture.
- **One tab at a time.** This extension captures a single target tab per
  session. If you switch which tab is "the class," stop and restart
  monitoring on the new tab.
- **Offscreen documents and `requestAnimationFrame`:** hidden pages get
  their rAF throttled/paused by the browser. The detection loop uses
  `setInterval` for this reason — don't switch it to rAF or detection will
  stall when you're not looking at the popup.
- **Service worker can be evicted.** MV3 service workers can be killed
  after ~30s of inactivity and woken back up by events. This extension's
  background.js is event-driven (message listeners), so it wakes up
  correctly, but if you add polling logic to background.js directly
  (instead of offscreen.js), it will silently stop working when the worker
  sleeps.
- **False positives from browser/OS notification sounds** on other tabs
  won't affect this — tabCapture only captures the *target tab's* audio,
  not system-wide audio.
- **This will forcibly close all your windows/tabs**, including unrelated
  work in other windows. There's no way to close "only the browser" while
  leaving other apps open — that's just how `chrome.windows.remove` works.
  Consider it a blunt instrument; the built-in 10-second cancellable
  warning notification exists specifically to prevent this from happening
  mid-sentence if the professor is just pausing.

## File overview

| File            | Role                                                          |
|-----------------|-----------------------------------------------------------------|
| `manifest.json` | MV3 manifest, permissions                                     |
| `background.js` | Service worker — orchestration, notifications, closes windows |
| `offscreen.html`/`offscreen.js` | Hidden document doing the real AudioContext/AnalyserNode work |
| `popup.html`/`popup.css`/`popup.js` | Visible UI — waveform, timer, start/stop button |
