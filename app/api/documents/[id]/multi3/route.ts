import { NextRequest, NextResponse } from 'next/server';
import { startDocumentMulti3 } from '@/lib/multi-ai/document-orchestrator';
import { Multi3StartRequest } from '@/lib/multi-ai/types';
import { AIProvider } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await req.json();

    const startReq: Multi3StartRequest = {
      providers: body.providers as AIProvider[],
      judgeProvider: body.judgeProvider,
      command: body.command,
      args: body.args || '',
      versionId: body.versionId || documentId,
      models: body.models,
    };

    if (!startReq.providers?.length || !startReq.command) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const session = await startDocumentMulti3(documentId, startReq);
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
