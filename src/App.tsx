import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { ScenarioTable } from './components/ScenarioTable';
import { ScenarioDetail } from './components/ScenarioDetail';
import { LogConsole } from './components/LogConsole';
import { useLocalStorage } from './hooks/useLocalStorage';
import { md5 } from './lib/md5';
import type {
  ApiResponse,
  LogEntry,
  ScenarioDefinition,
  TestScenario,
  TesterSettings
} from './lib/types';

const defaultSettings: TesterSettings = {
  prepareUrl: '',
  completeUrl: '',
  serviceId: '',
  secretKey: '',
  merchantTransId: '',
  merchantUserId: '',
  clickPaydocId: '16853761',
  presetMerchantPrepareId: ''
};

const templateUrl = '/template.json';

const randomTransactionId = () =>
  String(
    Math.floor(Math.random() * (999_999_999_000 - 999_999_999 + 1)) +
      999_999_999
  );

const formatTimestamp = (date: Date) =>
  date
    .toLocaleString('ru-RU', {
      hour12: false
    })
    .replace(',', '');

const toUrlEncoded = (payload: Record<string, string>) =>
  new URLSearchParams(payload).toString();

const normalizeErrorCode = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
};

interface RequestContext {
  url: string;
  payload: Record<string, string>;
  merchantPrepareIdUsed: string;
}

function buildRequestContext(
  scenario: TestScenario,
  scenarioIndex: number,
  settings: TesterSettings,
  previousMerchantPrepareId: string
): RequestContext {
  const isComplete = scenario.action === 'complete';
  const payload: Record<string, string> = {};

  Object.entries(scenario.post).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      payload[key] = String(value);
    }
  });

  payload.service_id = settings.serviceId || payload.service_id || '';

  const merchantTransId =
    scenarioIndex === 7
      ? randomTransactionId()
      : settings.merchantTransId || payload.merchant_trans_id || '';
  payload.merchant_trans_id = merchantTransId;

  const merchantPrepareIdUsed = isComplete
    ? scenarioIndex === 9
      ? randomTransactionId()
      : previousMerchantPrepareId
    : '';

  if (isComplete && merchantPrepareIdUsed) {
    payload.merchant_prepare_id = merchantPrepareIdUsed;
  }

  payload.error = String(scenario.sending_error_code);
  payload.error_note = payload.error_note || 'Ok';
  payload.click_paydoc_id =
    settings.clickPaydocId || payload.click_paydoc_id || '';

  if (settings.merchantUserId) {
    payload.merchant_user_id = settings.merchantUserId;
  }

  if (scenarioIndex === 3) {
    payload.amount = '499';
  }

  payload.sign_time =
    payload.sign_time ||
    new Date().toISOString().replace('T', ' ').slice(0, 19);

  payload.sign_string =
    scenarioIndex === 0 || scenarioIndex === 2
      ? '10a250d95b1a6afedcda8360a12a1341'
      : md5(
          `${payload.click_trans_id}${payload.service_id}${settings.secretKey}${payload.merchant_trans_id}${
            isComplete ? merchantPrepareIdUsed : ''
          }${payload.amount}${payload.action}${payload.sign_time}`
        );

  return {
    url: isComplete ? settings.completeUrl : settings.prepareUrl,
    payload,
    merchantPrepareIdUsed
  };
}

interface RequestResult {
  json: ApiResponse | null;
  raw: string;
}

async function sendScenarioRequest(
  url: string,
  payload: Record<string, string>
): Promise<RequestResult> {
  if (!url) {
    throw new Error('URL не задан в настройках');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: toUrlEncoded(payload)
  });

  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as ApiResponse;
    return { json: parsed, raw };
  } catch {
    return { json: null, raw };
  }
}

export default function App() {
  const [settings, setSettings] = useLocalStorage<TesterSettings>(
    'clickTesterSettings',
    defaultSettings
  );
  const [settingsCollapsed, setSettingsCollapsed] = useLocalStorage<boolean>(
    'clickTesterSettingsCollapsed',
    false
  );
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState<number | null>(
    null
  );

  const cancelRef = useRef(false);

  const scenarioCount = scenarios.length;

  const normalizeScenarioForQueue = useCallback(
    (scenario: TestScenario): TestScenario => ({
      ...scenario,
      status: 'queued',
      response: null,
      rawResponse: undefined,
      errorMessage: undefined,
      requestPayload: undefined,
      actualErrorCode: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      durationMs: undefined
    }),
    []
  );

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: formatTimestamp(new Date()),
      level,
      message
    };

    setLogs((prev) => {
      const next = [...prev, entry];
      return next.slice(-500);
    });
  }, []);

  const handleSettingsChange = useCallback(
    (key: keyof TesterSettings, value: string) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value
      }));
    },
    [setSettings]
  );

  const handleLoadScenarios = useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as ScenarioDefinition[];

      const mapped: TestScenario[] = data.map((scenario, idx) => ({
        ...scenario,
        idx,
        status: 'idle'
      }));

      setScenarios(mapped);
      setSelectedScenarioIdx(mapped.length > 0 ? mapped[0].idx : null);
      addLog('info', `Загружено сценариев: ${mapped.length}`);
    } catch (error) {
      addLog(
        'error',
        `Не удалось загрузить сценарии: ${
          error instanceof Error ? error.message : 'неизвестная ошибка'
        }`
      );
    } finally {
      setLoadingScenarios(false);
    }
  }, [addLog, setSelectedScenarioIdx]);

  const stopQueue = useCallback(() => {
    if (!isRunning) {
      return;
    }
    cancelRef.current = true;
    addLog('info', 'Запрошена остановка очереди.');
  }, [addLog, isRunning]);

  const runQueue = useCallback(
    async (snapshot: TestScenario[]) => {
      setIsRunning(true);
      cancelRef.current = false;
      let merchantPrepareIdOld = settings.presetMerchantPrepareId || '';

      addLog('info', 'Тестирование началось.');

      for (let index = 0; index < snapshot.length; index += 1) {
        if (cancelRef.current) {
          addLog('info', 'Выполнение остановлено пользователем.');
          break;
        }

        const scenario = snapshot[index];

        const startedAt = new Date();

        setScenarios((prev) =>
          prev.map((item) =>
            item.idx === scenario.idx
              ? { ...item, status: 'running', startedAt: startedAt.toISOString() }
              : item
          )
        );

        addLog(
          'info',
          `[${scenario.idx + 1}] ${scenario.description} (${scenario.action})`
        );

        const { payload, url, merchantPrepareIdUsed } = buildRequestContext(
          scenario,
          scenario.idx,
          settings,
          merchantPrepareIdOld
        );

        let response: ApiResponse | null = null;
        let rawResponse = '';
        let status: TestScenario['status'] = 'success';
        let errorMessage: string | undefined;
        let actualErrorCode: number | string | null = null;

        try {
          const result = await sendScenarioRequest(url, payload);
          response = result.json;
          rawResponse = result.raw;

          if (!response) {
            status = 'error';
            errorMessage = 'Ответ сервера не является JSON.';
          } else if (response.success === false) {
            status = 'error';
            errorMessage =
              response.message || 'Сервер вернул success = false.';
          }

          if (response) {
            const numericError = normalizeErrorCode(response.error);
            actualErrorCode =
              (response.error as number | string | null | undefined) ?? null;
            if (numericError !== null) {
              actualErrorCode = numericError;
            }

            if (numericError === null) {
              status = 'error';
              errorMessage = 'Не удалось определить код ошибки в ответе сервера.';
            } else if (numericError !== scenario.expected_error_code) {
              status = 'error';
              errorMessage = `Ожидался код ${scenario.expected_error_code}, получен ${response.error}.`;
            }
          }

          if (
            scenario.action === 'prepare' &&
            response &&
            typeof response.merchant_prepare_id === 'string'
          ) {
            merchantPrepareIdOld = response.merchant_prepare_id;
          }
        } catch (error) {
          status = 'error';
          errorMessage =
            error instanceof Error ? error.message : 'Ошибка сети.';
        }

        if (status === 'success') {
          addLog(
            'success',
            `[${scenario.idx + 1}] ${scenario.description} — успешно (код ${
              actualErrorCode ?? response?.error ?? 'n/a'
            })`
          );
        } else {
          addLog(
            'error',
            `[${scenario.idx + 1}] ${scenario.description} — ошибка: ${
              errorMessage ?? 'подробности отсутствуют'
            }`
          );
        }

        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        setScenarios((prev) =>
          prev.map((item) =>
            item.idx === scenario.idx
              ? {
                  ...item,
                  status,
                  response,
                  rawResponse,
                  errorMessage,
                  requestPayload: payload,
                  actualErrorCode,
                  finishedAt: finishedAt.toISOString(),
                  durationMs
                }
              : item
          )
        );

        if (cancelRef.current) {
          addLog(
            'info',
            'Оставшиеся сценарии были пропущены после остановки очереди.'
          );
          break;
        }
      }

      setIsRunning(false);
    },
    [addLog, settings]
  );

  const handleStart = useCallback(async () => {
    if (isRunning) {
      return;
    }

    if (!settings.prepareUrl || !settings.completeUrl) {
      addLog('error', 'Заполните Prepare URL и Complete URL.');
      return;
    }

    if (!settings.serviceId || !settings.secretKey) {
      addLog('error', 'Укажите service_id и secret_key в настройках.');
      return;
    }

    if (scenarios.length === 0) {
      addLog('error', 'Сначала загрузите список сценариев.');
      return;
    }

    const snapshot: TestScenario[] = scenarios.map(normalizeScenarioForQueue);

    setSelectedScenarioIdx((prev) =>
      prev !== null ? prev : snapshot.length > 0 ? snapshot[0].idx : null
    );
    setScenarios(snapshot);
    await runQueue(snapshot);
  }, [
    addLog,
    isRunning,
    runQueue,
    scenarios,
    settings,
    setSelectedScenarioIdx,
    normalizeScenarioForQueue
  ]);

  const handleRunScenario = useCallback(
    async (scenario: TestScenario) => {
      if (isRunning) {
        addLog('error', 'Тестирование уже выполняется, дождитесь завершения.');
        return;
      }

      if (!settings.prepareUrl || !settings.completeUrl) {
        addLog('error', 'Заполните Prepare URL и Complete URL.');
        return;
      }

      if (!settings.serviceId || !settings.secretKey) {
        addLog('error', 'Укажите service_id и secret_key в настройках.');
        return;
      }

      const snapshotScenario = normalizeScenarioForQueue(scenario);
      setSelectedScenarioIdx(scenario.idx);
      setScenarios((prev) =>
        prev.map((item) =>
          item.idx === scenario.idx ? snapshotScenario : item
        )
      );

      await runQueue([snapshotScenario]);
    },
    [
      addLog,
      isRunning,
      normalizeScenarioForQueue,
      runQueue,
      settings
    ]
  );

  useEffect(() => {
    if (!isRunning) {
      cancelRef.current = false;
    }
  }, [isRunning]);

  const headerTitle = useMemo(
    () => ({
      title: 'CLICK SHOP API тестер',
      subtitle: 'Web UI для быстрого прогонки сценариев prepare / complete'
    }),
    []
  );

  const selectedScenario = useMemo(
    () =>
      selectedScenarioIdx === null
        ? undefined
        : scenarios.find((item) => item.idx === selectedScenarioIdx),
    [scenarios, selectedScenarioIdx]
  );

  const handleSelectScenario = useCallback((scenario: TestScenario) => {
    setSelectedScenarioIdx(scenario.idx);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {headerTitle.title}
          </h1>
          <p className="text-sm text-slate-400">{headerTitle.subtitle}</p>
        </header>

        <SettingsPanel
          settings={settings}
          scenarioCount={scenarioCount}
          onChange={handleSettingsChange}
          onLoadScenarios={handleLoadScenarios}
          onStart={handleStart}
          onStop={stopQueue}
          loadingScenarios={loadingScenarios}
          isRunning={isRunning}
          collapsed={settingsCollapsed}
          onToggleCollapsed={() =>
            setSettingsCollapsed((prev: boolean) => !prev)
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ScenarioTable
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioIdx}
            onSelectScenario={handleSelectScenario}
            onRunScenario={handleRunScenario}
            disableRun={isRunning}
          />
          <ScenarioDetail scenario={selectedScenario} />
        </div>

        <LogConsole
          logs={logs}
          onClear={() => setLogs([])}
          disableClear={logs.length === 0}
        />
      </div>
    </main>
  );
}
