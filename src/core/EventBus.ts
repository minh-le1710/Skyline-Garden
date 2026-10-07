export class EventBus<E extends { type: string }> {
  private listeners = new Set<(event: E) => void>();

  on(listener: (event: E) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: E): void {
    for (const listener of this.listeners) listener(event);
  }
}
