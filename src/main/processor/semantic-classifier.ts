import * as fs from 'fs';
import { OpenRouter } from '@openrouter/sdk';
import { ClassificationInput, ClassificationResult, InteractionContext } from '../../shared/types';

export class SemanticClassifierService {
  private summaryHistory: ClassificationResult[] = [];
  private client: OpenRouter;
  private model: string;
  private maxHistorySize: number;

  constructor(apiKey?: string, model = 'mistralai/mistral-small-3.2-24b-instruct', maxHistorySize = 5) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.client = new OpenRouter({ apiKey: key });
    this.model = model;
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Classify user activity between two screenshots with events
   */
  public async classify(input: ClassificationInput): Promise<string> {
    const { startScreenshot, endScreenshot, events } = input;

    try {
      console.log(`[SemanticClassifier] Classifying activity between ${startScreenshot.id} and ${endScreenshot.id}`);
      console.log(`[SemanticClassifier] Events count: ${events.length}`);

      // Build the prompt with context
      const prompt = this.formatPrompt(input);

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

    let prompt = 'You are analyzing user activity between two screenshots (START and END).\n\n';

    // Add previous context summaries if available
    if (this.summaryHistory.length > 0) {
      prompt += '## Previous Context (for continuity):\n';
      this.summaryHistory.forEach((result) => {
        const timeAgo = this.formatTimeAgo(Date.now() - result.timestamp);
        prompt += `- ${timeAgo} ago: "${result.summary}"\n`;
      });
      prompt += '\n';
    }

    // Add events that occurred
    if (events.length > 0) {
      prompt += '## Events that occurred:\n';
      events.forEach((event) => {
        prompt += this.formatEvent(event) + '\n';
      });
      prompt += '\n';
    }

    // Instructions
    prompt += '## Task:\n';
    prompt += 'Describe what the user accomplished in 5-10 words.\n';
    prompt += 'Focus on the substantive action, not the mechanics.\n';
    prompt += 'Example: "User filled in revenue numbers in Q2 report"\n';
    prompt += 'Example: "User reviewed pull request comments in GitHub"\n';
    prompt += 'Example: "User edited TypeScript code in VS Code"\n\n';
    prompt += 'Your response should be ONLY the summary, nothing else.';

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
      case 'app_change':
        return `- app changed from "${event.previousWindow?.processName}" to "${event.activeWindow?.processName}"`;
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
}
