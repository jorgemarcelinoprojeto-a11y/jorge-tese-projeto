import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/chapters/[id]/versions/[versionId]/text
 * Returns the text content of a version assembled from its stored chunks.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: chapterId, versionId } = await params;

    // Verify version belongs to chapter
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('id, version_number, created_by_operation, created_at, pages')
      .eq('id', versionId)
      .eq('chapter_id', chapterId)
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Fetch chunks ordered by index
    const { data: chunks, error: chunksError } = await supabase
      .from('chapter_chunks')
      .select('chunk_index, text, page_from, page_to')
      .eq('chapter_version_id', versionId)
      .order('chunk_index', { ascending: true });

    if (chunksError) throw chunksError;

    const text = (chunks || []).map((c) => c.text).join('\n\n');

    return NextResponse.json({
      versionId,
      versionNumber: version.version_number,
      operation: version.created_by_operation,
      createdAt: version.created_at,
      pages: version.pages,
      text,
      chunkCount: (chunks || []).length,
    });
  } catch (error: any) {
    console.error('[VERSION-TEXT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
