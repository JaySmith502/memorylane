import * as fs from 'fs';
import { OpenRouter } from '@openrouter/sdk';
import { ClassificationInput, ClassificationResult, InteractionContext } from '../../shared/types';
import { UsageTracker } from '../services/usage-tracker';

const MODEL_CHOICES: string[] = [
  'mistralai/mistral-small-3.2-24b-instruct',
];

interface ModelCost {
  input_tokens_per_million: number;
  completion_tokens_per_million: number;
}

const MODEL_COSTS: Record<string, ModelCost> = {
  'mistralai/mistral-small-3.2-24b-instruct': {
    input_tokens_per_million: 0.06,
    completion_tokens_per_million: 0.18,
  }
}

export class SemanticClassifierService {
  private summaryHistory: ClassificationResult[] = [];
  private client: OpenRouter | null = null;
  private model: string;
  private maxHistorySize: number;
  private usageTracker: UsageTracker;

  constructor(apiKey?: string, model = 'mistralai/mistral-small-3.2-24b-instruct', maxHistorySize = 5, usageTracker?: UsageTracker) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (key) {
      this.client = new OpenRouter({ apiKey: key });
      console.log('[SemanticClassifier] Initialized with API key');
    } else {
      console.warn('[SemanticClassifier] No API key provided - classification disabled');
    }
    this.model = model;
    this.maxHistorySize = maxHistorySize;
    this.usageTracker = usageTracker || new UsageTracker();
  }

  /**
   * Check if the classifier is configured with an API key
   */
  public isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Update the API key at runtime
   */
  public updateApiKey(apiKey: string | null): void {
    if (apiKey) {
      this.client = new OpenRouter({ apiKey });
      console.log('[SemanticClassifier] API key updated');
    } else {
      this.client = null;
      console.log('[SemanticClassifier] API key cleared');
    }
  }

  /**
   * Classify user activity between two screenshots with events
   */
  public async classify(input: ClassificationInput): Promise<string> {
    if (!this.client) {
      console.log('[SemanticClassifier] Skipping classification - no API key configured');
      return '';
    }

    const { startScreenshot, endScreenshot, events } = input;

    try {
      console.log(`[SemanticClassifier] Classifying activity between ${startScreenshot.id} and ${endScreenshot.id}`);
      console.log(`[SemanticClassifier] Events count: ${events.length}`);

      // Build the prompt with context
      const prompt = this.formatPrompt(input);

      console.log(`[SemanticClassifier] Prompt: ${prompt}`);

      // Convert screenshots to base64
      const startImageData = this.imageToBase64(startScreenshot.filepath);
      const endImageData = this.imageToBase64(endScreenshot.filepath);

      // Call OpenRouter API with vision model
      const response = await this.client.chat.send({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                imageUrl: {
                  url: `data:image/png;base64,${startImageData}`,
                },
              },
              {
                type: 'image_url',
                imageUrl: {
                  url: `data:image/png;base64,${endImageData}`,
                },
              },
            ],
          },
        ],
      });

      const messageContent = response.choices?.[0]?.message?.content;
      const summary = typeof messageContent === 'string' ? messageContent.trim() : 'No summary generated';
      console.log(`[SemanticClassifier] Summary: ${summary}`);

      if (response.usage) {
        const promptTokens = response.usage.promptTokens || 0;
        const completionTokens = response.usage.completionTokens || 0;
        const cost = (promptTokens / 1_000_000) * MODEL_COSTS[this.model].input_tokens_per_million + (completionTokens / 1_000_000) * MODEL_COSTS[this.model].completion_tokens_per_million;
        this.usageTracker.recordUsage({
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost: cost,
        });
        console.log(`[SemanticClassifier] Usage tracked - Tokens: ${response.usage.promptTokens}/${response.usage.completionTokens}, Cost: $${((response.usage as any).cost)?.toFixed(4) || 0}`);
      }

      // Store in history
      const result: ClassificationResult = {
        summary,
        timestamp: endScreenshot.timestamp,
      };
      this.summaryHistory.push(result);

      // Keep only recent summaries
      if (this.summaryHistory.length > this.maxHistorySize) {
        this.summaryHistory = this.summaryHistory.slice(-this.maxHistorySize);
      }

      return summary;
    } catch (error) {
      console.error('[SemanticClassifier] Error during classification:', error);
      throw error;
    }
  }

  /**
   * Format the prompt with events and previous summaries for context
   */
  private formatPrompt(input: ClassificationInput): string {
    const { events } = input;

    let prompt = 'You are analyzing two screenshots of a user\'s screen.\n\n';

    // Primary task
    prompt += '## Task\n';
    prompt += 'Compare the START and END screenshots. Describe what changed visually, then infer what the user accomplished in 5-10 words.\n\n';

    // Events as hints
    if (events.length > 0) {
      prompt += '## Hints (events that occurred between screenshots)\n';
      events.forEach((event) => {
        prompt += this.formatEvent(event) + '\n';
      });
      prompt += '\n';
    }

    // Previous context for continuity
    if (this.summaryHistory.length > 0) {
      prompt += '## Previous context (for continuity)\n';
      this.summaryHistory.forEach((result) => {
        const timeAgo = this.formatTimeAgo(Date.now() - result.timestamp);
        prompt += `- ${timeAgo} ago: "${result.summary}"\n`;
      });
      prompt += '\n';
    }

    // Instructions
    prompt += '## Instructions\n';
    prompt += '- Focus on visual differences: What content appeared, disappeared, or changed?\n';
    prompt += '- Use the events as hints to understand HOW the change happened\n';
    prompt += '- BE SPECIFIC: Extract actual names, identifiers, and context visible in the screenshots\n';
    prompt += '- Include: function/file names, document titles, specific UI elements, data labels\n';
    prompt += '- Summarize the substantive action, not the mechanics\n';
    prompt += '- Response format: ONLY the summary (5-15 words)\n\n';
    prompt += 'Examples:\n';
    prompt += '- "Implemented parseUserInput function in utils.ts"\n';
    prompt += '- "Filled in Q2 revenue numbers for Marketing department"\n';
    prompt += '- "Reviewed PR #142 comments on authentication refactor"\n';
    prompt += '- "Replied to email from John about project deadline"';

    return prompt;
  }

  /**
   * Format a single event for the prompt
   */
  private formatEvent(event: InteractionContext): string {
    switch (event.type) {
      case 'click':
        return `- click at (${event.clickPosition?.x}, ${event.clickPosition?.y})`;
      case 'keyboard':
        return `- keyboard: ${event.keyCount} keys over ${event.durationMs}ms`;
      case 'scroll':
        return `- scroll: ${event.scrollDirection}, ${event.scrollAmount} rotation`;
      case 'app_change': {
        const from = event.previousWindow;
        const to = event.activeWindow;
        if (from?.processName === to?.processName) {
          // Same app, different window/tab
          return `- switched tab: "${from?.title}" → "${to?.title}"`;
        }
        return `- switched app: "${from?.title}" (${from?.processName}) → "${to?.title}" (${to?.processName})`;
      }
      default:
        return `- ${event.type}`;
    }
  }

  /**
   * Format time difference in human-readable format
   */
  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Convert image file to base64
   */
  private imageToBase64(filepath: string): string {
    const imageBuffer = fs.readFileSync(filepath);
    return imageBuffer.toString('base64');
  }

  /**
   * Get the summary history
   */
  public getSummaryHistory(): ClassificationResult[] {
    return [...this.summaryHistory];
  }

  /**
   * Get the usage tracker instance
   */
  public getUsageTracker(): UsageTracker {
    return this.usageTracker;
  }
}
