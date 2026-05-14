import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { translateDocx, applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';
import JSZip from 'jszip';
import { SupportedLanguage } from '@/lib/translation/types';
import { AIProvider } from '@/lib/ai/types';
import { createOperationJob, updateOperationJob } from '@/lib/thesis/chapter-operations';
import { processChapterVersion } from '@/lib/thesis/chapter-processor';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { applyNormUpdatesToDocx } from '@/lib/norms-update/apply-docx';
import { NormReference } from '@/lib/norms-update/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TodosBody = {
  provider?: AIProvider;
  model?: string;
  targetLanguage?: SupportedLanguage;
  adaptStyle?: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body: TodosBody = await req.json().catch(() => ({}));

    const provider = body.provider || 'gemini';
    const model = body.model || 'gemini-2.5-flash';

    runTodos(chapterId, {
      provider,
      model,
      targetLanguage: body.targetLanguage || 'pt',
      adaptStyle: body.adaptStyle || 'simplified',
      targetAudience: body.targetAudience,
    }).catch((error) => {
      console.error(`[CHAPTER-TODOS ${chapterId}] Background error:`, error);
    });

    return NextResponse.json({
      message: '/todos iniciado',
      sequence: ['translate', 'adapt', 'update'],
    });
  } catch (error: any) {
    console.error('[CHAPTER-TODOS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function runTodos(
  chapterId: string,
  config: Required<Pick<TodosBody, 'provider' | 'model' | 'targetLanguage' | 'adaptStyle'>> & Pick<TodosBody, 'targetAudience'>
) {
  const tempPaths: string[] = [];

  try {
    let latest = await getLatestVersion(chapterId);

    const translated = await runTranslateStep(chapterId, latest.id, latest.file_path, config);
    const translatedPath = translated.outputPath;
    tempPaths.push(translatedPath);
    const translatedVersionId = await createChapterVersionFromFile(
      chapterId,
      latest.id,
      translatedPath,
      'translate',
      { autoAppliedBy: '/todos', targetLanguage: config.targetLanguage }
    );
    await updateOperationJob(translated.jobId, { newVersionId: translatedVersionId });

    latest = await getLatestVersion(chapterId, translatedVersionId);

    const adapted = await runAdaptStep(chapterId, latest.id, latest.file_path, config);
    const adaptedPath = adapted.outputPath;
    tempPaths.push(adaptedPath);
    const adaptedVersionId = await createChapterVersionFromFile(
      chapterId,
      latest.id,
      adaptedPath,
      'adapt',
      { autoAppliedBy: '/todos', style: config.adaptStyle }
    );
    await updateOperationJob(adapted.jobId, { newVersionId: adaptedVersionId });

    latest = await getLatestVersion(chapterId, adaptedVersionId);

    const norms = await runNormsStep(chapterId, latest.id, latest.file_path, config);
    if (norms.outputPath) {
      tempPaths.push(norms.outputPath);
      const normsVersionId = await createChapterVersionFromFile(
        chapterId,
        latest.id,
        norms.outputPath,
        'update',
        { autoAppliedBy: '/todos' }
      );
      await updateOperationJob(norms.jobId, {
        status: 'completed',
        progress: 100,
        newVersionId: normsVersionId,
        completedAt: new Date().toISOString(),
      });
    }
  } finally {
    await Promise.all(tempPaths.map((p) => fs.unlink(p).catch(() => {})));
  }
}

async function runTranslateStep(
  chapterId: string,
  versionId: string,
  filePath: string,
  config: { provider: AIProvider; model: string; targetLanguage: SupportedLanguage }
): Promise<{ outputPath: string; jobId: string }> {
  const jobId = await createOperationJob(chapterId, versionId, 'translate');
  const inputPath = await downloadVersionFile(versionId, filePath, 'todos_translate_input');
  const outputPath = path.join(os.tmpdir(), `${jobId}_${versionId}_todos_translated.docx`);

  try {
    await updateOperationJob(jobId, { status: 'processing', progress: 10 });
    const result = await translateDocx(inputPath, outputPath, {
      targetLanguage: config.targetLanguage,
      provider: config.provider,
      model: config.model,
      onProgress: async (progress) => {
        await updateOperationJob(jobId, {
          status: 'processing',
          progress: Math.min(95, Math.max(10, progress.percentage || 0)),
        });
      },
    });
    if (!result.success) {
      throw new Error(result.error || 'Falha na tradução');
    }
    await updateOperationJob(jobId, {
      status: 'completed',
      progress: 100,
      completedAt: new Date().toISOString(),
    });
    return { outputPath, jobId };
  } catch (error: any) {
    await updateOperationJob(jobId, { status: 'error', errorMessage: error.message });
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

async function runAdaptStep(
  chapterId: string,
  versionId: string,
  filePath: string,
  config: { provider: AIProvider; model: string; adaptStyle: 'academic' | 'professional' | 'simplified' | 'custom'; targetAudience?: string }
): Promise<{ outputPath: string; jobId: string }> {
  const jobId = await createOperationJob(chapterId, versionId, 'adapt');
  const inputPath = await downloadVersionFile(versionId, filePath, 'todos_adapt_input');
  const outputPath = path.join(os.tmpdir(), `${jobId}_${versionId}_todos_adapted.docx`);

  try {
    await updateOperationJob(jobId, { status: 'processing', progress: 10 });
    const suggestions = await analyzeDocumentForAdaptation(
      inputPath,
      config.adaptStyle,
      config.targetAudience,
      config.provider,
      config.model,
      getApiKey(config.provider),
      async (current, total) => {
        const pct = total > 0 ? 10 + Math.round((current / total) * 80) : 50;
        await updateOperationJob(jobId, { progress: Math.min(95, pct) });
      }
    );

    if (suggestions.length === 0) {
      await fs.copyFile(inputPath, outputPath);
    } else {
      const docxSuggestions: ApplyDocxSuggestion[] = suggestions.map((s: any) => ({
        id: s.id,
        originalText: s.originalText || '',
        improvedText: s.adaptedText || '',
      }));
      const applyResult = await applySuggestionsToDocx(inputPath, outputPath, docxSuggestions);
      if (applyResult.appliedCount === 0) {
        await applySuggestionTextFallback(inputPath, outputPath, docxSuggestions);
      }
    }

    await updateOperationJob(jobId, {
      status: 'completed',
      progress: 100,
      completedAt: new Date().toISOString(),
    });
    return { outputPath, jobId };
  } catch (error: any) {
    await updateOperationJob(jobId, { status: 'error', errorMessage: error.message });
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

async function runNormsStep(
  chapterId: string,
  versionId: string,
  filePath: string,
  config: { provider: AIProvider; model: string }
): Promise<{ outputPath: string | null; jobId: string }> {
  const operationJobId = await createOperationJob(chapterId, versionId, 'update');
  const inputPath = await downloadVersionFile(versionId, filePath, 'todos_norms_input');
  const outputPath = path.join(os.tmpdir(), `${versionId}_todos_norms_${randomUUID()}.docx`);
  const jobId = randomUUID();

  const { error: insertError } = await supabase.from('norm_update_jobs').insert({
    id: jobId,
    chapter_version_id: versionId,
    document_id: null,
    status: 'analyzing',
    norm_references: [],
    total_references: 0,
    vigentes: 0,
    alteradas: 0,
    revogadas: 0,
    substituidas: 0,
    manual_review: 0,
    current_reference: 0,
    progress_percentage: 0,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  });

  if (insertError) {
    await fs.unlink(inputPath).catch(() => {});
    await updateOperationJob(operationJobId, { status: 'error', errorMessage: insertError.message });
    throw new Error(`Falha ao criar job de normas: ${insertError.message}`);
  }

  try {
    await updateOperationJob(operationJobId, { status: 'processing', progress: 10 });
    const { structure, paragraphs } = await extractDocumentStructure(inputPath);
    const paragraphsWithContext = paragraphs
      .filter((p: any) => !p.isHeader)
      .map((p: any) => ({
        text: p.text,
        index: p.index,
        chapterTitle: structure.sections.find((s: any) =>
          p.index >= s.startParagraphIndex &&
          p.index <= s.endParagraphIndex &&
          s.level === 1
        )?.title,
      }));

    const normsProvider: 'openai' | 'gemini' | 'anthropic' =
      config.provider === 'grok' ? 'gemini' : config.provider;
    const normsModel = config.provider === 'grok' ? 'gemini-2.5-flash' : config.model;
    const apiKey = getApiKey(normsProvider);

    const references = await detectNormsInDocument(paragraphsWithContext, normsProvider, normsModel, apiKey);
    await supabase
      .from('norm_update_jobs')
      .update({ total_references: references.length, progress_percentage: 10 })
      .eq('id', jobId);

    if (references.length === 0) {
      await markNormsCompleted(jobId, []);
      await fs.copyFile(inputPath, outputPath);
      return { outputPath, jobId: operationJobId };
    }

    const verifiedReferences = await verifyMultipleNorms(
      references,
      normsProvider,
      normsModel,
      apiKey,
      undefined,
      async (current, total) => {
        await supabase
          .from('norm_update_jobs')
          .update({
            current_reference: current,
            progress_percentage: 10 + Math.floor((current / total) * 90),
          })
          .eq('id', jobId);
        await updateOperationJob(operationJobId, {
          progress: Math.min(95, 10 + Math.floor((current / total) * 90)),
        });
      }
    );

    await markNormsCompleted(jobId, verifiedReferences);

    const referencesToApply = verifiedReferences.filter((r: NormReference) => r.suggestedText);
    if (referencesToApply.length === 0) {
      await fs.copyFile(inputPath, outputPath);
      return { outputPath, jobId: operationJobId };
    }

    await applyNormUpdatesToDocx(inputPath, outputPath, referencesToApply);
    return { outputPath, jobId: operationJobId };
  } catch (error: any) {
    await supabase
      .from('norm_update_jobs')
      .update({ status: 'error', error_message: error.message, completed_at: new Date().toISOString() })
      .eq('id', jobId);
    await updateOperationJob(operationJobId, { status: 'error', errorMessage: error.message });
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

async function getLatestVersion(chapterId: string, preferredVersionId?: string) {
  let query = supabase
    .from('chapter_versions')
    .select('id, file_path, chapter_id, version_number')
    .eq('chapter_id', chapterId);

  if (preferredVersionId) {
    query = query.eq('id', preferredVersionId);
  } else {
    query = query.order('version_number', { ascending: false }).limit(1);
  }

  const { data, error } = preferredVersionId ? await query.single() : await query.single();
  if (error || !data) throw new Error('Versão mais recente não encontrada');
  return data;
}

async function downloadVersionFile(versionId: string, filePath: string, label: string): Promise<string> {
  const { data: fileBlob, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !fileBlob) {
    throw new Error(`Falha ao baixar versão ${versionId}: ${error?.message || 'erro desconhecido'}`);
  }

  const tempPath = path.join(os.tmpdir(), `${versionId}_${label}_${randomUUID()}.docx`);
  await fs.writeFile(tempPath, Buffer.from(await fileBlob.arrayBuffer()));
  return tempPath;
}

async function createChapterVersionFromFile(
  chapterId: string,
  parentVersionId: string,
  filePath: string,
  operation: 'translate' | 'adapt' | 'update',
  metadata: Record<string, any>
): Promise<string> {
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('thesis_id')
    .eq('id', chapterId)
    .single();
  if (chapterError || !chapter) throw new Error('Capítulo não encontrado');

  const versionFileName = `${randomUUID()}.docx`;
  const storagePath = `theses/${chapter.thesis_id}/chapters/${chapterId}/${versionFileName}`;
  const buffer = await fs.readFile(filePath);

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
  if (uploadError) throw new Error(`Falha ao enviar nova versão: ${uploadError.message}`);

  const { data: newVersionId, error: rpcError } = await supabase.rpc('create_chapter_version', {
    p_chapter_id: chapterId,
    p_file_path: storagePath,
    p_parent_version_id: parentVersionId,
    p_created_by_operation: operation,
    p_metadata: metadata,
  });
  if (rpcError) throw new Error(`Falha ao criar nova versão: ${rpcError.message}`);

  await processChapterVersion(newVersionId);
  return newVersionId;
}

async function markNormsCompleted(jobId: string, references: NormReference[]) {
  const stats = {
    vigentes: references.filter((r) => r.status === 'vigente').length,
    alteradas: references.filter((r) => r.status === 'alterada').length,
    revogadas: references.filter((r) => r.status === 'revogada').length,
    substituidas: references.filter((r) => r.status === 'substituida').length,
    manual_review: references.filter((r) => r.updateType === 'manual').length,
  };

  await supabase
    .from('norm_update_jobs')
    .update({
      status: 'completed',
      norm_references: references,
      total_references: references.length,
      ...stats,
      progress_percentage: 100,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

function getApiKey(provider: AIProvider | 'gemini'): string {
  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : provider === 'grok'
          ? process.env.GROK_API_KEY
          : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) throw new Error(`Chave de API não configurada para ${provider}`);
  return apiKey;
}

async function applySuggestionTextFallback(
  inputPath: string,
  outputPath: string,
  suggestions: ApplyDocxSuggestion[]
): Promise<void> {
  const data = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('word/document.xml');
  if (!file) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  let xml = await file.async('string');
  let applied = 0;

  for (const suggestion of suggestions) {
    if (!suggestion.originalText || !suggestion.improvedText) continue;
    const original = escapeXmlText(suggestion.originalText);
    const improved = escapeXmlText(suggestion.improvedText);
    if (xml.includes(original)) {
      xml = xml.replace(original, improved);
      applied++;
    }
  }

  if (applied === 0) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  zip.file('word/document.xml', Buffer.from(xml, 'utf-8'));
  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(outputPath, outputBuffer);
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
