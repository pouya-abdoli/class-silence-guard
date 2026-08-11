// background.js (service worker)
// Owns: starting/stopping capture, the offscreen document lifecycle,
// notifications, and the actual "close Chrome" action.
// Does NOT touch the DOM or AudioContext — that's offscreen.js's job.

let monitoringTabId = null;
let latestState = { monitoring: false, level: 0, isSilent: true, silenceMs: 0, error: null };
let closing = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'START':
      handleStart(msg.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // keep the message channel open for the async response

    case 'STOP':
      handleStop();
      sendResponse({ ok: true });
      return false;

    case 'GET_STATUS':
      sendResponse(latestState);
      return false;

    // Broadcasts from offscreen.js. The popup also listens for these
    // directly (for the live waveform); background.js only needs them
    // to keep latestState fresh and to react to threshold events.
    case 'CAPTURE_STARTED':
      latestState = { monitoring: true, level: 0, isSilent: true, silenceMs: 0, error: null };
      break;

    case 'AUDIO_STATE':
      latestState = {
        monitoring: true,
        level: msg.level,
        isSilent: msg.isSilent,
        silenceMs: msg.silenceMs,
        error: null
      };
      break;

    case 'CAPTURE_ERROR':
      latestState = { monitoring: false, level: 0, isSilent: true, silenceMs: 0, error: msg.error };
      monitoringTabId = null;
      break;

    case 'SILENCE_WARNING':
      notifyWarning();
      break;

    case 'SILENCE_LIMIT_REACHED':
      closeChrome();
      break;
  }
});

// If Chrome offers a button to cancel the close, wire it up.
chrome.notifications.onButtonClicked.addListener((notifId) => {
  if (notifId === 'silence-warning') {
    // User is present — abort the shutdown and stop this monitoring session.
    // They can hit "Start Monitoring" again from the popup once the class resumes.
    handleStop();
    chrome.notifications.clear('silence-warning');
  }
});

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Analyze tab audio amplitude in real time to detect silence during a class session.'
  });
}

async function handleStart(tabId) {
  if (!tabId) throw new Error('No active tab to capture.');
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreenDocument();
  monitoringTabId = tabId;
  closing = false;
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_CAPTURE', streamId });
}

function handleStop() {
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_CAPTURE' }).catch(() => {});
  monitoringTabId = null;
  latestState = { monitoring: false, level: 0, isSilent: true, silenceMs: 0, error: null };
}

function notifyWarning() {
  chrome.notifications.create('silence-warning', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Silence detected',
    message: 'Chrome will close in ~10s if silence continues. Click Cancel to keep it open.',
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: 'Cancel — keep Chrome open' }]
  });
}

async function closeChrome() {
  if (closing) return; // avoid double-fire
  closing = true;

  chrome.notifications.create('closing', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Class Silence Guard',
    message: 'No sound for 2 minutes — closing Chrome now.'
  });

  handleStop();

  // There is no "quit the browser" API. Closing every window is the closest
  // equivalent, and on Windows/Linux it does terminate the Chrome process
  // (unless the user has "continue running background apps" enabled).
  // On macOS, closing all windows does NOT quit the app — see README notes.
  const wins = await chrome.windows.getAll();
  for (const w of wins) {
    try {
      await chrome.windows.remove(w.id);
    } catch (e) {
      // ignore individual failures and keep closing the rest
    }
  }
}
