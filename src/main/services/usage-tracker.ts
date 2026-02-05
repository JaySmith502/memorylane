export interface UsageStats {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}

export class UsageTracker {
  private stats: UsageStats = {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0
  };

  public recordUsage(usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cost?: number;
  }): void {
    this.stats.requestCount++;
    this.stats.promptTokens += usage.prompt_tokens;
    this.stats.completionTokens += usage.completion_tokens;
    if (usage.cost !== undefined) {
      this.stats.totalCost += usage.cost;
    }
  }

  public getStats(): UsageStats {
    return { ...this.stats };
  }

  public reset(): void {
    this.stats = {
      requestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0
    };
  }
}
