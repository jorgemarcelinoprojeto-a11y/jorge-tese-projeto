'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, Circle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  createdAt: string;
  isCurrent: boolean;
  parentVersionId: string | null;
  pages: number | null;
};

type VersionHistoryProps = {
  versions: ChapterVersion[];
  chapterId: string;
  showHeader?: boolean;
};

export function VersionHistory({ versions, chapterId, showHeader = true }: VersionHistoryProps) {
  const router = useRouter();

  // Organiza versões em árvore
  const buildTree = () => {
    const versionMap = new Map(versions.map(v => [v.id, v]));
    const roots: ChapterVersion[] = [];
    const children = new Map<string, ChapterVersion[]>();

    versions.forEach(version => {
      if (!version.parentVersionId) {
        roots.push(version);
      } else {
        const siblings = children.get(version.parentVersionId) || [];
        siblings.push(version);
        children.set(version.parentVersionId, siblings);
      }
    });

    return { roots, children, versionMap };
  };

  const { roots, children } = buildTree();

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'upload': return 'bg-blue-500';
      case 'improve': return 'bg-green-500';
      case 'translate': return 'bg-purple-500';
      case 'adjust': return 'bg-orange-500';
      case 'adapt': return 'bg-pink-500';
      case 'update': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'upload': return 'Original';
      case 'improve': return 'Melhorado';
      case 'translate': return 'Traduzido';
      case 'adjust': return 'Ajustado';
      case 'adapt': return 'Adaptado';
      case 'update': return 'Atualizado';
      default: return operation;
    }
  };

  const renderVersion = (version: ChapterVersion, level: number = 0, isLast: boolean = false) => {
    const versionChildren = children.get(version.id) || [];
    const hasChildren = versionChildren.length > 0;

    return (
      <div key={version.id} className="relative">
        {/* Version Node */}
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
            version.isCurrent
              ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
              : 'bg-muted/30 border-border/50 hover:bg-muted/50'
          }`}
          style={{ marginLeft: `${level * 40}px` }}
          onClick={() => router.push(`/chapters/${chapterId}/versions/${version.id}`)}
        >
          {/* Connector Line */}
          {level > 0 && (
            <div
              className="absolute h-[2px] bg-border/50"
              style={{
                left: `${(level - 1) * 40 + 20}px`,
                width: '40px',
                top: '50%'
              }}
            />
          )}

          {/* Node Icon */}
          <div className="relative z-10">
            {version.isCurrent ? (
              <CheckCircle2 className="h-5 w-5 text-red-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          {/* Version Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">v{version.versionNumber}</span>
              {version.isCurrent && (
                <Badge variant="default" className="text-xs bg-red-600">
                  Atual
                </Badge>
              )}
              <Badge
                variant="outline"
                className={`text-xs ${getOperationColor(version.createdByOperation)} text-white border-0`}
              >
                {getOperationLabel(version.createdByOperation)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {new Date(version.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              {version.pages && (
                <>
                  <span>•</span>
                  <span>{version.pages} {version.pages === 1 ? 'pág' : 'págs'}</span>
                </>
              )}
            </div>
          </div>

          {/* Arrow indicating children */}
          {hasChildren && (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Vertical Line to Children */}
        {hasChildren && (
          <div
            className="absolute bg-border/50"
            style={{
              left: `${level * 40 + 10}px`,
              top: '50%',
              width: '2px',
              height: `${versionChildren.length * 70}px`
            }}
          />
        )}

        {/* Render Children */}
        {hasChildren && (
          <div className="mt-2 space-y-2">
            {versionChildren.map((child, idx) =>
              renderVersion(child, level + 1, idx === versionChildren.length - 1)
            )}
          </div>
        )}
      </div>
    );
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
          <GitBranch className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">Nenhuma versão encontrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
      {showHeader && (
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Árvore de Versões
          </CardTitle>
          <CardDescription>
            Visualização hierárquica das {versions.length} versões
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-2">
          {roots.map((root, idx) => renderVersion(root, 0, idx === roots.length - 1))}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Legenda:</p>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3 text-red-500" />
              <span className="text-muted-foreground">Versão Atual</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <Circle className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Versão Anterior</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Tem Derivações</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
