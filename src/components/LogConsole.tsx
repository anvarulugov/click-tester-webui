import { useEffect, useRef } from 'react';
import type { LogEntry } from '../lib/types';

interface LogConsoleProps {
  logs: LogEntry[];
  onClear?: () => void;
  disableClear?: boolean;
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'text-slate-300',
  success: 'text-emerald-300',
  error: 'text-rose-300'
};

export function LogConsole({ logs, onClear, disableClear }: LogConsoleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  return (
    <section className="flex h-52 flex-col rounded-lg border border-slate-800 bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-50">Лог тестирования</h2>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disableClear}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-rose-500 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Очистить
          </button>
        )}
      </header>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950 px-4 py-3 font-mono text-xs text-slate-300"
      >
        {logs.length === 0 && (
          <p className="text-slate-500">Журнал пуст.</p>
        )}
        {logs.map((log) => (
          <p key={log.id} className={`${levelColors[log.level]} whitespace-pre-wrap`}>
            {log.timestamp} {log.message}
          </p>
        ))}
      </div>
    </section>
  );
}
