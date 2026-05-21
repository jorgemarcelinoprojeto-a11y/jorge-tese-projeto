/**
 * Whole-document processing: serialize paragraphs with markers,
 * send one prompt to AI, parse response back into paragraphs.
 */

import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { AIProvider } from '@/lib/ai/types';
import { chatWithAgent, chatWithAgentLong } from '@/lib/ai/agent-chat';
import { SupportedLanguage } from '@/lib/translation/types';

export type PromptParagraph = {
  index: number;
  text: string;
  isHeader: boolean;
};

export type WholeDocumentTask = 'translate' | 'adapt' | 'adjust';

export type WholeDocumentOptions = {
  task: WholeDocumentTask;
  provider: AIProvider;
  model: string;
  targetLanguage?: SupportedLanguage;
  adaptStyle?: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
  adjustInstructions?: string;
  maxChars?: number;
};

export type WholeDocumentResult = {
  success: boolean;
  processingMode: 'whole-document' | 'failed';
  paragraphCount: number;
  markerMatchRate: number;
  appliedCount: number;
  error?: string;
};

const DEFAULT_MAX_CHARS: Record<AIProvider, number> = {
  openai: 96000,
  gemini: 96000,
  anthropic: 96000,
  grok: 96000,
};

const MARKER_OPEN = (n: number) => `[[P${String(n).padStart(4, '0')}]]`;
const MARKER_CLOSE = (n: number) => `[[/P${String(n).padStart(4, '0')}]]`;

export async function extractParagraphsForPrompt(docPath: string): Promise<PromptParagraph[]> {
  const { paragraphs } = await extractDocumentStructure(docPath);
  return paragraphs.map((p) => ({
    index: p.index,
    text: p.text,
    isHeader: p.isHeader,
  }));
}

export function serializeDocumentWithMarkers(paragraphs: PromptParagraph[]): string {
  return paragraphs
    .map((p) => `${MARKER_OPEN(p.index)}${p.text}${MARKER_CLOSE(p.index)}`)
    .join('\n\n');
}

export function estimateSerializedLength(paragraphs: PromptParagraph[]): number {
  return serializeDocumentWithMarkers(paragraphs).length;
}

export function canUseWholeDocument(
  paragraphs: PromptParagraph[],
  provider: AIProvider,
  maxChars?: number
): boolean {
  const limit = maxChars ?? DEFAULT_MAX_CHARS[provider] ?? 96000;
  return estimateSerializedLength(paragraphs) <= limit;
}

export function buildWholeDocumentPrompt(
  task: WholeDocumentTask,
  serialized: string,
  options: Omit<WholeDocumentOptions, 'provider' | 'model' | 'task' | 'maxChars'>
): string {
  const markerRules = `
REGRAS OBRIGATÓRIAS:
- Preserve EXATAMENTE os marcadores [[P0000]]...[[/P0000]] na mesma ordem e quantidade
- Não funda nem divida parágrafos
- Não omita nenhum marcador
- Retorne APENAS o documento processado com os marcadores
`;

  if (task === 'translate') {
    const lang = options.targetLanguage === 'en' ? 'inglês'
      : options.targetLanguage === 'es' ? 'espanhol'
      : options.targetLanguage === 'fr' ? 'francês'
      : options.targetLanguage === 'de' ? 'alemão'
      : options.targetLanguage === 'it' ? 'italiano'
      : 'português';
    return `Traduza o documento abaixo para ${lang}.
${markerRules}

${serialized}`;
  }

  if (task === 'adapt') {
    const styleLabel =
      options.adaptStyle === 'academic' ? 'acadêmico'
      : options.adaptStyle === 'professional' ? 'profissional'
      : options.adaptStyle === 'simplified' ? 'simplificado'
      : 'personalizado';
    const audience = options.targetAudience ? `\nPúblico-alvo: ${options.targetAudience}` : '';
    return `Adapte o documento abaixo para estilo ${styleLabel}.${audience}
Mantenha o significado; altere tom, vocabulário e estrutura conforme o estilo.
${markerRules}

${serialized}`;
  }

  return `Aplique as seguintes instruções ao documento abaixo:
"${options.adjustInstructions || 'Melhore o documento'}"

${markerRules}

${serialized}`;
}

export function parseMarkedResponse(
  response: string,
  expectedParagraphs: PromptParagraph[]
): { map: Map<number, string>; matchRate: number } {
  const map = new Map<number, string>();
  const expectedIndices = new Set(expectedParagraphs.map((p) => p.index));

  for (const p of expectedParagraphs) {
    const open = MARKER_OPEN(p.index);
    const close = MARKER_CLOSE(p.index);
    const start = response.indexOf(open);
    if (start === -1) continue;
    const contentStart = start + open.length;
    const end = response.indexOf(close, contentStart);
    if (end === -1) continue;
    map.set(p.index, response.slice(contentStart, end).trim());
  }

  if (map.size === expectedParagraphs.length) {
    return { map, matchRate: 1 };
  }

  // Fallback: try regex for all markers in response
  const regex = /\[\[P(\d{4})\]\]([\s\S]*?)\[\[\/P\1\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(response)) !== null) {
    const idx = parseInt(match[1], 10);
    if (expectedIndices.has(idx) && !map.has(idx)) {
      map.set(idx, match[2].trim());
    }
  }

  const matchRate = expectedParagraphs.length > 0
    ? map.size / expectedParagraphs.length
    : 0;
  return { map, matchRate };
}

export function alignParagraphsFallback(
  original: PromptParagraph[],
  responseText: string
): Map<number, string> {
  const map = new Map<number, string>();
  const parts = responseText
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === original.length) {
    original.forEach((p, i) => map.set(p.index, parts[i]));
    return map;
  }

  // Partial alignment: fill what we can, keep original for rest
  const count = Math.min(parts.length, original.length);
  for (let i = 0; i < count; i++) {
    map.set(original[i].index, parts[i]);
  }
  return map;
}

export async function callWholeDocumentAI(
  prompt: string,
  provider: AIProvider,
  model: string
): Promise<string> {
  return chatWithAgentLong({
    provider,
    model,
    systemPrompt: 'Você processa documentos acadêmicos preservando marcadores de parágrafo exatamente como recebidos.',
    history: [],
    userMessage: prompt,
  });
}

export async function applyParagraphMapToDocx(
  inputPath: string,
  outputPath: string,
  paragraphs: PromptParagraph[],
  map: Map<number, string>
): Promise<{ appliedCount: number; unmatchedCount: number }> {
  const suggestions: ApplyDocxSuggestion[] = [];
  for (const p of paragraphs) {
    const newText = map.get(p.index);
    if (newText && newText !== p.text) {
      suggestions.push({
        id: `p-${p.index}`,
        originalText: p.text,
        improvedText: newText,
      });
    }
  }
  if (suggestions.length === 0) {
    const fs = await import('fs/promises');
    await fs.copyFile(inputPath, outputPath);
    return { appliedCount: 0, unmatchedCount: 0 };
  }
  return applySuggestionsToDocx(inputPath, outputPath, suggestions);
}

export async function processWholeDocument(
  inputPath: string,
  outputPath: string,
  options: WholeDocumentOptions
): Promise<WholeDocumentResult> {
  try {
    const paragraphs = await extractParagraphsForPrompt(inputPath);
    if (paragraphs.length === 0) {
      const fs = await import('fs/promises');
      await fs.copyFile(inputPath, outputPath);
      return {
        success: true,
        processingMode: 'whole-document',
        paragraphCount: 0,
        markerMatchRate: 1,
        appliedCount: 0,
      };
    }

    if (!canUseWholeDocument(paragraphs, options.provider, options.maxChars)) {
      return {
        success: false,
        processingMode: 'failed',
        paragraphCount: paragraphs.length,
        markerMatchRate: 0,
        appliedCount: 0,
        error: 'Document exceeds whole-document size limit',
      };
    }

    const serialized = serializeDocumentWithMarkers(paragraphs);
    const prompt = buildWholeDocumentPrompt(options.task, serialized, options);

    let response = await callWholeDocumentAI(prompt, options.provider, options.model);
    let { map, matchRate } = parseMarkedResponse(response, paragraphs);

    if (matchRate < 1) {
      // Retry once
      response = await callWholeDocumentAI(
        `${prompt}\n\nIMPORTANTE: A resposta anterior omitiu marcadores. Inclua TODOS os marcadores [[Pxxxx]].`,
        options.provider,
        options.model
      );
      const retry = parseMarkedResponse(response, paragraphs);
      if (retry.matchRate > matchRate) {
        map = retry.map;
        matchRate = retry.matchRate;
      }
    }

    if (matchRate < 0.5) {
      const fallbackMap = alignParagraphsFallback(paragraphs, response);
      for (const [idx, text] of fallbackMap) {
        if (!map.has(idx)) map.set(idx, text);
      }
      matchRate = map.size / paragraphs.length;
    }

    const { appliedCount, unmatchedCount } = await applyParagraphMapToDocx(
      inputPath,
      outputPath,
      paragraphs,
      map
    );

    return {
      success: true,
      processingMode: 'whole-document',
      paragraphCount: paragraphs.length,
      markerMatchRate: matchRate,
      appliedCount: appliedCount + (unmatchedCount === 0 ? 0 : 0),
    };
  } catch (error: any) {
    return {
      success: false,
      processingMode: 'failed',
      paragraphCount: 0,
      markerMatchRate: 0,
      appliedCount: 0,
      error: error.message,
    };
  }
}
