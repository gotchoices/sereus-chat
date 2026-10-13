/**
 * Splitting command lines, as a shell would for the parts serchat needs: spaces separate
 * words, single and double quotes group, `\` escapes the next character, an unquoted `;`
 * or newline separates commands, and `#` at the start of a word comments out the rest of
 * the line (scripts read from stdin).
 */

/** Split one line into commands, each a list of words. Throws on an unclosed quote. */
export function splitLine(line: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  const endWord = () => { if (inWord) words.push(word); word = ''; inWord = false; };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c; inWord = true;
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[++i]; inWord = true;
    } else if (c === ';' || c === '\n') {
      endCommand();
    } else if (c === '#' && !inWord) {
      while (i + 1 < line.length && line[i + 1] !== '\n') i++;
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word += c; inWord = true;
    }
  }
  if (quote) throw new Error(`unclosed ${quote} quote`);
  endCommand();
  return commands;
}

/** Split arguments the shell has already split: a word that is exactly `;` separates commands. */
export function splitArgv(argv: string[]): string[][] {
  const commands: string[][] = [[]];
  for (const arg of argv) {
    if (arg === ';') commands.push([]);
    else commands[commands.length - 1].push(arg);
  }
  return commands.filter(c => c.length > 0);
}
