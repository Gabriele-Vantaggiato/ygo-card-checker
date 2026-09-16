import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GeminiCoachService } from '../../../services/gemini-coach.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Encrypted-key unlock + model picker for Gemini, shared by every feature that calls it. */
@Component({
  selector: 'app-gemini-key-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-base-300/60 bg-base-200/30 p-3 space-y-3">
      <p class="text-xs text-base-content/65">{{ 'replay.gemini.privacy' | translate }}</p>
      <p class="text-xs text-base-content/55">{{ 'replay.gemini.apiKeyHint' | translate }}</p>

      <label class="form-control">
        <span class="label-text text-xs">{{ 'replay.gemini.model' | translate }}</span>
        <select
          class="select select-bordered select-sm"
          [ngModel]="gemini.selectedModel()"
          (ngModelChange)="gemini.setModel($event)"
        >
          @for (m of gemini.modelOptions; track m) {
            <option [value]="m">{{ m }}</option>
          }
        </select>
      </label>

      @if (!gemini.unlocked()) {
        @if (!gemini.hasStoredKey()) {
          <label class="form-control">
            <span class="label-text text-xs">{{ 'replay.gemini.apiKey' | translate }}</span>
            <input
              type="password"
              class="input input-bordered input-sm"
              [(ngModel)]="apiKeyDraft"
              autocomplete="off"
            />
          </label>
        }
        <label class="form-control">
          <span class="label-text text-xs">{{ 'replay.gemini.passphrase' | translate }}</span>
          <input
            type="password"
            class="input input-bordered input-sm"
            [(ngModel)]="passphraseDraft"
            autocomplete="off"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          @if (!gemini.hasStoredKey()) {
            <button type="button" class="btn btn-outline btn-sm" (click)="saveKey()">
              {{ 'replay.gemini.save' | translate }}
            </button>
          } @else {
            <button type="button" class="btn btn-outline btn-sm" (click)="unlock()">
              {{ 'replay.gemini.unlock' | translate }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="gemini.clearStored()">
              {{ 'replay.gemini.clear' | translate }}
            </button>
          }
        </div>
        @if (localError(); as err) {
          <p class="text-xs text-error">{{ err | translate }}</p>
        }
      } @else {
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-success badge-sm">{{ 'replay.gemini.unlocked' | translate }}</span>
          <button type="button" class="btn btn-ghost btn-xs" (click)="gemini.lockSession()">
            {{ 'replay.gemini.lock' | translate }}
          </button>
        </div>
      }
    </div>
  `,
})
export class GeminiKeyPanelComponent {
  protected readonly gemini = inject(GeminiCoachService);

  apiKeyDraft = '';
  passphraseDraft = '';
  readonly localError = signal<string | null>(null);

  async saveKey(): Promise<void> {
    this.localError.set(null);
    try {
      await this.gemini.saveEncryptedKey(this.apiKeyDraft, this.passphraseDraft);
      this.apiKeyDraft = '';
      this.passphraseDraft = '';
    } catch (err) {
      this.localError.set(
        err instanceof Error && err.message.startsWith('replay.') ? err.message : 'replay.gemini.error.save',
      );
    }
  }

  async unlock(): Promise<void> {
    this.localError.set(null);
    try {
      await this.gemini.unlock(this.passphraseDraft);
      this.passphraseDraft = '';
    } catch (err) {
      this.localError.set(
        err instanceof Error && err.message.startsWith('replay.') ? err.message : 'replay.gemini.error.badPassphrase',
      );
    }
  }
}
