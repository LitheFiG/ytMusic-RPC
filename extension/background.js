const HTTP_SERVER_URL = 'http://127.0.0.1:8766';

let isConnected = false;
let currentMusicInfo = null;
let reconnectTimeout = null;

async function connect() {
  if (isConnected) return;

  try {
    const response = await fetch(`${HTTP_SERVER_URL}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });

    if (response.ok) {
      console.log('[YTM-RPC] Connected to Vencord plugin');
      isConnected = true;
      broadcastStatus();

      if (currentMusicInfo) {
        sendUpdate(currentMusicInfo);
      }
      return;
    }
  } catch (e) {
    console.log('[YTM-RPC] Vencord not available:', e.message);
  }

  isConnected = false;
  broadcastStatus();
  scheduleReconnect();
}

function scheduleReconnect() {
  if (!reconnectTimeout) {
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, 5000);
  }
}

async function sendUpdate(musicInfo) {
  if (!isConnected) return;

  try {
    await fetch(`${HTTP_SERVER_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(musicInfo)
    });
    console.log('[YTM-RPC] Sent update:', musicInfo.title);
  } catch (e) {
    console.error('[YTM-RPC] Update failed:', e);
    isConnected = false;
    broadcastStatus();
    scheduleReconnect();
  }
}

async function clearPresence() {
  if (!isConnected) return;

  try {
    await fetch(`${HTTP_SERVER_URL}/clear`, { method: 'POST' });
    console.log('[YTM-RPC] Cleared presence');
  } catch (e) {
    console.error('[YTM-RPC] Clear failed:', e);
  }
}

function broadcastStatus() {
  const status = getStatus();
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    data: status
  }).catch(() => {});
}

function getStatus() {
  return {
    isConnected,
    currentMusic: currentMusicInfo
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'MUSIC_UPDATE':
      currentMusicInfo = message.data;
      if (isConnected) {
        sendUpdate(message.data);
      }
      broadcastStatus();
      sendResponse({ success: true });
      break;

    case 'MUSIC_STOPPED':
      currentMusicInfo = null;
      clearPresence();
      broadcastStatus();
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse(getStatus());
      break;

    case 'CONNECT':
      connect().then(() => {
        sendResponse({ success: isConnected });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[YTM-RPC] Extension started');
  connect();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[YTM-RPC] Extension installed/updated');
  connect();
});

connect();

setInterval(() => {
  if (!isConnected && !reconnectTimeout) {
    connect();
  }
}, 30000);

console.log('[YTM-RPC] Background script loaded');
