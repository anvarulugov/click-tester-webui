import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { ScenarioTable } from './components/ScenarioTable';
import { ScenarioDetail } from './components/ScenarioDetail';
import { ScenarioManager } from './components/ScenarioManager';
import { LogConsole } from './components/LogConsole';
import { useLocalStorage } from './hooks/useLocalStorage';
import { md5 } from './lib/md5';
import type {
  ApiResponse,
  LogEntry,
  ScenarioDefinition,
  ScenarioPostPayload,
  TestScenario,
  TesterSettings
} from './lib/types';

const defaultSettings: TesterSettings = {
  prepareUrl: '',
  completeUrl: '',
  serviceId: '',
  secretKey: '',
  merchantTransId: '',
  amount: '',
  merchantUserId: '',
  clickPaydocId: '16853761',
  presetMerchantPrepareId: ''
};

const templateUrl = '/template.json';
const testingLogApiUrl = '/__tester/log-file';
const dynamicProxyApiUrl = '/__tester/http-proxy';
const scenariosStorageKey = 'clickTesterScenarios';
const httpAuditStorageKey = 'clickTesterHttpAudit';
const maxHttpAuditEntries = 500;
const maxHttpAuditBodyLength = 4_000;

type HttpAuditDirection = 'request' | 'response' | 'error';

interface HttpAuditEntry {
  id: string;
  requestId: string;
  timestamp: string;
  direction: HttpAuditDirection;
  context: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  ok?: boolean;
  payload?: Record<string, string>;
  responseBody?: string;
  headers?: Record<string, string>;
  errorMessage?: string;
}

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

type TestingLogSyncPayload =
  | { action: 'append'; line: string }
  | { action: 'clear' };

const syncTestingLogFile = async (payload: TestingLogSyncPayload) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    await fetch(testingLogApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Keep UI usable when running without Vite dev middleware.
  }
};

const trimAuditBody = (body: string): string => {
  if (!body) {
    return '';
  }

  if (body.length <= maxHttpAuditBodyLength) {
    return body;
  }

  return `${body.slice(0, maxHttpAuditBodyLength)}\n...[truncated ${
    body.length - maxHttpAuditBodyLength
  } chars]`;
};

const responseHeadersToObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const getHttpAuditEntries = (): HttpAuditEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(httpAuditStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as HttpAuditEntry[];
  } catch {
    return [];
  }
};

const setHttpAuditEntries = (entries: HttpAuditEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(httpAuditStorageKey, JSON.stringify(entries));
  } catch {
    // Keep app flow alive when storage quota is exceeded.
  }
};

const appendHttpAuditEntry = (
  entry: Omit<HttpAuditEntry, 'id' | 'timestamp'>
) => {
  const nextEntry: HttpAuditEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString()
  };
  const next = [...getHttpAuditEntries(), nextEntry].slice(-maxHttpAuditEntries);
  setHttpAuditEntries(next);
};

const clearHttpAuditEntries = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(httpAuditStorageKey);
};

const responsePreviewLimit = 700;

const makeResponsePreview = (raw: string): string => {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }

  if (normalized.length <= responsePreviewLimit) {
    return normalized;
  }

  return `${normalized.slice(0, responsePreviewLimit)}...`;
};

const parseApiResponse = (raw: string): ApiResponse | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as ApiResponse;
  } catch {
    return null;
  }
};

const resolveRequestUrl = (rawUrl: string): URL | null => {
  if (!rawUrl) {
    return null;
  }

  try {
    if (typeof window !== 'undefined') {
      return new URL(rawUrl, window.location.href);
    }
    return new URL(rawUrl);
  } catch {
    return null;
  }
};

const normalizeEndpointUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  if (hasScheme) {
    return trimmed;
  }

  const looksLikeHostPort = /^[\w.-]+:\d+(\/|$)/.test(trimmed);
  if (looksLikeHostPort) {
    return `http://${trimmed}`;
  }

  return trimmed;
};

const shouldUseDynamicDevProxy = (rawUrl: string): boolean => {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false;
  }

  const requestUrl = resolveRequestUrl(normalizeEndpointUrl(rawUrl));
  if (!requestUrl) {
    return false;
  }

  const isHttpTarget =
    requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:';
  if (!isHttpTarget) {
    return false;
  }

  return requestUrl.origin !== window.location.origin;
};

const buildHttpStatusErrorMessage = (
  url: string,
  response: Response,
  raw: string,
  serverMessage?: string
): string => {
  const statusLabel = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const preview = makeResponsePreview(raw);
  const parts = [`HTTP ${statusLabel} при запросе ${url}.`];

  if (serverMessage && serverMessage.trim()) {
    parts.push(`Сообщение сервера: ${serverMessage.trim()}`);
  }

  if (preview) {
    parts.push(`Ответ (фрагмент): ${preview}`);
  }

  return parts.join('\n');
};

const buildNetworkErrorMessage = (url: string, error: unknown): string => {
  const rawReason =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'неизвестная ошибка';
  const reason = rawReason.trim() || 'неизвестная ошибка';
  const normalizedReason = reason.toLowerCase();
  const likelyGenericBrowserReason =
    normalizedReason.includes('failed to fetch') ||
    normalizedReason.includes('load failed') ||
    normalizedReason.includes('networkerror');

  const hints: string[] = [];
  const requestUrl = resolveRequestUrl(url);
  if (!requestUrl) {
    hints.push('Некорректный URL запроса.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    hints.push('Браузер находится в режиме offline.');
  }

  if (typeof window !== 'undefined' && requestUrl) {
    if (
      window.location.protocol === 'https:' &&
      requestUrl.protocol === 'http:'
    ) {
      hints.push('HTTPS-страница вызывает HTTP API (mixed content).');
    }

    if (requestUrl.origin !== window.location.origin) {
      hints.push(
        'Запрос к другому origin: проверьте CORS и preflight (OPTIONS).'
      );
    }
  }

  const parts = [`Сетевой запрос не выполнен: ${reason}`, `URL: ${url}`];

  if (likelyGenericBrowserReason) {
    parts.push(
      'Браузер не раскрыл точную причину (обычно это CORS, SSL, DNS или недоступный хост).'
    );
  }

  if (hints.length > 0) {
    parts.push(`Проверьте: ${hints.join(' ')}`);
  }

  return parts.join('\n');
};

const makeRawResponsePreview = (raw: string): string => {
  const normalized = raw.trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > 300
    ? `${normalized.slice(0, 300)}...`
    : normalized;
};

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

const mapScenarioDefinitionsToTestScenarios = (
  data: ScenarioDefinition[]
): TestScenario[] =>
  data.map((scenario, idx) => ({
    ...scenario,
    idx,
    status: 'idle'
  }));

const getByPath = (data: unknown, path: string[]): unknown => {
  return path.reduce<unknown>((acc, segment) => {
    if (!segment) {
      return acc;
    }
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, data);
};

interface ScenarioReferenceEntry {
  post?: ScenarioPostPayload;
  request?: Record<string, string>;
  response?: ApiResponse | null;
}

const resolveTemplateValue = (
  rawValue: string,
  references: Record<string, ScenarioReferenceEntry>
): string =>
  rawValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawExpression: string) => {
    const expression = rawExpression.trim();
    const parts = expression.split('.');
    if (parts.length < 3) {
      return '';
    }

    const [scope, second, third, ...rest] = parts;
    let clickTransId = '';
    let source = '';
    let path: string[] = [];

    if (scope === 'scenario') {
      clickTransId = second;
      source = third;
      path = rest;
    } else if (scope === 'response' || scope === 'request' || scope === 'post') {
      clickTransId = second;
      source = scope;
      path = [third, ...rest];
    } else {
      return '';
    }

    const entry = references[clickTransId];
    if (!entry) {
      return '';
    }

    const sourceData =
      source === 'response'
        ? entry.response
        : source === 'request'
          ? entry.request
          : source === 'post'
            ? entry.post
            : undefined;

    const resolved = getByPath(sourceData, path);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });

interface RequestContext {
  url: string;
  payload: Record<string, string>;
  merchantPrepareIdUsed: string;
}

function buildRequestContext(
  scenario: TestScenario,
  settings: TesterSettings,
  previousMerchantPrepareId: string,
  merchantPrepareIdByClickTransId: Record<string, string>,
  scenarioReferences: Record<string, ScenarioReferenceEntry>
): RequestContext {
  const isComplete = scenario.action === 'complete';
  const payload: Record<string, string> = {};

  Object.entries(scenario.post).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const asString = String(value);
      payload[key] = resolveTemplateValue(asString, scenarioReferences);
    }
  });

  payload.service_id = settings.serviceId || payload.service_id || '';
  const clickTransId = String(payload.click_trans_id || '').trim();

  const merchantTransId =
    clickTransId === '77816'
      ? randomTransactionId()
      : settings.merchantTransId || payload.merchant_trans_id || '';
  payload.merchant_trans_id = merchantTransId;
  payload.amount = payload.amount?.trim() || settings.amount || '';

  const explicitMerchantPrepareId = String(
    payload.merchant_prepare_id ?? ''
  ).trim();

  const merchantPrepareIdUsed = isComplete
    ? clickTransId === '26216'
      ? randomTransactionId()
      : explicitMerchantPrepareId ||
        (clickTransId === '11994'
          ? merchantPrepareIdByClickTransId['18409'] || previousMerchantPrepareId
          : previousMerchantPrepareId)
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

  if (clickTransId === '73907') {
    payload.amount = '499';
  }

  payload.sign_time =
    payload.sign_time ||
    new Date().toISOString().replace('T', ' ').slice(0, 19);

  payload.sign_string =
    clickTransId === '27147' || clickTransId === '26021'
      ? '10a250d95b1a6afedcda8360a12a1341'
      : md5(
          `${payload.click_trans_id}${payload.service_id}${settings.secretKey}${payload.merchant_trans_id}${
            isComplete ? merchantPrepareIdUsed : ''
          }${payload.amount}${payload.action}${payload.sign_time}`
        );

  return {
    url: normalizeEndpointUrl(
      isComplete ? settings.completeUrl : settings.prepareUrl
    ),
    payload,
    merchantPrepareIdUsed
  };
}

interface RequestResult {
  json: ApiResponse | null;
  raw: string;
  status: number;
  statusText: string;
  contentType: string;
  effectiveUrl: string;
  redirected: boolean;
  redirectChain?: string;
}

interface RequestAuditContext {
  context: string;
  scenarioIdx?: number;
  scenarioAction?: string;
  scenarioDescription?: string;
}

const buildRequestAuditContext = (context: RequestAuditContext): string => {
  const segments = [context.context];
  if (typeof context.scenarioIdx === 'number') {
    segments.push(`scenario #${context.scenarioIdx + 1}`);
  }
  if (context.scenarioAction) {
    segments.push(context.scenarioAction);
  }
  if (context.scenarioDescription) {
    segments.push(context.scenarioDescription);
  }
  return segments.join(' | ');
};

async function sendScenarioRequest(
  url: string,
  payload: Record<string, string>,
  auditContext: RequestAuditContext
): Promise<RequestResult> {
  if (!url) {
    throw new Error('URL не задан в настройках');
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const contextLabel = buildRequestAuditContext(auditContext);
  appendHttpAuditEntry({
    requestId,
    direction: 'request',
    context: contextLabel,
    method: 'POST',
    url,
    payload
  });

  let response: Response;
  try {
    const useDynamicProxy = shouldUseDynamicDevProxy(url);
    response = await fetch(
      useDynamicProxy ? dynamicProxyApiUrl : url,
      useDynamicProxy
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/plain, */*'
            },
            body: JSON.stringify({
              url,
              payload
            })
          }
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: toUrlEncoded(payload)
          }
    );
  } catch (error) {
    const message = buildNetworkErrorMessage(url, error);
    appendHttpAuditEntry({
      requestId,
      direction: 'error',
      context: contextLabel,
      method: 'POST',
      url,
      payload,
      errorMessage: message
    });
    throw new Error(message);
  }

  const raw = await response.text();
  const parsed = parseApiResponse(raw);
  appendHttpAuditEntry({
    requestId,
    direction: 'response',
    context: contextLabel,
    method: 'POST',
    url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    payload,
    headers: responseHeadersToObject(response.headers),
    responseBody: trimAuditBody(raw)
  });

  if (!response.ok) {
    const serverMessage =
      parsed && typeof parsed.message === 'string'
        ? parsed.message
        : undefined;
    throw new Error(
      buildHttpStatusErrorMessage(url, response, raw, serverMessage)
    );
  }

  const proxiedEffectiveUrl =
    response.headers.get('x-tester-upstream-url') || '';
  const proxiedRedirectedFlag =
    response.headers.get('x-tester-upstream-redirected') === '1';
  const proxiedRedirectChain =
    response.headers.get('x-tester-upstream-redirect-chain') || '';

  return {
    json: parsed,
    raw,
    status: response.status,
    statusText: response.statusText || '',
    contentType: response.headers.get('content-type') || '',
    effectiveUrl: proxiedEffectiveUrl || response.url || url,
    redirected: proxiedRedirectedFlag || response.redirected,
    redirectChain: proxiedRedirectChain || undefined
  };
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
  const [scenarios, setScenarios] = useLocalStorage<TestScenario[]>(
    scenariosStorageKey,
    []
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenarioManagerOpen, setScenarioManagerOpen] = useState(false);
  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState<number | null>(
    null
  );

  const cancelRef = useRef(false);
  const initializedFromTemplateRef = useRef(false);

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
    const line = `${entry.timestamp} ${entry.message}`;

    setLogs((prev) => {
      const next = [...prev, entry];
      return next.slice(-500);
    });
    void syncTestingLogFile({ action: 'append', line });
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

  const loadTemplateScenarios = useCallback(async (mode: 'init' | 'manual') => {
    setLoadingScenarios(true);
    try {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const context = `template load | ${mode}`;
      appendHttpAuditEntry({
        requestId,
        direction: 'request',
        context,
        method: 'GET',
        url: templateUrl
      });

      let response: Response;
      try {
        response = await fetch(templateUrl);
      } catch (error) {
        const message = buildNetworkErrorMessage(templateUrl, error);
        appendHttpAuditEntry({
          requestId,
          direction: 'error',
          context,
          method: 'GET',
          url: templateUrl,
          errorMessage: message
        });
        throw new Error(message);
      }

      const raw = await response.text();
      appendHttpAuditEntry({
        requestId,
        direction: 'response',
        context,
        method: 'GET',
        url: templateUrl,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: responseHeadersToObject(response.headers),
        responseBody: trimAuditBody(raw)
      });

      if (!response.ok) {
        throw new Error(buildHttpStatusErrorMessage(templateUrl, response, raw));
      }

      let data: ScenarioDefinition[];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error('template.json должен быть массивом сценариев.');
        }
        data = parsed as ScenarioDefinition[];
      } catch (error) {
        const parseMessage =
          error instanceof Error
            ? error.message
            : 'Некорректный JSON в template.json.';
        appendHttpAuditEntry({
          requestId,
          direction: 'error',
          context,
          method: 'GET',
          url: templateUrl,
          errorMessage: parseMessage
        });
        throw new Error(parseMessage);
      }

      const mapped = mapScenarioDefinitionsToTestScenarios(data);

      setScenarios(mapped);
      setSelectedScenarioIdx(mapped.length > 0 ? mapped[0].idx : null);
      addLog(
        'info',
        mode === 'init'
          ? `Сценарии инициализированы из template.json: ${mapped.length}`
          : `Загружено сценариев: ${mapped.length}`
      );
    } catch (error) {
      addLog(
        'error',
        `Не удалось ${mode === 'init' ? 'инициализировать' : 'загрузить'} сценарии: ${
          error instanceof Error ? error.message : 'неизвестная ошибка'
        }`
      );
    } finally {
      setLoadingScenarios(false);
    }
  }, [addLog, setScenarios]);

  const handleLoadScenarios = useCallback(async () => {
    await loadTemplateScenarios('manual');
  }, [loadTemplateScenarios]);

  const handleClearPanelLogs = useCallback(() => {
    setLogs([]);
    clearHttpAuditEntries();
    void syncTestingLogFile({ action: 'clear' });
  }, []);

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
      const merchantPrepareIdByClickTransId: Record<string, string> = {};
      const scenarioReferences: Record<string, ScenarioReferenceEntry> = {};
      scenarios.forEach((item) => {
        const clickTransId = String(item.post.click_trans_id || '').trim();
        if (!clickTransId) {
          return;
        }
        scenarioReferences[clickTransId] = {
          post: item.post,
          request: item.requestPayload,
          response: item.response
        };
      });
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

        const { payload, url } = buildRequestContext(
          scenario,
          settings,
          merchantPrepareIdOld,
          merchantPrepareIdByClickTransId,
          scenarioReferences
        );
        const scenarioClickTransId = String(payload.click_trans_id || '').trim();
        if (scenarioClickTransId) {
          scenarioReferences[scenarioClickTransId] = {
            ...(scenarioReferences[scenarioClickTransId] || {}),
            post: scenario.post,
            request: payload
          };
        }

        let response: ApiResponse | null = null;
        let rawResponse = '';
        let status: TestScenario['status'] = 'success';
        let errorMessage: string | undefined;
        let actualErrorCode: number | string | null = null;

        try {
          const result = await sendScenarioRequest(url, payload, {
            context: 'scenario request',
            scenarioIdx: scenario.idx,
            scenarioAction: scenario.action,
            scenarioDescription: scenario.description
          });
          response = result.json;
          rawResponse = result.raw;

          if (!response) {
            status = 'error';
            const rawPreview = makeRawResponsePreview(rawResponse);
            const statusLabel = result.statusText
              ? `${result.status} ${result.statusText}`
              : String(result.status);
            const details = [
              `URL: ${url}`,
              `HTTP: ${statusLabel}`,
              result.contentType
                ? `Content-Type: ${result.contentType}`
                : null,
              `Effective URL: ${result.effectiveUrl}`,
              result.redirected ? 'Redirected: yes' : null,
              result.redirectChain
                ? `Redirect chain: ${result.redirectChain}`
                : null
            ]
              .filter(Boolean)
              .join('\n');
            errorMessage = rawPreview
              ? `Ответ сервера не является JSON.\n${details}\nФрагмент ответа: ${rawPreview}`
              : `Ответ сервера не является JSON.\n${details}`;
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
            const prepareId = response.merchant_prepare_id.trim();
            if (prepareId) {
              merchantPrepareIdOld = prepareId;
              if (scenarioClickTransId) {
                merchantPrepareIdByClickTransId[scenarioClickTransId] = prepareId;
              }
            }
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

        if (scenarioClickTransId) {
          scenarioReferences[scenarioClickTransId] = {
            ...(scenarioReferences[scenarioClickTransId] || {}),
            post: scenario.post,
            request: payload,
            response
          };
        }

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
    [addLog, scenarios, setScenarios, settings]
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

  const handleSaveScenarios = useCallback(
    (next: TestScenario[]) => {
      const normalized = next.map((scenario, idx) => ({
        ...scenario,
        idx
      }));
      setScenarios(normalized);
      setSelectedScenarioIdx(
        normalized.length > 0 ? normalized[0].idx : null
      );
      addLog('info', `Сценарии сохранены: ${normalized.length}`);
    },
    [addLog, setScenarios]
  );

  useEffect(() => {
    if (scenarios.length > 0 || initializedFromTemplateRef.current) {
      return;
    }
    initializedFromTemplateRef.current = true;
    void loadTemplateScenarios('init');
  }, [loadTemplateScenarios, scenarios.length]);

  useEffect(() => {
    if (scenarios.length === 0) {
      if (selectedScenarioIdx !== null) {
        setSelectedScenarioIdx(null);
      }
      return;
    }

    if (
      selectedScenarioIdx === null ||
      !scenarios.some((scenario) => scenario.idx === selectedScenarioIdx)
    ) {
      setSelectedScenarioIdx(scenarios[0].idx);
    }
  }, [scenarios, selectedScenarioIdx]);

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
          onOpenScenarioManager={() => setScenarioManagerOpen(true)}
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
          onClear={handleClearPanelLogs}
          disableClear={logs.length === 0}
        />

        <ScenarioManager
          open={scenarioManagerOpen}
          scenarios={scenarios}
          disabled={isRunning}
          onClose={() => setScenarioManagerOpen(false)}
          onSave={handleSaveScenarios}
        />
      </div>
    </main>
  );
}
