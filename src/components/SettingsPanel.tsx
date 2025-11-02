import type { TesterSettings } from '../lib/types';

interface SettingsPanelProps {
  settings: TesterSettings;
  onChange: (key: keyof TesterSettings, value: string) => void;
  onLoadScenarios: () => void;
  onStart: () => void;
  onStop: () => void;
  loadingScenarios: boolean;
  isRunning: boolean;
  scenarioCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400';

export function SettingsPanel({
  settings,
  onChange,
  onLoadScenarios,
  onStart,
  onStop,
  loadingScenarios,
  isRunning,
  scenarioCount,
  collapsed,
  onToggleCollapsed
}: SettingsPanelProps) {
  const handleChange =
    (key: keyof TesterSettings) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(key, event.target.value);
    };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-lg shadow-slate-950/40">
      <header
        className={`${collapsed ? 'mb-2' : 'mb-4'} flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-50">
            Настройки
          </h2>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500 hover:text-sky-300"
          >
            {collapsed ? 'Развернуть' : 'Свернуть'}
          </button>
        </div>

        <span className="rounded bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
          Сценариев: {scenarioCount}
        </span>
      </header>

      {!collapsed && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-2 xl:col-span-2">
              Prepare URL
              <input
                className={inputClass}
                type="url"
                placeholder="https://domain.uz/prepare.php"
                value={settings.prepareUrl}
                onChange={handleChange('prepareUrl')}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-2 xl:col-span-2">
              Complete URL
              <input
                className={inputClass}
                type="url"
                placeholder="https://domain.uz/complete.php"
                value={settings.completeUrl}
                onChange={handleChange('completeUrl')}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-2 xl:col-span-1">
              secret_key
              <input
                className={inputClass}
                type="password"
                value={settings.secretKey}
                onChange={handleChange('secretKey')}
                placeholder="секретный ключ"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-1 xl:col-span-1">
              service_id
              <input
                className={inputClass}
                value={settings.serviceId}
                onChange={handleChange('serviceId')}
                placeholder="12345"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-1 xl:col-span-1">
              merchant_trans_id
              <input
                className={inputClass}
                value={settings.merchantTransId}
                onChange={handleChange('merchantTransId')}
                placeholder="123"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-1 xl:col-span-1">
              merchant_user_id
              <input
                className={inputClass}
                value={settings.merchantUserId}
                onChange={handleChange('merchantUserId')}
                placeholder="user-001"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-1 xl:col-span-1">
              prepare/confirm_id
              <input
                className={inputClass}
                value={settings.presetMerchantPrepareId}
                onChange={handleChange('presetMerchantPrepareId')}
                placeholder="merchant_prepare_id"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400 md:col-span-1 xl:col-span-1">
              click_paydoc_id
              <input
                className={inputClass}
                value={settings.clickPaydocId}
                onChange={handleChange('clickPaydocId')}
                placeholder="16853761"
              />
            </label>
          </div>
      )}

      <footer
        className={`flex flex-wrap items-center gap-3 ${
          collapsed ? 'mt-2' : 'mt-6'
        }`}
      >
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onLoadScenarios}
          disabled={loadingScenarios || isRunning}
        >
          {loadingScenarios ? 'Загрузка…' : 'Загрузить сценарии'}
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:border-sky-500 hover:bg-sky-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onStart}
          disabled={isRunning || scenarioCount === 0}
        >
          Начать тест
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-rose-700/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-500 hover:bg-rose-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onStop}
          disabled={!isRunning}
        >
          Остановить
        </button>
      </footer>
    </section>
  );
}
