/**
 * Document-level Multi-IA orchestrator (projects agent).
 * Stores candidate outputs in storage; accept persists winner as document version.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { persistDocumentVersion } from '@/lib/document-versioning';
import {
  createMulti3Session,
  getMulti3Session,
  updateMulti3Session,
  multi3DefaultModel,
} from './session-store';
import { judgeMulti3Results } from './judge';
import { Multi3StartRequest, Multi3Session, Multi3Candidate } from './types';
import { AIProvider } from '@/lib/ai/types';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { processWholeDocument } from '@/lib/document-processing/whole-document';
import { runTodosPipeline as runDocumentTodosPipeline } from '@/lib/todos/run-document-todos-pipeline';

async function downloadDocumentFile(documentId: string, filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  const tmp = path.join(os.tmpdir(), `${documentId}_${randomUUID()}.docx`);
  await fs.writeFile(tmp, Buffer.from(await data.arrayBuffer()));
  return tmp;
}

export async function startDocumentMulti3(
  documentId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  const models = req.models || {};
  for (const p of req.providers) {
    if (!models[p]) models[p] = multi3DefaultModel(p);
  }

  const session = await createMulti3Session('document', documentId, { ...req, models });

  runDocumentMulti3Background(documentId, session.id, { ...req, models }).catch(async (err) => {
    console.error(`[DOC-MULTI3 ${session.id}]`, err);
    await updateMulti3Session(session.id, { status: 'failed', completedAt: new Date().toISOString() });
  });

  return session;
}

async function runDocumentMulti3Background(
  documentId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> }
): Promise<void> {
  const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
  if (!doc) throw new Error('Document not found');

  const candidates = await Promise.all(
    req.providers.map(async (provider, branchIndex) => {
      const model = req.models?.[provider] || multi3DefaultModel(provider);
      try {
        if (req.command === '/perguntar') {
          const tmp = await downloadDocumentFile(documentId, doc.file_path);
          let docText = '';
          try {
            const { paragraphs } = await extractDocumentStructure(tmp);
            docText = paragraphs.map((p) => p.text).join('\n\n').slice(0, 60000);
          } finally {
            await fs.unlink(tmp).catch(() => {});
          }
          const text = await chatWithAgent({
            provider,
            model,
            systemPrompt: 'Responda perguntas sobre o documento em português.',
            history: [],
            userMessage: `Documento:\n${docText}\n\nPergunta: ${req.args}`,
          });
          return { provider, model, status: 'completed' as const, text, branchIndex, progress: 100 };
        }

        if (req.command === '/todos') {
          const result = await runDocumentTodosPipeline(documentId, doc, {
            provider,
            model,
            targetLanguage: 'pt',
            adaptStyle: 'simplified',
            multi3Meta: { multi3SessionId: sessionId, multi3Provider: provider, multi3BranchIndex: branchIndex },
            deferPersist: true,
          });
          const storagePath = `documents/${documentId}/multi3/${sessionId}/${provider}.docx`;
          if (result.finalPath) {
            const buffer = await fs.readFile(result.finalPath);
            await supabase.storage.from('documents').upload(storagePath, buffer, {
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              upsert: true,
            });
          }
          return {
            provider,
            model,
            status: 'completed' as const,
            text: result.previewText,
            branchIndex,
            progress: 100,
            versionIds: result.stepPaths,
            versionId: storagePath,
          };
        }

        const inputPath = await downloadDocumentFile(documentId, doc.file_path);
        const outputPath = path.join(os.tmpdir(), `${randomUUID()}_doc_multi3.docx`);
        try {
          const task = req.command === '/adaptar' ? 'adapt' as const
            : req.command === '/traduzir' ? 'translate' as const
            : 'adjust' as const;

          const whole = await processWholeDocument(inputPath, outputPath, {
            task,
            provider,
            model,
            adaptStyle: 'simplified',
            adjustInstructions: req.args,
            targetLanguage: 'pt',
          });

          if (!whole.success) {
            await fs.copyFile(inputPath, outputPath);
          }

          const buffer = await fs.readFile(outputPath);
          const storagePath = `documents/${documentId}/multi3/${sessionId}/${provider}.docx`;
          await supabase.storage.from('documents').upload(storagePath, buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true,
          });

          const { paragraphs } = await extractDocumentStructure(outputPath);
          const preview = paragraphs.map((p) => p.text).join('\n\n').slice(0, 8000);

          return {
            provider,
            model,
            status: 'completed' as const,
            text: preview,
            branchIndex,
            progress: 100,
            versionId: storagePath,
          };
        } finally {
          await fs.unlink(inputPath).catch(() => {});
          await fs.unlink(outputPath).catch(() => {});
        }
      } catch (error: any) {
        return { provider, model, status: 'failed' as const, branchIndex, error: error.message };
      }
    })
  );

  await updateMulti3Session(sessionId, { candidates, status: 'candidates_ready' });

  const completed = candidates.filter((c) => c.status === 'completed');
  if (completed.length === 0) {
    await updateMulti3Session(sessionId, { status: 'failed', completedAt: new Date().toISOString() });
    return;
  }

  await updateMulti3Session(sessionId, { status: 'judging' });
  const judgeProvider = req.judgeProvider || 'gemini';
  const judgeModel = req.models?.[judgeProvider] || multi3DefaultModel(judgeProvider);

  const judgeResult = await judgeMulti3Results({
    command: req.command,
    commandArgs: req.args || '',
    judgeProvider,
    judgeModel,
    candidates: completed.map((c) => ({ provider: c.provider, text: c.text || '' })),
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

export async function acceptDocumentMulti3Winner(
  sessionId: string,
  provider?: AIProvider
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const chosen = provider || session.winnerProvider;
  const winner = session.candidates.find((c) => c.provider === chosen && c.status === 'completed');
  if (!winner) throw new Error('Candidato não encontrado');

  if (session.command === '/perguntar' || !winner.versionId) {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: chosen,
      completedAt: new Date().toISOString(),
    });
    return (await getMulti3Session(sessionId))!;
  }

  const { data: doc } = await supabase.from('documents').select('*').eq('id', session.targetId).single();
  if (!doc) throw new Error('Document not found');

  const { data: fileBlob } = await supabase.storage.from('documents').download(winner.versionId);
  if (!fileBlob) throw new Error('Arquivo candidato não encontrado');

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  await persistDocumentVersion({
    documentId: session.targetId,
    title: doc.title,
    projectId: doc.project_id,
    buffer,
    operation: `multi3_${session.command.replace('/', '')}`,
  });

  await updateMulti3Session(sessionId, {
    status: 'accepted',
    winnerProvider: chosen,
    completedAt: new Date().toISOString(),
  });

  return (await getMulti3Session(sessionId))!;
}
