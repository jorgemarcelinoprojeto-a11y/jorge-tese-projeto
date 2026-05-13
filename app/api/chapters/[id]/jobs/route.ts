import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/chapters/[id]/jobs
 * Returns recent operation jobs for a chapter, ordered by creation date desc.
 * Query param: ?active=true  →  only pending/processing jobs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const activeOnly = req.nextUrl.searchParams.get('active') === 'true';

    let query = supabase
      .from('chapter_operation_jobs')
      .select('id, operation, status, progress, error_message, new_version_id, created_at, completed_at')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (activeOnly) {
      query = query.in('status', ['pending', 'processing']);
    }

    const { data: jobs, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      jobs: (jobs || []).map((j) => ({
        id: j.id,
        operation: j.operation,
        status: j.status,
        progress: j.progress,
        errorMessage: j.error_message,
        newVersionId: j.new_version_id,
        createdAt: j.created_at,
        completedAt: j.completed_at,
      })),
    });
  } catch (error: any) {
    console.error('[CHAPTER-JOBS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
