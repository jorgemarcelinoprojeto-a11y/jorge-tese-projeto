'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, CheckCircle2, Circle, ArrowLeftRight, Eye, Clock, Trash2, Cpu, ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { VersionDiff } from './version-diff';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
  parentVersionId: string | null;
  pages: number | null;
  metadata?: Record<string, unknown>;
};

type VersionHistoryProps = {
  versions: ChapterVersion[];
  chapterId: string;
  showHeader?: boolean;
  onVersionDeleted?: (versionId: string) => void;
};

const OPERATION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  upload:   { label: 'Original',  color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30' },
  improve:  { label: 'Melhorado', color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30' },
  translate:{ label: 'Traduzido', color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30' },
  adjust:   { label: 'Ajustado',  color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  adapt:    { label: 'Adaptado',  color: 'text-pink-400',   bg: 'bg-pink-500/15 border-pink-500/30' },
  update:   { label: 'Atualizado',color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30' },
};

function getOpConfig(operation: string) {
  return OPERATION_CONFIG[operation] ?? { label: operation, color: 'text-gray-400', bg: 'bg-gray-500/15 border-gray-500/30' };
}

export function VersionHistory({ versions, chapterId, showHeader = true, onVersionDeleted }: VersionHistoryProps) {
  const router = useRouter();
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeft, setDiffLeft] = useState<ChapterVersion | null>(null);
  const [diffRight, setDiffRight] = useState<ChapterVersion | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeleteVersion = async (version: ChapterVersion) => {
    if (version.createdByOperation === 'upload' && versions.length > 1) {
      // Allow deleting original only if there are others, but warn
    }
    if (!confirm(`Excluir versão v${version.versionNumber} (${version.createdByOperation})? Esta ação não pode ser desfeita.`)) return;
    try {
      setDeletingId(version.id);
      const res = await fetch(`/api/chapters/${chapterId}/versions/${version.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao excluir versão');
      }
      toast.success(`Versão v${version.versionNumber} excluída.`);
      onVersionDeleted?.(version.id);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir versão');
    } finally {
      setDeletingId(null);
    }
  };

  if (versions.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
        {showHeader && (
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Histórico de Versões
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GitBranch className="h-12 w-12 text-gray-600 mb-4" />
          <p className="text-sm text-gray-500">Nenhuma versão encontrada</p>
        </CardContent>
      </Card>
    );
  }

  // Sort versions chronologically
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const originalVersion = sorted[0];
  const currentVersion = sorted.find((v) => v.isCurrent) ?? sorted[sorted.length - 1];

  // Group Multi-IA versions by session + branch
  type GroupedEntry =
    | { type: 'single'; version: ChapterVersion }
    | { type: 'multi3'; sessionId: string; command: string; branches: Map<number, ChapterVersion[]> };

  const grouped: GroupedEntry[] = [];
  const multi3Sessions = new Map<string, { command: string; branches: Map<number, ChapterVersion[]> }>();
  const consumed = new Set<string>();

  for (const v of sorted) {
    const meta = v.metadata as Record<string, unknown> | undefined;
    const sessionId = meta?.multi3SessionId as string | undefined;
    if (sessionId) {
      if (!multi3Sessions.has(sessionId)) {
        multi3Sessions.set(sessionId, {
          command: (meta?.multi3Command as string) || '/3',
          branches: new Map(),
        });
      }
      const branch = (meta?.multi3BranchIndex as number) ?? 0;
      const entry = multi3Sessions.get(sessionId)!;
      if (!entry.branches.has(branch)) entry.branches.set(branch, []);
      entry.branches.get(branch)!.push(v);
      consumed.add(v.id);
    }
  }

  for (const v of sorted) {
    if (consumed.has(v.id)) continue;
    grouped.push({ type: 'single', version: v });
  }

  for (const [sessionId, data] of multi3Sessions) {
    grouped.push({ type: 'multi3', sessionId, command: data.command, branches: data.branches });
  }

  grouped.sort((a, b) => {
    const numA = a.type === 'single' ? a.version.versionNumber : Math.min(...[...a.branches.values()].flat().map((v) => v.versionNumber));
    const numB = b.type === 'single' ? b.version.versionNumber : Math.min(...[...b.branches.values()].flat().map((v) => v.versionNumber));
    return numA - numB;
  });

  const renderVersionRow = (version: ChapterVersion, idx: number, sortedList: ChapterVersion[]) => {
    const cfg = getOpConfig(version.createdByOperation);
    const isFirst = version.id === sorted[0]?.id;
    const prevVersion = idx > 0 ? sortedList[idx - 1] : null;
    const meta = version.metadata as Record<string, unknown> | undefined;
    const provider = meta?.multi3Provider as string | undefined;

    return (
      <div key={version.id} className="relative flex items-start gap-4 py-2.5">
        <div className="relative z-10 flex-shrink-0 mt-0.5">
          {version.isCurrent ? (
            <CheckCircle2 className="h-[22px] w-[22px] text-red-500" />
          ) : (
            <Circle className="h-[22px] w-[22px] text-gray-600" />
          )}
        </div>
        <div
          className={cn(
            'flex-1 flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer group',
            version.isCurrent
              ? 'bg-red-500/[0.08] border-red-500/25 hover:border-red-500/40'
              : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-white/15'
          )}
          onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">v{version.versionNumber}</span>
                {version.isCurrent && (
                  <Badge className="bg-red-600 text-white text-xs px-1.5 py-0 h-4">Atual</Badge>
                )}
                {isFirst && !version.isCurrent && (
                  <Badge variant="outline" className="text-gray-500 border-gray-700 text-xs px-1.5 py-0 h-4">Original</Badge>
                )}
                <Badge className={cn('text-xs border px-1.5 py-0 h-4', cfg.bg, cfg.color)}>{cfg.label}</Badge>
                {provider && (
                  <Badge variant="outline" className="text-indigo-400 border-indigo-500/30 text-xs px-1.5 py-0 h-4 capitalize">
                    {provider}
                  </Badge>
                )}
                {meta?.multi3Role === 'winner' && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs px-1.5 py-0 h-4">Vencedora</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {new Date(version.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
                {version.pages && (<><span>·</span><span>{version.pages} {version.pages === 1 ? 'pág' : 'págs'}</span></>)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {prevVersion && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-white/10 gap-1"
                onClick={() => openDiff(prevVersion, version)}>
                <ArrowLeftRight className="h-3 w-3" />Diff
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}>
              <Eye className="h-3 w-3" />
            </Button>
            {version.createdByOperation !== 'upload' || versions.length === 1 ? (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                disabled={deletingId === version.id}
                onClick={() => handleDeleteVersion(version)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const openDiff = (left: ChapterVersion, right: ChapterVersion) => {
    setDiffLeft(left);
    setDiffRight(right);
    setDiffOpen(true);
  };

  return (
    <>
      <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
        {showHeader && (
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-red-400" />
                Histórico de Versões
                <Badge variant="secondary" className="bg-white/10 text-gray-400 text-xs ml-1">
                  {versions.length}
                </Badge>
              </CardTitle>
              {versions.length >= 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/15 text-gray-300 hover:bg-white/10 gap-2 text-xs h-8"
                  onClick={() => openDiff(originalVersion, currentVersion)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Original vs Atual
                </Button>
              )}
            </div>
          </CardHeader>
        )}

        <CardContent className="pt-0">
          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            {sorted.length > 1 && (
              <div className="absolute left-[19px] top-5 bottom-5 w-px bg-white/10" />
            )}

            <div className="space-y-1">
              {grouped.map((entry) => {
                if (entry.type === 'single') {
                  const idx = sorted.findIndex((v) => v.id === entry.version.id);
                  return renderVersionRow(entry.version, idx, sorted);
                }

                const groupKey = entry.sessionId;
                const isCollapsed = collapsedGroups.has(groupKey);
                const allVersions = [...entry.branches.values()].flat().sort((a, b) => a.versionNumber - b.versionNumber);

                return (
                  <div key={groupKey} className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-2 my-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-indigo-300 hover:text-indigo-200"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <Cpu className="h-4 w-4" />
                      <span className="font-medium">Multi-IA {entry.command}</span>
                      <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-400">
                        {allVersions.length} versões · {entry.branches.size} IAs
                      </Badge>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-4 space-y-2 mt-1">
                        {[...entry.branches.entries()].map(([branchIdx, branchVersions]) => {
                          const provider = (branchVersions[0]?.metadata as Record<string, unknown>)?.multi3Provider as string;
                          return (
                            <div key={branchIdx} className="border-l border-indigo-500/20 pl-3">
                              <p className="text-xs text-indigo-400/80 mb-1 capitalize font-medium">{provider || `IA ${branchIdx + 1}`}</p>
                              {branchVersions.sort((a, b) => a.versionNumber - b.versionNumber).map((v, i, list) => {
                                const idx = sorted.findIndex((x) => x.id === v.id);
                                return renderVersionRow(v, idx >= 0 ? idx : i, list);
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diff Dialog */}
      {diffLeft && diffRight && (
        <VersionDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          chapterId={chapterId}
          leftVersionId={diffLeft.id}
          leftVersionNumber={diffLeft.versionNumber}
          leftLabel={diffLeft.createdByOperation === 'upload' ? 'Original' : getOpConfig(diffLeft.createdByOperation).label}
          rightVersionId={diffRight.id}
          rightVersionNumber={diffRight.versionNumber}
          rightLabel={diffRight.isCurrent ? 'Atual' : getOpConfig(diffRight.createdByOperation).label}
        />
      )}
    </>
  );
}
