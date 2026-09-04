/**
 * Classify non-zero exit codes for ctx_execute / ctx_execute_file.
 *
 * Some shell commands use exit code 1 for a non-error status.
 * We treat exit code 1 as a soft failure only when:
 *   - language is "shell"
 *   - exit code is exactly 1
 *   - stdout has non-whitespace content
 *   - stderr is empty
 */
export interface ExitClassification {
  isError: boolean;
  output: string;
}

export function classifyNonZeroExit(params: {
  language: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): ExitClassification {
  const { language, exitCode, stdout, stderr } = params;
  const isSoftFail =
    language === "shell" &&
    exitCode === 1 &&
    stdout.trim().length > 0 &&
    stderr.trim().length === 0;

  return {
    isError: !isSoftFail,
    output: isSoftFail
      ? stdout
      : `Exit code: ${exitCode}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
  };
}
