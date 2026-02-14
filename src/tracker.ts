import joplin from 'api';
import { ModelType } from '../api/types';
import { clearApiResponse } from './memory';
import { sortTags, escapeRegex } from './utils';

/**
 * Interface for tracking tag conversions per note
 */
export interface TagConversionData {
  /** Tags that were converted from inline to Joplin tags in the last conversion */
  joplinTags: string[];
  /** Tags that were converted from Joplin to inline tags in the last conversion */
  inlineTags: string[];
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
    let data = await joplin.data.userDataGet<TagConversionData>(ModelType.Note, noteId, USER_DATA_KEY);
    // Create a copy to avoid holding reference to original userData object
    const result = data ? { ...data } : null;
    // Clear the original userData object if it exists
    if (data && typeof data === 'object') {
      try {
        for (const key of Object.keys(data)) {
          delete (data as any)[key];
        }
      } catch {
        // Ignore errors
      }
    }
    return result;
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
  
  const result = {
    toAdd: currentTags.filter(tag => !previousSet.has(tag)),
    toRemove: previousTags.filter(tag => !currentSet.has(tag))
  };
  
  // Clear Sets
  currentSet.clear();
  previousSet.clear();
  
  return result;
}

/**
 * Checks whether two string arrays contain the same elements (order-independent)
 * @param a - First array
 * @param b - Second array
 * @returns true if both arrays contain exactly the same elements
 */
export function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  const result = b.every(item => setA.has(item));
  setA.clear();
  return result;
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
    
    // Clear the Map
    tagMap.clear();
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
    clearApiResponse(tags); // Clear API response
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
      clearApiResponse(notes); // Clear API response
    }
  } catch (error) {
    console.error('Failed to clear tag conversion data:', error);
    throw error;
  }
}

/**
 * Removes specified inline tags from the note body
 * @param noteBody - The note body content
 * @param tagsToRemove - Array of tag names to remove
 * @param listPrefix - The prefix used for tag lists (e.g., "tags: ")
 * @param tagPrefix - The prefix used for individual tags (e.g., "#")
 * @param spaceReplace - The character used to replace spaces in tags
 * @returns The updated note body
 */
export function removeInlineTags(
  noteBody: string, 
  tagsToRemove: string[], 
  listPrefix: string,
  tagPrefix: string,
  spaceReplace: string
): string {
  if (tagsToRemove.length === 0) return noteBody;
  
  const lines = noteBody.split('\n');
  const updatedLines = [];
  
  for (const line of lines) {
    if (line.startsWith(listPrefix)) {
      // This is a tag line, remove specified tags
      let updatedLine = line;
      
      for (const tagToRemove of tagsToRemove) {
        const tagWithPrefix = tagPrefix + tagToRemove.replace(/\s/g, spaceReplace);
        // Remove the tag and any trailing/leading spaces
        updatedLine = updatedLine.replace(new RegExp(`\\s*${escapeRegex(tagWithPrefix)}\\s*`, 'g'), ' ');
      }
      
      // Clean up the line - remove extra spaces and ensure proper formatting
      updatedLine = updatedLine.replace(/\s+/g, ' ').trim();
      
      // Only keep the line if it still has content after the prefix
      if (updatedLine.length > listPrefix.length) {
        updatedLines.push(updatedLine);
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  const result = updatedLines.join('\n');
  
  // Clear arrays to prevent memory leaks
  lines.length = 0;
  updatedLines.length = 0;
  
  return result;
}

/**
 * Adds inline tags to the note body
 * @param noteBody - The note body content
 * @param tagsToAdd - Array of tag names to add
 * @param listPrefix - The prefix used for tag lists (e.g., "tags: ")
 * @param tagPrefix - The prefix used for individual tags (e.g., "#")
 * @param spaceReplace - The character used to replace spaces in tags
 * @param location - Where to add the tags ('top' or 'bottom')
 * @param valueDelim - Delimiter for sorting tags
 * @returns The updated note body
 */
export function addInlineTags(
  noteBody: string,
  tagsToAdd: string[],
  listPrefix: string,
  tagPrefix: string,
  spaceReplace: string,
  location: 'top' | 'bottom',
  valueDelim: string
): string {
  if (tagsToAdd.length === 0) return noteBody;
  
  const lines = noteBody.split('\n');
  let existingTagLineIndex = -1;
  
  // Find existing tag line
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(listPrefix)) {
      existingTagLineIndex = i;
      break;
    }
  }
  
  const sortedTags = sortTags(tagsToAdd, valueDelim);
  const newTagsString = sortedTags
    .map(tag => tagPrefix + tag.replace(/\s/g, spaceReplace)).join(' ');
  
  if (existingTagLineIndex !== -1) {
    // Add to existing tag line
    const existingLine = lines[existingTagLineIndex];
    lines[existingTagLineIndex] = existingLine + ' ' + newTagsString;
  } else {
    // Create new tag line
    const newTagLine = listPrefix + newTagsString;
    if (location === 'top') {
      lines.unshift(newTagLine);
    } else {
      lines.push(newTagLine);
    }
  }
  
  const result = lines.join('\n');
  
  // Clear arrays to prevent memory leaks
  lines.length = 0;
  
  return result;
}

/**
 * Checks if the note body contains any existing tag lines
 * @param noteBody - The note body content
 * @param listPrefix - The prefix used for tag lists (e.g., "tags: ")
 * @returns true if tag lines exist, false otherwise
 */
export function hasExistingTagLines(noteBody: string, listPrefix: string): boolean {
  const lines = noteBody.split('\n');
  const result = lines.some(line => line.startsWith(listPrefix));
  
  // Clear array to prevent memory leaks
  lines.length = 0;
  
  return result;
}