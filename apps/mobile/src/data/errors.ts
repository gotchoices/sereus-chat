/**
 * Typed failures the UI has to tell apart from ordinary errors.
 *
 * A screen that matches on message text is one copy edit away from breaking, so
 * anything a screen must RENDER DIFFERENTLY gets a class here.
 */

/**
 * There is nowhere for the other person to answer.
 *
 * Story 02 Alt A: this is not an error the user caused and must not be dressed
 * as one — nobody's phone is reachable on its own, and this is the ordinary
 * starting position. The screen that catches this owes the user two ways out
 * (a machine of their own, or a borrowed relay) and must keep whatever terms
 * they had already chosen.
 */
export class UnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreachableError';
    // Restores the prototype chain across the TS `extends Error` downlevel, so
    // `instanceof` still works after transpilation.
    Object.setPrototypeOf(this, UnreachableError.prototype);
  }
}
