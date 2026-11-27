/**
 * UNIT 01 — Application Controller
 * Handles lazy 3D engine initialization, custom cursor, pointer/tilt tracking,
 * curious button reactions, double-tap spin, scroll choreography, and pause states.
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

let robotApp = null;
let isHoveringRobot = false;
let lastTapTime = 0;

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
// 2. SCROLL REVEAL & SECTION CHOREOGRAPHY
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

  // Track active section to animate robot glides & nods between sections
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
// 3. POINTER, TOUCH, TILT & MULTI-REACTION INTERACTIONS
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
        e.target.closest('a, button, .editorial-card, .arch-card, .specs-panel, .contact-card, header')
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

  // Single click/tap = wave & jump; Double click/tap = 360 spin
  window.addEventListener('click', (e) => {
    if (!robotApp) return;
    if (e.target.closest('a, button, .editorial-card, .arch-card, .specs-panel, .contact-card, header')) {
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

  // Hero CTA triggers a friendly wave before scrolling
  if (heroCta) {
    heroCta.addEventListener('click', () => {
      if (robotApp) robotApp.triggerClickReaction();
    });
  }

  // Mobile touch-drag updates robot gaze smoothly without blocking page scroll
  window.addEventListener('touchmove', (e) => {
    if (!robotApp || !e.touches.length) return;
    const touch = e.touches[0];
    const nx = (touch.clientX / window.innerWidth) * 2 - 1;
    const ny = -(touch.clientY / window.innerHeight) * 2 + 1;
    robotApp.setTargetPointer(nx, ny);
  }, { passive: true });

  // Gentle mobile tilt support (only where browser allows without permission popup)
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
// 4. PERFORMANCE LIFECYCLE (TAB VISIBILITY & CLEANUP)
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
// 5. LAZY 3D BOOTSTRAP (TEXT PAINTS FIRST, 3D LOADS NEXT)
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
      }
    });
  } catch (error) {
    console.error('3D Engine initialization error:', error);
    showFallback();
  }
}

// Boot UI immediately so typography & layout respond at 0ms
initCustomCursor();
initScrollObservers();
initRobotInteractions();
initLifecycleGuards();

// Defer 3D module download slightly so initial text paint stays instant
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => loadRobotEngine(), { timeout: 250 });
} else {
  setTimeout(loadRobotEngine, 80);
}
