/** Every command, `help`, and running one command line's commands in order. */
import { CliFailure, EXIT, UsageError, type Session } from '../session.js';
import { parseCommand, type Command } from './command.js';
import { inviteCommands } from './invites.js';
import { settingsCommands } from './settings.js';
import { strandCommands } from './strands.js';

const help: Command = {
  name: 'help',
  aliases: ['?'],
  summary: 'List commands, or show one command\'s usage',
  usage: '[command]',
  offline: true,
  async run(session, args) {
    if (args[0]) {
      const command = find(args[0]);
      session.out.note(`${command.name} ${command.usage}\n  ${command.summary}${command.aliases ? `\n  also: ${command.aliases.join(', ')}` : ''}`);
      return;
    }
    const width = Math.max(...COMMANDS.map(c => c.name.length));
    session.out.note(COMMANDS.map(c => `${c.name.padEnd(width)}  ${c.summary}`).join('\n')
      + '\n\nStrands are named by row (from the last "strands"), id or id prefix, or title.'
      + '\nSeparate commands with ";". Any unique beginning of a command works (stat = status).'
      + '\nDetails: help <command>.');
  },
};

export const COMMANDS: Command[] = [help, ...settingsCommands, ...strandCommands, ...inviteCommands];

/**
 * The command a word names: a name or alias exactly, else the one command whose name or
 * alias it begins. Unknown or ambiguous is a usage error.
 */
export function find(word: string): Command {
  const names = (c: Command) => [c.name, ...(c.aliases ?? [])];
  const exact = COMMANDS.find(c => names(c).includes(word));
  if (exact) return exact;
  const matches = COMMANDS.filter(c => names(c).some(n => n.startsWith(word)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new UsageError(`${JSON.stringify(word)} could be ${matches.map(c => c.name).join(', ')}`);
  throw new UsageError(`no command ${JSON.stringify(word)}; "help" lists them`);
}

export function commandNames(): string[] {
  return COMMANDS.flatMap(c => [c.name, ...(c.aliases ?? [])]).sort();
}

/**
 * Run commands in order, stopping at the first failure. Returns the exit code; a failure's
 * words go to stderr.
 */
export async function runCommands(session: Session, commands: string[][]): Promise<number> {
  for (const [name, ...words] of commands) {
    const code = await runOne(session, name, words);
    if (code !== EXIT.ok) return code;
  }
  return EXIT.ok;
}

async function runOne(session: Session, name: string, words: string[]): Promise<number> {
  try {
    const command = find(name);
    const { args, values } = parseCommand(command, words);
    if (!command.offline) await session.ready;
    await command.run(session, args, values);
    return EXIT.ok;
  } catch (err) {
    if (err instanceof CliFailure) {
      session.out.note(`serchat: ${err.message}`);
      return err.code;
    }
    // A thrown error is a defect, or the node failing to start.
    session.out.note(`serchat: ${err instanceof Error ? (session.verbose ? err.stack : err.message) : String(err)}`);
    return EXIT.failed;
  }
}
