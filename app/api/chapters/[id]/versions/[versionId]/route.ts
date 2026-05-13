import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * DELETE /api/chapters/[id]/versions/[versionId]
 * Deletes a single version. If it is the current version, sets current_version_id
 * to the parent version (or null if no parent exists).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: chapterId, versionId } = await params;

    // Fetch version details
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('id, file_path, parent_version_id, chapter_id')
      .eq('id', versionId)
      .eq('chapter_id', chapterId)
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Fetch chapter to check if this is the current version
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('current_version_id')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // If deleting the current version, set current to parent (or null)
    if (chapter.current_version_id === versionId) {
      const { error: updateError } = await supabase
        .from('chapters')
        .update({ current_version_id: version.parent_version_id ?? null })
        .eq('id', chapterId);

      if (updateError) throw updateError;
    }

    // Remove file from Storage
    if (version.file_path) {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([version.file_path]);

      if (storageError) {
        console.error('[VERSION-DELETE] Storage removal error (non-fatal):', storageError);
      }
    }

    // Delete version (CASCADE removes chunks + operation jobs)
    const { error: deleteError } = await supabase
      .from('chapter_versions')
      .delete()
      .eq('id', versionId);

    if (deleteError) throw deleteError;

    console.log(`[VERSION-DELETE] Deleted version ${versionId} from chapter ${chapterId}`);

    return NextResponse.json({ message: 'Version deleted successfully', versionId });
  } catch (error: any) {
    console.error('[VERSION-DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
