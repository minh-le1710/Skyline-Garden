import type { ItemId, PotId, Rarity } from '../game';

export const ITEM_ICON: Record<ItemId, string> = {
  rose: '🌹',
  sunflower: '🌻',
  strawberry: '🍓',
  mint: '🌿',
  lavender: '🪻',
  tea: '🍃',
  lily: '🌷',
  apple: '🍎',
  cotton: '☁️',
  banana: '🍌',
  lotus: '🪷',
  coconut: '🥥',
  cocoa: '🫘',
  dragonfruit: '🐉',
  vanilla: '🌼',
  starfruit: '⭐',
  rose_water: '🧴',
  mint_oil: '🧪',
  lavender_oil: '💜',
  lotus_essence: '🫙',
  strawberry_jam: '🍯',
  apple_jam: '🥫',
  dragonfruit_jam: '🍮',
  roasted_seeds: '🌰',
  green_tea: '🍵',
  mint_tea: '🫖',
  lotus_tea: '🧋',
  yarn: '🧶',
  cloth: '🧣',
  scented_sachet: '👝',
  apple_juice: '🧃',
  smoothie: '🥤',
  coconut_milk: '🥛',
  starfruit_juice: '🍹',
  chocolate: '🍫',
  banana_bread: '🍞',
  vanilla_cake: '🍰',
  bouquet: '💐',
  spa_basket: '🎀',
  grand_hamper: '🎁',
  cloudclay: '🟫',
  dewglass: '💧',
  sunstone: '🔆',
  stardust: '✨',
  cloudBomb: '💣',
  petTreat: '🍪',
};

/** @deprecated dùng ITEM_ICON */
export const PLANT_ICON = ITEM_ICON;

export const GOLD = '🪙';
export const RUBY = '💎';
export const XP = '⭐';

/** Biểu tượng chậu vẽ bằng CSS; viền màu theo độ hiếm. */
export function PotIcon({ potId, rarity }: { potId: PotId; rarity?: Rarity }) {
  return <span class={`pot-icon pot-${potId} ${rarity ? `rarity-${rarity}` : ''}`} aria-hidden="true" />;
}
