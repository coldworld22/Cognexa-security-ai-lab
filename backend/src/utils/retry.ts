interface RetryOptions {
  attempts: number;
  delayMs: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.attempts) {
        throw error;
      }

      options.onRetry?.(error, attempt);
      await sleep(options.delayMs);
      attempt += 1;
    }
  }
}
