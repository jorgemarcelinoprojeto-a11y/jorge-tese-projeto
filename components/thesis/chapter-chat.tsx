'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Send, Loader2, Zap, GitCompare } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChapterSelector } from './chapter-selector';
import { CitationBadge, CitationDisplayMode } from './citation-badge';
import { getAIErrorMessage } from '@/lib/ai-error-message';

type AIProvider = 'openai' | 'gemini' | 'grok' | 'anthropic';

type ChapterVersion = {
  id: string;
  versionNumber: number;
  createdByOperation: string;
  isCurrent: boolean;
  pages: number | null;
};

type Chapter = {
  id: string;
  title: string;
  chapterOrder: number;
  versions: ChapterVersion[];
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: any[];
  citationMode?: CitationDisplayMode;
  timestamp: Date;
};

type ChapterChatProps = {
  currentChapterId: string;
  allChapters: Chapter[];
};

export function ChapterChat({ currentChapterId, allChapters }: ChapterChatProps) {
  const router = useRouter();

  // /funcao dialog state
  const [funcaoDialogOpen, setFuncaoDialogOpen] = useState(false);
  const [funcaoMode, setFuncaoMode] = useState<'preset' | 'custom'>('preset');
  const [funcaoInstructions, setFuncaoInstructions] = useState('');
  const [funcaoRunning, setFuncaoRunning] = useState(false);
  const [funcaoOps, setFuncaoOps] = useState({ adjust: true, update: true, translate: true });

  // Load messages from localStorage on mount
  const loadMessagesFromStorage = (): Message[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(`chat-history-${currentChapterId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    } catch (error) {
      console.error('[CHAT] Error loading messages from storage:', error);
    }
    return [];
  };

  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<{ models?: Record<AIProvider, string[]> } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
  const [selectedModels, setSelectedModels] = useState<Record<AIProvider, string>>({
    openai: '',
    gemini: '',
    grok: '',
    anthropic: ''
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load settings (available models per provider)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (cancelled) return;
        setSettings(data.settings || null);
        const models = data.settings?.models || {};
        const nextModels = {
          openai: models.openai?.[0] || '',
          gemini: models.gemini?.[0] || '',
          grok: models.grok?.[0] || '',
          anthropic: models.anthropic?.[0] || ''
        };
        setSelectedModels(nextModels);
        // Prefer Gemini when available (user may have Google credits)
        if (nextModels.gemini) {
          setSelectedProvider('gemini');
        } else if (nextModels.openai) {
          setSelectedProvider('openai');
        } else if (nextModels.anthropic) {
          setSelectedProvider('anthropic');
        } else if (nextModels.grok) {
          setSelectedProvider('grok');
        }
      } catch (e) {
        if (!cancelled) console.error('[CHAT] Settings load error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined' || messages.length === 0) return;
    try {
      localStorage.setItem(`chat-history-${currentChapterId}`, JSON.stringify(messages));
    } catch (error) {
      console.error('[CHAT] Error saving messages to storage:', error);
    }
  }, [messages, currentChapterId]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0 && scrollAreaRef.current) {
      // Find the ScrollArea viewport (Radix UI creates it)
      setTimeout(() => {
        const viewport = scrollAreaRef.current?.closest('[data-radix-scroll-area-root]')?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }, 100);
    }
  }, [messages]);

  // Auto-seleciona a versão atual do capítulo atual
  useEffect(() => {
    const currentChapter = allChapters.find(c => c.id === currentChapterId);
    if (currentChapter) {
      const currentVersion = currentChapter.versions.find(v => v.isCurrent);
      if (currentVersion && selectedVersionIds.length === 0) {
        setSelectedVersionIds([currentVersion.id]);
      }
    }
  }, [currentChapterId, allChapters]);

  const handleRunFuncao = async () => {
    const currentChapter = allChapters.find(c => c.id === currentChapterId);
    const currentVersion = currentChapter?.versions.find(v => v.isCurrent);
    if (!currentVersion) {
      toast.error('Nenhuma versão atual encontrada');
      return;
    }

    const versionId = currentVersion.id;
    const provider = selectedProvider;
    const model = selectedModels[provider];
    const instructions = funcaoMode === 'preset'
      ? 'Ajuste o texto para melhorar a clareza, coesão e linguagem acadêmica, corrigindo erros gramaticais e de estilo.'
      : funcaoInstructions.trim();

    if (funcaoMode === 'custom' && !instructions) {
      toast.error('Insira as instruções personalizadas');
      return;
    }

    setFuncaoRunning(true);
    try {
      const promises: Promise<any>[] = [];

      if (funcaoOps.adjust) {
        promises.push(
          fetch(`/api/chapters/${currentChapterId}/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId, instructions, provider, model })
          })
        );
      }

      if (funcaoOps.update) {
        promises.push(
          fetch(`/api/chapters/${currentChapterId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId, provider, model })
          })
        );
      }

      if (funcaoOps.translate) {
        promises.push(
          fetch(`/api/chapters/${currentChapterId}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId, targetLanguage: 'pt', provider, model })
          })
        );
      }

      await Promise.all(promises);
      toast.success('Operações iniciadas!', {
        description: 'As operações estão sendo processadas em segundo plano.',
        duration: 5000
      });
      setFuncaoDialogOpen(false);
    } catch (error: any) {
      toast.error('Erro ao iniciar operações');
    } finally {
      setFuncaoRunning(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();

    // Slash command: /comparar
    if (trimmed === '/comparar') {
      router.push(`/chapters/${currentChapterId}/compare`);
      setInput('');
      return;
    }

    // Slash command: /funcao
    if (trimmed.startsWith('/funcao')) {
      setInput('');
      setFuncaoDialogOpen(true);
      return;
    }

    if (!trimmed || selectedVersionIds.length === 0) {
      if (selectedVersionIds.length === 0) {
        toast.error('Selecione pelo menos um capítulo');
      }
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const provider = selectedProvider;
      const model = selectedModels[provider];
      if (!model) {
        toast.error(
          `Selecione um modelo para ${provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : provider === 'anthropic' ? 'Claude' : 'Grok'}`
        );
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterVersionIds: selectedVersionIds,
          question: input,
          providers: [provider],
          models: { [provider]: model }
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao enviar mensagem');
      }

      const data = await response.json();

      console.log('[CHAT] Response data:', data);

      // answers é um array de AIResponse
      const answers = data.answers || [];
      const citationMode = data.citationMode;

      if (answers.length > 0) {
        // Pega a primeira resposta (geralmente openai)
        const answer = answers[0];
        
        console.log('[CHAT] Processing answer:', {
          provider: answer.provider,
          hasText: !!answer.text,
          citationsCount: answer.citations?.length || 0
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: answer.text || 'Sem resposta',
          citations: answer.citations || [],
          citationMode: citationMode,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        console.warn('[CHAT] No answers received');
        toast.error('Nenhuma resposta recebida da IA');
      }

    } catch (error: any) {
      console.error('[CHAT] Error:', error);
      toast.error(getAIErrorMessage(error, 'Erro ao enviar mensagem'));

      // Remove a mensagem do usuário em caso de erro
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chat Area */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat Contextual
            </CardTitle>
            <CardDescription>
              Faça perguntas sobre os capítulos selecionados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Messages */}
            <ScrollArea className="h-[400px]">
              <div ref={scrollAreaRef} className="pr-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-2">Nenhuma mensagem ainda</p>
                  <p className="text-sm text-muted-foreground">
                    Selecione capítulos e faça uma pergunta para começar
                  </p>
                </div>
              ) : (
                <>
                  {loading && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Processando...</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.role === 'user'
                            ? 'bg-red-600 text-white'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                        {/* Citations */}
                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground mb-1">Fontes:</p>
                            <div className="flex flex-wrap gap-1">
                              {message.citations.map((citation: any, idx: number) => (
                                <CitationBadge
                                  key={idx}
                                  citation={{
                                    pageFrom: citation.page || citation.pageFrom || 0,
                                    pageTo: citation.page || citation.pageTo || citation.pageFrom || 0,
                                    chapterOrder: citation.metadata?.chapterOrder,
                                    chapterTitle: citation.metadata?.chapterTitle,
                                    versionNumber: citation.metadata?.versionNumber
                                  }}
                                  mode={message.citationMode || 'minimal'}
                                  showIcon={idx === 0}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-xs opacity-70 mt-2">
                          {message.timestamp.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Provider & Model selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Provedor de IA</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={(v) => setSelectedProvider(v as AIProvider)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Gemini (Google)</SelectItem>
                    <SelectItem value="grok">Grok</SelectItem>
                    <SelectItem value="anthropic">Claude</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Modelo</Label>
                <Select
                  value={selectedModels[selectedProvider] || ''}
                  onValueChange={(v: string) =>
                    setSelectedModels((prev: Record<AIProvider, string>) => ({ ...prev, [selectedProvider]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(settings?.models?.[selectedProvider] || []).map((m: string) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Slash command hints */}
            {input.startsWith('/') && (
              <div className="flex gap-2 flex-wrap">
                {input === '/' || '/comparar'.startsWith(input) ? (
                  <button
                    type="button"
                    onClick={() => setInput('/comparar')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-gray-300 transition-colors"
                  >
                    <GitCompare className="h-3 w-3 text-blue-400" />
                    /comparar
                    <span className="text-gray-500">— abrir comparador</span>
                  </button>
                ) : null}
                {input === '/' || '/funcao'.startsWith(input) ? (
                  <button
                    type="button"
                    onClick={() => setInput('/funcao')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-gray-300 transition-colors"
                  >
                    <Zap className="h-3 w-3 text-yellow-400" />
                    /funcao
                    <span className="text-gray-500">— executar todas as operações</span>
                  </button>
                ) : null}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua pergunta ou /comparar, /funcao..."
                disabled={loading || selectedVersionIds.length === 0}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim() || selectedVersionIds.length === 0}
                size="icon"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {selectedVersionIds.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                ← Selecione capítulos no painel ao lado
              </p>
            )}

            {/* Clear history button */}
            {messages.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm('Tem certeza que deseja limpar o histórico de conversa?')) {
                      setMessages([]);
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem(`chat-history-${currentChapterId}`);
                      }
                    }
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Limpar histórico
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chapter Selector */}
      <div className="lg:col-span-1">
        <ChapterSelector
          chapters={allChapters}
          selectedVersionIds={selectedVersionIds}
          onSelectionChange={setSelectedVersionIds}
          currentChapterId={currentChapterId}
        />
      </div>

      {/* /funcao Dialog */}
      <Dialog open={funcaoDialogOpen} onOpenChange={setFuncaoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              Executar Operações
            </DialogTitle>
            <DialogDescription>
              Escolha o modo e as operações a executar na versão atual do capítulo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFuncaoMode('preset')}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                  funcaoMode === 'preset'
                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                <div className="font-semibold mb-0.5">Predefinido</div>
                <div className="text-xs opacity-70">Instruções padrão de melhoria acadêmica</div>
              </button>
              <button
                type="button"
                onClick={() => setFuncaoMode('custom')}
                className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                  funcaoMode === 'custom'
                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                <div className="font-semibold mb-0.5">Personalizado</div>
                <div className="text-xs opacity-70">Configure suas próprias instruções</div>
              </button>
            </div>

            {/* Custom instructions */}
            {funcaoMode === 'custom' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Instruções de ajuste</Label>
                <Textarea
                  placeholder="Descreva como deseja que o texto seja ajustado..."
                  value={funcaoInstructions}
                  onChange={(e) => setFuncaoInstructions(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}

            {/* Operations to run */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Operações</Label>
              <div className="space-y-2">
                {[
                  { key: 'adjust', label: 'Ajustar', description: 'Melhora clareza e linguagem acadêmica' },
                  { key: 'update', label: 'Revisar normas', description: 'Atualiza conforme normas acadêmicas' },
                  { key: 'translate', label: 'Traduzir para Português', description: 'Traduz para pt-BR' },
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-start gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <Checkbox
                      id={`funcao-op-${key}`}
                      checked={funcaoOps[key as keyof typeof funcaoOps]}
                      onCheckedChange={(checked) =>
                        setFuncaoOps(prev => ({ ...prev, [key]: !!checked }))
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor={`funcao-op-${key}`} className="cursor-pointer">
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="text-xs text-gray-500">{description}</div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setFuncaoDialogOpen(false)}
                disabled={funcaoRunning}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleRunFuncao}
                disabled={funcaoRunning || !Object.values(funcaoOps).some(Boolean)}
                className="bg-red-600 hover:bg-red-700"
              >
                {funcaoRunning ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />Executar</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
