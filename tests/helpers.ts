import { createNewGame, type ActionResult, type GameState } from '../src/game';

export const T0 = 1_700_000_000_000;

export const newGame = (): GameState => createNewGame(T0, 42);

/** Lấy state từ action thành công, ném lỗi nếu action thất bại. */
export function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`action failed: ${result.error}`);
  return result.state;
}

export function errorOf(result: ActionResult): string | null {
  return result.ok ? null : result.error;
}
