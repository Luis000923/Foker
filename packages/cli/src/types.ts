export interface Flag {
  name: string;
  type: 'boolean' | 'string' | 'string[]';
  description: string;
  default: boolean | string | string[];
  short?: string;
}
export interface Message {
  code: string;
  message: string;
  hint?: string;
}
export interface Context {
  env: NodeJS.ProcessEnv;
  confirm?: (message: string) => Promise<boolean>;
  trustBaseDir?: string;
  display(message: string): void;
  cwd: string;
  flags: Record<string, boolean | string | string[]>;
  args: string[];
  nonInteractive: boolean;
  color: boolean;
  log(message: string): void;
}
export interface Result {
  errors?: Message[];
  human?: string;
  json?: boolean;
  data: unknown;
  warnings: Message[];
  exitCode: number;
}
export interface Command {
  name: string;
  description: string;
  flags: Flag[];
  maxArgs: number;
  run(ctx: Context): Promise<Result>;
}
export function flag(name: string, type: Flag['type'], description: string): Flag {
  return { name, type, description, default: type === 'boolean' ? false : type === 'string[]' ? [] : '' };
}
