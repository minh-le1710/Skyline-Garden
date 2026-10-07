import type { Game } from '../core/Game';
import { BlockingNotice } from './BlockingNotice';
import { GameContext, useGame } from './context';
import { Hud } from './Hud';
import { MachinePanel } from './MachinePanel';
import { OrdersPanel } from './OrdersPanel';
import { FlyLayer, ForgeReveal, LevelUpModal, LoginModal, Toasts } from './Overlays';
import { QuestsPanel } from './QuestsPanel';
import { BalloonPanel } from './BalloonPanel';
import { PotInfo } from './PotInfo';
import { ShopPanel } from './ShopPanel';
import { StoragePanel } from './StoragePanel';
import { Toolbar } from './Toolbar';
import { ToolBanner, Tray } from './Tray';
import { UnlockDialog } from './UnlockDialog';

function Panels() {
  const panel = useGame().ui.panel.value;
  switch (panel) {
    case 'shop':
      return <ShopPanel />;
    case 'storage':
      return <StoragePanel />;
    case 'orders':
      return <OrdersPanel />;
    case 'unlock':
      return <UnlockDialog />;
    case 'machine':
      return <MachinePanel />;
    case 'quests':
      return <QuestsPanel />;
    case 'balloon':
      return <BalloonPanel />;
    default:
      return null;
  }
}

export function App({ game }: { game: Game }) {
  return (
    <GameContext.Provider value={game}>
      <Hud />
      <ToolBanner />
      <Toasts />
      <div class="bottom">
        <PotInfo />
        <Tray />
        <Toolbar />
      </div>
      <Panels />
      <LevelUpModal />
      <ForgeReveal />
      <LoginModal />
      <FlyLayer />
      <BlockingNotice />
    </GameContext.Provider>
  );
}
