'use client';

import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useState } from 'react';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  pages: number | null;
  chunksCount: number | null;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
};

type Chapter = {
  id: string;
  title: string;
  chapterOrder: number;
  currentVersion: ChapterVersion | null;
  totalVersions: number;
  versions?: ChapterVersion[];
};

type ThesisTreeProps = {
  chapters: Chapter[];
  onDeleteChapter?: (chapterId: string) => void;
};

const OPERATION_COLORS: Record<string, string> = {
  upload: 'bg-blue-500',
  improve: 'bg-green-500',
  translate: 'bg-purple-500',
  adjust: 'bg-orange-500',
  adapt: 'bg-pink-500',
  update: 'bg-yellow-500',
};

const OPERATION_LABELS: Record<string, string> = {
  upload: 'Original',
  improve: 'Melhorado',
  translate: 'Traduzido',
  adjust: 'Ajustado',
  adapt: 'Adaptado',
  update: 'Atualizado',
};

export function ThesisTree({ chapters, onDeleteChapter }: ThesisTreeProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (chapters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum capítulo nesta tese</p>
        <p className="text-sm mt-2">Adicione capítulos para começar</p>
      </div>
    );
  }

  const sorted = [...chapters].sort((a, b) => a.chapterOrder - b.chapterOrder);

  return (
    <div className="space-y-2">
      {sorted.map((chapter) => {
        const isExpanded = expanded.has(chapter.id);
        const hasVersions = (chapter.totalVersions || 0) > 0;

        return (
          <div key={chapter.id} className="border border-white/10 rounded-lg overflow-hidden">
            {/* Chapter header */}
            <div className="flex items-center gap-2 p-3 bg-white/[0.04] hover:bg-white/[0.07] transition-colors">
              <button
                onClick={() => toggle(chapter.id)}
                className="p-1 hover:bg-white/10 rounded"
                disabled={!hasVersions}
              >
                {hasVersions ? (
                  isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  <div className="w-4 h-4" />
                )}
              </button>

              <FileText className="h-5 w-5 text-red-500 shrink-0" />

              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => router.push(`/chapters/${chapter.id}`)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-white">
                    Cap. {chapter.chapterOrder}
                  </span>
                  <span className="text-sm text-gray-300 truncate">{chapter.title}</span>
                </div>
                {chapter.currentVersion && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs border-white/20 text-gray-400">
                      v{chapter.currentVersion.versionNumber}
                    </Badge>
                    {chapter.currentVersion.pages && (
                      <span className="text-xs text-gray-500">
                        {chapter.currentVersion.pages} págs
                      </span>
                    )}
                    <Badge
                      className={cn(
                        'text-xs text-white border-0',
                        OPERATION_COLORS[chapter.currentVersion.createdByOperation] || 'bg-gray-500'
                      )}
                    >
                      {OPERATION_LABELS[chapter.currentVersion.createdByOperation] || chapter.currentVersion.createdByOperation}
                    </Badge>
                  </div>
                )}
              </div>

              <Badge variant="secondary" className="ml-auto shrink-0 bg-white/10 text-gray-300 border-white/10">
                {chapter.totalVersions} {chapter.totalVersions === 1 ? 'versão' : 'versões'}
              </Badge>

              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-red-400 hover:text-white hover:bg-red-600/20"
                  onClick={() => router.push(`/chapters/${chapter.id}`)}
                >
                  Abrir
                </Button>
                {onDeleteChapter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChapter(chapter.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Versions list — clicking opens the chapter (agent) page */}
            {isExpanded && chapter.versions && chapter.versions.length > 0 && (
              <div className="border-t border-white/10 bg-black/20">
                {chapter.versions.map((version) => (
                  <div
                    key={version.id}
                    className={cn(
                      'flex items-center gap-2 p-3 pl-12 hover:bg-white/5 transition-colors cursor-pointer',
                      version.isCurrent && 'bg-red-500/5'
                    )}
                    onClick={() => router.push(`/chapters/${chapter.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">
                          v{version.versionNumber}
                        </span>
                        {version.isCurrent && (
                          <Badge variant="default" className="text-xs bg-red-600">Atual</Badge>
                        )}
                        <Badge
                          className={cn(
                            'text-xs text-white border-0',
                            OPERATION_COLORS[version.createdByOperation] || 'bg-gray-500'
                          )}
                        >
                          {OPERATION_LABELS[version.createdByOperation] || version.createdByOperation}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {version.pages && <span>{version.pages} págs</span>}
                        <span>{new Date(version.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
