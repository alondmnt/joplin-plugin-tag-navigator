/**
 * Kanban view that support the YesYouKan plugin.
 */
import { GroupedResult, SortableItem } from './search';
import { normalizeIndentation, sortResults } from './search';
import { NoteViewSettings, TagSettings } from './settings';
import { DatabaseManager } from './db';
import { escapeRegex } from './utils';
import { sortTags } from './utils';

/**
 * The priority order for checkbox states
 */
const CHECKBOX_STATE_ORDER = ['Open', 'Ongoing', 'In question', 'Blocked', 'Done', 'Obsolete'];

/**
 * Checkbox information for a line in a group
 */
export interface CheckboxItem {
  line: number;       // Line number in the original note
  level: number;      // Indentation level
  state: string;      // State of the checkbox ('Open', 'Done', etc.)
  hasCheckbox: boolean; // Whether this line has a checkbox
  text: string;       // Full text of the line
}

/**
 * Result item for a kanban group
 */
export interface KanbanItem extends SortableItem {
  heading: string;    // Heading text for the item
  group: string;      // Full content of the group
  processedHeading: string; // Heading with tags removed
  processedContent: string; // Content with tags removed
}

/**
 * Processes search results for kanban display
 * @param filteredResults Array of filtered search results
 * @param tagSettings Configuration for tag processing
 * @param viewSettings Configuration for note view
 * @returns Object containing grouped results by checkbox state
 */
export async function processResultsForKanban(
  filteredResults: GroupedResult[],
  tagSettings: TagSettings,
  viewSettings: NoteViewSettings
): Promise<{ [state: string]: KanbanItem[] }> {
  // Define checkbox state patterns and their corresponding kanban categories
  const checkboxPatterns = {
    'Open': /- \[ \]/,
    'In question': /- \[\?\]/,
    'Ongoing': /- \[\@\]/,
    'Blocked': /- \[\!\]/,
    'Obsolete': /- \[~\]/,
    'Done': /- \[[xX]\]/
  };
  
  // Create checkboxStates using the order from CHECKBOX_STATE_ORDER
  const checkboxStates: { [key: string]: RegExp } = {};
  for (const state of CHECKBOX_STATE_ORDER) {
    if (state in checkboxPatterns) {
      checkboxStates[state] = checkboxPatterns[state];
    }
  }

  // Initialize result object with empty arrays for each state
  const result: { [state: string]: KanbanItem[] } = {};
  for (const state of CHECKBOX_STATE_ORDER) {
    result[state] = [];
  }

  // Track already processed content to avoid duplication
  const processedContent = new Map<string, { state: string, noteId: string, lineNumber: number }>();
  
  // Get database instance for tag processing
  const db = DatabaseManager.getDatabase();

  // Process each result group
  for (const groupedResult of filteredResults) {
    for (let groupIndex = 0; groupIndex < groupedResult.text.length; groupIndex++) {
      // Parse the text into lines and analyze checkboxes
      const checkboxItems = parseCheckboxes(
        groupedResult.text[groupIndex].split('\n'),
        groupedResult.lineNumbers[groupIndex],
        checkboxStates
      );
      
      if (checkboxItems.length === 0) continue;
      
      // Process parent-child relationships for items without checkboxes
      processRelationships(checkboxItems);
      
      // Identify hierarchical structures
      const hierarchies = buildHierarchies(checkboxItems);
      
      // Process hierarchical items
      processHierarchicalItems(
        hierarchies,
        checkboxItems,
        checkboxStates,
        groupedResult,
        processedContent,
        result,
        tagSettings,
        viewSettings
      );
      
      // Process standalone items (items not in hierarchies)
      processStandaloneItems(
        checkboxItems, 
        hierarchies.flatMap(h => h), // All items that are part of hierarchies
        checkboxStates,
        groupedResult,
        processedContent,
        result,
        tagSettings,
        viewSettings
      );
    }
  }

  return result;
}

/**
 * Parses checkbox states and metadata from text lines
 */
function parseCheckboxes(
  lines: string[], 
  lineNumbers: number[], 
  checkboxStates: { [key: string]: RegExp }
): CheckboxItem[] {
  if (lines.length === 0) return [];
  
  return lines.map((line, index) => {
    // Calculate indentation level
    const indentMatch = line.match(/^(\s*)/);
    const indentLevel = indentMatch ? indentMatch[1].length : 0;
    
    // Check if this line has a checkbox
    const hasCheckbox = /^\s*- \[[xX\s@\?!~]\]/.test(line);
    
    // Determine checkbox state
    let state = 'Open'; // Default state
    if (hasCheckbox) {
      for (const [stateKey, pattern] of Object.entries(checkboxStates)) {
        if (pattern.test(line)) {
          state = stateKey;
          break;
        }
      }
    }
    
    return {
      line: lineNumbers[index] !== undefined ? lineNumbers[index] : (lineNumbers[0] || 0),
      level: indentLevel,
      state,
      hasCheckbox,
      text: line
    };
  });
}

/**
 * Processes parent-child relationships for items without checkboxes
 */
function processRelationships(items: CheckboxItem[]): void {
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    
    if (!current.hasCheckbox) {
      // Check if it has a parent checkbox (case a)
      let hasParent = false;
      for (let j = i - 1; j >= 0; j--) {
        const potentialParent = items[j];
        if (potentialParent.level < current.level && potentialParent.hasCheckbox) {
          hasParent = true;
          current.state = potentialParent.state;
          break;
        }
      }
      
      // Check if it has nested checkboxes (case b)
      if (!hasParent) {
        const childInfo = findChildCheckboxes(items, i);
        if (childInfo.hasNestedCheckbox) {
          current.state = childInfo.effectiveState;
        } else {
          // Skip lines with no checkboxes and no nested checkboxes
          current.state = '';
        }
      }
    }
  }
}

/**
 * Finds child checkboxes and determines the effective state
 */
function findChildCheckboxes(items: CheckboxItem[], currentIndex: number): { 
  hasNestedCheckbox: boolean, 
  effectiveState: string 
} {
  const current = items[currentIndex];
  let hasNestedCheckbox = false;
  let effectiveState = 'Done'; // Start with "strongest" state
  
  // Generate stateStrength dynamically from CHECKBOX_STATE_ORDER
  const stateStrength: {[key: string]: number} = {};
  CHECKBOX_STATE_ORDER.forEach((state, index) => {
    stateStrength[state] = index + 1;
  });
  
  // Look at immediate children
  for (let j = currentIndex + 1; j < items.length; j++) {
    const potentialChild = items[j];
    if (potentialChild.level > current.level) {
      if (potentialChild.hasCheckbox) {
        hasNestedCheckbox = true;
        
        // If any child is Open, the parent is Open (weakest state)
        // Otherwise take the "weakest" state of children
        if (potentialChild.state === 'Open' || 
            stateStrength[potentialChild.state] < stateStrength[effectiveState]) {
          effectiveState = potentialChild.state;
        }
      }
    } else if (potentialChild.level <= current.level) {
      // We've reached a sibling or higher level, stop looking
      break;
    }
  }
  
  return { hasNestedCheckbox, effectiveState };
}

/**
 * Builds hierarchical structures from checkbox items
 */
function buildHierarchies(items: CheckboxItem[]): number[][] {
  const hierarchies: number[][] = [];
  const processedIndices = new Set<number>();
  
  for (let i = 0; i < items.length; i++) {
    if (processedIndices.has(i)) continue;
    
    const current = items[i];
    if (!current.hasCheckbox && !current.state) continue; // Skip items with no state
    
    const hierarchy: number[] = [i];
    processedIndices.add(i);
    
    // Add parent items (items above with lower indentation)
    let parentLevel = current.level;
    for (let j = i - 1; j >= 0; j--) {
      const item = items[j];
      if (item.level < parentLevel) {
        hierarchy.unshift(j); // Add parent to beginning
        processedIndices.add(j);
        parentLevel = item.level;
      }
    }
    
    // Add child items (items below with higher indentation)
    let currentLevel = current.level;
    for (let j = i + 1; j < items.length; j++) {
      const item = items[j];
      if (item.level <= currentLevel) break; // Not a child
      
      hierarchy.push(j);
      processedIndices.add(j);
    }
    
    if (hierarchy.length > 0) {
      hierarchies.push(hierarchy);
    }
  }
  
  return hierarchies;
}

/**
 * Processes hierarchical items and adds them to results
 */
function processHierarchicalItems(
  hierarchies: number[][],
  items: CheckboxItem[],
  checkboxStates: { [key: string]: RegExp },
  groupedResult: GroupedResult,
  processedContent: Map<string, { state: string, noteId: string, lineNumber: number }>,
  result: { [state: string]: KanbanItem[] },
  tagSettings: TagSettings,
  viewSettings: NoteViewSettings
): void {
  // Get the actual NoteDatabase instance
  const noteDb = DatabaseManager.getDatabase();
  
  for (const hierarchy of hierarchies) {
    if (hierarchy.length === 0) continue;
    
    // Get the root/parent item of this hierarchy
    const rootItem = items[hierarchy[0]];
    
    // Extract heading from the root item
    const heading = formatHeading(rootItem.text);
    
    // Determine primary state
    let primaryState: string;
    
    // If the root item has a checkbox, use its state
    if (rootItem.hasCheckbox && rootItem.state && Object.keys(checkboxStates).includes(rootItem.state)) {
      primaryState = rootItem.state;
    } else {
      // Use the recursive getAllChildCheckboxStates to determine state based on children
      const childStates = getAllChildCheckboxStates(hierarchy, items, 0);
      
      if (childStates.length === 0) {
        // No checkboxes found, skip this hierarchy
        continue;
      } else if (childStates.every(state => state === 'Done')) {
        // All checkboxes are "Done"
        primaryState = 'Done';
      } else {
        // Find highest priority state using the same logic as in getAllChildCheckboxStates
        let foundState = false;
        
        for (const state of CHECKBOX_STATE_ORDER) {
          if (childStates.includes(state)) {
            primaryState = state;
            foundState = true;
            break;
          }
        }
        
        // Fallback to most common state if no priority state found
        if (!foundState) {
          primaryState = findMostCommonState(childStates);
        }
      }
    }
    
    // Extract lines for this group
    const groupLines = hierarchy.map(idx => items[idx].text);
    const contentSignature = groupLines.join('\n').trim();
    
    // Skip if already processed
    const existingEntry = processedContent.get(contentSignature);
    if (existingEntry && existingEntry.state === primaryState) continue;
    
    // Mark as processed
    processedContent.set(contentSignature, {
      state: primaryState,
      noteId: groupedResult.externalId,
      lineNumber: rootItem.line
    });
    
    // Extract content separately
    const contentLines = groupLines.slice(1);
    const contentIndices = Array.from({ length: contentLines.length }, (_, i) => i);
    const normalizedContent = contentLines.length > 0 ? normalizeIndentation(contentLines, contentIndices) : '';
    
    // Process tags for this group
    const lineNumbers = [];
    let startLine = rootItem.line;
    
    // Process all lines in this group to find their line numbers
    if (normalizedContent && normalizedContent.trim()) {
      const lines = normalizedContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        lineNumbers.push(startLine + i + 1);  // +1 because the heading is at startLine
      }
    }
    
    // Add the group heading line itself
    lineNumbers.push(startLine);
    
    // Process tags for this group
    let tagsResult: {
      processedHeading: string;
      processedContent: string;
      sortedTags: string[];
    };
    
    if (viewSettings.kanbanTagSummary) {
      tagsResult = processTagsForKanbanItem(
        lineNumbers,
        heading,
        normalizedContent,
        groupedResult,
        tagSettings
      );
    } else {
      // Use original text when tag summary is disabled
      tagsResult = {
        processedHeading: heading,
        processedContent: normalizedContent,
        sortedTags: []
      };
    }
    
    // Add to results
    result[primaryState].push({
      heading: tagsResult.processedHeading,
      group: normalizedContent,
      externalId: groupedResult.externalId,
      lineNumbers: [[rootItem.line]],
      color: groupedResult.color,
      title: groupedResult.title,
      tags: [tagsResult.sortedTags],
      processedHeading: tagsResult.processedHeading,
      processedContent: tagsResult.processedContent,
      notebook: groupedResult.notebook,
      updatedTime: groupedResult.updatedTime,
      createdTime: groupedResult.createdTime,
    });
  }
}

/**
 * Gets all checkbox states from children recursively
 */
function getAllChildCheckboxStates(hierarchy: number[], items: CheckboxItem[], startIdx: number): string[] {
  const states: string[] = [];
  
  // Process items at the current level
  for (let i = startIdx; i < hierarchy.length; i++) {
    const item = items[hierarchy[i]];
    
    if (item.hasCheckbox && item.state) {
      states.push(item.state);
    } else {
      // For items without checkboxes, derive state from their children recursively
      const childIndices = findChildIndices(hierarchy, items, i);
      
      if (childIndices.length > 0) {
        const childStates = getAllChildCheckboxStates(childIndices, items, 0);
        
        if (childStates.length > 0) {
          // Find the highest priority state
          let foundState = false;
          for (const state of CHECKBOX_STATE_ORDER) {
            if (childStates.includes(state)) {
              states.push(state);
              foundState = true;
              break;
            }
          }
          
          // Fallback to most common if no priority found
          if (!foundState) {
            states.push(findMostCommonState(childStates));
          }
        }
      }
    }
  }
  
  return states.filter(state => state); // Filter out empty states
}

/**
 * Finds child indices within a hierarchy for a given parent
 */
function findChildIndices(hierarchy: number[], items: CheckboxItem[], parentIndex: number): number[] {
  const childIndices: number[] = [];
  const parentItem = items[hierarchy[parentIndex]];
  const parentLevel = parentItem.level;
  let minChildLevel = Infinity;
  
  // First pass: find the minimum indentation level of direct children
  for (let i = parentIndex + 1; i < hierarchy.length; i++) {
    const currentItem = items[hierarchy[i]];
    
    // Stop when we reach the same or lower indentation level
    if (currentItem.level <= parentLevel) {
      break;
    }
    
    // Track the minimum child indentation level
    if (currentItem.level < minChildLevel) {
      minChildLevel = currentItem.level;
    }
  }
  
  // Second pass: add only direct children
  for (let i = parentIndex + 1; i < hierarchy.length; i++) {
    const currentItem = items[hierarchy[i]];
    
    // Stop when we reach the same or lower indentation level
    if (currentItem.level <= parentLevel) {
      break;
    }
    
    // Only add direct children (with the minimum indentation level found)
    if (currentItem.level === minChildLevel) {
      childIndices.push(hierarchy[i]);
    }
  }
  
  return childIndices;
}

/**
 * Processes standalone items not part of hierarchies
 */
function processStandaloneItems(
  items: CheckboxItem[],
  processedIndices: number[],
  checkboxStates: { [key: string]: RegExp },
  groupedResult: GroupedResult,
  processedContent: Map<string, { state: string, noteId: string, lineNumber: number }>,
  result: { [state: string]: KanbanItem[] },
  tagSettings: TagSettings,
  viewSettings: NoteViewSettings
): void {
  // Get the actual NoteDatabase instance
  const noteDb = DatabaseManager.getDatabase();
  
  const processedSet = new Set(processedIndices);
  
  for (let i = 0; i < items.length; i++) {
    if (processedSet.has(i)) continue;
    
    const current = items[i];
    if (!current.hasCheckbox || !current.state || !Object.keys(checkboxStates).includes(current.state)) {
      continue; // Skip invalid items
    }
    
    const contentSignature = current.text.trim();
    
    // Skip if already processed
    const existingEntry = processedContent.get(contentSignature);
    if (existingEntry && existingEntry.state === current.state) continue;
    
    // Mark as processed
    processedContent.set(contentSignature, {
      state: current.state,
      noteId: groupedResult.externalId,
      lineNumber: current.line
    });
    
    // Extract heading (normalize not needed for single line items)
    const heading = formatHeading(current.text);
    
    // Process tags for this item
    const lineNumbers = [current.line];
    
    let tagsResult: {
      processedHeading: string;
      processedContent: string;
      sortedTags: string[];
    };
    
    if (viewSettings.kanbanTagSummary) {
      tagsResult = processTagsForKanbanItem(
        lineNumbers,
        heading,
        current.text,
        groupedResult,
        tagSettings
      );
    } else {
      // Use original text when tag summary is disabled
      tagsResult = {
        processedHeading: heading,
        processedContent: current.text,
        sortedTags: []
      };
    }
    
    // Add to results
    result[current.state].push({
      heading: tagsResult.processedHeading,
      group: '', // No content for standalone items
      externalId: groupedResult.externalId,
      lineNumbers: [[current.line]],
      color: groupedResult.color,
      title: groupedResult.title,
      tags: [tagsResult.sortedTags],
      processedHeading: tagsResult.processedHeading,
      processedContent: tagsResult.processedContent,
      notebook: groupedResult.notebook,
      updatedTime: groupedResult.updatedTime,
      createdTime: groupedResult.createdTime,
    });
  }
}

/**
 * Finds the most common state in an array of states
 */
function findMostCommonState(states: string[]): string {
  const stateCounts = states.reduce((acc, state) => {
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {} as {[key: string]: number});
  
  return Object.keys(stateCounts).reduce((a, b) => 
    stateCounts[a] > stateCounts[b] ? a : b
  );
}

/**
 * Formats a line to be used as a heading by removing checkbox notation
 */
function formatHeading(line: string): string {
  let heading = line;
  
  // Remove checkbox notation and list marker from heading
  if (heading.includes('- [')) {
    heading = heading.replace(/^(\s*)- \[[^\]]+\](\s*)/, '$1$2');
  } else if (heading.trim().startsWith('-')) {
    heading = heading.replace(/^(\s*)-(\s*)/, '$1$2');
  }
  
  return heading.trim();
}

/**
 * Builds a markdown kanban board from the results
 * @param kanbanResults Results grouped by checkbox state
 * @param tagSettings Configuration for tag formatting
 * @param viewSettings Configuration for note view
 * @returns Markdown string representing the kanban board
 */
export async function buildKanban(
  kanbanResults: { [state: string]: KanbanItem[] },
  tagSettings: TagSettings,
  viewSettings: NoteViewSettings
): Promise<string> {
  // The order of states to display
  const displayColors = viewSettings.noteViewColorTitles;
  let kanbanString = '\n';

  // Build the kanban board
  for (const state of CHECKBOX_STATE_ORDER) {
    const groups = kanbanResults[state];
    if (groups.length === 0) continue;

    // Add state header
    kanbanString += `# ${state}\n\n`;

    // Display each group
    for (const group of groups) {
      // Format the note title (with color if enabled)
      let titleDisplay = group.title;
      if (displayColors && group.color) {
        titleDisplay = `<span style="color: ${group.color};">${group.title}</span>`;
      }
      
      // Add the group heading (converted to H2)
      kanbanString += `## ${group.processedHeading}\n`;
      
      // Add tags right after the heading (comma separated)
      if (group.tags.length > 0) {
        // Flatten the 2D tags array to work with the filtering logic
        const flatTags = group.tags.flat();
        const noParentTags = flatTags.filter(tag => !flatTags.some(t => t.startsWith(tag + '/') || t.startsWith(tag + tagSettings.valueDelim)) && !tag.startsWith(tagSettings.colorTag));
        kanbanString += `${noParentTags.join(', ')}\n`;
      }
      
      // Add link to the note
      kanbanString += `[${titleDisplay} (L${group.lineNumbers[0][0] + 1})](:/${group.externalId})\n\n`;
      
      // Add the processed content
      if (group.processedContent) {
        kanbanString += `${group.processedContent}\n\n`;
      }
    }
  }

  return kanbanString;
}

/**
 * Sort kanban items using the same sorting logic as search results
 * @param kanbanResults Object containing kanban items grouped by state
 * @param options Optional sorting options
 * @param tagSettings Tag processing settings
 * @param resultSettings Global result settings for fallbacks
 * @returns Sorted kanban results object with the same structure
 */
export function sortKanbanItems(
  kanbanResults: { [state: string]: KanbanItem[] },
  options: { 
    sortBy?: string, 
    sortOrder?: string
  } | undefined,
  tagSettings: TagSettings,
  resultSettings: {
    resultSort: string,
    resultOrder: string
  }
): { [state: string]: KanbanItem[] } {
  const sortedResults: { [state: string]: KanbanItem[] } = {};
  
  // Sort items within each state group
  for (const [state, items] of Object.entries(kanbanResults)) {
    // sortResults can now accept KanbanItem[] directly
    const sortedItems = sortResults(items, options, tagSettings, resultSettings);
    
    sortedResults[state] = sortedItems;
  }
  
  return sortedResults;
}

/**
 * Processes tags for a kanban item: extracts raw tags, cleans text, formats and sorts tags
 * @param lineNumbers Array of line numbers to extract tags from
 * @param heading The heading text to clean
 * @param content The content text to clean (optional)
 * @param groupedResult The grouped result containing note info
 * @param tagSettings Tag processing settings
 * @returns Object containing processed heading, content, and sorted tags
 */
function processTagsForKanbanItem(
  lineNumbers: number[],
  heading: string,
  content: string,
  groupedResult: GroupedResult,
  tagSettings: TagSettings
): {
  processedHeading: string;
  processedContent: string;
  sortedTags: string[];
} {
  // Get the actual NoteDatabase instance
  const noteDb = DatabaseManager.getDatabase();
  
  // Get raw tags from all lines (keep original format for accurate text removal)
  const allRawTags = new Set<string>();
  const note = noteDb.notes[groupedResult.externalId];
  if (note) {
    lineNumbers.forEach(lineNum => {
      const lineTags = note.getTagsAtLine(lineNum);
      lineTags.forEach(tag => allRawTags.add(tag));
    });
  }

  // Process the heading to remove tag mentions (using raw tags for accurate matching)
  let processedHeading = heading;
  allRawTags.forEach(rawTag => {
    // Remove exact tag from text, handling spaces properly
    const tagPattern = new RegExp(`\\s*${escapeRegex(rawTag)}(?=$|[\\s\\n,.;:?!]+)`, 'gi');
    processedHeading = processedHeading.replace(tagPattern, '');
  });
  // Clean up any trailing whitespace and multiple spaces
  processedHeading = processedHeading.replace(/\s+/g, ' ').trim();
  
  // Process the content to remove tag mentions (using raw tags)
  let processedContent = '';
  if (content && content.trim()) {
    processedContent = content;
    
    // Replace tag mentions with empty string
    allRawTags.forEach(rawTag => {
      // Remove exact tag from text, handling spaces properly
      const tagPattern = new RegExp(`\\s*${escapeRegex(rawTag)}(?=$|[\\s\\n,.;:?!]+)`, 'gi');
      processedContent = processedContent.replace(tagPattern, '');
    });
    
    // Clean up extra newlines and spaces
    processedContent = processedContent.split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n');
  }

  // Now format tags for sorting (remove prefix, lowercase)
  const formattedTags = Array.from(allRawTags).map(tag => 
    tag.replace(tagSettings.tagPrefix, '').toLowerCase()
  );
  
  // Sort tags using proper tag hierarchy sorting (same as GroupedResult)
  const sortedTags = sortTags(formattedTags, tagSettings.valueDelim);
  
  return {
    processedHeading,
    processedContent,
    sortedTags
  };
} 