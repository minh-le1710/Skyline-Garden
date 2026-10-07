import { useLayoutEffect, useRef } from 'preact/hooks';
import { LOGIN_GIFTS, loginReward, unlocksAt } from '../game';
import { t } from '../i18n';
import { flyers, forgeReveal, levelUp, removeFlyer, toasts, type Flyer } from './feedback';
import { activeModal, loginModalOpen } from './modals';
import { useGame } from './context';
import { RewardChips } from './QuestsPanel';
import { GOLD, ITEM_ICON, PotIcon, RUBY } from './icons';
import { plantName, potName, potStatsText, rarityName } from './names';

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((toast) => (
        <div key={toast.id} class={`toast ${toast.kind}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function FlyingIcon({ flyer }: { flyer: Flyer }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = document.querySelector(`[data-fly-target="${flyer.target}"]`)?.getBoundingClientRect();
    const to = target
      ? { x: target.left + target.width / 2, y: target.top + target.height / 2 }
      : { x: flyer.from.x, y: flyer.from.y - 120 };
    const { from } = flyer;
    const animation = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${from.x}px, ${from.y - 40}px) scale(1.15)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(0.7)`, opacity: 0.4 },
      ],
      { duration: 900, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' },
    );
    animation.onfinish = () => removeFlyer(flyer.id);
    return () => animation.cancel();
  }, [flyer]);
  return (
    <div ref={ref} class="flyer">
      <span>{flyer.icon}</span>
      {flyer.text}
    </div>
  );
}

export function FlyLayer() {
  return (
    <div class="fly-layer" aria-hidden="true">
      {flyers.value.map((f) => (
        <FlyingIcon key={f.id} flyer={f} />
      ))}
    </div>
  );
}

export function LevelUpModal() {
  const info = levelUp.value;
  if (!info || activeModal.value !== 'levelUp') return null;
  const unlocked = unlocksAt(info.level);
  const hasNew = unlocked.plants.length + unlocked.pots.length + unlocked.floors.length > 0;
  const close = () => (levelUp.value = null);
  return (
    <div class="sheet-backdrop center" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="levelup" role="dialog" data-testid="levelup">
        <div class="levelup-star">⭐</div>
        <h2>{t('levelUp.title', { n: info.level })}</h2>
        <p>{t('levelUp.reward')}</p>
        <div class="chips center">
          <span class="chip">
            {GOLD} +{info.gold}
          </span>
          <span class="chip">
            {RUBY} +{info.ruby}
          </span>
        </div>
        {hasNew && (
          <>
            <p>{t('levelUp.newPlants')}</p>
            <div class="chips center">
              {unlocked.plants.map((id) => (
                <span key={id} class="chip">
                  {ITEM_ICON[id]} {plantName(id)}
                </span>
              ))}
              {unlocked.pots.map((id) => (
                <span key={id} class="chip">
                  <PotIcon potId={id} /> {potName(id)}
                </span>
              ))}
              {unlocked.floors.map((f) => (
                <span key={f} class="chip">
                  ☁️ {t('levelUp.floor', { n: f + 1 })}
                </span>
              ))}
            </div>
          </>
        )}
        <button class="btn primary big" onClick={close}>
          {t('levelUp.ok')}
        </button>
      </section>
    </div>
  );
}

/** Màn mở chậu vừa đúc: hiệu ứng theo độ hiếm + chỉ số. */
export function ForgeReveal() {
  const pot = forgeReveal.value[0];
  if (!pot || activeModal.value !== 'forgeReveal') return null;
  const close = () => (forgeReveal.value = forgeReveal.value.slice(1));
  const remaining = forgeReveal.value.length - 1;
  return (
    <div class="sheet-backdrop center" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class={`levelup forge-reveal rarity-${pot.rarity}`} role="dialog" data-testid="forge-reveal">
        <div class="forge-burst">
          <PotIcon potId={pot.potId} rarity={pot.rarity} />
        </div>
        <h2>{t('forge.title')}</h2>
        <p>
          <strong>{potName(pot.potId)}</strong> · {rarityName(pot.rarity)}
        </p>
        <p>{potStatsText(pot)}</p>
        <button class="btn primary big" onClick={close} data-testid="forge-reveal-ok">
          {remaining > 0 ? t('forge.next', { n: remaining }) : t('forge.ok')}
        </button>
      </section>
    </div>
  );
}

/** Hộp quà đăng nhập, tự mở một lần mỗi phiên khi có quà. */
export function LoginModal() {
  const game = useGame();
  if (activeModal.value !== 'login') return null;
  const state = game.state.value;
  const close = () => (loginModalOpen.value = false);
  return (
    <div class="sheet-backdrop center" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="levelup" role="dialog" data-testid="login-modal">
        <div class="levelup-star">🎁</div>
        <h2>{t('login.title', { n: (state.daily.loginCount % LOGIN_GIFTS.length) + 1 })}</h2>
        <p>
          <RewardChips reward={loginReward(state)} />
        </p>
        <button
          class="btn primary big"
          onClick={() => {
            game.exec({ type: 'claimLogin' });
            close();
          }}
        >
          {t('login.claim')}
        </button>
      </section>
    </div>
  );
}
