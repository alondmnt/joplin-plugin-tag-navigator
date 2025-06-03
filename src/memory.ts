/**
 * Simplified memory management for the Tag Navigator plugin
 * Handles cleanup of timers and provides basic cleanup functionality
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
 * Basic object reference cleaner (keeps it simple - let GC handle most cases)
 */
export function clearObjectReferences<T extends Record<string, any>>(
  obj: T | null, 
  visited: Set<any> = new Set()
): null {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) {
    return null;
  }

  visited.add(obj);

  try {
    if (Array.isArray(obj)) {
      obj.length = 0; // Clear array
    } else {
      // Clear object properties
      for (const prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          delete obj[prop];
        }
      }
    }
  } catch (error) {
    // Ignore errors - GC will handle it
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