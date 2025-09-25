import { createHash } from 'crypto';
import { parse as parseToml } from 'toml';

export interface Pep723Header {
  dependencies: string[];
  requiresPython?: string;
}

function normalizeDependencies(dependencies: unknown): string[] {
  if (!Array.isArray(dependencies)) {
    return [];
  }
  return dependencies
    .map((d) => (typeof d === 'string' ? d.trim() : String(d)))
    .filter((d) => d.length > 0);
}

export function parsePep723HeaderFromText(text: string): Pep723Header | null {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\s*#\s*\/\/\/\s*script\s*$/.test(l));
  if (startIdx === -1) {
    return null;
  }
  const rest = lines.slice(startIdx + 1);
  const endRelIdx = rest.findIndex((l) => /^\s*#\s*\/\/\/\s*$/.test(l));
  if (endRelIdx === -1) {
    return null;
  }
  const bodyLines = rest.slice(0, endRelIdx).map((l) => l.replace(/^\s*#\s?/, ''));
  const body = bodyLines.join('\n');

  const tryParse = (src: string) => {
    const data: any = parseToml(src);
    const dependencies = normalizeDependencies(data?.dependencies);
    const requiresPython: string | undefined =
      typeof data?.['requires-python'] === 'string'
        ? (data['requires-python'] as string)
        : typeof data?.requires?.python === 'string'
        ? (data.requires.python as string)
        : undefined;
    return { dependencies, requiresPython } as Pep723Header;
  };

  try {
    return tryParse(body);
  } catch {
    // Fallback: rewrite dotted requires.python into an inline table to keep other keys at the root
    const transformed = body.replace(
      /^[ \t]*requires\.python\s*=\s*(.+)$/m,
      (_m, g1) => `requires = { python = ${g1} }`,
    );
    try {
      return tryParse(transformed);
    } catch {
      return null;
    }
  }
}

export function computeEnvHash(dependencies: string[], requiresPython?: string): string {
  const stable = {
    deps: [...dependencies].sort((a, b) => a.localeCompare(b)),
    pyReq: requiresPython ?? '',
  };
  const json = JSON.stringify(stable);
  const hash = createHash('sha256').update(json).digest('hex');
  return hash.slice(0, 12);
}
