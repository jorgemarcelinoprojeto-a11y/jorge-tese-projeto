/** Catálogo completo de comandos do Modo Agente. */

export type CommandExample = {
  cmd: string;
  desc: string;
};

export type CommandCategory = {
  id: string;
  title: string;
  description: string;
  examples: CommandExample[];
};

export const MULTI3_PROVIDER_HINT =
  'gemini (google), openai (gpt/chatgpt), claude (anthropic), grok (xai/crok)';

export const MULTI3_SHORT_DESCRIPTION =
  '3 IAs processam em paralelo → todas viram versões → juiz (Gemini) ativa a melhor automaticamente. Compare no painel ou no histórico Multi-IA.';

export const AGENT_COMMAND_CATALOG: CommandCategory[] = [
  {
    id: 'perguntar',
    title: '/perguntar — Perguntar sobre o documento',
    description: 'Faz uma pergunta à IA sobre o conteúdo. Não gera nova versão do arquivo.',
    examples: [
      { cmd: '/perguntar qual o tema deste capítulo?', desc: 'Identificar tema principal' },
      { cmd: '/perguntar qual o argumento central do autor?', desc: 'Resumo argumentativo' },
      { cmd: '/perguntar quais leis são citadas?', desc: 'Listar referências legais' },
      { cmd: '/perguntar resuma em 3 parágrafos', desc: 'Resumo do documento' },
    ],
  },
  {
    id: 'ajustar',
    title: '/ajustar — Editar com instruções',
    description: 'A IA aplica suas instruções e cria uma nova versão do documento.',
    examples: [
      { cmd: '/ajustar expandir a conclusão', desc: 'Aprofundar conclusão' },
      { cmd: '/ajustar resumir parágrafos longos', desc: 'Reduzir extensão' },
      { cmd: '/ajustar corrigir erros de gramática', desc: 'Revisão linguística' },
      { cmd: '/ajustar adicionar citações onde faltam', desc: 'Completar referências' },
    ],
  },
  {
    id: 'adaptar',
    title: '/adaptar — Mudar tom e estilo',
    description: 'Adapta o texto para outro público ou registro linguístico.',
    examples: [
      { cmd: '/adaptar acadêmico', desc: 'Tom formal acadêmico' },
      { cmd: '/adaptar simplificado', desc: 'Linguagem acessível' },
      { cmd: '/adaptar profissional', desc: 'Tom corporativo/técnico' },
      { cmd: '/adaptar acadêmico para público leigo', desc: 'Estilo + audiência' },
    ],
  },
  {
    id: 'traduzir',
    title: '/traduzir — Traduzir versão atual',
    description: 'Traduz o documento para outro idioma.',
    examples: [
      { cmd: '/traduzir inglês', desc: 'Para inglês' },
      { cmd: '/traduzir português', desc: 'Para português' },
      { cmd: '/traduzir espanhol', desc: 'Para espanhol' },
      { cmd: '/traduzir francês', desc: 'Para francês' },
    ],
  },
  {
    id: 'revisar',
    title: '/revisar — Verificar normas e leis',
    description: 'Detecta leis/normas citadas e verifica se continuam vigentes.',
    examples: [
      { cmd: '/revisar', desc: 'Revisão completa de normas' },
    ],
  },
  {
    id: 'todos',
    title: '/todos — Pipeline completo',
    description: 'Executa em sequência: traduzir → adaptar simplificado → revisar leis.',
    examples: [
      { cmd: '/todos', desc: 'Pipeline padrão (1 IA)' },
      { cmd: '/todos /3 gemini openai claude', desc: 'Pipeline com 3 IAs em paralelo' },
    ],
  },
  {
    id: 'comparar',
    title: '/comparar — Diff entre versões',
    description: 'Abre comparação visual entre duas versões salvas.',
    examples: [
      { cmd: '/comparar', desc: 'Original vs versão atual' },
      { cmd: '/comparar 1 atual', desc: 'Versão 1 vs atual' },
      { cmd: '/comparar 2 5', desc: 'Versão 2 vs versão 5' },
    ],
  },
  {
    id: 'multi3-start',
    title: 'Multi-IA /3 — Iniciar comparação',
    description: `${MULTI3_SHORT_DESCRIPTION} Provedores: ${MULTI3_PROVIDER_HINT}.`,
    examples: [
      { cmd: '/3 gemini openai claude /perguntar qual o tema do documento', desc: '3 respostas em texto (sem versão)' },
      { cmd: '/3 gemini openai claude /ajustar expandir a conclusão', desc: '3 edições — melhor ativada automaticamente' },
      { cmd: '/3 gemini openai claude /adaptar acadêmico', desc: '3 adaptações de estilo' },
      { cmd: '/3 gemini openai claude /traduzir português', desc: '3 traduções' },
      { cmd: '/3 gemini openai claude /revisar', desc: '3 revisões de normas' },
      { cmd: '/3 gemini openai claude /todos', desc: '3 pipelines completos' },
      { cmd: '/3 gemini openai grok /adaptar simplificado', desc: 'Usar Grok em vez de Claude' },
    ],
  },
  {
    id: 'multi3-follow',
    title: 'Multi-IA /3 — Durante ou após comparação',
    description: 'Comandos para trocar a versão ativa ou re-juizar os resultados.',
    examples: [
      { cmd: '/3 escolher claude', desc: 'Ativar versão do Claude manualmente' },
      { cmd: '/3 escolher openai', desc: 'Ativar versão da OpenAI' },
      { cmd: '/3 escolher gemini', desc: 'Ativar versão do Gemini' },
      { cmd: '/3 decidir openai', desc: 'Re-juizar com OpenAI como juiz' },
      { cmd: '/3 decidir gemini', desc: 'Re-juizar com Gemini (padrão)' },
    ],
  },
  {
    id: 'util',
    title: 'Utilitários',
    description: 'Outros comandos do chat.',
    examples: [
      { cmd: '/limpar', desc: 'Limpa o histórico da conversa' },
    ],
  },
];

/** @deprecated use AGENT_COMMAND_CATALOG — mantido para Multi3CommandHelp */
export const MULTI3_COMMAND_EXAMPLES = AGENT_COMMAND_CATALOG.filter((c) =>
  c.id.startsWith('multi3')
).map((c) => ({ category: c.title, examples: c.examples }));
