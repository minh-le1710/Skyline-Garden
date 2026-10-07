import { useState } from 'preact/hooks';
import { BACKUP_KEY, readSave, serialize } from '../game';
import { LOCALES, type Locale, type Quality } from '../core/settings';
import { t } from '../i18n';
import { useGame } from './context';
import { showToast } from './feedback';
import { ConfirmDialog, Sheet } from './Sheet';

const LOCALE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };
const QUALITIES: Quality[] = ['auto', 'low', 'high'];

export function SettingsPanel() {
  const game = useGame();
  const settings = game.settings.value.value;
  const update = (patch: Parameters<typeof game.settings.update>[0]) => game.settings.update(patch);
  const [confirm, setConfirm] = useState<null | { kind: 'reset' } | { kind: 'import'; json: string }>(null);
  const close = () => (game.ui.panel.value = null);

  const exportSave = () => {
    const blob = new Blob([serialize(game.state.value)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skyline-garden-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const json = await file.text();
    const result = readSave(json);
    if (result.status === 'ok') setConfirm({ kind: 'import', json });
    else if (result.status === 'tooNew') showToast(t('settings.importNewer'), 'error');
    else
      showToast(
        t('settings.importBad', { reason: result.status === 'corrupt' ? result.reason : '—' }),
        'error',
      );
  };

  const doImport = (json: string) => {
    const result = readSave(json);
    if (result.status !== 'ok') return;
    game.writeKey(BACKUP_KEY, serialize(game.state.value));
    game.replaceState(result.state, 'import');
    showToast(t('settings.importOk'), 'success');
  };

  if (confirm) {
    return confirm.kind === 'reset' ? (
      <ConfirmDialog
        title={t('settings.reset')}
        message={t('settings.resetConfirm')}
        confirmLabel={t('settings.reset')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          game.writeKey(BACKUP_KEY, serialize(game.state.value));
          game.reset();
        }}
      />
    ) : (
      <ConfirmDialog
        title={t('settings.import')}
        message={t('settings.importConfirm')}
        confirmLabel={t('settings.import')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => doImport(confirm.json)}
      />
    );
  }

  return (
    <Sheet title={t('settings.title')} onClose={close} testId="settings">
      <h3>{t('settings.sound')}</h3>
      <label class="setting-row">
        <span>{t('settings.sfx')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.sfx}
          onInput={(e) => update({ sfx: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="setting-row">
        <span>{t('settings.music')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.music}
          onInput={(e) => update({ music: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="setting-row">
        <span>{t('settings.mute')}</span>
        <input type="checkbox" checked={settings.muted} onChange={() => update({ muted: !settings.muted })} />
      </label>
      <label class="setting-row">
        <span>{t('settings.haptics')}</span>
        <input
          type="checkbox"
          checked={settings.haptics}
          onChange={() => update({ haptics: !settings.haptics })}
        />
      </label>

      <h3>{t('settings.display')}</h3>
      <div class="setting-row">
        <span>{t('settings.language')}</span>
        <div class="segmented" role="radiogroup" aria-label={t('settings.language')}>
          {LOCALES.map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={settings.locale === l}
              class={settings.locale === l ? 'active' : ''}
              onClick={() => update({ locale: l })}
              data-testid={`locale-${l}`}
            >
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
      <div class="setting-row">
        <span>{t('settings.quality')}</span>
        <div class="segmented" role="radiogroup" aria-label={t('settings.quality')}>
          {QUALITIES.map((q) => (
            <button
              key={q}
              role="radio"
              aria-checked={settings.quality === q}
              class={settings.quality === q ? 'active' : ''}
              onClick={() => update({ quality: q })}
            >
              {t(`settings.quality.${q}` as const)}
            </button>
          ))}
        </div>
      </div>
      <label class="setting-row">
        <span>{t('settings.reduceMotion')}</span>
        <input
          type="checkbox"
          checked={settings.reduceMotion}
          onChange={() => update({ reduceMotion: !settings.reduceMotion })}
        />
      </label>

      <h3>{t('settings.data')}</h3>
      <div class="setting-actions">
        <button class="btn" onClick={exportSave} data-testid="export-save">
          ⬇ {t('settings.export')}
        </button>
        <label class="btn">
          ⬆ {t('settings.import')}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-save"
            onChange={(e) => void pickFile((e.target as HTMLInputElement).files?.[0])}
          />
        </label>
        <button class="btn danger" onClick={() => setConfirm({ kind: 'reset' })} data-testid="reset-game">
          {t('settings.reset')}
        </button>
      </div>
      <p class="muted small">{t('settings.version', { v: __BUILD_SHA__.slice(0, 7) })}</p>
    </Sheet>
  );
}
