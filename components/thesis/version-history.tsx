'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, Circle, ArrowRight, CheckCircle2, GitCompare } from 'lucide-react';
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
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const buildTree = () => {
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

    return { roots, children };
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

  const toggleCompareSelect = (versionId: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(versionId)) return prev.filter(id => id !== versionId);
      if (prev.length >= 2) return [prev[1], versionId];
      return [...prev, versionId];
    });
  };

  const goToCompare = () => {
    if (selectedForCompare.length === 2) {
      router.push(
        `/chapters/${chapterId}/compare?v1=${selectedForCompare[0]}&v2=${selectedForCompare[1]}`
      );
    } else if (selectedForCompare.length === 1 && versions.length >= 2) {
      const other = versions.find(v => v.id !== selectedForCompare[0]);
      if (other) {
        router.push(
          `/chapters/${chapterId}/compare?v1=${selectedForCompare[0]}&v2=${other.id}`
        );
      }
    } else {
      router.push(`/chapters/${chapterId}/compare`);
    }
  };

  const renderVersion = (version: ChapterVersion, level: number = 0) => {
    const versionChildren = children.get(version.id) || [];
    const hasChildren = versionChildren.length > 0;
    const isSelected = selectedForCompare.includes(version.id);

    return (
      <div key={version.id} className="relative">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
            compareMode
              ? isSelected
                ? 'bg-red-500/20 border-red-500/50 cursor-pointer'
                : 'bg-muted/30 border-border/50 hover:bg-muted/50 cursor-pointer'
              : version.isCurrent
              ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20 cursor-pointer'
              : 'bg-muted/30 border-border/50 hover:bg-muted/50 cursor-pointer'
          }`}
          style={{ marginLeft: `${level * 40}px` }}
          onClick={() =>
            compareMode
              ? toggleCompareSelect(version.id)
              : router.push(`/chapters/${chapterId}/versions/${version.id}`)
          }
        >
          {level > 0 && (
            <div
              className="absolute h-[2px] bg-border/50"
              style={{
                left: `${(level - 1) * 40 + 20}px`,
                width: '40px',
                top: '50%',
              }}
            />
          )}

          <div className="relative z-10">
            {compareMode && isSelected ? (
              <CheckCircle2 className="h-5 w-5 text-red-500" />
            ) : version.isCurrent ? (
              <CheckCircle2 className="h-5 w-5 text-red-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">v{version.versionNumber}</span>
              {version.isCurrent && (
                <Badge variant="default" className="text-xs bg-red-600">
                  Atual
                </Badge>
              )}
              {compareMode && isSelected && (
                <Badge variant="default" className="text-xs bg-red-500">
                  Selecionada
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
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
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

          {hasChildren && !compareMode && (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {hasChildren && (
          <div
            className="absolute bg-border/50"
            style={{
              left: `${level * 40 + 10}px`,
              top: '50%',
              width: '2px',
              height: `${versionChildren.length * 70}px`,
            }}
          />
        )}

        {hasChildren && (
          <div className="mt-2 space-y-2">
            {versionChildren.map((child) => renderVersion(child, level + 1))}
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
              Comparar Versões
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Comparar Versões
              </CardTitle>
              <CardDescription>
                {versions.length} {versions.length === 1 ? 'versão' : 'versões'} disponíveis
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {compareMode ? (
                <>
                  <span className="text-xs text-gray-400">
                    {selectedForCompare.length}/2 selecionadas
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCompareMode(false);
                      setSelectedForCompare([]);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={goToCompare}
                    disabled={selectedForCompare.length === 0}
                  >
                    <GitCompare className="h-4 w-4 mr-1" />
                    Comparar
                  </Button>
                </>
              ) : (
                versions.length >= 2 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => setCompareMode(true)}
                  >
                    <GitCompare className="h-4 w-4 mr-1" />
                    Comparar
                  </Button>
                )
              )}
            </div>
          </div>
          {compareMode && (
            <p className="text-xs text-gray-400 mt-1">
              Clique em até 2 versões para comparar lado a lado
            </p>
          )}
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-2">
          {roots.map((root) => renderVersion(root, 0))}
        </div>

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
