/**
 * UNIT 01 — Application Controller
 * Handles lazy 3D engine initialization, custom cursor, pointer/tilt tracking,
 * first-visit guided tour, scroll choreography, and performance pause states.
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
const heroCta = document.getElementById('hero-cta');

// Guide / Tour Elements
const guideEl = document.getElementById('sentinel-guide');
const guideStepLabel = document.getElementById('guide-step-label');
const guideTitle = document.getElementById('guide-title');
const guideText = document.getElementById('guide-text');
const guideDots = document.querySelectorAll('#guide-dots .guide-dot');
const guideSkipBtn = document.getElementById('guide-skip');
const guideNextBtn = document.getElementById('guide-next');
const guideCloseBtn = document.getElementById('guide-close');
const replayTourBtn = document.getElementById('replay-tour');

const TOUR_STORAGE_KEY = 'unit01_guide_seen';

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

    const interactiveTarget = e.target.closest('a, button, [data-cursor]');
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
// 2. FIRST-VISIT GREETING & REPLAYABLE GUIDED TOUR
// =========================================================
const tourSteps = [
  {
    badge: 'UNIT 01 // ONLINE',
    title: "Hello. I'm Unit 01.",
    text: "Welcome to my space. Want a quick guided tour of how I'm built and how this site works?",
    skipLabel: 'Dismiss',
    nextLabel: 'Show Me Around',
    targetId: 'hero',
    section: 'hero',
    action: () => {}
  },
  {
    badge: '01 / 03 — SENTINEL CORE',
    title: 'Pure Math. Zero 3D Files.',
    text: 'Every curve, visor reflection, and floating arm is built live with Three.js primitives. Double-click me to spin!',
    skipLabel: 'Skip Tour',
    nextLabel: 'Next →',
    targetId: 'hero',
    section: 'hero',
    action: () => {
      if (robotApp) robotApp.triggerSpinReaction();
    }
  },
  {
    badge: '02 / 03 — STUDIO LIGHT',
    title: 'Procedural Reflections.',
    text: 'Watch me glide across the stage. A custom studio light box runs in memory so ceramic and glass stay glossy.',
    skipLabel: 'Skip Tour',
    nextLabel: 'Next →',
    targetId: 'about',
    section: 'about',
    action: () => {}
  },
  {
    badge: '03 / 03 — 60 FPS ENGINE',
    title: 'Built for Speed.',
    text: 'Adaptive scaling and pause-on-idle keep frame rates silky on phones and laptops alike. Enjoy exploring!',
    skipLabel: 'Skip Tour',
    nextLabel: 'Finish',
    targetId: 'architecture',
    section: 'architecture',
    action: () => {
      if (robotApp) robotApp.triggerClickReaction();
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
  if (guideNextBtn) {
    guideNextBtn.addEventListener('click', () => {
      advanceTourStep();
    });
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
      if (robotApp) {
        robotApp.replayEntrance();
      }
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
    if (e.key === 'Escape' && guideEl && guideEl.classList.contains('is-open')) {
      closeGuide(false);
    }
  });
}

// =========================================================
// 3. SCROLL REVEAL & SECTION CHOREOGRAPHY
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
// 4. POINTER, TOUCH, TILT & MULTI-REACTION INTERACTIONS
// =========================================================
function initRobotInteractions() {
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

  if (heroCta) {
    heroCta.addEventListener('click', () => {
      if (robotApp) robotApp.triggerClickReaction();
    });
  }

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
// 5. PERFORMANCE LIFECYCLE (TAB VISIBILITY & CLEANUP)
// =========================================================
function initLifecycleGuards() {
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

// =========================================================
// 6. LAZY 3D BOOTSTRAP (TEXT PAINTS FIRST, 3D LOADS NEXT)
// =========================================================
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

// Boot UI immediately so typography & layout respond at 0ms
initCustomCursor();
initGuideControls();
initScrollObservers();
initRobotInteractions();
initLifecycleGuards();

// Defer 3D module download slightly so initial text paint stays instant
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => loadRobotEngine(), { timeout: 250 });
} else {
  setTimeout(loadRobotEngine, 80);
}
