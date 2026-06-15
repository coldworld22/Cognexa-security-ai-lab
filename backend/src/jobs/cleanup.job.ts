export class CleanupJob {
  async run() {
    return {
      executedAt: new Date().toISOString(),
      deletedSessions: 0,
      archivedEmbeddings: 0
    };
  }
}
