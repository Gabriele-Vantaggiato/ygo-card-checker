/** Shared by the Angular landing and its isolated visual preview. */
export function scenePosition(top: number, height: number, viewport: number) {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const safeViewport = Math.max(1, viewport);
  return {
    shift: clamp((safeViewport / 2 - top - height / 2) / safeViewport, -1, 1),
    progress: clamp((safeViewport * 0.8 - top) / (height + safeViewport * 0.3), 0, 1),
    visible: top < safeViewport && top + height > 0,
  };
}

export function createLandingMotion(root: HTMLElement, scrollContainer?: HTMLElement) {
  const win = root.ownerDocument.defaultView;
  if (!win) return { destroy() {} };

  const scenes = [...root.querySelectorAll<HTMLElement>('[data-scene]')];
  const chapters = [...root.querySelectorAll<HTMLAnchorElement>('[data-chapter]')];
  const toggle = root.querySelector<HTMLInputElement>('[data-motion-toggle]');
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'ygo-landing-motion';
  let paused = false;
  let frame = 0;
  let destroyed = false;
  let activeChapter = '';
  try {
    paused = win.sessionStorage.getItem(storageKey) === 'off';
  } catch {
    // The landing remains usable when browser storage is unavailable.
  }

  function render() {
    frame = 0;
    if (destroyed || !win) return;
    const origin = scrollContainer?.getBoundingClientRect().top ?? 0;
    const viewport = scrollContainer?.clientHeight ?? win.innerHeight;
    const enabled = !paused && !media.matches;
    // Batch layout reads before all style writes.
    const positions = scenes.map((scene) => {
      const rect = scene.getBoundingClientRect();
      return {
        scene,
        top: rect.top - origin,
        ...scenePosition(rect.top - origin, rect.height, viewport),
      };
    });
    const rootRect = root.getBoundingClientRect();
    const overall = Math.min(
      1,
      Math.max(0, (origin - rootRect.top) / Math.max(1, rootRect.height - viewport)),
    );

    root.style.setProperty('--journey-progress', overall.toFixed(4));
    for (const position of positions) {
      position.scene.style.setProperty('--scene-shift', enabled ? position.shift.toFixed(4) : '0');
      position.scene.style.setProperty(
        '--scene-progress',
        enabled ? position.progress.toFixed(4) : '1',
      );
      position.scene.toggleAttribute('data-in-view', enabled && position.visible);
    }

    // Ordinary page navigation: no wheel/touch interception or scroll snapping.
    const current = positions.filter((p) => p.scene.id && p.top <= viewport * 0.46).at(-1);
    const nextChapter = current?.scene.id ?? '';
    if (nextChapter !== activeChapter) {
      activeChapter = nextChapter;
      chapters.forEach((link) => {
        if (link.dataset['chapter'] === activeChapter)
          link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }

  function schedule() {
    if (!frame && !destroyed && win) frame = win.requestAnimationFrame(render);
  }

  function updateMotion() {
    root.dataset['motion'] = !paused && !media.matches ? 'on' : 'off';
    root.dataset['reducedMotion'] = String(media.matches);
    if (toggle) {
      toggle.checked = !paused && !media.matches;
      toggle.disabled = media.matches;
    }
    schedule();
  }

  function toggleMotion() {
    paused = !toggle?.checked;
    try {
      win?.sessionStorage.setItem(storageKey, paused ? 'off' : 'on');
    } catch {
      // Motion controls do not depend on storage.
    }
    updateMotion();
  }

  const scrollTarget = scrollContainer ?? win;
  scrollTarget.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  media.addEventListener('change', updateMotion);
  toggle?.addEventListener('change', toggleMotion);
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  if (scrollContainer) observer.observe(scrollContainer);
  updateMotion();

  return {
    destroy() {
      destroyed = true;
      if (frame) win.cancelAnimationFrame(frame);
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', schedule);
      media.removeEventListener('change', updateMotion);
      toggle?.removeEventListener('change', toggleMotion);
    },
  };
}
