import { createLandingMotion, scenePosition } from './landing-motion';

describe('landing scroll motion', () => {
  let root: HTMLElement;
  let scrollContainer: HTMLElement;
  let media: MediaQueryList;
  let raf: FrameRequestCallback | undefined;
  let destroy: (() => void) | undefined;

  beforeEach(() => {
    scrollContainer = document.createElement('div');
    root = document.createElement('main');
    root.innerHTML =
      '<input type="checkbox" data-motion-toggle checked>' +
      '<a href="#scene" data-chapter="scene">Deck</a><section id="scene" data-scene></section>';
    scrollContainer.append(root);
    document.body.append(scrollContainer);
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 800 });
    spyOn(scrollContainer, 'getBoundingClientRect').and.returnValue({ top: 0 } as DOMRect);
    spyOn(root, 'getBoundingClientRect').and.returnValue({ top: 0, height: 1800 } as DOMRect);
    spyOn(root.querySelector('section')!, 'getBoundingClientRect').and.returnValue({
      top: 100,
      height: 600,
    } as DOMRect);
    media = {
      matches: false,
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    } as unknown as MediaQueryList;
    spyOn(window, 'matchMedia').and.returnValue(media);
    spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      raf = callback;
      return 71;
    });
    spyOn(window, 'cancelAnimationFrame');
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    destroy?.();
    destroy = undefined;
    scrollContainer.remove();
    raf = undefined;
  });

  function mount() {
    destroy = createLandingMotion(root, scrollContainer).destroy;
  }
  function tick() {
    const callback = raf;
    raf = undefined;
    callback?.(0);
  }

  it('clamps scenes outside the viewport and remains finite for a zero-height viewport', () => {
    expect(scenePosition(900, 500, 800)).toEqual({ shift: -0.9375, progress: 0, visible: false });
    expect(scenePosition(-2000, 500, 800)).toEqual({ shift: 1, progress: 1, visible: false });
    expect(Number.isFinite(scenePosition(0, 0, 0).progress)).toBeTrue();
  });

  it('updates parallax from geometry and marks the current chapter without interrupting native scrolling', () => {
    mount();
    tick();
    const scene = root.querySelector<HTMLElement>('section')!;
    expect(scene.style.getPropertyValue('--scene-progress')).toBe('0.6429');
    expect(scene.hasAttribute('data-in-view')).toBeTrue();
    expect(root.querySelector('a')!.getAttribute('aria-current')).toBe('location');
    const scroll = new Event('scroll', { cancelable: true });
    scrollContainer.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBeFalse();
  });

  it('coalesces multiple scroll events into one animation frame', () => {
    mount();
    tick();
    (window.requestAnimationFrame as jasmine.Spy).calls.reset();
    for (let i = 0; i < 10; i++) scrollContainer.dispatchEvent(new Event('scroll'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('pauses all decorative motion and remembers the choice for the session', () => {
    mount();
    tick();
    const toggle = root.querySelector<HTMLInputElement>('input')!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    tick();
    expect(root.dataset['motion']).toBe('off');
    expect(
      root.querySelector<HTMLElement>('section')!.style.getPropertyValue('--scene-shift'),
    ).toBe('0');
    expect(
      root.querySelector<HTMLElement>('section')!.style.getPropertyValue('--scene-progress'),
    ).toBe('1');
    expect(sessionStorage.setItem).toHaveBeenCalledWith('ygo-landing-motion', 'off');
  });

  it('honors reduced motion, including changes while the page is open', () => {
    mount();
    tick();
    Object.defineProperty(media, 'matches', { value: true });
    const listener = (media.addEventListener as jasmine.Spy).calls.mostRecent().args[1];
    listener();
    tick();
    expect(root.dataset['motion']).toBe('off');
    expect(root.querySelector<HTMLInputElement>('input')!.disabled).toBeTrue();
  });

  it('does not fail when session storage is blocked', () => {
    (sessionStorage.getItem as jasmine.Spy).and.throwError('Storage disabled');
    (sessionStorage.setItem as jasmine.Spy).and.throwError('Storage disabled');
    expect(() => {
      mount();
      tick();
    }).not.toThrow();
    expect(() => root.querySelector('input')!.dispatchEvent(new Event('change'))).not.toThrow();
  });

  it('cancels pending work and removes listeners when navigating away', () => {
    mount();
    destroy!();
    destroy = undefined;
    (window.requestAnimationFrame as jasmine.Spy).calls.reset();
    scrollContainer.dispatchEvent(new Event('scroll'));
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(71);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', jasmine.any(Function));
  });
});
