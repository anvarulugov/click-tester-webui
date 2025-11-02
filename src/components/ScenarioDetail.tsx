import type { TestScenario } from '../lib/types';

interface ScenarioDetailProps {
  scenario?: TestScenario;
}

const statusStyleMap: Record<TestScenario['status'], string> = {
  idle: 'text-slate-400',
  queued: 'text-amber-300',
  running: 'text-sky-300',
  success: 'text-emerald-300',
  error: 'text-rose-300'
};

const statusLabelMap: Record<TestScenario['status'], string> = {
  idle: 'Не запущен',
  queued: 'В очереди',
  running: 'В процессе',
  success: 'Пройден',
  error: 'Ошибка'
};

const formatJson = (data: unknown) => {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }

  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2);
  }

  return String(data);
};

export function ScenarioDetail({ scenario }: ScenarioDetailProps) {
  if (!scenario) {
    return (
      <section className="flex h-[28rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950 text-center text-sm text-slate-500">
        <p>Выберите сценарий в таблице, чтобы увидеть отправленные и полученные данные.</p>
      </section>
    );
  }

  const requestData = scenario.requestPayload ?? scenario.post;
  const responseData =
    scenario.response ??
    (scenario.rawResponse ? scenario.rawResponse : null);

  return (
    <section className="flex h-[28rem] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-50">
            Детали сценария
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
            <span>#{scenario.idx + 1}</span>
            <span
              className={`font-semibold ${statusStyleMap[scenario.status]}`}
            >
              {statusLabelMap[scenario.status]}
            </span>
            <span>{scenario.action}</span>
          </div>
          <p className="text-sm text-slate-300">{scenario.description}</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col gap-3 overflow-auto px-4 py-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Отправленные данные
            </h3>
            <div className="mt-1 rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <pre className="max-h-40 overflow-auto text-xs text-slate-200">
                {formatJson(requestData) || '—'}
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ответ сервера
            </h3>
            <div className="mt-1 rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <pre className="max-h-40 overflow-auto text-xs text-slate-200">
                {formatJson(responseData) ||
                  (scenario.errorMessage
                    ? scenario.errorMessage
                    : '—')}
              </pre>
            </div>
          </div>

          {scenario.rawResponse && scenario.response === null && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Необработанный ответ
              </h3>
              <div className="mt-1 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <pre className="max-h-32 overflow-auto text-xs text-slate-200">
                  {scenario.rawResponse}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
