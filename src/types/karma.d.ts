/**
 * Minimal ambient types for the parts of the Karma Node API the suite runner
 * uses. Karma ships no types and `@types/karma` is unmaintained, so this
 * declares only the surface `src/suite.ts` touches.
 */
declare module 'karma' {
  /** The relevant fields of Karma's `run_complete` result. */
  export interface RunCompleteResult {
    readonly success: number;
    readonly failed: number;
    readonly skipped?: number;
    readonly error: boolean;
    readonly disconnected: boolean;
    readonly exitCode: number;
  }

  export class Server {
    constructor(config: unknown, done?: (exitCode: number) => void);
    on(
      event: 'run_complete',
      handler: (browsers: unknown, result: RunCompleteResult) => void,
    ): void;
    start(): void;
  }

  export const config: {
    parseConfig(
      configFilePath: string,
      cliOptions: unknown,
      parseOptions: { promiseConfig: true; throwErrors: boolean },
    ): Promise<unknown>;
  };

  const karma: { Server: typeof Server; config: typeof config };
  export default karma;
}
