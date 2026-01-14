let lastMusicInfo = null;
let lastSentTime = 0;
let observer = null;
let videoElement = null;

const CONFIG = {
  MIN_UPDATE_INTERVAL: 2000,
  PERIODIC_UPDATE_INTERVAL: 15000,
  TIME_UPDATE_INTERVAL: 5,
  RETRY_INTERVAL: 1000
};

function extractVideoId(url) {
  if (!url) return null;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function getHighQualityThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;

  if (thumbnailUrl.includes('lh3.googleusercontent.com')) {
    return thumbnailUrl
      .replace(/=w\d+-h\d+/, '=w544-h544')
      .replace(/=s\d+/, '=s544')
      .replace(/=w\d+/, '=w544');
  }

  return thumbnailUrl;
}

function cleanArtistString(artist) {
  if (!artist) return 'Unknown Artist';

  return artist
    .replace(/\s*&\s*\d+\s*more.*$/i, '')
    .replace(/\s*,\s*\d+\s*more.*$/i, '')
    .replace(/\s*•.*$/, '')
    .trim() || 'Unknown Artist';
}

function extractMusicInfo() {
  try {
    const video = document.querySelector('video');
    if (!video) return null;

    const titleElement =
      document.querySelector('.title.style-scope.ytmusic-player-bar') ||
      document.querySelector('ytmusic-player-bar .title') ||
      document.querySelector('.content-info-wrapper .title');

    if (!titleElement) return null;

    const title = titleElement.textContent?.trim();
    if (!title) return null;

    const artistElement =
      document.querySelector('.byline.style-scope.ytmusic-player-bar') ||
      document.querySelector('ytmusic-player-bar .byline') ||
      document.querySelector('.content-info-wrapper .byline');

    const thumbnailElement =
      document.querySelector('ytmusic-player-bar img.image') ||
      document.querySelector('ytmusic-player-bar .thumbnail img') ||
      document.querySelector('.ytmusic-player-bar img') ||
      document.querySelector('.thumbnail-image-wrapper img');

    const currentUrl = window.location.href;
    const videoIdFromUrl = extractVideoId(currentUrl);

    let thumbnailUrl = thumbnailElement?.src || '';
    thumbnailUrl = getHighQualityThumbnail(thumbnailUrl);

    const isPaused = video.paused;
    const currentTime = Math.floor(video.currentTime) || 0;
    const duration = Math.floor(video.duration) || 0;

    let artistText = artistElement?.textContent?.trim() || '';
    const artistParts = artistText.split('•');
    artistText = cleanArtistString(artistParts[0]);

    return {
      title,
      artist: artistText,
      thumbnail: thumbnailUrl,
      currentTime,
      duration,
      isPaused,
      videoId: videoIdFromUrl,
      url: currentUrl,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error extracting music info:', error);
    return null;
  }
}

function hasSignificantChange(newInfo, oldInfo) {
  if (!oldInfo) return true;
  if (!newInfo) return false;

  if (newInfo.title !== oldInfo.title) return true;
  if (newInfo.artist !== oldInfo.artist) return true;
  if (newInfo.isPaused !== oldInfo.isPaused) return true;

  const timeDiff = Math.abs(newInfo.currentTime - oldInfo.currentTime);
  if (timeDiff > 5) return true;

  return false;
}

function sendMusicInfo(force = false) {
  const now = Date.now();

  if (!force && now - lastSentTime < CONFIG.MIN_UPDATE_INTERVAL) {
    return;
  }

  const info = extractMusicInfo();

  if (info && (force || hasSignificantChange(info, lastMusicInfo))) {
    chrome.runtime.sendMessage({
      type: 'MUSIC_UPDATE',
      data: info
    }).catch((error) => {
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('Failed to send music info:', error);
      }
    });

    lastMusicInfo = info;
    lastSentTime = now;
  }
}

function sendMusicStopped() {
  chrome.runtime.sendMessage({
    type: 'MUSIC_STOPPED'
  }).catch(() => {});

  lastMusicInfo = null;
}

function setupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  const targetNode = document.querySelector('ytmusic-player-bar');
  if (!targetNode) {
    setTimeout(setupObserver, CONFIG.RETRY_INTERVAL);
    return;
  }

  observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData' ||
          mutation.type === 'childList' ||
          (mutation.type === 'attributes' && mutation.attributeName === 'src')) {
        shouldUpdate = true;
        break;
      }
    }

    if (shouldUpdate) {
      sendMusicInfo();
    }
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['src']
  });

  console.log('YTM Discord RPC: Observer started');
  sendMusicInfo(true);
}

function setupVideoListeners() {
  const video = document.querySelector('video');
  if (!video) {
    setTimeout(setupVideoListeners, CONFIG.RETRY_INTERVAL);
    return;
  }

  if (video === videoElement) {
    return;
  }

  videoElement = video;

  video.addEventListener('play', () => {
    console.log('YTM Discord RPC: Video playing');
    sendMusicInfo(true);
  });

  video.addEventListener('pause', () => {
    console.log('YTM Discord RPC: Video paused');
    sendMusicInfo(true);
  });

  video.addEventListener('ended', () => {
    console.log('YTM Discord RPC: Video ended');
  });

  let lastTimeUpdate = 0;
  video.addEventListener('timeupdate', () => {
    const currentSecond = Math.floor(video.currentTime);
    if (currentSecond !== lastTimeUpdate &&
        currentSecond % CONFIG.TIME_UPDATE_INTERVAL === 0) {
      lastTimeUpdate = currentSecond;
      sendMusicInfo();
    }
  });

  video.addEventListener('seeked', () => {
    sendMusicInfo(true);
  });

  console.log('YTM Discord RPC: Video listeners set up');
}

function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendMusicInfo(true);
    }
  });
}

function setupUnloadHandler() {
  window.addEventListener('beforeunload', () => {
    sendMusicStopped();
  });
}

function initialize() {
  console.log('YTM Discord RPC: Initializing content script');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupObserver();
      setupVideoListeners();
    });
  } else {
    setupObserver();
    setupVideoListeners();
  }

  setupVisibilityHandler();
  setupUnloadHandler();

  setInterval(() => {
    sendMusicInfo();
  }, CONFIG.PERIODIC_UPDATE_INTERVAL);

  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('YTM Discord RPC: URL changed, re-initializing');
      setTimeout(() => {
        setupObserver();
        setupVideoListeners();
        sendMusicInfo(true);
      }, 500);
    }
  });

  urlObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

initialize();
