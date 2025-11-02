export type ScenarioAction = 'prepare' | 'complete';

export interface ScenarioPostPayload {
  click_trans_id: string;
  service_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error: number | string;
  error_note: string;
  sign_time: string;
  sign_string: string;
  click_paydoc_id: string;
  [key: string]: string | number | undefined;
}

export interface ScenarioDefinition {
  description: string;
  action: ScenarioAction;
  sending_error_code: number;
  expected_error_code: number;
  go_to_script?: number;
  post: ScenarioPostPayload;
}

export interface ApiResponse {
  success?: boolean;
  error: number | string;
  message?: string;
  merchant_prepare_id?: string;
  [key: string]: unknown;
}

export type ScenarioStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';

export interface TestScenario extends ScenarioDefinition {
  idx: number;
  status: ScenarioStatus;
  requestPayload?: Record<string, string>;
  response?: ApiResponse | null;
  rawResponse?: string;
  actualErrorCode?: number | string | null;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export type LogLevel = 'info' | 'success' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  scenarioIndex?: number;
}

export interface TesterSettings {
  prepareUrl: string;
  completeUrl: string;
  serviceId: string;
  secretKey: string;
  merchantTransId: string;
  merchantUserId: string;
  clickPaydocId: string;
  presetMerchantPrepareId: string;
}
