import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import mammoth from 'mammoth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;

    const { data: version, error } = await supabase
      .from('chapter_versions')
      .select('file_path, version_number')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = '';
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch {
      // If not a docx, try reading as plain text
      text = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\tÀ-ɏ]/g, ' ');
    }

    return NextResponse.json({ text, versionNumber: version.version_number });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
