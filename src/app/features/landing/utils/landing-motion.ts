/** Shared by Angular and the standalone review; no framework or animation dependency. */
export function scenePosition(top: number, height: number, viewport: number) {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const safeViewport = Math.max(1, viewport);
  return {
    shift: clamp((safeViewport / 2 - top - height / 2) / safeViewport, -1, 1),
    progress: clamp((safeViewport * 0.8 - top) / (height + safeViewport * 0.3), 0, 1),
    visible: top < safeViewport && top + height > 0,
  };
}

export function pinPosition(top: number, height: number, stageHeight: number, offset: number) {
  return Math.min(1, Math.max(0, (offset - top) / Math.max(1, height - stageHeight)));
}

/** Long translations, landscape phones and zoomed text must never be trapped in a pin. */
export function canPin(contentHeight: number, stageHeight: number, reducedMotion: boolean) {
  return !reducedMotion && stageHeight >= 450 && contentHeight + 32 <= stageHeight;
}

export function createLandingMotion(root: HTMLElement, scrollContainer?: HTMLElement) {
  const win = root.ownerDocument.defaultView;
  if (!win) return { destroy() {} };
  const doc = root.ownerDocument;
  const scenes = [...root.querySelectorAll<HTMLElement>('[data-scene]')];
  const chapters = [...root.querySelectorAll<HTMLAnchorElement>('[data-chapter]')];
  const toggle = root.querySelector<HTMLInputElement>('[data-motion-toggle]');
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const hover = win.matchMedia('(hover: hover) and (pointer: fine)');
  const canvas = root.querySelector<HTMLCanvasElement>('[data-atmosphere]');
  const context = canvas?.getContext('2d') ?? null;
  const hero = root.querySelector<HTMLElement>('.lp-hero');
  const storageKey = 'ygo-landing-motion';
  let paused = false;
  let frame = 0;
  let ambientFrame = 0;
  let destroyed = false;
  let activeChapter = '';
  let needsMeasure = true;
  let viewport = 800;
  let headerHeight = 64;
  let chapterHeight = 52;
  let bottomInset = 0;
  let heroVisible = false;
  let canvasWidth = 1;
  let canvasHeight = 1;
  let lastPaint = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  const enabled = () => !paused && !media.matches && !doc.hidden;
  try {
    paused = win.sessionStorage.getItem(storageKey) === 'off';
  } catch {
    /* Optional storage. */
  }

  function measure() {
    if (!win) return;
    viewport = scrollContainer?.clientHeight ?? win.innerHeight;
    const width = root.clientWidth || win.innerWidth;
    const header =
      scrollContainer?.querySelector('header') ??
      root.closest('.app-shell')?.querySelector('.studio-navbar');
    headerHeight = header?.getBoundingClientRect().height || (width < 768 ? 64 : 76);
    chapterHeight = root.querySelector('.lp-chapters')?.getBoundingClientRect().height || 52;
    bottomInset = scrollContainer
      ? 0
      : root.closest('.app-shell')?.querySelector('.mobile-tab-bar')?.getBoundingClientRect()
          .height || 0;
    const measurements = scenes.map((scene) => {
      const content = scene.querySelector<HTMLElement>('.lp-pin-content');
      const offset = headerHeight + (scene === hero ? 0 : chapterHeight);
      return {
        scene,
        offset,
        height: Math.max(0, viewport - offset - bottomInset),
        contentHeight: content?.getBoundingClientRect().height ?? Infinity,
      };
    });
    root.style.setProperty('--lp-header', `${headerHeight}px`);
    root.style.setProperty('--lp-chapter', `${chapterHeight}px`);
    for (const m of measurements) {
      m.scene.style.setProperty('--pin-height', `${m.height}px`);
      m.scene.style.setProperty('--pin-offset', `${m.offset}px`);
      m.scene.toggleAttribute(
        'data-pin-active',
        m.scene.hasAttribute('data-pin') && canPin(m.contentHeight, m.height, media.matches),
      );
    }
    if (canvas && context) {
      const rect = canvas.getBoundingClientRect();
      canvasWidth = Math.max(1, rect.width);
      canvasHeight = Math.max(1, rect.height);
      const dpr = Math.min(1.5, win.devicePixelRatio || 1);
      canvas.width = Math.round(canvasWidth * dpr);
      canvas.height = Math.round(canvasHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    needsMeasure = false;
  }

  function drawAtmosphere(timestamp: number) {
    if (!context || !canvas || !heroVisible) return;
    if (timestamp - lastPaint < 32) return; // Cap decorative canvas work at ~30 fps.
    lastPaint = timestamp;
    const t = timestamp * 0.001;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const count = canvasWidth < 650 ? 38 : 72;
    for (let i = 0; i < count; i++) {
      const seed = (i * 0.61803398875) % 1;
      const x = ((seed + Math.sin(t * 0.11 + i) * 0.012 + 1) % 1) * canvasWidth + pointerX * 14;
      const y = ((i * 0.381966 + t * (0.008 + seed * 0.012)) % 1) * canvasHeight;
      const alpha = 0.16 + 0.34 * Math.pow(Math.sin(t * 0.5 + i), 2);
      const size = 0.6 + (i % 4) * 0.35;
      context.fillStyle = `rgba(239,202,131,${alpha})`;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
      if (i % 9 === 0) {
        context.strokeStyle = `rgba(211,166,91,${alpha * 0.28})`;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 10, y - 38);
        context.stroke();
      }
    }
  }

  function animate(timestamp: number) {
    ambientFrame = 0;
    if (destroyed || !enabled() || !win) return;
    pointerX += (targetX - pointerX) * 0.09;
    pointerY += (targetY - pointerY) * 0.09;
    root.style.setProperty('--pointer-x', pointerX.toFixed(3));
    root.style.setProperty('--pointer-y', pointerY.toFixed(3));
    drawAtmosphere(timestamp);
    if (
      (context && heroVisible) ||
      Math.abs(targetX - pointerX) + Math.abs(targetY - pointerY) > 0.002
    ) {
      ambientFrame = win.requestAnimationFrame(animate);
    }
  }

  function wakeAmbient() {
    if (
      !ambientFrame &&
      !destroyed &&
      enabled() &&
      win &&
      ((context && heroVisible) ||
        Math.abs(targetX - pointerX) + Math.abs(targetY - pointerY) > 0.002)
    ) {
      ambientFrame = win.requestAnimationFrame(animate);
    }
  }

  function render() {
    frame = 0;
    if (destroyed || !win) return;
    if (needsMeasure) measure();
    const origin = scrollContainer?.getBoundingClientRect().top ?? 0;
    const moving = enabled();
    // Read all geometry before writing scroll variables. Nothing intercepts native scrolling.
    const positions = scenes.map((scene) => {
      const rect = scene.getBoundingClientRect();
      const top = rect.top - origin;
      const offset = headerHeight + (scene === hero ? 0 : chapterHeight);
      const stageHeight = Math.max(1, viewport - offset - bottomInset);
      return {
        scene,
        top,
        ...scenePosition(top, rect.height, viewport),
        pin: pinPosition(top, rect.height, stageHeight, offset),
        reveal: Math.min(1, Math.max(0, (viewport * 0.91 - top) / (viewport * 0.36))),
      };
    });
    const rootRect = root.getBoundingClientRect();
    root.style.setProperty(
      '--journey-progress',
      Math.min(
        1,
        Math.max(0, (origin - rootRect.top) / Math.max(1, rootRect.height - viewport)),
      ).toFixed(4),
    );
    heroVisible = positions.find((p) => p.scene === hero)?.visible ?? false;
    for (const p of positions) {
      p.scene.style.setProperty('--scene-shift', moving ? p.shift.toFixed(4) : '0');
      p.scene.style.setProperty('--scene-progress', moving ? p.progress.toFixed(4) : '1');
      p.scene.style.setProperty(
        '--pin-progress',
        moving ? (p.scene.hasAttribute('data-pin-active') ? p.pin : p.progress).toFixed(4) : '.5',
      );
      p.scene.style.setProperty('--reveal', moving ? p.reveal.toFixed(4) : '1');
      p.scene.toggleAttribute('data-in-view', moving && p.visible);
    }
    const current = positions
      .filter(
        (p) =>
          p.scene.id &&
          chapters.some((a) => a.dataset['chapter'] === p.scene.id) &&
          p.top <= viewport * 0.46,
      )
      .at(-1);
    const nextChapter = current?.scene.id ?? '';
    if (nextChapter !== activeChapter) {
      activeChapter = nextChapter;
      for (const link of chapters) {
        if (link.dataset['chapter'] === activeChapter)
          link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
    wakeAmbient();
  }

  function schedule() {
    if (!frame && !destroyed && win) frame = win.requestAnimationFrame(render);
  }
  function resize() {
    needsMeasure = true;
    schedule();
  }
  function updateMotion() {
    root.dataset['motion'] = !paused && !media.matches ? 'on' : 'off';
    root.dataset['reducedMotion'] = String(media.matches);
    root.dataset['documentVisible'] = String(!doc.hidden);
    if (toggle) {
      toggle.checked = !paused && !media.matches;
      toggle.disabled = media.matches;
    }
    if (!enabled()) {
      if (ambientFrame && win) win.cancelAnimationFrame(ambientFrame);
      ambientFrame = 0;
      targetX = targetY = pointerX = pointerY = 0;
      root.style.setProperty('--pointer-x', '0');
      root.style.setProperty('--pointer-y', '0');
      context?.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    resize();
  }
  function toggleMotion() {
    paused = !toggle?.checked;
    try {
      win?.sessionStorage.setItem(storageKey, paused ? 'off' : 'on');
    } catch {
      /* Optional storage. */
    }
    updateMotion();
  }
  function pointerMove(event: PointerEvent) {
    if (!enabled() || !hover.matches || event.pointerType === 'touch') return;
    const rect = root.getBoundingClientRect();
    const origin = scrollContainer?.getBoundingClientRect().top ?? 0;
    targetX = Math.max(
      -1,
      Math.min(1, ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2),
    );
    targetY = Math.max(
      -1,
      Math.min(1, ((event.clientY - origin) / Math.max(1, viewport) - 0.5) * 2),
    );
    wakeAmbient();
  }
  function pointerLeave() {
    targetX = targetY = 0;
    wakeAmbient();
  }

  const scrollTarget = scrollContainer ?? win;
  scrollTarget.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', resize, { passive: true });
  media.addEventListener('change', updateMotion);
  doc.addEventListener('visibilitychange', updateMotion);
  root.addEventListener('pointermove', pointerMove, { passive: true });
  root.addEventListener('pointerleave', pointerLeave);
  toggle?.addEventListener('change', toggleMotion);
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  root.querySelectorAll('.lp-pin-content').forEach((node) => observer.observe(node));
  if (scrollContainer) observer.observe(scrollContainer);
  updateMotion();
  return {
    destroy() {
      destroyed = true;
      if (frame) win.cancelAnimationFrame(frame);
      if (ambientFrame) win.cancelAnimationFrame(ambientFrame);
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', resize);
      media.removeEventListener('change', updateMotion);
      doc.removeEventListener('visibilitychange', updateMotion);
      root.removeEventListener('pointermove', pointerMove);
      root.removeEventListener('pointerleave', pointerLeave);
      toggle?.removeEventListener('change', toggleMotion);
    },
  };
}
