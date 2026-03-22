import { runDueConnectionSyncs } from './service';

let schedulerHandle: NodeJS.Timeout | null = null;

export function startIntegrationScheduler(intervalMs = 30_000) {
  if (schedulerHandle) {
    return schedulerHandle;
  }

  const tick = async () => {
    try {
      await runDueConnectionSyncs();
    } catch (error) {
      console.error('Integration scheduler tick failed', error);
    }
  };

  void tick();
  schedulerHandle = setInterval(() => {
    void tick();
  }, intervalMs);

  return schedulerHandle;
}

export function stopIntegrationScheduler() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
