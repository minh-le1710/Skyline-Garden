import type { ActionError, ActionResult, GameEvent, GameState } from './types';

// Mọi action là hàm thuần: kiểm tra trên state cũ, rồi sửa trên một bản sao qua `commit`.

export const fail = (error: ActionError): ActionResult => ({ ok: false, error });

export function commit(
  state: GameState,
  mutate: (draft: GameState, events: GameEvent[]) => void,
): ActionResult {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  mutate(draft, events);
  return { ok: true, state: draft, events };
}
