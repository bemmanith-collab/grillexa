// One error type, shared by every provider and understood by both surfaces:
// the CLI prints .message and .hint as two lines, and the backend route turns it
// into a 502/503 with the same two fields rather than a stack trace.
//
// Its own file so a provider can throw it without importing the module that
// chooses providers, which imports the providers. That cycle is avoidable and
// this is how it is avoided.
export class GenerationError extends Error {
  constructor(message, { hint, code } = {}) {
    super(message);
    this.name = 'GenerationError';
    this.hint = hint;
    // 'not-configured' marks the one class of failure an operator has to fix
    // rather than a user retrying: no provider set up, or a key that was
    // refused. The dashboard turns it into a 503 and says who to ask.
    this.code = code;
  }
}
