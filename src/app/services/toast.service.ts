import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly messages = signal<ToastMessage[]>([]);

  success(message: string, durationMs = 4000): void {
    this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 5000): void {
    this.show(message, 'error', durationMs);
  }

  info(message: string, durationMs = 4000): void {
    this.show(message, 'info', durationMs);
  }

  dismiss(id: number): void {
    this.messages.update((messages) => messages.filter((message) => message.id !== id));
  }

  private show(message: string, type: ToastType, durationMs: number): void {
    const id = ++this.nextId;
    this.messages.update((messages) => [...messages, { id, type, message }]);
    window.setTimeout(() => this.dismiss(id), durationMs);
  }
}
