import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';

const HOVER_ZONES = 8;
const MAX_TILT = 14;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-tilt-3d',
  standalone: true,
  template: `
    <div
      class="hover-3d card-tilt-3d w-full"
      [class.card-tilt-3d--gyro]="gyroMode()"
      [style.--tilt-x]="tiltX()"
      [style.--tilt-y]="tiltY()"
      [style.--shine]="shine()"
      [style.--shadow]="shadow()"
      (touchstart)="onTouchStart($event)"
      (touchmove)="onTouchMove($event)"
      (touchend)="onTouchEnd()"
      (touchcancel)="onTouchEnd()"
    >
      <figure class="m-0 aspect-[59/86] w-full">
        <img [src]="src()" [alt]="alt()" class="h-full w-full rounded-xl object-cover" loading="lazy" />
      </figure>
      @if (hoverMode()) {
        @for (zone of hoverZones; track zone) {
          <div></div>
        }
      }
    </div>
  `,
  styles: [
    `
      .card-tilt-3d--gyro > :first-child {
        transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) scale(1.03);
        transition: transform 70ms linear;
        outline-color: rgb(255 255 255 / 0.1);
      }

      .card-tilt-3d--gyro > :first-child::before {
        opacity: 0.75;
      }

      @media (prefers-reduced-motion: reduce) {
        .card-tilt-3d--gyro > :first-child {
          transform: none;
          transition: none;
        }
      }
    `,
  ],
})
export class CardTilt3dComponent {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();

  protected readonly hoverZones = Array.from({ length: HOVER_ZONES }, (_, index) => index);
  protected readonly hoverMode = signal(false);
  protected readonly gyroMode = signal(false);

  protected readonly tiltX = signal('0deg');
  protected readonly tiltY = signal('0deg');
  protected readonly shine = signal('100% 100%');
  protected readonly shadow = signal('0rem 0rem');

  private readonly destroyRef = inject(DestroyRef);

  private gyroAttached = false;
  private touchActive = false;
  private baseBeta = 0;
  private baseGamma = 0;
  private orientationCalibrated = false;
  private rafId: number | null = null;
  private pendingTilt: { x: number; y: number } | null = null;

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    if (this.touchActive || event.beta == null || event.gamma == null) {
      return;
    }

    if (!this.orientationCalibrated) {
      this.baseBeta = event.beta;
      this.baseGamma = event.gamma;
      this.orientationCalibrated = true;
    }

    const x = clamp((event.beta - this.baseBeta) * -0.85, -MAX_TILT, MAX_TILT);
    const y = clamp((event.gamma - this.baseGamma) * 0.85, -MAX_TILT, MAX_TILT);
    this.scheduleTilt(x, y);
  };

  constructor() {
    afterNextRender(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      this.hoverMode.set(finePointer && !reducedMotion);
      this.gyroMode.set(!finePointer && !reducedMotion);

      if (this.gyroMode()) {
        this.tryAttachGyro();
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.gyroAttached) {
        window.removeEventListener('deviceorientation', this.onOrientation);
      }
      if (this.rafId != null) {
        cancelAnimationFrame(this.rafId);
      }
    });
  }

  protected onTouchStart(event: TouchEvent): void {
    if (!this.gyroMode()) {
      return;
    }

    this.touchActive = true;
    this.tryAttachGyro();

    if (event.touches.length === 1) {
      this.applyTouchTilt(event.touches[0], event.currentTarget as HTMLElement);
    }
  }

  protected onTouchMove(event: TouchEvent): void {
    if (!this.gyroMode() || !this.touchActive || event.touches.length !== 1) {
      return;
    }

    event.preventDefault();
    this.applyTouchTilt(event.touches[0], event.currentTarget as HTMLElement);
  }

  protected onTouchEnd(): void {
    this.touchActive = false;
    this.scheduleTilt(0, 0);
  }

  private applyTouchTilt(touch: Touch, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = clamp(((touch.clientY - centerY) / (rect.height / 2)) * -MAX_TILT, -MAX_TILT, MAX_TILT);
    const y = clamp(((touch.clientX - centerX) / (rect.width / 2)) * MAX_TILT, -MAX_TILT, MAX_TILT);
    this.scheduleTilt(x, y);
  }

  private tryAttachGyro(): void {
    if (this.gyroAttached || !this.gyroMode()) {
      return;
    }

    const attach = (): void => {
      if (this.gyroAttached) {
        return;
      }
      window.addEventListener('deviceorientation', this.onOrientation, { passive: true });
      this.gyroAttached = true;
    };

    const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };

    if (typeof orientationEvent.requestPermission === 'function') {
      void orientationEvent.requestPermission().then((state) => {
        if (state === 'granted') {
          attach();
        }
      });
      return;
    }

    attach();
  }

  private scheduleTilt(x: number, y: number): void {
    this.pendingTilt = { x, y };

    if (this.rafId != null) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.pendingTilt) {
        return;
      }

      const { x: tiltX, y: tiltY } = this.pendingTilt;
      this.pendingTilt = null;
      this.applyTilt(tiltX, tiltY);
    });
  }

  private applyTilt(x: number, y: number): void {
    this.tiltX.set(`${x.toFixed(2)}deg`);
    this.tiltY.set(`${y.toFixed(2)}deg`);

    const shineX = 50 + (y / MAX_TILT) * 50;
    const shineY = 50 + (x / MAX_TILT) * 50;
    this.shine.set(`${shineX.toFixed(1)}% ${shineY.toFixed(1)}%`);

    const shadowX = ((y / MAX_TILT) * 0.5).toFixed(2);
    const shadowY = ((x / MAX_TILT) * 0.5).toFixed(2);
    this.shadow.set(`${shadowX}rem ${shadowY}rem`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
