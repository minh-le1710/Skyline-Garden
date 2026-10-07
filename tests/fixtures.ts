import { createNewGame, step, type Command, type GameState } from '../src/game';
import { T0 } from './helpers';

/** Chạy một kịch bản lệnh hợp lệ, ném lỗi nếu lệnh nào thất bại (dùng để dựng fixture). */
export function scripted(seed: number, script: [number, Command][]): GameState {
  let state = createNewGame(T0, seed);
  let now = T0;
  for (const [dt, cmd] of script) {
    now += dt;
    const result = step(state, cmd, now);
    if (!result.ok) throw new Error(`${cmd.type} thất bại: ${result.error}`);
    state = result.state;
  }
  return state;
}

const MIN = 60_000;

/** Một ván chơi giữa chừng: có cây đang lớn, nông sản trong kho, đơn hàng, chậu mua thêm. */
export function midgame(): GameState {
  const plant = (floor: number, slot: number): [number, Command] => [
    0,
    { type: 'plant', floor, slot, plantId: 'rose' },
  ];
  const harvest = (floor: number, slot: number): [number, Command] => [0, { type: 'harvest', floor, slot }];
  return scripted(7, [
    [0, { type: 'tick' }],
    [0, { type: 'buySeed', plantId: 'rose', qty: 10 }],
    ...[0, 1, 2, 3, 4, 5].map((s) => plant(0, s)),
    [MIN, { type: 'tick' }],
    ...[0, 1, 2, 3, 4, 5].map((s) => harvest(0, s)),
    [0, { type: 'sellItem', id: 'rose', qty: 2 }],
    [0, { type: 'buyPot', potId: 'clay', qty: 1 }],
    [0, { type: 'placePot', floor: 1, slot: 2, uid: 9 }],
    plant(1, 0),
    plant(1, 1),
    [0, { type: 'plant', floor: 0, slot: 0, plantId: 'sunflower' }],
    [10_000, { type: 'tick' }],
    [0, { type: 'discardOrder', index: 2 }],
  ]);
}
