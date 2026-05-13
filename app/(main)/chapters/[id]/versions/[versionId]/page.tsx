'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Esta view foi consolidada na tela do agente (/chapters/[id]).
// Qualquer link antigo para /versions/[versionId] volta ao capítulo.
export default function ChapterVersionPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;

  useEffect(() => {
    router.replace(`/chapters/${chapterId}`);
  }, [chapterId, router]);

  return null;
}
