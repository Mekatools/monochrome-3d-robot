/**
 * AXION by Meka Develops — Shared Application Controller
 * Powers custom cursor, scroll reveals, homepage 3D category switcher,
 * first-visit tour, OS detection, live release fetching, and direct downloads.
 */

const rootEl = document.documentElement;
rootEl.classList.add('js-ready');

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

const loaderEl = document.getElementById('robot-loader');
const loaderBar = document.getElementById('loader-bar');
const fallbackEl = document.getElementById('webgl-fallback');
const canvasContainer = document.getElementById('canvas-container');
const robotStage = document.getElementById('robot-stage');
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');

const guideEl = document.getElementById('sentinel-guide');
const guideStepLabel = document.getElementById('guide-step-label');
const guideTitle = document.getElementById('guide-title');
const guideText = document.getElementById('guide-text');
const guideDots = document.querySelectorAll('#guide-dots .guide-dot');
const guideSkipBtn = document.getElementById('guide-skip');
const guideNextBtn = document.getElementById('guide-next');
const guideCloseBtn = document.getElementById('guide-close');
const replayTourBtn = document.getElementById('replay-tour');

const TOUR_STORAGE_KEY = 'axion_guide_seen';

let robotApp = null;
let isHoveringRobot = false;
let lastTapTime = 0;

function hasSeenGuide() {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markGuideSeen() {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // Ignore storage errors in restricted/private browser contexts
  }
}

// =========================================================
// 1. CUSTOM SMOOTH CURSOR (Desktop Fine Pointer Only)
// =========================================================
function initCustomCursor() {
  if (!finePointerQuery.matches || !cursorDot || !cursorRing) return;

  rootEl.classList.add('cursor-active');

  let mouseX = -100;
  let mouseY = -100;
  let ringX = -100;
  let ringY = -100;
  let cursorVisible = false;
  let cursorRaf = 0;

  const updateCursorLoop = () => {
    const ease = reducedMotionQuery.matches ? 1 : 0.18;
    ringX += (mouseX - ringX) * ease;
    ringY += (mouseY - ringY) * ease;

    cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

    if (Math.abs(mouseX - ringX) > 0.1 || Math.abs(mouseY - ringY) > 0.1) {
      cursorRaf = requestAnimationFrame(updateCursorLoop);
    } else {
      cursorRaf = 0;
    }
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!cursorVisible) {
      ringX = mouseX;
      ringY = mouseY;
      cursorVisible = true;
    }

    const interactiveTarget = e.target.closest('a, button, input, [data-cursor]');
    cursorRing.classList.toggle('is-hover', Boolean(interactiveTarget));

    if (!cursorRaf) {
      cursorRaf = requestAnimationFrame(updateCursorLoop);
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursorDot.style.opacity = '0';
    cursorRing.style.opacity = '0';
  });

  document.addEventListener('mouseenter', () => {
    cursorDot.style.opacity = '';
    cursorRing.style.opacity = '';
  });
}

// =========================================================
// 2. HOMEPAGE CATEGORY PREVIEW SWITCHER
// =========================================================
const CATEGORY_SPECS = {
  vision: {
    title: 'Local AI — Private Models On Your Machine',
    desc: 'Run open-weight language models and AI image upscalers locally without cloud subscriptions or tracking. Includes Ollama, Jan, and Upscayl.',
    platforms: 'Win / Mac / Linux',
    license: 'Open Source'
  },
  kinetic: {
    title: '3D & Media — Creative Production Suites',
    desc: 'Build games, record crisp video, trim footage losslessly, and edit audio with Godot Engine, OBS Studio, Audacity, and LosslessCut.',
    platforms: 'Win / Mac / Linux',
    license: 'MIT / GPL'
  },
  pulse: {
    title: 'Dev & Utilities — Essential Daily Workflows',
    desc: 'Code, test APIs, share files offline, manage passwords, and connect remotely using VSCodium, Bruno, LocalSend, KeePassXC, and RustDesk.',
    platforms: 'Win / Mac / Linux',
    license: 'MIT / GPL / Apache'
  }
};

function initModelSwitcher() {
  const pills = document.querySelectorAll('.model-pill[data-model-mode]');
  if (!pills.length) return;

  const titleEl = document.getElementById('readout-title');
  const descEl = document.getElementById('readout-desc');
  const latencyEl = document.getElementById('readout-latency');
  const priceEl = document.getElementById('readout-price');

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.modelMode;
      const spec = CATEGORY_SPECS[mode];
      if (!spec) return;

      pills.forEach((p) => {
        const active = p === pill;
        p.classList.toggle('is-active', active);
        p.setAttribute('aria-selected', String(active));
      });

      if (titleEl) titleEl.textContent = spec.title;
      if (descEl) descEl.textContent = spec.desc;
      if (latencyEl) latencyEl.textContent = spec.platforms;
      if (priceEl) priceEl.textContent = spec.license;

      if (robotApp) {
        robotApp.setModelMode(mode);
      }
    });
  });
}

// =========================================================
// 3. OPEN-SOURCE MARKETPLACE: OS DETECTION & DIRECT DOWNLOADS
// =========================================================
const TOOLS_CATALOG = {
  ollama: {
    name: 'Ollama',
    repo: 'ollama/ollama',
    defaultVersion: 'v0.40.17',
    ext: { windows: '.exe', mac: '.zip', linux: '.tgz' },
    fallbackUrls: {
      windows: 'https://ollama.com/download/OllamaSetup.exe',
      mac: 'https://ollama.com/download/Ollama-darwin.zip',
      linux: 'https://github.com/ollama/ollama/releases/download/v0.40.17/ollama-linux-amd64.tgz'
    }
  },
  jan: {
    name: 'Jan',
    repo: 'janhq/jan',
    defaultVersion: 'v0.8.8',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/janhq/jan/releases/latest',
      mac: 'https://github.com/janhq/jan/releases/latest',
      linux: 'https://github.com/janhq/jan/releases/latest'
    }
  },
  upscayl: {
    name: 'Upscayl',
    repo: 'upscayl/upscayl',
    defaultVersion: 'v2.15.0',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-win.exe',
      mac: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-mac.dmg',
      linux: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-linux.AppImage'
    }
  },
  godot: {
    name: 'Godot Engine',
    repo: 'godotengine/godot',
    defaultVersion: '4.7.2-stable',
    ext: { windows: '.zip', mac: '.zip', linux: '.zip' },
    fallbackUrls: {
      windows: 'https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip',
      mac: 'https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_macos.universal.zip',
      linux: 'https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip'
    }
  },
  obs: {
    name: 'OBS Studio',
    repo: 'obsproject/obs-studio',
    defaultVersion: '33.0.1',
    ext: { windows: '.exe', mac: '.dmg', linux: '.deb' },
    fallbackUrls: {
      windows: 'https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-Windows-x64-Installer.exe',
      mac: 'https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-macOS-Apple.dmg',
      linux: 'https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-Ubuntu-x86_64.deb'
    }
  },
  audacity: {
    name: 'Audacity',
    repo: 'audacity/audacity',
    defaultVersion: '4.0.2',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/audacity/audacity/releases/latest',
      mac: 'https://github.com/audacity/audacity/releases/latest',
      linux: 'https://github.com/audacity/audacity/releases/download/Audacity-4.0.2/audacity-linux-4.0.2-x86_64.AppImage'
    }
  },
  losslesscut: {
    name: 'LosslessCut',
    repo: 'mifi/lossless-cut',
    defaultVersion: '3.70.2',
    ext: { windows: '.7z', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/mifi/lossless-cut/releases/latest',
      mac: 'https://github.com/mifi/lossless-cut/releases/latest',
      linux: 'https://github.com/mifi/lossless-cut/releases/latest'
    }
  },
  vscodium: {
    name: 'VSCodium',
    repo: 'VSCodium/vscodium',
    defaultVersion: '1.143.17232',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/VSCodium/vscodium/releases/download/1.143.17232/VSCodiumUserSetup-x64-1.143.17232.exe',
      mac: 'https://github.com/VSCodium/vscodium/releases/latest',
      linux: 'https://github.com/VSCodium/vscodium/releases/latest'
    }
  },
  bruno: {
    name: 'Bruno',
    repo: 'usebruno/bruno',
    defaultVersion: 'v4.3.0',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/usebruno/bruno/releases/latest',
      mac: 'https://github.com/usebruno/bruno/releases/latest',
      linux: 'https://github.com/usebruno/bruno/releases/latest'
    }
  },
  localsend: {
    name: 'LocalSend',
    repo: 'localsend/localsend',
    defaultVersion: 'v1.19.0',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/localsend/localsend/releases/latest',
      mac: 'https://github.com/localsend/localsend/releases/latest',
      linux: 'https://github.com/localsend/localsend/releases/latest'
    }
  },
  keepassxc: {
    name: 'KeePassXC',
    repo: 'keepassxreboot/keepassxc',
    defaultVersion: '2.8.0',
    ext: { windows: '.msi', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/keepassxreboot/keepassxc/releases/latest',
      mac: 'https://github.com/keepassxreboot/keepassxc/releases/latest',
      linux: 'https://github.com/keepassxreboot/keepassxc/releases/latest'
    }
  },
  rustdesk: {
    name: 'RustDesk',
    repo: 'rustdesk/rustdesk',
    defaultVersion: '1.5.3',
    ext: { windows: '.exe', mac: '.dmg', linux: '.AppImage' },
    fallbackUrls: {
      windows: 'https://github.com/rustdesk/rustdesk/releases/download/1.5.3/rustdesk-1.5.3-x86_64.exe',
      mac: 'https://github.com/rustdesk/rustdesk/releases/latest',
      linux: 'https://github.com/rustdesk/rustdesk/releases/latest'
    }
  }
};

function detectUserOS() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();
  if (platform.includes('mac') || ua.includes('mac os')) return 'mac';
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  return 'windows';
}

function getOSDisplayName(os) {
  if (os === 'mac') return 'macOS';
  if (os === 'linux') return 'Linux';
  return 'Windows';
}

function extractExtension(url, fallbackExt) {
  if (!url || url.endsWith('/latest')) return fallbackExt || '';
  const match = url.match(/\.(AppImage|exe|msi|dmg|deb|tgz|tar\.gz|tar\.bz2|7z|zip)(?:$|\?)/i);
  return match ? `.${match[1]}` : (fallbackExt || '');
}

function pickBestAssetUrl(assets, os) {
  if (!Array.isArray(assets) || !assets.length) return null;

  const valid = assets.filter((a) => {
    const n = a.name.toLowerCase();
    return !/\.(sha256|sha512|sig|asc|blockmap|yml|yaml|txt|zsync|digest)$/i.test(n) && !n.includes('source');
  });

  if (os === 'windows') {
    const exe = valid.find((a) => /\.exe$/i.test(a.name) && !/arm64|aarch64/i.test(a.name));
    if (exe) return exe.browser_download_url;
    const msi = valid.find((a) => /\.msi$/i.test(a.name) && !/arm64|aarch64/i.test(a.name));
    if (msi) return msi.browser_download_url;
    const winZip = valid.find((a) => /win64.*exe\.zip$/i.test(a.name) && !/mono/i.test(a.name))
      || valid.find((a) => /(win64|win32-x64|win-x64|windows).*(\.zip|\.7z)$/i.test(a.name) && !/arm64|aarch64|mono/i.test(a.name));
    if (winZip) return winZip.browser_download_url;
  }

  if (os === 'mac') {
    const dmg = valid.find((a) => /\.dmg$/i.test(a.name) && /(universal|apple|arm64)/i.test(a.name))
      || valid.find((a) => /\.dmg$/i.test(a.name));
    if (dmg) return dmg.browser_download_url;
    const macZip = valid.find((a) => /(macos|darwin|mac).*(\.zip|\.tar)/i.test(a.name) && !/mono/i.test(a.name));
    if (macZip) return macZip.browser_download_url;
  }

  if (os === 'linux') {
    const appImage = valid.find((a) => /\.appimage$/i.test(a.name) && !/arm64|aarch64/i.test(a.name));
    if (appImage) return appImage.browser_download_url;
    const deb = valid.find((a) => /\.deb$/i.test(a.name) && !/arm64|aarch64/i.test(a.name));
    if (deb) return deb.browser_download_url;
    const linuxArchive = valid.find((a) => /linux.*(amd64|x86_64|x64).*\.(tgz|tar\.gz|tar\.bz2|zip)$/i.test(a.name) && !/mono/i.test(a.name));
    if (linuxArchive) return linuxArchive.browser_download_url;
  }

  return null;
}

async function fetchLatestRelease(repo) {
  const cacheKey = `axion_rel_v2_${repo}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 30 * 60 * 1000) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore cache read issues
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error('Release fetch skipped');
  const data = await res.json();

  const slim = {
    tag: data.tag_name,
    urls: {
      windows: pickBestAssetUrl(data.assets, 'windows'),
      mac: pickBestAssetUrl(data.assets, 'mac'),
      linux: pickBestAssetUrl(data.assets, 'linux')
    }
  };

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: slim }));
  } catch {
    // Ignore storage quota errors
  }

  return slim;
}

function initMarketplace() {
  const cards = document.querySelectorAll('.tool-card[data-tool-id]');
  if (!cards.length) return;

  const detectedOsLabel = document.getElementById('detected-os-name');
  const osBtns = document.querySelectorAll('.os-btn[data-os]');
  const catTabs = document.querySelectorAll('.cat-tab[data-category]');
  const searchInput = document.getElementById('tool-search');
  const emptyState = document.getElementById('marketplace-empty');
  const toastEl = document.getElementById('download-toast');

  const detectedOS = detectUserOS();
  let selectedOS = detectedOS;
  let activeCategory = 'all';
  let searchQuery = '';
  let toastTimer = 0;

  if (detectedOsLabel) {
    detectedOsLabel.textContent = getOSDisplayName(detectedOS);
  }

  const liveReleases = {};

  const showToast = (message) => {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 3600);
  };

  const refreshCardUI = () => {
    const osName = getOSDisplayName(selectedOS);
    cards.forEach((card) => {
      const id = card.dataset.toolId;
      const meta = TOOLS_CATALOG[id];
      if (!meta) return;

      const live = liveReleases[id];
      const version = live?.tag || meta.defaultVersion;
      const directUrl = live?.urls?.[selectedOS] || meta.fallbackUrls[selectedOS];
      const versionEl = card.querySelector('.version-badge');
      const osTargetEl = card.querySelector('.tool-os-target');
      const downloadBtn = card.querySelector('.tool-download-btn');

      if (versionEl) versionEl.textContent = version;
      if (osTargetEl) osTargetEl.textContent = `${osName} Installer`;

      if (downloadBtn) {
        const extLabel = extractExtension(directUrl, meta.ext[selectedOS]);
        const btnLabel = downloadBtn.querySelector('.dl-label');
        if (btnLabel) {
          btnLabel.textContent = `Download ${extLabel}`;
        }
        downloadBtn.href = directUrl;
      }
    });
  };

  const applyFilters = () => {
    let visibleCount = 0;
    const query = searchQuery.trim().toLowerCase();

    cards.forEach((card) => {
      const category = card.dataset.category || '';
      const text = card.textContent.toLowerCase();
      const matchesCat = activeCategory === 'all' || category === activeCategory;
      const matchesSearch = !query || text.includes(query);
      const show = matchesCat && matchesSearch;
      card.hidden = !show;
      if (show) visibleCount++;
    });

    if (emptyState) emptyState.hidden = visibleCount > 0;
  };

  const setActiveOS = (os) => {
    selectedOS = os;
    osBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.os === os));
    refreshCardUI();
  };

  osBtns.forEach((btn) => {
    btn.addEventListener('click', () => setActiveOS(btn.dataset.os));
  });

  catTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeCategory = tab.dataset.category;
      catTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFilters();
    });
  }

  cards.forEach((card) => {
    const id = card.dataset.toolId;
    const downloadBtn = card.querySelector('.tool-download-btn');
    if (!downloadBtn) return;

    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const meta = TOOLS_CATALOG[id];
      const live = liveReleases[id];
      const url = live?.urls?.[selectedOS] || meta.fallbackUrls[selectedOS];
      const version = live?.tag || meta.defaultVersion;

      showToast(`Starting ${meta.name} (${version}) download for ${getOSDisplayName(selectedOS)}...`);

      const tempLink = document.createElement('a');
      tempLink.href = url;
      tempLink.setAttribute('download', '');
      tempLink.rel = 'noopener noreferrer';
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
    });
  });

  setActiveOS(detectedOS);

  Object.entries(TOOLS_CATALOG).forEach(async ([id, meta]) => {
    try {
      const release = await fetchLatestRelease(meta.repo);
      liveReleases[id] = release;
      refreshCardUI();
    } catch {
      // Fallback versions and direct links remain active seamlessly
    }
  });
}

// =========================================================
// 4. FIRST-VISIT GREETING & REPLAYABLE GUIDED TOUR
// =========================================================
const tourSteps = [
  {
    badge: 'AXION // ONLINE',
    title: 'Welcome to AXION.',
    text: 'Built independently by Meka Develops. Want a quick tour of our open-source software marketplace?',
    skipLabel: 'Dismiss',
    nextLabel: 'Show Me Around',
    targetId: 'hero',
    section: 'hero',
    action: () => {}
  },
  {
    badge: '01 / 03 — DIRECT ACCESS',
    title: 'Latest Releases. Zero Detours.',
    text: 'Every Download button detects your OS and grabs the newest official installer directly—while keeping a dedicated GitHub button for source code.',
    skipLabel: 'Skip Tour',
    nextLabel: 'Next →',
    targetId: 'hero',
    section: 'hero',
    action: () => {
      if (robotApp) robotApp.triggerSpinReaction();
    }
  },
  {
    badge: '02 / 03 — CATEGORIES',
    title: 'AI, 3D, Dev & Utilities.',
    text: 'Preview software categories here, then open the Marketplace page to filter 12+ open-source tools for Windows, macOS, or Linux.',
    skipLabel: 'Skip Tour',
    nextLabel: 'Next →',
    targetId: 'preview',
    section: 'about',
    action: () => {
      if (robotApp) robotApp.setModelMode('pulse');
    }
  },
  {
    badge: '03 / 03 — TRANSPARENT RULES',
    title: 'Independent by Meka Develops.',
    text: 'Every tool credits its real creator, and our Terms page strictly clarifies our independence. Enjoy exploring!',
    skipLabel: 'Skip Tour',
    nextLabel: 'Finish',
    targetId: 'architecture',
    section: 'architecture',
    action: () => {
      if (robotApp) {
        robotApp.setModelMode('vision');
        robotApp.triggerClickReaction();
      }
    }
  }
];

let tourIndex = 0;
let autoAdvanceTimer = 0;
let isTourPlaying = false;

function clearAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = 0;
  }
}

function renderTourStep(index) {
  if (!guideEl) return;
  const step = tourSteps[index];
  if (!step) return;

  tourIndex = index;
  if (guideStepLabel) guideStepLabel.textContent = step.badge;
  if (guideTitle) guideTitle.textContent = step.title;
  if (guideText) guideText.textContent = step.text;
  if (guideSkipBtn) guideSkipBtn.textContent = step.skipLabel;
  if (guideNextBtn) guideNextBtn.textContent = step.nextLabel;

  guideDots.forEach((dot, i) => {
    dot.classList.toggle('is-active', i === index);
  });

  if (index > 0) {
    const targetEl = document.getElementById(step.targetId);
    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
        block: 'center'
      });
    }
    if (robotApp) {
      robotApp.setScrollSection(step.section);
    }
    step.action();
  }
}

function openGuide(startIndex = 0) {
  if (!guideEl) return;
  clearAutoAdvance();
  isTourPlaying = startIndex > 0;
  renderTourStep(startIndex);
  guideEl.classList.add('is-open');
}

function closeGuide(returnToHero = false) {
  if (!guideEl) return;
  clearAutoAdvance();
  isTourPlaying = false;
  markGuideSeen();
  guideEl.classList.remove('is-open');

  if (returnToHero) {
    const heroEl = document.getElementById('hero');
    if (heroEl) {
      heroEl.scrollIntoView({
        behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
    if (robotApp) {
      robotApp.setScrollSection('hero');
      robotApp.triggerClickReaction();
    }
  }
}

function advanceTourStep() {
  clearAutoAdvance();
  markGuideSeen();

  if (tourIndex < tourSteps.length - 1) {
    isTourPlaying = true;
    renderTourStep(tourIndex + 1);
    autoAdvanceTimer = setTimeout(() => {
      if (isTourPlaying && guideEl && guideEl.classList.contains('is-open')) {
        advanceTourStep();
      }
    }, 5200);
  } else {
    closeGuide(true);
  }
}

function initGuideControls() {
  if (!guideEl) return;

  if (guideNextBtn) {
    guideNextBtn.addEventListener('click', () => advanceTourStep());
  }
  if (guideSkipBtn) {
    guideSkipBtn.addEventListener('click', () => closeGuide(false));
  }
  if (guideCloseBtn) {
    guideCloseBtn.addEventListener('click', () => closeGuide(false));
  }
  if (replayTourBtn) {
    replayTourBtn.addEventListener('click', () => {
      clearAutoAdvance();
      isTourPlaying = false;
      window.scrollTo({
        top: 0,
        behavior: reducedMotionQuery.matches ? 'auto' : 'smooth'
      });
      if (robotApp) robotApp.replayEntrance();
      openGuide(0);
    });
  }

  window.addEventListener('wheel', () => {
    if (isTourPlaying) {
      clearAutoAdvance();
      isTourPlaying = false;
    }
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guideEl.classList.contains('is-open')) {
      closeGuide(false);
    }
  });
}

// =========================================================
// 5. SCROLL REVEAL & SECTION CHOREOGRAPHY
// =========================================================
function initScrollObservers() {
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reducedMotionQuery.matches) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' }
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  const sections = document.querySelectorAll('[data-section]');
  if ('IntersectionObserver' in window && sections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && robotApp) {
            robotApp.setScrollSection(entry.target.dataset.section);
          }
        }
      },
      { threshold: 0.45 }
    );

    sections.forEach((sec) => sectionObserver.observe(sec));
  }
}

// =========================================================
// 6. POINTER, TOUCH, TILT & MULTI-REACTION INTERACTIONS
// =========================================================
function initRobotInteractions() {
  if (!canvasContainer) return;

  window.addEventListener('pointermove', (e) => {
    if (!robotApp) return;

    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    robotApp.setTargetPointer(nx, ny);

    if (e.pointerType === 'mouse') {
      const overButton = Boolean(e.target.closest('[data-cursor="button"]'));
      robotApp.setCuriousState(overButton);

      const overUi = Boolean(
        e.target.closest('a, button, aside, .editorial-card, .arch-card, .specs-panel, .contact-card, header')
      );
      const hitRobot = !overUi && robotApp.raycastRobot(nx, ny);

      if (hitRobot !== isHoveringRobot) {
        isHoveringRobot = hitRobot;
        robotApp.setHoveringRobot(hitRobot);
        if (cursorRing) {
          cursorRing.classList.toggle('is-robot', hitRobot);
        }
      }
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    if (robotApp) {
      robotApp.setTargetPointer(0, 0);
      robotApp.setHoveringRobot(false);
      robotApp.setCuriousState(false);
    }
    if (cursorRing) cursorRing.classList.remove('is-robot');
    isHoveringRobot = false;
  });

  window.addEventListener('click', (e) => {
    if (!robotApp) return;
    if (e.target.closest('a, button, aside, .editorial-card, .arch-card, .specs-panel, .contact-card, header')) {
      return;
    }

    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;

    if (robotApp.raycastRobot(nx, ny)) {
      const now = performance.now();
      if (now - lastTapTime < 340) {
        robotApp.triggerSpinReaction();
        lastTapTime = 0;
      } else {
        robotApp.triggerClickReaction();
        lastTapTime = now;
      }
    }
  });

  window.addEventListener('touchmove', (e) => {
    if (!robotApp || !e.touches.length) return;
    const touch = e.touches[0];
    const nx = (touch.clientX / window.innerWidth) * 2 - 1;
    const ny = -(touch.clientY / window.innerHeight) * 2 + 1;
    robotApp.setTargetPointer(nx, ny);
  }, { passive: true });

  if (
    !finePointerQuery.matches &&
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission !== 'function'
  ) {
    window.addEventListener('deviceorientation', (e) => {
      if (!robotApp || e.gamma === null || e.beta === null) return;
      const nx = Math.max(-1, Math.min(1, e.gamma / 32));
      const ny = Math.max(-1, Math.min(1, -(e.beta - 45) / 32));
      robotApp.setTargetPointer(nx, ny);
    }, { passive: true });
  }
}

// =========================================================
// 7. PERFORMANCE LIFECYCLE & LAZY 3D BOOTSTRAP
// =========================================================
function initLifecycleGuards() {
  if (!canvasContainer) return;

  let isTabHidden = document.hidden;
  let isStageVisible = true;

  const syncPauseState = () => {
    if (robotApp) {
      robotApp.setPaused(isTabHidden || !isStageVisible);
    }
  };

  document.addEventListener('visibilitychange', () => {
    isTabHidden = document.hidden;
    syncPauseState();
  });

  if ('IntersectionObserver' in window && robotStage) {
    const stageObserver = new IntersectionObserver(
      (entries) => {
        isStageVisible = entries[0].isIntersecting;
        syncPauseState();
      },
      { threshold: 0.01 }
    );
    stageObserver.observe(robotStage);
  }

  window.addEventListener('pagehide', () => {
    if (robotApp) {
      robotApp.dispose();
      robotApp = null;
    }
  });
}

function showFallback() {
  if (loaderEl) loaderEl.classList.add('is-hidden');
  if (fallbackEl) fallbackEl.hidden = false;
}

async function loadRobotEngine() {
  if (!canvasContainer) return;
  if (loaderBar) loaderBar.style.width = '15%';

  try {
    const { isWebGLSupported, createRobotScene } = await import('./robot.js');

    if (!isWebGLSupported()) {
      showFallback();
      return;
    }

    robotApp = createRobotScene({
      container: canvasContainer,
      reducedMotion: reducedMotionQuery.matches,
      onProgress: (percent) => {
        if (loaderBar) loaderBar.style.width = `${percent}%`;
      },
      onReady: () => {
        setTimeout(() => {
          if (loaderEl) loaderEl.classList.add('is-hidden');
        }, 180);
      },
      onGreet: () => {
        if (!hasSeenGuide()) {
          openGuide(0);
        }
      }
    });
  } catch (error) {
    console.error('3D Engine initialization error:', error);
    showFallback();
  }
}

// Boot shared UI immediately
initCustomCursor();
initModelSwitcher();
initMarketplace();
initGuideControls();
initScrollObservers();
initRobotInteractions();
initLifecycleGuards();

// Only download Three.js on pages with the 3D canvas (index.html)
if (canvasContainer) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => loadRobotEngine(), { timeout: 250 });
  } else {
    setTimeout(loadRobotEngine, 80);
  }
}
