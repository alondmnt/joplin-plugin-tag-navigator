/**
 * Memory management for the Tag Navigator plugin
 * 
 * This module provides memory leak prevention utilities specifically designed
 * for Joplin plugins that use the Data API extensively. It implements the
 * patterns from the Memory Leak Prevention Guide to ensure stable memory usage.
 * 
 * Key functions:
 * - clearApiResponse(): Clears joplin.data.get() response objects
 * - clearObjectReferences(): Enhanced object cleanup with circular reference handling
 * - MemoryManager: Timer and resource management with automatic cleanup
 */

/**
 * Simplified memory management class
 */
export class MemoryManager {
  private static instance: MemoryManager;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupFunctions: (() => void)[] = [];

  private constructor() {}

  /**
   * Gets the singleton instance
   */
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Creates and tracks a timeout
   */
  createTimeout(
    callback: () => void, 
    delay: number, 
    description?: string
  ): string {
    const id = this.generateId();
    
    const timerId = setTimeout(() => {
      try {
        callback();
      } finally {
        this.activeTimers.delete(id);
      }
    }, delay);
    
    this.activeTimers.set(id, timerId);
    return id;
  }

  /**
   * Creates and tracks an interval
   */
  createInterval(
    callback: () => void, 
    delay: number, 
    description?: string
  ): string {
    const id = this.generateId();
    const timerId = setInterval(callback, delay);
    this.activeTimers.set(id, timerId);
    return id;
  }

  /**
   * Clears a specific timer
   */
  clearTimer(id: string): boolean {
    const timer = this.activeTimers.get(id);
    if (!timer) return false;

    clearTimeout(timer);
    clearInterval(timer);
    this.activeTimers.delete(id);
    return true;
  }

  /**
   * Adds a cleanup function to be called during shutdown
   */
  addCleanupFunction(cleanupFn: () => void): void {
    this.cleanupFunctions.push(cleanupFn);
  }

  /**
   * Performs cleanup of all managed resources
   */
  cleanup(): void {
    console.log('Tag Navigator: Starting cleanup...');
    
    // Clear all timers
    for (const [id, timer] of this.activeTimers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.activeTimers.clear();
    
    // Run custom cleanup functions
    this.cleanupFunctions.forEach(cleanupFn => {
      try {
        cleanupFn();
      } catch (error) {
        console.error('Tag Navigator: Error in cleanup function:', error);
      }
    });
    this.cleanupFunctions = [];
    
    console.log('Tag Navigator: Cleanup completed');
  }

  /**
   * Gets basic memory statistics
   */
  getMemoryStats(): { activeTimers: number } {
    return {
      activeTimers: this.activeTimers.size
    };
  }

  private generateId(): string {
    return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Convenience function to get the global memory manager instance
 */
export function getMemoryManager(): MemoryManager {
  return MemoryManager.getInstance();
}

/**
 * Clears API response objects to prevent memory leaks from Joplin's Data API
 * Use this immediately after extracting data from joplin.data.get() responses
 */
export function clearApiResponse(response: any): null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  
  try {
    // Clear items array if present (common in paginated responses)
    if (Array.isArray(response.items)) {
      response.items.length = 0;
    }
    // Clear common pagination fields
    delete response.items;
    delete response.has_more;
    delete response.page;
    delete response.limit;
  } catch {
    // Ignore errors
  }
  
  return null;
}

/**
 * Enhanced object reference cleaner that handles circular references and various data types
 * Use this after processing large objects like note bodies, search results, or userData
 */
export function clearObjectReferences<T extends Record<string, any>>(
  obj: T | null | undefined,
  visited: WeakSet<object> = new WeakSet()
): null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  if (visited.has(obj)) {
    return null;
  }
  visited.add(obj);

  try {
    if (Array.isArray(obj)) {
      obj.length = 0;  // Clear all elements
    } else if (obj instanceof Map) {
      obj.clear();
    } else if (obj instanceof Set) {
      obj.clear();
    } else {
      // Clear object properties
      for (const key of Object.keys(obj)) {
        try {
          delete obj[key];
        } catch {
          // Ignore readonly properties
        }
      }
    }
  } catch (error) {
    // Silently ignore errors
  }
  return null;
}

/**
 * Memory-efficient timer creation with automatic cleanup
 */
export function createManagedTimeout(
  callback: () => void, 
  delay: number, 
  description?: string
): string {
  return getMemoryManager().createTimeout(callback, delay, description);
}

/**
 * Memory-efficient interval creation with automatic tracking
 */
export function createManagedInterval(
  callback: () => void, 
  delay: number, 
  description?: string
): string {
  return getMemoryManager().createInterval(callback, delay, description);
}

/**
 * Clears a managed timer
 */
export function clearManagedTimer(id: string): boolean {
  return getMemoryManager().clearTimer(id);
} 