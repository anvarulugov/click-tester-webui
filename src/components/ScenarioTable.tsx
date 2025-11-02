import type { TestScenario } from '../lib/types';

interface ScenarioTableProps {
  scenarios: TestScenario[];
  selectedScenarioId?: number | null;
  onSelectScenario?: (scenario: TestScenario) => void;
  onRunScenario?: (scenario: TestScenario) => void;
  disableRun?: boolean;
}

const statusMap: Record<
  TestScenario['status'],
  { icon: JSX.Element; label: string }
> = {
  idle: {
    icon: (
      <svg
        className="h-4 w-4 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
    label: 'Не запущен'
  },
  queued: {
    icon: (
      <svg
        className="h-4 w-4 text-amber-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <circle cx="12" cy="12" r="8" opacity={0.6} />
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      </svg>
    ),
    label: 'В очереди'
  },
  running: {
    icon: (
      <svg
        className="h-4 w-4 text-sky-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    label: 'В процессе'
  },
  success: {
    icon: (
      <svg
        className="h-4 w-4 text-emerald-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M8.5 12.5 11 15l4.5-5.5" />
      </svg>
    ),
    label: 'Пройден'
  },
  error: {
    icon: (
      <svg
        className="h-4 w-4 text-rose-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="m9 9 6 6m0-6-6 6" />
      </svg>
    ),
    label: 'Ошибка'
  }
};

export function ScenarioTable({
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  onRunScenario,
  disableRun
}: ScenarioTableProps) {
  return (
    <section className="flex h-[28rem] flex-col rounded-lg border border-slate-800 bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-50">
          Описание сценариев
        </h2>
        <span className="text-xs uppercase tracking-wide text-slate-400">
          Обновляется в реальном времени
        </span>
      </header>
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/70 uppercase text-[11px] tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Запуск</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Статус теста</th>
              <th className="px-3 py-2 text-left">Описание сценария</th>
              <th className="px-3 py-2 text-left">Действие</th>
              <th className="px-3 py-2 text-left">Отправляемый код ошибки</th>
              <th className="px-3 py-2 text-left">Ожидаемый код ошибки</th>
              <th className="px-3 py-2 text-left">Фактический код</th>
              <th className="px-3 py-2 text-left">Длительность (мс)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/70 text-slate-200">
            {scenarios.map((scenario) => (
              <tr
                key={scenario.idx}
                onClick={() => onSelectScenario?.(scenario)}
                className={`transition-colors ${
                  selectedScenarioId === scenario.idx
                    ? 'bg-slate-900/80'
                    : 'hover:bg-slate-900/60'
                } ${onSelectScenario ? 'cursor-pointer' : ''}`}
              >
                <td className="px-3 py-2 text-xs text-slate-300">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRunScenario?.(scenario);
                    }}
                    disabled={!onRunScenario || disableRun}
                    className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 p-1 text-slate-300 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Запустить сценарий"
                  >
                    <span aria-hidden="true">▶</span>
                    <span className="sr-only">Запустить сценарий</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {scenario.idx + 1}
                </td>
                <td className="px-3 py-2 text-xs font-semibold">
                  <span
                    className="inline-flex items-center"
                    title={statusMap[scenario.status].label}
                    aria-label={statusMap[scenario.status].label}
                  >
                    <span aria-hidden="true">
                      {statusMap[scenario.status].icon}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-xs leading-relaxed">
                  {scenario.description}
                </td>
                <td className="px-3 py-2 text-xs uppercase text-slate-300">
                  {scenario.action}
                </td>
                <td className="px-3 py-2 text-xs text-slate-300">
                  {scenario.sending_error_code}
                </td>
                <td className="px-3 py-2 text-xs text-slate-300">
                  {scenario.expected_error_code}
                </td>
                <td className="px-3 py-2 text-xs text-slate-300">
                  {scenario.actualErrorCode ?? '-'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-300">
                  {typeof scenario.durationMs === 'number'
                    ? scenario.durationMs.toFixed(0)
                    : '-'}
                </td>
              </tr>
            ))}
            {scenarios.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-8 text-center text-sm text-slate-500"
                >
                  Загрузите сценарии, чтобы начать тестирование.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
