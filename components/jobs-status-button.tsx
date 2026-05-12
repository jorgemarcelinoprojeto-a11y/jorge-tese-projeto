'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, Loader2, CheckCircle2, XCircle, Languages, Sliders, Wand2,
  Sparkles, SearchCheck, ExternalLink, FileText, ChevronRight, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyAIError } from '@/lib/ai-error-message';

type ActiveJob = {
  id: string;
  type: 'translate' | 'adjust' | 'adapt' | 'improve' | 'norms-update' | 'chapter-operation';
  operation?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
  createdAt: string;
  completedAt: string | null;
  target: {
    kind: 'document' | 'chapter';
    id: string;
    title?: string;
    projectId?: string;
    thesisId?: string;
  };
  resultHref: string;
};

const POLL_INTERVAL_MS = 4000;

const OP_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  translate:     { label: 'Tradução',  icon: <Languages   className="h-3.5 w-3.5" />, color: 'text-purple-400' },
  adjust:        { label: 'Ajuste',    icon: <Sliders     className="h-3.5 w-3.5" />, color: 'text-orange-400' },
  adapt:         { label: 'Adaptação', icon: <Wand2       className="h-3.5 w-3.5" />, color: 'text-pink-400' },
  improve:       { label: 'Melhoria',  icon: <Sparkles    className="h-3.5 w-3.5" />, color: 'text-green-400' },
  'norms-update':{ label: 'Revisão de normas', icon: <SearchCheck className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
  update:        { label: 'Revisão de normas', icon: <SearchCheck className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
};

function metaFor(job: ActiveJob) {
  const key = job.type === 'chapter-operation' ? (job.operation || 'unknown') : job.type;
  return OP_META[key] ?? { label: key, icon: <FileText className="h-3.5 w-3.5" />, color: 'text-gray-400' };
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  return `${day}d atrás`;
}

export function JobsStatusButton() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs/active');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
      setRunningCount(data.runningCount || 0);
    } catch {
      // silent
    }
  };

  // Initial load + polling
  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const running = jobs.filter((j) => j.status === 'running' || j.status === 'pending');
  const recent  = jobs.filter((j) => j.status === 'completed' || j.status === 'error').slice(0, 10);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchJobs();
        }}
        className={cn(
          'relative h-9 px-3 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-all border',
          runningCount > 0
            ? 'text-red-300 bg-red-500/10 border-red-500/30 hover:bg-red-500/15'
            : 'text-gray-400 border-white/10 hover:text-white hover:bg-white/5'
        )}
        title="Operações em andamento"
      >
        {runningCount > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Activity className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Operações</span>
        {runningCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {runningCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[380px] max-h-[480px] bg-gray-950 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Operações de IA</h3>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Activity className="h-10 w-10 mx-auto mb-3 text-gray-700" />
                <p className="text-sm text-gray-400">Nenhuma operação recente</p>
                <p className="text-xs text-gray-600 mt-1">
                  Operações iniciadas continuam rodando mesmo se você sair da página.
                </p>
              </div>
            ) : (
              <>
                {running.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      Em andamento ({running.length})
                    </p>
                    {running.map((job) => <JobRow key={job.id} job={job} onClick={() => setOpen(false)} />)}
                  </div>
                )}

                {recent.length > 0 && (
                  <div className={cn(running.length > 0 && 'border-t border-white/5 mt-1')}>
                    <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      Recentes
                    </p>
                    {recent.map((job) => <JobRow key={job.id} job={job} onClick={() => setOpen(false)} />)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/10 bg-white/[0.02]">
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Atualiza a cada {POLL_INTERVAL_MS / 1000}s · Histórico das últimas 6h
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onClick }: { job: ActiveJob; onClick: () => void }) {
  const meta = metaFor(job);
  const isRunning = job.status === 'running' || job.status === 'pending';
  const isError = job.status === 'error';
  const isDone = job.status === 'completed';
  const errInfo = isError && job.errorMessage ? classifyAIError(job.errorMessage) : null;

  return (
    <Link
      href={job.resultHref}
      onClick={onClick}
      className="block px-4 py-2.5 hover:bg-white/[0.04] transition-colors border-l-2 border-transparent hover:border-red-500/40"
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-md bg-white/5 flex-shrink-0', meta.color)}>
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white truncate">{meta.label}</span>
            {isRunning && <Loader2 className="h-3 w-3 text-red-400 animate-spin flex-shrink-0" />}
            {isDone && <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />}
            {isError && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
          </div>

          <p className="text-xs text-gray-500 truncate mt-0.5">
            {job.target.title || (job.target.kind === 'chapter' ? 'Capítulo' : 'Documento')}
            <span className="text-gray-700"> · {timeAgo(job.createdAt)}</span>
          </p>

          {isRunning && job.progress > 0 && (
            <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}

          {isError && errInfo && (
            <p className="text-[11px] text-red-400 mt-1 truncate" title={errInfo.message}>
              {errInfo.title}
            </p>
          )}
        </div>

        <ChevronRight className="h-3.5 w-3.5 text-gray-700 flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}
