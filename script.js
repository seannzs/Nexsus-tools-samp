'use strict';

/* =========================================================
   STATES
========================================================= */
const S = {
  BOOT:      'boot',
  IDLE:      'idle',
  DETECTING: 'detecting',
  COUNTDOWN: 'countdown',
  CAPTURING: 'capturing',
  PUZZLE:    'puzzle',
  COMPLETE:  'complete'
};

let state = S.BOOT;

/* =========================================================
   DOM REFS
========================================================= */
const vid        = document.getElementById('video');
const capCanvas  = document.getElementById('cap-canvas');
const capCtx     = capCanvas.getContext('2d');
const overlay    = document.getElementById('overlay');
const scanFrame  = document.getElementById('scan-frame');
const timerBar   = document.getElementById('timer-bar');
const handRings  = document.getElementById('hand-rings');
const cntdEl     = document.getElementById('countdown');
const statusEl   = document.getElementById('status');
const flashEl    = document.getElementById('flash');
const puzzleEl   = document.getElementById('puzzle');
const doneEl     = document.getElementById('done-overlay');
const restartBtn = document.getElementById('restart-btn');

/* =========================================================
   PUZZLE STATE
========================================================= */
let GRID       = 3;
let PW         = 0;
let PH         = 0;
let pieces     = [];
let slotMap    = {};          // slotIndex → pieceEl
let pieceSlot  = new Map();   // pieceEl   → slotIndex
let dragData   = null;
let capturedURL = null;

/* =========================================================
   TIMERS
========================================================= */
let handTimer      = null;
let countdownTimer = null;

/* =========================================================
   CAMERA INIT
========================================================= */
async function startCamera() {
  setStatus('Memuat Kamera...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    vid.srcObject = stream;
    await vid.play();
    loadMediaPipe();
  } catch (err) {
    setStatus('⚠ Izin kamera diperlukan');
    console.error('Camera error:', err);
  }
}

/* =========================================================
   MEDIAPIPE HANDS
========================================================= */
function loadMediaPipe() {
  setStatus('Mendeteksi Tangan...');
  state = S.IDLE;

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  hands.setOptions({
    maxNumHands:             1,
    modelComplexity:         0,   // 0 = fast (mobile-friendly)
    minDetectionConfidence:  0.70,
    minTrackingConfidence:   0.50
  });

  hands.onResults(onHandResults);

  const mpCam = new Camera(vid, {
    onFrame: async () => {
      if (state === S.IDLE || state === S.DETECTING) {
        await hands.send({ image: vid });
      }
    },
    width:  640,
    height: 480
  });

  mpCam.start();
}

/* =========================================================
   HAND DETECTION RESULTS
========================================================= */
function onHandResults(results) {
  if (state !== S.IDLE && state !== S.DETECTING) return;

  const hasHand = !!(results.multiHandLandmarks?.length);

  /* ── Hand appeared → start 2-second detection window ── */
  if (hasHand && state === S.IDLE) {
    state = S.DETECTING;
    setStatus('Tangan Terdeteksi — Tahan...');

    scanFrame.classList.add('on');
    handRings.classList.add('on');

    /* Animate timer bar over 2 seconds */
    timerBar.style.transition = 'none';
    timerBar.style.width = '0%';
    /* double rAF to flush the style before starting transition */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      timerBar.style.transition = 'width 2s linear';
      timerBar.style.width = '100%';
    }));

    handTimer = setTimeout(beginCountdown, 2000);
    return;
  }

  /* ── Hand disappeared → reset ── */
  if (!hasHand && state === S.DETECTING) {
    state = S.IDLE;
    clearTimeout(handTimer);
    scanFrame.classList.remove('on');
    handRings.classList.remove('on');
    timerBar.style.transition = 'none';
    timerBar.style.width = '0%';
    setStatus('Mendeteksi Tangan...');
  }
}

/* =========================================================
   COUNTDOWN  3 → 2 → 1 → capture
========================================================= */
function beginCountdown() {
  state = S.COUNTDOWN;

  scanFrame.classList.remove('on');
  handRings.classList.remove('on');

  let n = 3;
  animateNumber(n);
  setStatus('Bersiap-siap...');

  countdownTimer = setInterval(() => {
    n--;
    if (n > 0) {
      animateNumber(n);
    } else {
      clearInterval(countdownTimer);
      cntdEl.textContent = '';
      capturePhoto();
    }
  }, 1000);
}

function animateNumber(n) {
  cntdEl.textContent = n;
  gsap.killTweensOf(cntdEl);
  gsap.fromTo(
    cntdEl,
    { opacity: 1, scale: 1.7 },
    { opacity: 0, scale: 0.75, duration: 0.88, ease: 'power3.out' }
  );
}

/* =========================================================
   CAPTURE PHOTO
========================================================= */
async function capturePhoto() {
  state = S.CAPTURING;
  setStatus('Mengambil Foto...');

  /* Flash effect */
  gsap.fromTo(flashEl,
    { opacity: 0 },
    { opacity: 1, duration: 0.06, yoyo: true, repeat: 1,
      ease: 'none', onComplete: () => { flashEl.style.opacity = 0; } }
  );

  await wait(120);

  /* Capture mirrored frame → matches what user saw on screen */
  capCanvas.width  = window.innerWidth;
  capCanvas.height = window.innerHeight;

  capCtx.save();
  capCtx.translate(capCanvas.width, 0);
  capCtx.scale(-1, 1);
  capCtx.drawImage(vid, 0, 0, capCanvas.width, capCanvas.height);
  capCtx.restore();

  capturedURL = capCanvas.toDataURL('image/jpeg', 0.92);

  await wait(380);
  setStatus('Menyusun Puzzle...');
  await wait(280);

  buildPuzzle();
}

/* =========================================================
   BUILD PUZZLE
========================================================= */
function buildPuzzle() {
  state = S.PUZZLE;

  /* Adaptive grid: 3×3 on small screens, 4×4 on larger */
  GRID = window.innerWidth < 640 ? 3 : 4;
  PW = window.innerWidth  / GRID;
  PH = window.innerHeight / GRID;

  pieces.length = 0;
  slotMap    = {};
  pieceSlot  = new Map();
  puzzleEl.innerHTML = '';

  /* Hide overlay, show puzzle */
  overlay.style.display = 'none';
  puzzleEl.style.display = 'block';

  const total = GRID * GRID;

  /* Shuffled slot assignment — ensure it's not already solved */
  const slots = ensureShuffled(total);

  for (let i = 0; i < total; i++) {
    const correctRow = Math.floor(i / GRID);
    const correctCol = i % GRID;
    const slot       = slots[i];
    const slotRow    = Math.floor(slot / GRID);
    const slotCol    = slot % GRID;

    const el = document.createElement('div');
    el.className    = 'p-piece';
    el.dataset.ci   = i;   /* correct index */

    el.style.cssText = `
      width:             ${PW}px;
      height:            ${PH}px;
      background-image:  url("${capturedURL}");
      background-size:   ${window.innerWidth}px ${window.innerHeight}px;
      background-position: ${-correctCol * PW}px ${-correctRow * PH}px;
      left:              ${slotCol * PW}px;
      top:               ${slotRow * PH}px;
      z-index:           ${i + 1};
    `;

    slotMap[slot] = el;
    pieceSlot.set(el, slot);
    pieces.push(el);
    puzzleEl.appendChild(el);

    /* Staggered entrance animation */
    gsap.fromTo(el,
      { opacity: 0, scale: 0.72 },
      { opacity: 1, scale: 1,
        duration: 0.38,
        delay: i * 0.028,
        ease: 'back.out(1.6)' }
    );
  }

  bindDragEvents();
  showHint('Seret kepingan untuk menyusun puzzle', 4500);
}

/* =========================================================
   SHUFFLE HELPERS
========================================================= */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ensureShuffled(total) {
  const arr = Array.from({ length: total }, (_, i) => i);
  do { shuffle(arr); } while (arr.every((v, i) => v === i));
  return arr;
}

/* =========================================================
   DRAG & TOUCH EVENTS
========================================================= */
function bindDragEvents() {
  pieces.forEach(p => {
    p.addEventListener('mousedown',  onPointerDown, false);
    p.addEventListener('touchstart', onPointerDown, { passive: false });
  });

  document.addEventListener('mousemove',  onPointerMove, false);
  document.addEventListener('mouseup',    onPointerUp,   false);
  document.addEventListener('touchmove',  onPointerMove, { passive: false });
  document.addEventListener('touchend',   onPointerUp,   false);
  document.addEventListener('touchcancel',onPointerUp,   false);
}

function unbindDragEvents() {
  document.removeEventListener('mousemove',  onPointerMove, false);
  document.removeEventListener('mouseup',    onPointerUp,   false);
  document.removeEventListener('touchmove',  onPointerMove, false);
  document.removeEventListener('touchend',   onPointerUp,   false);
  document.removeEventListener('touchcancel',onPointerUp,   false);
}

function getXY(e) {
  const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
  return { x: t.clientX, y: t.clientY };
}

/* ── Drag start ── */
function onPointerDown(e) {
  e.preventDefault();
  if (state !== S.PUZZLE) return;
  if (dragData) return;

  const piece = e.currentTarget;
  const { x, y } = getXY(e);
  const rect = piece.getBoundingClientRect();

  dragData = {
    piece,
    fromSlot: pieceSlot.get(piece),
    ox: x - rect.left,
    oy: y - rect.top
  };

  piece.classList.add('dragging');
  piece.style.zIndex    = 9999;
  piece.style.transition = 'none';
  gsap.to(piece, { scale: 1.07, duration: 0.1, ease: 'power1.out' });
}

/* ── Drag move ── */
function onPointerMove(e) {
  e.preventDefault();
  if (!dragData) return;

  const { piece, ox, oy } = dragData;
  const { x, y } = getXY(e);

  piece.style.left = `${x - ox}px`;
  piece.style.top  = `${y - oy}px`;
}

/* ── Drag end ── */
function onPointerUp(e) {
  if (!dragData) return;

  const { piece, fromSlot } = dragData;
  dragData = null;

  piece.classList.remove('dragging');

  /* Center of the piece in its current drag position */
  const currentLeft = parseFloat(piece.style.left);
  const currentTop  = parseFloat(piece.style.top);
  const cx = currentLeft + PW / 2;
  const cy = currentTop  + PH / 2;

  /* Nearest grid slot */
  const targetCol = Math.max(0, Math.min(GRID - 1, Math.floor(cx / PW)));
  const targetRow = Math.max(0, Math.min(GRID - 1, Math.floor(cy / PH)));
  const targetSlot = targetRow * GRID + targetCol;

  /* Same slot → snap back */
  if (targetSlot === fromSlot) {
    snapToSlot(piece, fromSlot, true);
    gsap.to(piece, { scale: 1, duration: 0.18 });
    return;
  }

  /* Swap with occupant */
  const occupant = slotMap[targetSlot];

  /* Move dragged piece to target slot */
  slotMap[targetSlot] = piece;
  pieceSlot.set(piece, targetSlot);
  snapToSlot(piece, targetSlot, true);
  gsap.to(piece, { scale: 1, duration: 0.18 });

  /* Move occupant to fromSlot */
  if (occupant) {
    slotMap[fromSlot] = occupant;
    pieceSlot.set(occupant, fromSlot);
    snapToSlot(occupant, fromSlot, false);
  } else {
    delete slotMap[fromSlot];
  }

  /* Check win after snaps settle */
  setTimeout(checkWin, 360);
}

/* Animate a piece into a grid slot */
function snapToSlot(piece, slot, bounce) {
  const col = slot % GRID;
  const row = Math.floor(slot / GRID);

  gsap.to(piece, {
    left:     col * PW,
    top:      row * PH,
    duration: 0.28,
    ease:     bounce ? 'back.out(1.4)' : 'power2.out',
    onComplete: () => {
      piece.style.zIndex = parseInt(piece.dataset.ci) + 1;
    }
  });
}

/* =========================================================
   WIN CHECK
========================================================= */
function checkWin() {
  if (state !== S.PUZZLE) return;

  const allCorrect = pieces.every(p =>
    pieceSlot.get(p) === parseInt(p.dataset.ci)
  );

  if (allCorrect) onWin();
}

function onWin() {
  state = S.COMPLETE;
  unbindDragEvents();

  /* Highlight all pieces then remove borders */
  pieces.forEach((p, i) => {
    p.classList.add('correct');
    gsap.to(p, {
      borderColor: 'rgba(0,255,136,0)',
      duration: 0.6,
      delay: i * 0.018
    });
  });

  /* Show completion card */
  setTimeout(() => {
    doneEl.classList.add('visible');
  }, 700);
}

/* =========================================================
   RESTART
========================================================= */
restartBtn.addEventListener('click', () => {
  doneEl.classList.remove('visible');

  setTimeout(() => {
    puzzleEl.style.display = 'none';
    puzzleEl.innerHTML     = '';
    overlay.style.display  = '';

    pieces.length = 0;
    slotMap       = {};
    pieceSlot     = new Map();
    capturedURL   = null;
    dragData      = null;

    /* Reset timer bar */
    timerBar.style.transition = 'none';
    timerBar.style.width      = '0%';

    state = S.IDLE;
    setStatus('Mendeteksi Tangan...');
  }, 420);
});

/* =========================================================
   FLOATING HINT
========================================================= */
function showHint(text, duration) {
  const old = document.getElementById('hint');
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = 'hint';
  Object.assign(el.style, {
    position:       'fixed',
    bottom:         '8%',
    left:           '50%',
    transform:      'translateX(-50%)',
    padding:        '9px 22px',
    background:     'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border:         '1px solid rgba(255,255,255,0.11)',
    borderRadius:   '100px',
    color:          'rgba(255,255,255,0.68)',
    fontSize:       '13px',
    fontWeight:     '500',
    letterSpacing:  '0.04em',
    whiteSpace:     'nowrap',
    zIndex:         '9000',
    pointerEvents:  'none'
  });
  el.textContent = text;
  document.body.appendChild(el);

  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
  setTimeout(() => {
    gsap.to(el, { opacity: 0, y: -8, duration: 0.4, onComplete: () => el.remove() });
  }, duration);
}

/* =========================================================
   UTILS
========================================================= */
function setStatus(text) {
  statusEl.textContent = text;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================================================
   BOOT
========================================================= */
window.addEventListener('DOMContentLoaded', startCamera);

/* Handle window resize: rebuild puzzle at new dimensions */
let resizeTimeout;
window.addEventListener('resize', () => {
  if (state !== S.PUZZLE && state !== S.COMPLETE) return;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (state === S.PUZZLE && capturedURL) {
      buildPuzzle();   // rebuild at new size
    }
  }, 300);
});
