import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardImage } from '../../../models/ygo-card.model';
import { TranslatePipe } from '../../pipes/translate.pipe';

export interface PreviewCard {
  id: number;
  name: string;
  type?: string;
  desc?: string;
  imageUrlSmall?: string | null;
  card_images?: CardImage[];
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
}

@Component({
  selector: 'app-card-preview',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-hover-preview', role: 'tooltip' },
  template: `
    <div class="card-hover-heading">
      @if (image(); as src) {
        <img [src]="src" alt="" class="card-hover-art" width="140" height="204" (error)="hideImage($event)">
      }
      <div class="min-w-0">
        <p class="duel-eyebrow">{{ 'ux.cardPreview' | translate }}</p>
        <h3>{{ card().name }}</h3>
        @if (card().type) { <p class="card-hover-type">{{ card().type }}</p> }
        <div class="card-hover-stats">
          @if (card().attribute) { <span>{{ card().attribute }}</span> }
          @if (card().level != null) { <span>★ {{ card().level }}</span> }
          @if (card().atk != null) { <span>ATK {{ stat(card().atk) }}</span> }
          @if (card().def != null) { <span>DEF {{ stat(card().def) }}</span> }
        </div>
      </div>
    </div>
    <div class="card-hover-effect">
      <h4>{{ 'result.effect' | translate }}</h4>
      @if (loading()) {
        <p role="status"><span class="loading loading-dots loading-xs"></span> {{ 'search.loading' | translate }}</p>
      } @else {
        <p>{{ card().desc || ('ux.previewUnavailable' | translate) }}</p>
      }
    </div>
    <p class="card-hover-footer">{{ 'ux.previewHint' | translate }}</p>
  `,
})
export class CardPreviewComponent {
  readonly card = input.required<PreviewCard>();
  readonly loading = input(false);
  image(): string | null { return this.card().card_images?.[0]?.image_url ?? this.card().imageUrlSmall ?? null; }
  stat(value: number | undefined): string { return value == null || value < 0 ? '?' : String(value); }
  hideImage(event: Event): void { (event.target as HTMLImageElement).hidden = true; }
}
