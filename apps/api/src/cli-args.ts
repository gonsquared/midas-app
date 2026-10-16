export interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--') && arg !== '--confirm-production') {
        flags.set(arg.slice(2), next);
        i++;
      } else {
        flags.set(arg.slice(2), true);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, flags };
}

export function parseCount(value: string | true | undefined): number {
  if (value === undefined) return 1;
  const count = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(count) || count < 1) throw new Error('--count must be a positive integer');
  return count;
}
