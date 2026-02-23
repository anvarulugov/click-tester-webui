import { useEffect, useMemo, useState } from 'react';
import type { ScenarioAction, TestScenario } from '../lib/types';

interface ScenarioManagerProps {
  open: boolean;
  scenarios: TestScenario[];
  onClose: () => void;
  onSave: (next: TestScenario[]) => void;
  disabled?: boolean;
}

const defaultPostPayload = {
  click_trans_id: '',
  service_id: '',
  merchant_trans_id: '',
  merchant_prepare_id: '',
  amount: '',
  action: '0',
  error: 0,
  error_note: 'Ok',
  sign_time: '',
  sign_string: '',
  click_paydoc_id: ''
};

const createDefaultScenario = (): TestScenario => ({
  idx: 0,
  status: 'idle',
  description: 'Новый сценарий',
  action: 'prepare',
  sending_error_code: 0,
  expected_error_code: 0,
  post: { ...defaultPostPayload }
});

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function normalizeAction(value: string): ScenarioAction {
  return value === 'complete' ? 'complete' : 'prepare';
}

export function ScenarioManager({
  open,
  scenarios,
  onClose,
  onSave,
  disabled
}: ScenarioManagerProps) {
  const [draft, setDraft] = useState<TestScenario[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [postJson, setPostJson] = useState('{}');
  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = scenarios.length > 0 ? scenarios : [createDefaultScenario()];
    setDraft(next.map((item) => ({ ...item, post: { ...item.post } })));
    setSelectedIdx(0);
    setPostJson(prettyJson(next[0]?.post ?? defaultPostPayload));
    setFormError('');
  }, [open, scenarios]);

  const selected = useMemo(() => draft[selectedIdx], [draft, selectedIdx]);

  const patchSelected = (patch: Partial<TestScenario>) => {
    setDraft((prev) =>
      prev.map((item, idx) =>
        idx === selectedIdx
          ? {
              ...item,
              ...patch
            }
          : item
      )
    );
  };

  const handleAdd = () => {
    const nextScenario = createDefaultScenario();
    setDraft((prev) => [...prev, nextScenario]);
    setSelectedIdx(draft.length);
    setPostJson(prettyJson(nextScenario.post));
    setFormError('');
  };

  const handleDelete = () => {
    if (draft.length <= 1) {
      setDraft([createDefaultScenario()]);
      setSelectedIdx(0);
      setPostJson(prettyJson(defaultPostPayload));
      setFormError('');
      return;
    }
    setDraft((prev) => prev.filter((_, idx) => idx !== selectedIdx));
    const nextIdx = selectedIdx > 0 ? selectedIdx - 1 : 0;
    setSelectedIdx(nextIdx);
    setPostJson(
      prettyJson(draft[nextIdx === selectedIdx ? selectedIdx + 1 : nextIdx]?.post ?? defaultPostPayload)
    );
    setFormError('');
  };

  const handleSelect = (idx: number) => {
    setSelectedIdx(idx);
    setPostJson(prettyJson(draft[idx].post));
    setFormError('');
  };

  const handleApplyPostJson = () => {
    if (!selected) {
      return;
    }

    try {
      const parsed = JSON.parse(postJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('post должен быть JSON-объектом.');
      }
      patchSelected({
        post: parsed as TestScenario['post']
      });
      setFormError('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Невалидный JSON.');
    }
  };

  const handleSave = () => {
    if (disabled) {
      return;
    }

    let parsedPost: TestScenario['post'] | null = null;

    try {
      const parsed = JSON.parse(postJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('post должен быть JSON-объектом.');
      }
      parsedPost = parsed as TestScenario['post'];
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Невалидный JSON.');
      return;
    }

    const next = draft.map((item, idx) => ({
      ...item,
      idx,
      status: item.status ?? 'idle',
      action: normalizeAction(item.action),
      post: idx === selectedIdx ? parsedPost ?? item.post : item.post
    }));

    onSave(next);
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <section className="flex h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Менеджер сценариев</h2>
            <p className="text-xs text-slate-400">
              Создание и редактирование сценариев. Данные сохраняются в localStorage.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-slate-500"
          >
            Закрыть
          </button>
        </header>

        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex flex-col border-r border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 p-3">
              <button
                type="button"
                onClick={handleAdd}
                disabled={disabled}
                className="rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Добавить
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={disabled || draft.length === 0}
                className="rounded-md border border-rose-700/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {draft.map((item, idx) => {
                const clickTransId = String(item.post.click_trans_id ?? '').trim();
                return (
                  <button
                    key={`${idx}-${clickTransId}-${item.description}`}
                    type="button"
                    onClick={() => handleSelect(idx)}
                    className={`flex w-full flex-col border-b border-slate-900 px-3 py-2 text-left text-xs transition ${
                      idx === selectedIdx
                        ? 'bg-slate-900 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-900/70'
                    }`}
                  >
                    <span className="font-semibold">#{idx + 1}</span>
                    <span className="truncate">{item.description}</span>
                    <span className="text-slate-500">
                      click_trans_id: {clickTransId || '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex flex-1 flex-col overflow-auto">
            {!selected ? (
              <div className="p-6 text-sm text-slate-400">Сценарий не выбран.</div>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                    Описание
                    <input
                      type="text"
                      value={selected.description}
                      onChange={(event) =>
                        patchSelected({ description: event.target.value })
                      }
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                    Action
                    <select
                      value={selected.action}
                      onChange={(event) =>
                        patchSelected({
                          action: normalizeAction(event.target.value)
                        })
                      }
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="prepare">prepare</option>
                      <option value="complete">complete</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                    sending_error_code
                    <input
                      type="number"
                      value={selected.sending_error_code}
                      onChange={(event) =>
                        patchSelected({
                          sending_error_code: Number(event.target.value || 0)
                        })
                      }
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                    expected_error_code
                    <input
                      type="number"
                      value={selected.expected_error_code}
                      onChange={(event) =>
                        patchSelected({
                          expected_error_code: Number(event.target.value || 0)
                        })
                      }
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                    go_to_script (optional)
                    <input
                      type="number"
                      value={selected.go_to_script ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value.trim();
                        patchSelected({
                          go_to_script: raw === '' ? undefined : Number(raw)
                        });
                      }}
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      post (JSON)
                    </label>
                    <button
                      type="button"
                      onClick={handleApplyPostJson}
                      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500 hover:text-sky-300"
                    >
                      Применить JSON
                    </button>
                  </div>
                  <textarea
                    value={postJson}
                    onChange={(event) => setPostJson(event.target.value)}
                    className="h-60 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
                  />
                  {formError && (
                    <p className="mt-2 text-xs text-rose-300">{formError}</p>
                  )}
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Синтаксис связей между сценариями
                  </h3>
                  <p className="mt-2 text-xs text-slate-400">
                    Используйте шаблоны в любом строковом поле `post`:
                  </p>
                  <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
{`{{scenario.<click_trans_id>.response.<field>}}
{{scenario.<click_trans_id>.request.<field>}}
{{scenario.<click_trans_id>.post.<field>}}
{{response.<click_trans_id>.<field>}}
{{request.<click_trans_id>.<field>}}
{{post.<click_trans_id>.<field>}}`}
                  </pre>
                  <p className="mt-2 text-xs text-slate-500">
                    Пример:{' '}
                    <code>
                      merchant_prepare_id:
                      {' "{{scenario.18409.response.merchant_prepare_id}}"'}
                    </code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled}
            className="rounded-md border border-sky-700/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:border-sky-500 hover:bg-sky-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Сохранить сценарии
          </button>
        </footer>
      </section>
    </div>
  );
}
