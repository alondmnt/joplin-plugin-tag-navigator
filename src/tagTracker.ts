import joplin from 'api';
import { ModelType } from '../api/types';

/**
 * Interface for tracking tag conversions per note
 */
export interface TagConversionData {
  /** Tags that were converted from inline to Joplin tags in the last conversion */
  joplinTags: string[];
  /** Timestamp of the last conversion */
  lastUpdated: number;
}

const USER_DATA_KEY = 'tagConversions';

/**
 * Stores tag conversion data for a note using Joplin's user data API
 * @param noteId - The ID of the note
 * @param data - The tag conversion data to store
 */
export async function saveTagConversionData(
  noteId: string, 
  data: TagConversionData
): Promise<void> {
  try {
    await joplin.data.userDataSet(ModelType.Note, noteId, USER_DATA_KEY, data);
  } catch (error) {
    console.error(`Failed to save tag conversion data for note ${noteId}:`, error);
  }
}

/**
 * Retrieves tag conversion data for a note
 * @param noteId - The ID of the note
 * @returns The tag conversion data, or null if none exists
 */
export async function getTagConversionData(noteId: string): Promise<TagConversionData | null> {
  try {
    const data = await joplin.data.userDataGet<TagConversionData>(ModelType.Note, noteId, USER_DATA_KEY);
    return data || null;
  } catch (error) {
    console.debug(`No tag conversion data found for note ${noteId}:`, error);
    return null;
  }
}

/**
 * Deletes tag conversion data for a note
 * @param noteId - The ID of the note
 */
export async function deleteTagConversionData(noteId: string): Promise<void> {
  try {
    await joplin.data.userDataDelete(ModelType.Note, noteId, USER_DATA_KEY);
  } catch (error) {
    console.debug(`Failed to delete tag conversion data for note ${noteId}:`, error);
  }
}

/**
 * Computes the differences between current tags and previously tracked tags
 * @param currentTags - Current tags in the note
 * @param previousTags - Previously tracked tags
 * @returns Object with tags to add and remove
 */
export function computeTagDiff(currentTags: string[], previousTags: string[]): {
  toAdd: string[];
  toRemove: string[];
} {
  const currentSet = new Set(currentTags);
  const previousSet = new Set(previousTags);
  
  return {
    toAdd: currentTags.filter(tag => !previousSet.has(tag)),
    toRemove: previousTags.filter(tag => !currentSet.has(tag))
  };
}

/**
 * Removes specified Joplin tags from a note
 * @param noteId - The ID of the note
 * @param tagsToRemove - Array of tag names to remove
 */
export async function removeJoplinTags(noteId: string, tagsToRemove: string[]): Promise<void> {
  if (tagsToRemove.length === 0) return;
  
  try {
    // Get all tags to find their IDs
    const allTags = await getAllTags();
    const tagMap = new Map(allTags.map((tag: any) => [tag.title, tag.id]));
    
    // Remove each tag from the note
    for (const tagName of tagsToRemove) {
      const tagId = tagMap.get(tagName);
      if (tagId) {
        try {
          await joplin.data.delete(['tags', tagId as string, 'notes', noteId]);
        } catch (error) {
          console.debug(`Tag ${tagName} was not associated with note ${noteId}, skipping removal`);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to remove Joplin tags from note ${noteId}:`, error);
  }
}

/**
 * Gets all tags from Joplin with proper pagination handling
 * @returns An array of all tags
 */
export async function getAllTags(): Promise<{ id: string; title: string }[]> {
  let hasMore = true;
  let page = 0;
  const allTags = [];
  while (hasMore) {
    const tags = await joplin.data.get(['tags'], { 
      fields: ['id', 'title'],
      limit: 100,
      page: page++
    });
    allTags.push(...tags.items);
    hasMore = tags.has_more;
  }
  return allTags;
}

/**
 * Clears tag conversion data for all notes
 * This is useful when users want to start fresh with tag tracking
 */
export async function clearAllTagConversionData(): Promise<void> {
  try {
    // Get all notes
    let hasMore = true;
    let page = 0;
    while (hasMore) {
      const notes = await joplin.data.get(['notes'], {
        fields: ['id'],
        limit: 100,
        page: page++,
      });
      hasMore = notes.has_more;

      // Clear conversion data for each note
      for (const note of notes.items as { id: string }[]) {
        try {
          await deleteTagConversionData(note.id);
        } catch (error) {
          // Continue with other notes even if one fails
          console.debug(`Failed to clear tag conversion data for note ${note.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear tag conversion data:', error);
    throw error;
  }
}
