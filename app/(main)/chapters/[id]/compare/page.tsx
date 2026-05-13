'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, GitCompare, Loader2, CalendarDays, FileText } from 'lucide-react';
import { toast } from 'sonner';

type VersionMeta = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  createdAt: string;
  pages: number | null;
  isCurrent: boolean;
};

type VersionContent = {
  versionId: string;
  versionNumber: number;
  operation: string;
  createdAt: string;
  pages: number | null;
  text: string;
  chunkCount: number;
};

const OPERATION_LABELS: Record<string, string> = {
  upload: 'Original',
  improve: 'Melhorado',
  translate: 'Traduzido',
  adjust: 'Ajustado',
  adapt: 'Adaptado',
  update: 'Atualizado',
};

const OPERATION_COLORS: Record<string, string> = {
  upload: 'bg-blue-500',
  improve: 'bg-green-500',
  translate: 'bg-purple-500',
  adjust: 'bg-orange-500',
  adapt: 'bg-pink-500',
  update: 'bg-yellow-500',
};

export default function ComparePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chapterId = params.id as string;

  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedLeft, setSelectedLeft] = useState<string>(searchParams.get('v1') || '');
  const [selectedRight, setSelectedRight] = useState<string>(searchParams.get('v2') || '');
  const [leftContent, setLeftContent] = useState<VersionContent | null>(null);
  const [rightContent, setRightContent] = useState<VersionContent | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);

  // Synchronized scroll refs
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleLeftScroll = () => {
    if (syncingRef.current || !leftRef.current || !rightRef.current) return;
    syncingRef.current = true;
    const ratio =
      leftRef.current.scrollTop /
      (leftRef.current.scrollHeight - leftRef.current.clientHeight || 1);
    rightRef.current.scrollTop =
      ratio * (rightRef.current.scrollHeight - rightRef.current.clientHeight);
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const handleRightScroll = () => {
    if (syncingRef.current || !leftRef.current || !rightRef.current) return;
    syncingRef.current = true;
    const ratio =
      rightRef.current.scrollTop /
      (rightRef.current.scrollHeight - rightRef.current.clientHeight || 1);
    leftRef.current.scrollTop =
      ratio * (leftRef.current.scrollHeight - leftRef.current.clientHeight);
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  // Load chapter + versions list
  useEffect(() => {
    const load = async () => {
      try {
        const [chapRes, verRes] = await Promise.all([
          fetch(`/api/chapters/${chapterId}`),
          fetch(`/api/chapters/${chapterId}/versions`),
        ]);
        if (chapRes.ok) {
          const d = await chapRes.json();
          setChapterTitle(d.chapter.title);
        }
        if (verRes.ok) {
          const d = await verRes.json();
          setVersions(d.versions || []);
          // Auto-select two most recent if none in URL
          if (!selectedLeft && d.versions?.length > 0) {
            setSelectedLeft(d.versions[0].id);
          }
          if (!selectedRight && d.versions?.length > 1) {
            setSelectedRight(d.versions[1].id);
          }
        }
      } catch {
        toast.error('Erro ao carregar versões');
      }
    };
    load();
  }, [chapterId]);

  // Load left content
  useEffect(() => {
    if (!selectedLeft) return;
    const load = async () => {
      setLoadingLeft(true);
      try {
        const res = await fetch(
          `/api/chapters/${chapterId}/versions/${selectedLeft}/text`
        );
        if (!res.ok) throw new Error('Falha ao carregar texto');
        const data = await res.json();
        setLeftContent(data);
      } catch {
        toast.error('Erro ao carregar versão esquerda');
      } finally {
        setLoadingLeft(false);
      }
    };
    load();
  }, [selectedLeft, chapterId]);

  // Load right content
  useEffect(() => {
    if (!selectedRight) return;
    const load = async () => {
      setLoadingRight(true);
      try {
        const res = await fetch(
          `/api/chapters/${chapterId}/versions/${selectedRight}/text`
        );
        if (!res.ok) throw new Error('Falha ao carregar texto');
        const data = await res.json();
        setRightContent(data);
      } catch {
        toast.error('Erro ao carregar versão direita');
      } finally {
        setLoadingRight(false);
      }
    };
    load();
  }, [selectedRight, chapterId]);

  const VersionHeader = ({
    content,
    loading,
  }: {
    content: VersionContent | null;
    loading: boolean;
  }) => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          <Loader2 className="h-4 w-4 animate-spin text-red-500" />
          <span className="text-sm text-gray-400">Carregando...</span>
        </div>
      );
    }
    if (!content) {
      return (
        <div className="p-4 border-b border-white/10 text-sm text-gray-500">
          Selecione uma versão
        </div>
      );
    }
    return (
      <div className="p-4 border-b border-white/10 bg-white/[0.03] space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-white">v{content.versionNumber}</span>
          <Badge
            className={`${OPERATION_COLORS[content.operation] || 'bg-gray-500'} text-white border-0 text-xs`}
          >
            {OPERATION_LABELS[content.operation] || content.operation}
          </Badge>
          {content.pages && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {content.pages} {content.pages === 1 ? 'pág' : 'págs'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <CalendarDays className="h-3 w-3" />
          {new Date(content.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/chapters/${chapterId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Comparar Versões</h1>
              {chapterTitle && (
                <p className="text-xs text-gray-400">{chapterTitle}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Left selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">Esquerda:</span>
            <Select value={selectedLeft} onValueChange={setSelectedLeft}>
              <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Selecionar versão" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={v.id === selectedRight}>
                    v{v.versionNumber} — {OPERATION_LABELS[v.createdByOperation] || v.createdByOperation}
                    {v.isCurrent ? ' (atual)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="text-gray-600 text-lg">↔</span>

          {/* Right selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">Direita:</span>
            <Select value={selectedRight} onValueChange={setSelectedRight}>
              <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Selecionar versão" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={v.id === selectedLeft}>
                    v{v.versionNumber} — {OPERATION_LABELS[v.createdByOperation] || v.createdByOperation}
                    {v.isCurrent ? ' (atual)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Side-by-side panels */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Left panel */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] overflow-hidden">
          <VersionHeader content={leftContent} loading={loadingLeft} />
          <div
            ref={leftRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-y-auto p-5 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-mono"
          >
            {!loadingLeft && leftContent && (
              leftContent.text || (
                <span className="text-gray-500 italic">Sem conteúdo de texto disponível para esta versão.</span>
              )
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] overflow-hidden">
          <VersionHeader content={rightContent} loading={loadingRight} />
          <div
            ref={rightRef}
            onScroll={handleRightScroll}
            className="flex-1 overflow-y-auto p-5 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-mono"
          >
            {!loadingRight && rightContent && (
              rightContent.text || (
                <span className="text-gray-500 italic">Sem conteúdo de texto disponível para esta versão.</span>
              )
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center pb-1">
        Scroll sincronizado — ao rolar um painel o outro acompanha na posição equivalente
      </p>
    </div>
  );
}
