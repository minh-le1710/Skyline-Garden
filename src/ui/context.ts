import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Game } from '../core/Game';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error('GameContext chưa được cung cấp');
  return game;
}
