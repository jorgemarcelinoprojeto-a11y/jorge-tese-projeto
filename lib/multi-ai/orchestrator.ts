import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  createMulti3Session,
  getMulti3Session,
  updateMulti3Session,
  multi3DefaultModel,
} from './session-store';
import { judgeMulti3Results } from './judge';
import {
  Multi3StartRequest,
  Multi3Session,
  Multi3Candidate,
  Multi3Command,
} from './types';
import { AIProvider } from '@/lib/ai/types';
import {
  downloadChapterVersionFile,
  createChapterVersionFromFile,
  activateChapterVersion,
  extractVersionTextPreview,
  getApiKey,
} from './chapter-helpers';
import { runTodosPipeline } from '@/lib/todos/run-todos-pipeline';
import { processWholeDocument } from '@/lib/document-processing/whole-document';
import { translateDocx } from '@/lib/translation/docx-translator';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { supabase } from '@/lib/supabase';

const STYLE_MAP: Record<string, 'academic' | 'professional' | 'simplified'> = {
  acadêmico: 'academic', academico: 'academic', academic: 'academic',
  profissional: 'professional', professional: 'professional',
  simplificado: 'simplified', simples: 'simplified', simplified: 'simplified',
};

const LANGUAGE_MAP: Record<string, string> = {
  português: 'pt', portugues: 'pt', pt: 'pt',
  inglês: 'en', ingles: 'en', english: 'en', en: 'en',
  espanhol: 'es', spanish: 'es', es: 'es',
};

function multi3Meta(sessionId: string, provider: AIProvider, branchIndex: number, command: Multi3Command) {
  return {
    multi3SessionId: sessionId,
    multi3Provider: provider,
    multi3Role: 'candidate',
    multi3Command: command,
    multi3BranchIndex: branchIndex,
  };
}

export async function startChapterMulti3(
  chapterId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  const models = req.models || {};
  for (const p of req.providers) {
    if (!models[p]) models[p] = multi3DefaultModel(p);
  }

  const session = await createMulti3Session('chapter', chapterId, { ...req, models });

  runChapterMulti3Background(chapterId, session.id, { ...req, models }).catch(async (err) => {
    console.error(`[MULTI3 ${session.id}] Background error:`, err);
    await updateMulti3Session(session.id, { status: 'failed', completedAt: new Date().toISOString() });
  });

  return session;
}

async function runChapterMulti3Background(
  chapterId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> }
): Promise<void> {
  const session = await getMulti3Session(sessionId);
  if (!session) return;

  const candidates = await Promise.all(
    req.providers.map((provider, branchIndex) =>
      runSingleCandidate(chapterId, sessionId, req, provider, branchIndex)
    )
  );

  await updateMulti3Session(sessionId, { candidates, status: 'candidates_ready' });

  const completed = candidates.filter((c) => c.status === 'completed');
  if (completed.length === 0) {
    await updateMulti3Session(sessionId, { status: 'failed', completedAt: new Date().toISOString() });
    return;
  }

  await updateMulti3Session(sessionId, { status: 'judging' });

  const judgeProvider = req.judgeProvider || session.judgeProvider;
  const judgeModel = req.models?.[judgeProvider] || multi3DefaultModel(judgeProvider);

  const textByProvider: Record<string, string> = {};
  for (const c of completed) {
    if (c.text) {
      textByProvider[c.provider] = c.text;
    } else if (c.versionId) {
      const { data: ver } = await supabase
        .from('chapter_versions')
        .select('file_path')
        .eq('id', c.versionId)
        .single();
      if (ver?.file_path) {
        const tmp = await downloadChapterVersionFile(c.versionId, ver.file_path, 'judge_preview');
        try {
          textByProvider[c.provider] = await extractVersionTextPreview(tmp);
        } finally {
          await fs.unlink(tmp).catch(() => {});
        }
      }
    }
  }

  const judgeResult = await judgeMulti3Results({
    command: req.command,
    commandArgs: req.args || '',
    judgeProvider,
    judgeModel,
    candidates: completed.map((c) => ({
      provider: c.provider,
      text: textByProvider[c.provider] || c.text || '',
    })),
  });

  const winner = completed.find((c) => c.provider === judgeResult.winnerProvider) || completed[0];

  await updateMulti3Session(sessionId, {
    status: 'awaiting_human',
    winnerProvider: winner.provider,
    winnerVersionId: winner.versionId,
    judgeReasoning: judgeResult.reasoning,
    judgeScores: judgeResult.scores,
    completedAt: new Date().toISOString(),
  });
}

async function runSingleCandidate(
  chapterId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> },
  provider: AIProvider,
  branchIndex: number
): Promise<Multi3Candidate> {
  const model = req.models?.[provider] || multi3DefaultModel(provider);
  const meta = multi3Meta(sessionId, provider, branchIndex, req.command);

  try {
    switch (req.command) {
      case '/todos':
        return await runTodosCandidate(chapterId, req.versionId, provider, model, meta, branchIndex);
      case '/perguntar':
        return await runPerguntarCandidate(chapterId, req.versionId, provider, model, req.args || '', branchIndex);
      case '/ajustar':
        return await runAdjustCandidate(chapterId, req.versionId, provider, model, req.args || '', meta);
      case '/adaptar':
        return await runAdaptCandidate(chapterId, req.versionId, provider, model, req.args || '', meta);
      case '/traduzir':
        return await runTranslateCandidate(chapterId, req.versionId, provider, model, req.args || '', meta);
      case '/revisar':
        return await runRevisarCandidate(chapterId, req.versionId, provider, model, meta);
      default:
        throw new Error(`Comando não suportado: ${req.command}`);
    }
  } catch (error: any) {
    return {
      provider,
      model,
      status: 'failed',
      branchIndex,
      error: error.message,
    };
  }
}

async function runTodosCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  meta: Record<string, unknown>,
  branchIndex: number
): Promise<Multi3Candidate> {
  const result = await runTodosPipeline(chapterId, {
    provider,
    model,
    targetLanguage: 'pt',
    adaptStyle: 'simplified',
    multi3Meta: meta,
    setAsCurrent: false,
  });

  const { data: ver } = await supabase
    .from('chapter_versions')
    .select('file_path')
    .eq('id', result.finalVersionId)
    .single();

  let preview = '';
  if (ver?.file_path) {
    const tmp = await downloadChapterVersionFile(result.finalVersionId, ver.file_path, 'preview');
    try {
      preview = await extractVersionTextPreview(tmp);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }

  return {
    provider,
    model,
    status: 'completed',
    versionId: result.finalVersionId,
    versionIds: result.versionIds,
    branchIndex,
    text: preview,
    progress: 100,
    progressLabel: '/todos concluído',
  };
}

async function runPerguntarCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  question: string,
  branchIndex: number
): Promise<Multi3Candidate> {
  const { data: ver } = await supabase
    .from('chapter_versions')
    .select('file_path')
    .eq('id', versionId)
    .single();
  if (!ver) throw new Error('Versão não encontrada');

  const tmp = await downloadChapterVersionFile(versionId, ver.file_path, 'perguntar');
  let docText = '';
  try {
    const { paragraphs } = await extractDocumentStructure(tmp);
    docText = paragraphs.map((p) => p.text).join('\n\n').slice(0, 60000);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }

  const reply = await chatWithAgent({
    provider,
    model,
    systemPrompt: `Você responde perguntas sobre o documento "${chapterId}". Responda em português de forma clara e objetiva.`,
    history: [],
    userMessage: `Documento:\n${docText}\n\nPergunta: ${question}`,
  });

  return {
    provider,
    model,
    status: 'completed',
    branchIndex,
    text: reply,
    progress: 100,
  };
}

async function runAdjustCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  instructions: string,
  meta: Record<string, unknown>
): Promise<Multi3Candidate> {
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'adjust');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_adjust.docx`);

  try {
    const whole = await processWholeDocument(inputPath, outputPath, {
      task: 'adjust',
      provider,
      model,
      adjustInstructions: instructions,
    });

    if (!whole.success) {
      const suggestions = await analyzeDocumentForAdjustments(
        inputPath,
        instructions,
        5,
        provider,
        model,
        getApiKey(provider),
        false
      );
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adjustedText || s.improvedText || '',
      }));
      await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'adjust',
      { ...meta, instructions, processingMode: whole.success ? 'whole-document' : 'batches' },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runAdaptCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  styleArg: string,
  meta: Record<string, unknown>
): Promise<Multi3Candidate> {
  const styleKey = styleArg.toLowerCase().split(/\s+/)[0];
  const style = STYLE_MAP[styleKey] || 'simplified';

  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'adapt');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_adapt.docx`);

  try {
    const whole = await processWholeDocument(inputPath, outputPath, {
      task: 'adapt',
      provider,
      model,
      adaptStyle: style,
    });

    if (!whole.success) {
      const suggestions = await analyzeDocumentForAdaptation(
        inputPath,
        style,
        undefined,
        provider,
        model,
        getApiKey(provider)
      );
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adaptedText || '',
      }));
      if (docxSuggestions.length === 0) {
        await fs.copyFile(inputPath, outputPath);
      } else {
        await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
      }
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'adapt',
      { ...meta, style, processingMode: whole.success ? 'whole-document' : 'batches' },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runTranslateCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  langArg: string,
  meta: Record<string, unknown>
): Promise<Multi3Candidate> {
  const lang = LANGUAGE_MAP[langArg.toLowerCase().split(/\s+/)[0]] || 'pt';
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'translate');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_translate.docx`);

  try {
    const whole = await processWholeDocument(inputPath, outputPath, {
      task: 'translate',
      provider,
      model,
      targetLanguage: lang as any,
    });

    if (!whole.success) {
      const result = await translateDocx(inputPath, outputPath, {
        targetLanguage: lang as any,
        provider,
        model,
      });
      if (!result.success) throw new Error(result.error || 'Falha na tradução');
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'translate',
      { ...meta, targetLanguage: lang, processingMode: whole.success ? 'whole-document' : 'batches' },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function runRevisarCandidate(
  chapterId: string,
  versionId: string,
  provider: AIProvider,
  model: string,
  meta: Record<string, unknown>
): Promise<Multi3Candidate> {
  const { data: ver } = await supabase.from('chapter_versions').select('file_path').eq('id', versionId).single();
  if (!ver) throw new Error('Versão não encontrada');

  const inputPath = await downloadChapterVersionFile(versionId, ver.file_path, 'revisar');
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}_revisar.docx`);

  try {
    const { structure, paragraphs } = await extractDocumentStructure(inputPath);
    const paragraphsWithContext = paragraphs
      .filter((p) => !p.isHeader)
      .map((p) => ({
        text: p.text,
        index: p.index,
        chapterTitle: structure.sections.find((s) =>
          p.index >= s.startParagraphIndex && p.index <= s.endParagraphIndex && s.level === 1
        )?.title,
      }));

    const normsProvider: 'openai' | 'gemini' | 'anthropic' =
      provider === 'grok' ? 'gemini' : provider;
    const normsModel = provider === 'grok' ? 'gemini-2.5-flash' : model;
    const apiKey = getApiKey(normsProvider);

    const references = await detectNormsInDocument(paragraphsWithContext, normsProvider, normsModel, apiKey);

    if (references.length === 0) {
      await fs.copyFile(inputPath, outputPath);
    } else {
      const verified = await verifyMultipleNorms(references, normsProvider, normsModel, apiKey);
      const toApply = verified.filter((r) => r.suggestedText);
      if (toApply.length === 0) {
        await fs.copyFile(inputPath, outputPath);
      } else {
        await applyNormUpdatesToDocx(inputPath, outputPath, toApply);
      }
    }

    const newVersionId = await createChapterVersionFromFile(
      chapterId,
      versionId,
      outputPath,
      'update',
      { ...meta, multi3AutoApplied: true },
      false
    );

    const preview = await extractVersionTextPreview(outputPath);
    return {
      provider,
      model,
      status: 'completed',
      versionId: newVersionId,
      text: preview,
      progress: 100,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

export async function acceptMulti3Winner(
  sessionId: string,
  provider?: AIProvider
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const chosenProvider = provider || session.winnerProvider;
  if (!chosenProvider) throw new Error('Nenhum vencedor definido');

  const winner = session.candidates.find((c) => c.provider === chosenProvider && c.status === 'completed');
  if (!winner) throw new Error('Candidato não encontrado');

  if (session.command === '/perguntar' || !winner.versionId) {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: chosenProvider,
      completedAt: new Date().toISOString(),
    });
    const updated = await getMulti3Session(sessionId);
    return updated!;
  }

  if (session.targetType === 'chapter' && winner.versionId) {
    await activateChapterVersion(session.targetId, winner.versionId);

    // Mark winner in metadata
    const { data: ver } = await supabase
      .from('chapter_versions')
      .select('metadata')
      .eq('id', winner.versionId)
      .single();
    if (ver) {
      await supabase
        .from('chapter_versions')
        .update({
          metadata: { ...(ver.metadata || {}), multi3Role: 'winner' },
        })
        .eq('id', winner.versionId);
    }
  }

  await updateMulti3Session(sessionId, {
    status: 'accepted',
    winnerProvider: chosenProvider,
    winnerVersionId: winner.versionId,
    completedAt: new Date().toISOString(),
  });

  const updated = await getMulti3Session(sessionId);
  return updated!;
}

export async function rejudgeMulti3Session(
  sessionId: string,
  judgeProvider: AIProvider,
  judgeModel?: string
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const completed = session.candidates.filter((c) => c.status === 'completed');
  const textByProvider: Record<string, string> = {};

  for (const c of completed) {
    if (c.text) {
      textByProvider[c.provider] = c.text;
    } else if (c.versionId) {
      const { data: ver } = await supabase
        .from('chapter_versions')
        .select('file_path')
        .eq('id', c.versionId)
        .single();
      if (ver?.file_path) {
        const tmp = await downloadChapterVersionFile(c.versionId, ver.file_path, 'rejudge');
        try {
          textByProvider[c.provider] = await extractVersionTextPreview(tmp);
        } finally {
          await fs.unlink(tmp).catch(() => {});
        }
      }
    }
  }

  const model = judgeModel || multi3DefaultModel(judgeProvider);
  const judgeResult = await judgeMulti3Results({
    command: session.command,
    commandArgs: session.commandArgs,
    judgeProvider,
    judgeModel: model,
    candidates: completed.map((c) => ({
      provider: c.provider,
      text: textByProvider[c.provider] || c.text || '',
    })),
  });

  const winner = completed.find((c) => c.provider === judgeResult.winnerProvider) || completed[0];

  await updateMulti3Session(sessionId, {
    status: 'awaiting_human',
    judgeProvider,
    winnerProvider: winner.provider,
    winnerVersionId: winner.versionId,
    judgeReasoning: judgeResult.reasoning,
    judgeScores: judgeResult.scores,
  });

  const updated = await getMulti3Session(sessionId);
  return updated!;
}
