import * as fs from 'fs';
import { extractText } from './ocr';
import { EmbeddingService } from './embedding';
import { StorageService, StoredEvent } from './storage';
import { Screenshot, InteractionContext } from '../../shared/types';
import { SemanticClassifierService } from './semantic-classifier';

export class EventProcessor {
  private embeddingService: EmbeddingService;
  private storageService: StorageService;
  private classifierService: SemanticClassifierService | null = null;
  
  // Event aggregation state (moved from recorder for separation of concerns)
  private pendingEvents: InteractionContext[] = [];
  
  // Classification state - track START screenshot for START/END pairs
  private startScreenshot: Screenshot | null = null;
  private startEvents: InteractionContext[] = [];

  constructor(embeddingService: EmbeddingService, storageService: StorageService, classifierService?: SemanticClassifierService) {
    this.embeddingService = embeddingService;
    this.storageService = storageService;
    this.classifierService = classifierService || null;
  }

  /**
   * Add an interaction event to the pending events list.
   * Events are aggregated here and associated with screenshots during processing.
   */
  public addInteractionEvent(event: InteractionContext): void {
    this.pendingEvents.push(event);
  }

  /**
   * Main pipeline: OCR -> Embed -> Store -> Classification -> Cleanup
   * 
   * Flow:
   * 1. OCR extracts text from screenshot (needs file)
   * 2. Generate embedding from text
   * 3. Store in database
   * 4. If classifier enabled: track START/END pairs for classification
   * 5. Classification runs (needs both screenshot files)
   * 6. Delete screenshot files after classification (or immediately if no classifier)
   */
  public async processScreenshot(screenshot: Screenshot): Promise<void> {
    const { filepath, id, timestamp } = screenshot;
    
    // Grab pending events and reset for next screenshot
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    console.log(`[EventProcessor] Processing screenshot ${id} with ${events.length} accumulated events`);
    
    try {
      // 1. OCR - needs the file to exist
      if (!fs.existsSync(filepath)) {
          console.warn(`File not found for screenshot ${id}: ${filepath}`);
          return;
      }
      
      const text = await extractText(filepath);
      console.log(`OCR complete for ${id}. Text length: ${text.length}`);

      // 2. Embedding
      const vector = await this.embeddingService.generateEmbedding(text);
      console.log(`Embedding generated for ${id}.`);

      // 3. Store
      const storedEvent: StoredEvent = {
        id,
        timestamp,
        text,
        vector
      };
      
      await this.storageService.addEvent(storedEvent);
      console.log(`Event stored for ${id}.`);

      // 4. Semantic Classification (START/END pair tracking)
      if (this.classifierService) {
        if (!this.startScreenshot) {
          // This is the START screenshot - keep file for classification
          this.startScreenshot = screenshot;
          this.startEvents = events;
          console.log(`[EventProcessor] START screenshot set: ${id} (file retained for classification)`);
        } else {
          // This is the END screenshot - trigger classification then cleanup
          console.log(`[EventProcessor] END screenshot: ${id} - triggering classification`);
          
          const allEvents = [...this.startEvents, ...events];
          
          try {
            // Classification needs both screenshot files
            await this.classifierService.classify({
              startScreenshot: this.startScreenshot,
              endScreenshot: screenshot,
              events: allEvents,
            });
          } catch (classificationError) {
            console.error('[EventProcessor] Classification failed:', classificationError);
          }
          
          // Delete START screenshot (classification done or failed, no longer needed)
          this.deleteScreenshot(this.startScreenshot.filepath);
          
          // END becomes new START (keep its file for next classification)
          this.startScreenshot = screenshot;
          this.startEvents = events;
        }
      } else {
        // No classifier - delete immediately after OCR (original behavior)
        this.deleteScreenshot(filepath);
      }
      
    } catch (error) {
      console.error(`Error processing screenshot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Safely delete a screenshot file
   */
  private deleteScreenshot(filepath: string): void {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`[EventProcessor] Deleted screenshot: ${filepath}`);
      }
    } catch (error) {
      console.error(`[EventProcessor] Failed to delete screenshot ${filepath}:`, error);
    }
  }

  /**
   * Search for events using both vector similarity and FTS.
   */
  public async search(query: string, limit = 5): Promise<{ fts: StoredEvent[], vector: StoredEvent[] }> {
    console.log(`[Search] Query: "${query}" (Limit: ${limit})`);

    // 1. Generate embedding for vector search
    const queryVector = await this.embeddingService.generateEmbedding(query);

    // 2. Vector search
    const vectorResults = await this.storageService.searchVectors(queryVector, limit);
    console.log(`[Search] Vector results: ${vectorResults.length}`);

    // 3. FTS search
    const ftsResults = await this.storageService.searchFTS(query, limit);
    console.log(`[Search] FTS results: ${ftsResults.length}`);

    return { fts: ftsResults, vector: vectorResults };
  }
}
