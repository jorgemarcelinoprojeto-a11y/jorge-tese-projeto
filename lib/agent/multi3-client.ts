import { parseMulti3Input, ParsedMulti3Command } from '@/lib/multi-ai/parser';
import { Multi3Command } from '@/lib/multi-ai/types';
import { AIProvider } from '@/lib/ai/types';

export type Multi3LaunchParams = {
  providers: AIProvider[];
  judgeProvider: AIProvider;
  command: Multi3Command;
  args: string;
};

export function parseMulti3Command(raw: string): ParsedMulti3Command {
  return parseMulti3Input(raw);
}

export function buildMulti3ApiBody(
  parsed: Extract<ParsedMulti3Command, { kind: 'start' }>,
  versionId: string,
  models?: Partial<Record<AIProvider, string>>
) {
  return {
    providers: parsed.providers,
    judgeProvider: parsed.judgeProvider,
    command: parsed.command,
    args: parsed.args,
    versionId,
    models,
  };
}

export async function pollMulti3Session(
  basePath: string,
  onUpdate: (session: any) => void,
  intervalMs = 3000,
  timeoutMs = 45 * 60 * 1000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(basePath, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      onUpdate(data.session);
      const status = data.session?.status;
      if (['awaiting_human', 'accepted', 'failed'].includes(status)) {
        return data.session;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timeout aguardando sessão Multi-IA');
}
