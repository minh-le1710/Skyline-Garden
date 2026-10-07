import { BoxGeometry, Group } from 'three';
import type { MachineId } from '../../game';
import { toon } from '../materials';
import { geo, mesh } from './common';

/** Mô hình tạm cho máy (sẽ thay bằng mô hình riêng từng máy). */
export function buildMachine(_machineId: MachineId): Group {
  const group = new Group();
  group.add(
    mesh(
      geo('machineBox', () => new BoxGeometry(0.9, 0.8, 0.8)),
      toon(0xb08968),
      0,
      0.4,
    ),
  );
  return group;
}
