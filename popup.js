// popup.js
// Pure viewer/controller. Never touches audio directly — only reflects
// state broadcast by offscreen.js / background.js. Safe to close anytime.

const SILENCE_LIMIT_MS = 120000;

const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const silenceTimeEl = document.getElementById('silenceTime');
const progressBar = document.getElementById('progressBar');
const toggleBtn = document.getElementById('toggleBtn');
const errorMsg = document.getElementById('errorMsg');

let monitoring = false;
let isSilent = true;
let silenceMs = 0;

// The offscreen document only sends amplitude ~10x/sec (see offscreen.js
// comments on why). We smooth toward that target at 60fps locally so the
// waveform still looks fluid instead of choppy.
let targetLevel = 0;
let displayLevel = 0;
let waveformPhase = 0;
let rafId = null;

init();

async function init() {
  const status = await sendToBackground({ type: 'GET_STATUS' });
  applyStatus(status);
  startRenderLoop();
}

toggleBtn.addEventListener('click', async () => {
  errorMsg.textContent = '';
  if (monitoring) {
    await sendToBackground({ type: 'STOP' });
    applyStatus({ monitoring: false, level: 0, isSilent: true, silenceMs: 0, error: null });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      errorMsg.textContent = 'No active tab found.';
      return;
    }
    const res = await sendToBackground({ type: 'START', tabId: tab.id });
    if (!res || !res.ok) {
      errorMsg.textContent = (res && res.error) || 'Could not start capture.';
      return;
    }
    monitoring = true;
    updateStaticUI();
  }
});

// Live updates broadcast from offscreen.js (relayed as plain runtime
// messages, so the popup hears them directly whenever it's open).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUDIO_STATE') {
    monitoring = true;
    isSilent = msg.isSilent;
    silenceMs = msg.silenceMs;
    targetLevel = msg.level;
    updateStaticUI();
  } else if (msg.type === 'CAPTURE_ERROR') {
    monitoring = false;
    errorMsg.textContent = 'Capture error: ' + msg.error;
    updateStaticUI();
  } else if (msg.type === 'CAPTURE_STARTED') {
    monitoring = true;
    errorMsg.textContent = '';
    updateStaticUI();
  }
});

function applyStatus(status) {
  monitoring = !!status.monitoring;
  isSilent = status.isSilent !== false;
  silenceMs = status.silenceMs || 0;
  targetLevel = status.level || 0;
  if (status.error) errorMsg.textContent = 'Capture error: ' + status.error;
  updateStaticUI();
}

function updateStaticUI() {
  toggleBtn.textContent = monitoring ? 'Stop Monitoring' : 'Start Monitoring';
  toggleBtn.className = 'btn ' + (monitoring ? 'btn-stop' : 'btn-start');

  if (!monitoring) {
    statusDot.className = 'dot dot-off';
    statusText.textContent = 'Not monitoring';
  } else if (isSilent) {
    statusDot.className = 'dot dot-silence';
    statusText.textContent = '🔇 Silence';
  } else {
    statusDot.className = 'dot dot-sound';
    statusText.textContent = '🔊 Sound Detected';
  }

  const seconds = Math.min(120, Math.floor(silenceMs / 1000));
  silenceTimeEl.textContent = seconds;

  const pct = Math.min(100, (silenceMs / SILENCE_LIMIT_MS) * 100);
  progressBar.style.width = pct + '%';

  let color = '#38bd94'; // green
  if (pct >= 80) color = '#e2543c'; // red
  else if (pct >= 40) color = '#e2b53c'; // yellow
  progressBar.style.backgroundColor = color;
}

function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

function startRenderLoop() {
  const width = canvas.width;
  const height = canvas.height;
  const midY = height / 2;

  function frame() {
    // Ease the displayed level toward the latest real sample.
    displayLevel += (targetLevel - displayLevel) * 0.25;
    if (monitoring && !isSilent) {
      waveformPhase += 0.25;
    }

    ctx.clearRect(0, 0, width, height);

    if (!monitoring || isSilent || displayLevel < 0.01) {
      // Flat line — required visual for silence.
      ctx.strokeStyle = '#4a5160';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
    } else {
      // Pseudo-oscilloscope: real amplitude drives height, phase drives motion.
      const amp = Math.min(1, displayLevel * 2.2) * (height / 2 - 6);
      ctx.strokeStyle = '#38bd94';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const t = x / width;
        const y =
          midY +
          Math.sin(t * Math.PI * 6 + waveformPhase) * amp * 0.6 +
          Math.sin(t * Math.PI * 13 + waveformPhase * 1.7) * amp * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
}
