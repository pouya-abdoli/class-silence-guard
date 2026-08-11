// offscreen.js
// Lives in the hidden offscreen document. Owns the AudioContext / AnalyserNode.
// Runs independently of whether the popup is open.

const SILENCE_THRESHOLD = 0.02;   // amplitude 0..1 — tune this, see README notes
const SILENCE_LIMIT_MS = 120000;  // 2 minutes
const WARNING_MS = 110000;        // fire a cancellable warning 10s before closing
const POLL_INTERVAL_MS = 100;     // 10Hz is plenty for silence detection

let audioContext = null;
let analyser = null;
let dataArray = null;
let pollTimer = null;
let monitoring = false;
let silenceStart = null;
let warned = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.streamId);
  } else if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(streamId) {
  try {
    // Stop any previous session first.
    stopCapture();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    // IMPORTANT: capturing the tab mutes it for the user unless we
    // reconnect the stream to the speakers ourselves. Without this,
    // the student would hear silence the moment monitoring starts.
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    dataArray = new Uint8Array(analyser.fftSize);
    monitoring = true;
    silenceStart = null;
    warned = false;

    // NOTE: requestAnimationFrame is throttled/paused on hidden pages
    // (offscreen documents are never "visible"), so we use setInterval
    // for the detection loop instead. High-frequency visual smoothing
    // happens client-side in the popup, which IS visible.
    pollTimer = setInterval(analyzeFrame, POLL_INTERVAL_MS);

    chrome.runtime.sendMessage({ type: 'CAPTURE_STARTED' }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'CAPTURE_ERROR', error: err.message }).catch(() => {});
  }
}

function stopCapture() {
  monitoring = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  silenceStart = null;
  warned = false;
}

function analyzeFrame() {
  if (!monitoring || !analyser) return;

  analyser.getByteTimeDomainData(dataArray);

  // Peak deviation from the 128 (silence) midpoint, normalized 0..1.
  let peak = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const dev = Math.abs(dataArray[i] - 128) / 128;
    if (dev > peak) peak = dev;
  }

  const now = Date.now();
  const isSilent = peak < SILENCE_THRESHOLD;

  if (isSilent) {
    if (silenceStart === null) silenceStart = now;
  } else {
    silenceStart = null;
    warned = false;
  }

  const silenceMs = silenceStart ? now - silenceStart : 0;

  chrome.runtime.sendMessage({
    type: 'AUDIO_STATE',
    level: peak,
    isSilent,
    silenceMs,
    timestamp: now
  }).catch(() => {}); // no listener (popup closed) — fine, ignore

  if (silenceMs >= WARNING_MS && !warned) {
    warned = true;
    chrome.runtime.sendMessage({ type: 'SILENCE_WARNING', silenceMs }).catch(() => {});
  }

  if (silenceMs >= SILENCE_LIMIT_MS) {
    chrome.runtime.sendMessage({ type: 'SILENCE_LIMIT_REACHED' }).catch(() => {});
    // Keep the loop running — background.js decides whether to actually
    // close things, and will send STOP_CAPTURE once it does (or if the
    // user cancels via the warning notification).
  }
}
