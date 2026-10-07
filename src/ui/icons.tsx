import type { PlantId, PotId } from '../game';

export const PLANT_ICON: Record<PlantId, string> = {
  rose: '🌹',
  sunflower: '🌻',
  strawberry: '🍓',
  lavender: '🪻',
  lily: '🌷',
  apple: '🍎',
  banana: '🍌',
  coconut: '🥥',
};

export const GOLD = '🪙';
export const RUBY = '💎';
export const XP = '⭐';

export function PotIcon({ potId }: { potId: PotId }) {
  return <span class={`pot-icon pot-${potId}`} aria-hidden="true" />;
}
