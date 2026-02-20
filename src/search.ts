import joplin from 'api';
import { getResultSettings, getTagSettings, TagSettings } from './settings';
import { NoteDatabase, ResultSet, intersectSets, unionSets } from './db';
import { parseDateTag } from './parser';
import { compareTagValues, sortTags, processBatch } from './utils';
import { clearObjectReferences, clearApiResponse } from './memory';

/**
 * Represents a search query component
 */
export interface Query {
  tag?: string;          // Tag to search for
  title?: string;        // Title to search for
  externalId?: string;   // Note ID to search for
  negated: boolean;      // Whether to negate the search
  minValue?: string;     // Minimum value for range queries
  maxValue?: string;     // Maximum value for range queries
}

/**
 * Represents a search query configuration
 */
export interface QueryRecord {
  /** Array of query conditions grouped by AND/OR logic */
  query: Query[][];
  /** Text filter to apply to results */
  filter: string;
  /** How to display results in the note: 'false', 'list', 'table', or 'kanban' */
  displayInNote: string;
  /** Query interpretation mode: 'dnf' (OR-of-ANDs) or 'cnf' (AND-of-ORs) */
  mode?: 'dnf' | 'cnf';
  /** Optional display settings */
  options?: {
    includeCols?: string;
    excludeCols?: string;
    sortBy?: string;
    sortOrder?: string;
    resultGrouping?: string;
    resultToggle?: boolean;
    limit?: number;
  };
}

/**
 * Base interface for items that can be sorted
 */
export interface SortableItem {
  externalId: string;     // Note ID
  lineNumbers: number[][];  // Line numbers where matches were found
  color: string;         // Color for display
  title: string;         // Note title
  notebook?: string;     // Notebook name
  updatedTime?: number;  // Last update timestamp
  createdTime?: number;  // Creation timestamp
  tags?: string[][];     // Array of unique tags per group for sorting
}

/**
 * Represents a grouped search result
 */
export interface GroupedResult extends SortableItem {
  text: string[];        // Text content of matched lines
  html: string[];        // HTML content of matched lines
  // Context expansion fields
  textExpanded?: string[][];   // textExpanded[groupIndex][level] - text with context (levels 1-3)
  htmlExpanded?: string[][];   // htmlExpanded[groupIndex][level] - rendered HTML with context
  expandLevels?: number[];     // Max expansion level per group (0 = no expansion available, 3 = full)
  lineNumbersExpanded?: number[][][];  // [section][level][localLine] → actual file line number
}

/** Cached regex patterns */
export const REGEX = {
  leadingWhitespace: /^(\s*)/,
  codeBlockStart: /^\s*```/,
  codeBlockEnd: /^\s*```\s*$/,
};

/**
 * Executes a search query and returns grouped results
 * @param db Note database to search in
 * @param params Query configuration containing query conditions, options, and mode
 * @returns Array of grouped search results
 */
export async function runSearch(
  db: NoteDatabase,
  params: QueryRecord
): Promise<GroupedResult[]> {
  const query = params.query;
  let currentNote = (await joplin.workspace.selectedNote()) || {};
  const settings = await getTagSettings();
  const resultSettings = await getResultSettings();
  const groupingMode = params.options?.resultGrouping || resultSettings.resultGrouping;
  const mode = params.mode || 'dnf';
  const queryResults = await getQueryResults(db, query, currentNote, mode);
  let groupedResults = await processQueryResults(
    db,
    queryResults,
    groupingMode,
    settings,
    resultSettings.contextExpansionStep
  );

  // Sort results using options with fallbacks to global settings
  const tagSettings = await getTagSettings();
  groupedResults = sortResults(
    groupedResults, params.options, tagSettings, resultSettings);

  currentNote = clearObjectReferences(currentNote);
  return groupedResults;
}

/**
 * Processes query and returns matching note locations.
 * In DNF mode (default): inner groups are AND, outer combination is OR.
 * In CNF mode: inner groups are OR, outer combination is AND.
 * @param db Note database to search in
 * @param query 2D array of queries
 * @param currentNote Currently selected note
 * @param mode Query interpretation mode ('dnf' or 'cnf')
 * @returns Dictionary of note IDs to sets of line numbers
 */
async function getQueryResults(
  db: NoteDatabase,
  query: Query[][],
  currentNote: { id?: string },
  mode: 'dnf' | 'cnf' = 'dnf'
): Promise<ResultSet> {
  const combineWithinGroup = mode === 'cnf' ? unionResults : intersectResults;
  const combineBetweenGroups = mode === 'cnf' ? intersectResults : unionResults;

  let resultsSet: ResultSet | null = null;

  for (const clause of query) {
    let clauseResultsSet: ResultSet | null = null;

    for (const queryPart of clause) {
      let partResults: ResultSet = {};

      if (queryPart.tag) {
        partResults = db.searchBy('tag', queryPart.tag, queryPart.negated);

      } else if (queryPart.externalId) {
        if ((queryPart.externalId === 'current') && (currentNote?.id)) {
          partResults = db.searchBy('noteLinkId', currentNote.id, queryPart.negated);
        } else {
          partResults = db.searchBy('noteLinkId', queryPart.externalId, queryPart.negated);

          if (queryPart.title) {
            partResults = unionResults(
              partResults,
              db.searchBy('noteLinkTitle', queryPart.title, queryPart.negated)
            );
          }
        }

      } else if (queryPart.minValue || queryPart.maxValue) {
        const tagSettings = await getTagSettings();
        const minValue = queryPart.minValue ?
          parseDateTag(queryPart.minValue.toLowerCase(), tagSettings) : null;
        const maxValue = queryPart.maxValue ?
          parseDateTag(queryPart.maxValue.toLowerCase(), tagSettings) : null;

        for (const tag of db.getTags()) {
          if (minValue) {
            if (minValue.startsWith('*')) {
              // Simple suffix check
              if (!tag.endsWith(minValue.slice(1))) { continue; }
            } else if (minValue.endsWith('*')) {
              // Combined prefix + range check
              if (!tag.startsWith(minValue.slice(0, -1))) { continue; }
            } else if (!isTagInRange(tag, minValue, maxValue, tagSettings.valueDelim)) {
              continue;
            }
          }
          if (maxValue) {
            if (maxValue.startsWith('*')) {
              // Simple suffix check
              if (!tag.endsWith(maxValue.slice(1))) { continue; }
            } else if (maxValue.endsWith('*')) {
              // Combined prefix + range check
              if (!tag.startsWith(maxValue.slice(0, -1))) { continue; }
            } else if (!isTagInRange(tag, minValue, maxValue, tagSettings.valueDelim)) {
              continue;
            }
          }
          partResults = unionResults(partResults, db.searchBy('tag', tag, false));
        }
      }

      // Combine results within group (AND in DNF, OR in CNF)
      clauseResultsSet = clauseResultsSet === null ?
        partResults :
        combineWithinGroup(clauseResultsSet, partResults);
    }

    // Combine results between groups (OR in DNF, AND in CNF)
    if (clauseResultsSet !== null) {
      resultsSet = resultsSet === null ?
        clauseResultsSet :
        combineBetweenGroups(resultsSet, clauseResultsSet);
    }
  }

  return resultsSet ?? {};
}

/**
 * Checks if a tag is within a range, properly handling nested tags.
 * Uses numeric comparison when both operands are numeric, otherwise
 * falls back to lexicographic comparison.
 * @param tag Tag to check
 * @param minValue Minimum value of range
 * @param maxValue Maximum value of range
 * @param valueDelim Delimiter between tag key and value (e.g., '=')
 * @returns True if tag is within range, false otherwise
 */
function isTagInRange(tag: string, minValue: string, maxValue: string, valueDelim: string): boolean {
  // If both min and max exist, ensure min is not greater than max
  if (minValue && maxValue && compareTagValues(minValue, maxValue, valueDelim) > 0) {
    return false;
  }

  // First check for exact matches
  if (tag === minValue || tag === maxValue) {
    return true;
  }

  // Check if tag is a parent of minValue or maxValue
  if (minValue && minValue.startsWith(tag + '/') ||
      maxValue && maxValue.startsWith(tag + '/')) {
    return false;
  }

  // Numeric-aware comparison (falls back to lexicographic for non-numeric values)
  if (minValue && compareTagValues(tag, minValue, valueDelim) < 0) {
    return false;
  }
  if (maxValue && compareTagValues(tag, maxValue, valueDelim) > 0) {
    return false;
  }

  return true;
}

/**
 * Computes intersection of two result sets
 * @param noteDictA First result set
 * @param noteDictB Second result set
 * @returns Intersection of the two sets
 */
function intersectResults(
  noteDictA: ResultSet, 
  noteDictB: ResultSet
): ResultSet {
  const result: ResultSet = {};
  for (const noteId in noteDictA) {
    if (noteDictB[noteId]) {
      result[noteId] = intersectSets(noteDictA[noteId], noteDictB[noteId]);
    }
  }
  return result;
}

/**
 * Computes union of two result sets
 * @param noteDictA First result set
 * @param noteDictB Second result set
 * @returns Union of the two sets
 */
function unionResults(
  noteDictA: ResultSet, 
  noteDictB: ResultSet
): ResultSet {
  const result: ResultSet = { ...noteDictA };
  for (const noteId in noteDictB) {
    if (result[noteId]) {
      result[noteId] = unionSets(result[noteId], noteDictB[noteId]);
    } else {
      result[noteId] = noteDictB[noteId];
    }
  }
  return result;
}

/**
 * Processes raw query results into grouped results with note content
 * @param queryResults Raw query results
 * @param colorTag The color tag to use
 * @param groupingMode The grouping mode to use
 * @param contextExpansionStep Lines to expand per level (0 = disabled)
 * @returns Array of grouped results with note content
 */
async function processQueryResults(
  db: NoteDatabase,
  queryResults: ResultSet,
  groupingMode: string,
  tagSettings: TagSettings,
  contextExpansionStep: number = 0
): Promise<GroupedResult[]> {
  const groupedResults: GroupedResult[] = [];
  if (!queryResults) return groupedResults;

  // First pass: build colour-grouped result objects synchronously
  const pendingResults: GroupedResult[] = [];
  for (const externalId in queryResults) {
    const note = db.notes[externalId];
    const lineNumbers = Array.from(queryResults[externalId]).sort((a, b) => a - b);

    // Get the color for each line
    const colorMap: Map<string, number[]> = new Map();
    colorMap.set('', [...lineNumbers]);

    for (const lineNumber of lineNumbers) {
      const lineTags = note.getTagsAtLine(lineNumber);

      for (const tag of lineTags) {
        if (tag.startsWith(tagSettings.colorTag)) {
          // Add the color to the map
          const color = tag.replace(tagSettings.colorTag, '');

          const colorLines = colorMap.get(color) || [];
          colorLines.push(lineNumber);
          colorMap.set(color, colorLines);

          // Remove the line from the default color array safely
          const defaultLines = colorMap.get('');
          const index = defaultLines.indexOf(lineNumber);
          if (index !== -1) {
            defaultLines.splice(index, 1);
          }
        }
      }
    }

    // Create a separate result for each color
    for (const [color, lines] of colorMap.entries()) {
      if (lines.length === 0) {
        continue;
      }

      pendingResults.push({
        externalId,
        lineNumbers: [lines],
        text: [],
        html: [],
        color: color,
        title: '',
        tags: [], // Will be populated after grouping
      });
    }

    // Clear map and lineNumbers array to prevent memory leaks
    colorMap.clear();
    lineNumbers.length = 0;
  }

  // Second pass: fetch note content in parallel batches
  // Delegate 'none' to 'item' grouping; we flatten after
  const effectiveMode = groupingMode === 'none' ? 'item' : groupingMode;
  await processBatch(pendingResults, tagSettings.readBatchSize, async (colorResult) => {
    const populated = await getTextAndTitleByGroup(colorResult, tagSettings.fullNotebookPath, effectiveMode, db, tagSettings, contextExpansionStep);
    groupedResults.push(populated);
  });

  // Flatten: split each multi-section result into individual single-section results
  if (groupingMode === 'none') {
    const flattened: GroupedResult[] = [];
    for (const result of groupedResults) {
      if (result.text.length <= 1) {
        flattened.push(result);
        continue;
      }
      for (let i = 0; i < result.text.length; i++) {
        flattened.push({
          externalId: result.externalId,
          title: result.title,
          notebook: result.notebook,
          updatedTime: result.updatedTime,
          createdTime: result.createdTime,
          color: result.color,
          lineNumbers: [result.lineNumbers[i]],
          text: [result.text[i]],
          html: [result.html[i]],
          tags: result.tags ? [result.tags[i]] : [],
          textExpanded: result.textExpanded ? [result.textExpanded[i]] : undefined,
          htmlExpanded: result.htmlExpanded ? [result.htmlExpanded[i]] : undefined,
          expandLevels: result.expandLevels ? [result.expandLevels[i]] : undefined,
          lineNumbersExpanded: result.lineNumbersExpanded ? [result.lineNumbersExpanded[i]] : undefined,
        });
      }
      // Clear original multi-section container arrays after extraction
      clearObjectReferences(result);
    }
    groupedResults.length = 0;
    groupedResults.push(...flattened);
    flattened.length = 0;
  }

  return groupedResults;
}

/**
 * Retrieves text content and title for a result, and groups the lines
 * @param result Result to populate with content
 * @param fullPath Whether to include full notebook path
 * @param groupingMode The grouping mode to use
 * @param contextExpansionStep Lines to expand per level (0 = disabled)
 * @returns Updated result with content
 */
async function getTextAndTitleByGroup(
  result: GroupedResult,
  fullPath: boolean,
  groupingMode: string,
  db: NoteDatabase,
  tagSettings: TagSettings,
  contextExpansionStep: number = 0
): Promise<GroupedResult> {
  let note = await joplin.data.get(['notes', result.externalId],
    { fields: ['title', 'body', 'updated_time', 'created_time', 'parent_id'] });
  let folder: any;
  try {
    folder = await joplin.data.get(['folders', note.parent_id], { fields: ['title', 'parent_id'] });
  } catch (e) {
    folder = { title: 'Unknown notebook' };
  }
  let notebook = folder.title + '/';
  if (fullPath) {
    while (folder.parent_id) {
      const parentFolder = await joplin.data.get(['folders', folder.parent_id], { fields: ['title', 'parent_id'] });
      notebook = parentFolder.title + '/' + notebook;
      clearObjectReferences(folder); // Clear previous folder
      folder = parentFolder;
    }
    notebook = '/' + notebook;
  }
  clearObjectReferences(folder); // Clear final folder reference
  const lines: string[] = note.body.split('\n');
  const [groupedLines, groupTitleLine] = await groupLines(lines, result, groupingMode);

  // Helper to get heading line for a group (returns null if none)
  const getHeadingLine = (index: number): number | null => {
    const line = groupTitleLine[index];
    return line >= 0 ? line : null;
  };

  // Transform grouped line numbers into text blocks
  result.text = groupedLines.map((group, index) => {
    const headingLine = getHeadingLine(index);
    if (headingLine !== null && !group.includes(headingLine)) {
      group.unshift(headingLine);
    }
    return normalizeIndentation(lines, group);
  });

  result.lineNumbers = groupedLines;
  
  // Extract unique tags per group
  result.tags = extractTagsPerGroup(groupedLines, db, result.externalId, tagSettings);
  result.title = note.title;
  result.notebook = notebook;
  result.updatedTime = note.updated_time;
  result.createdTime = note.created_time;

  // Context expansion - generate expanded text at each level
  if (contextExpansionStep > 0) {
    const CONTEXT_MULTIPLIERS = [1, 2, 3];  // levels 1, 2, 3
    result.lineNumbersExpanded = [];  // Store file line numbers for expanded content

    result.textExpanded = groupedLines.map((group, index) => {
      // Guard: skip empty groups
      if (group.length === 0) {
        result.lineNumbersExpanded.push([]);
        return [];
      }

      // Exclude heading line from expansion bounds - expand around actual content
      const headingLine = getHeadingLine(index);
      const contentLines = headingLine !== null
        ? group.filter(line => line !== headingLine)
        : group;
      if (contentLines.length === 0) {
        result.lineNumbersExpanded.push([]);
        return [];
      }
      const levels: string[] = [];
      const levelLineNumbers: number[][] = [];  // Track line numbers per level

      for (const multiplier of CONTEXT_MULTIPLIERS) {
        const contextSize = contextExpansionStep * multiplier;

        // Expand around each line individually - close lines naturally overlap
        const expandedSet = new Set<number>();
        for (const line of contentLines) {
          const start = Math.max(0, line - contextSize);
          const end = Math.min(lines.length - 1, line + contextSize);
          for (let i = start; i <= end; i++) {
            expandedSet.add(i);
          }
        }
        const expandedLines = [...expandedSet].sort((a, b) => a - b);
        expandedSet.clear();  // Clear to prevent memory leaks

        // Include group title line if applicable (same logic as core)
        if (headingLine !== null && !expandedLines.includes(headingLine)) {
          expandedLines.unshift(headingLine);
        }

        // Mark core vs context lines for CSS styling
        const markLine = (text: string, lineNum: number): string => {
          if (contentLines.includes(lineNum)) {
            return text + '\u200B\u2061';  // Core marker
          }
          return text + '\u200B\u2060';  // Context marker
        };
        levels.push(normalizeIndentation(lines, expandedLines, markLine));
        levelLineNumbers.push([...expandedLines]);  // Store actual file line numbers
        expandedLines.length = 0;  // Clear to prevent memory leaks
      }
      result.lineNumbersExpanded.push([...levelLineNumbers]);  // Push copy to avoid reference issues
      levelLineNumbers.length = 0;  // Clear after pushing
      return levels;
    });

    // Track whether expansion is available (based on content lines, not heading)
    result.expandLevels = groupedLines.map((group, index) => {
      if (group.length === 0) return 0;
      const headingLine = getHeadingLine(index);
      const contentLines = headingLine !== null
        ? group.filter(line => line !== headingLine)
        : group;
      if (contentLines.length === 0) return 0;
      const minLine = Math.min(...contentLines);
      const maxLine = Math.max(...contentLines);
      return (minLine > 0 || maxLine < lines.length - 1) ? 3 : 0;
    });
  }

  // Clear the lines array to prevent memory leaks
  lines.length = 0;

  note = clearObjectReferences(note);

  return result;
}

/**
 * Groups lines of text into groups based on the selected grouping mode.
 * @param lines The lines of text to group.
 * @param result The search result containing line numbers to group
 * @param groupingMode The grouping mode to use
 * @returns A tuple containing:
 *          - An array of line number groups, where each group is consecutive lines or lines under the same heading
 *          - An array of heading line numbers corresponding to each group
 */
async function groupLines(lines: string[], result: GroupedResult, groupingMode: string): Promise<[number[][], number[]]> {
  // Group line numbers based on the selected mode
  let groupedLines: number[][] = [];
  let groupTitleLine: number[] = [];  // Line number of the title for each group

  if (groupingMode === 'consecutive') {
    // Original consecutive grouping logic
    let currentGroup: number[] = [];
    let previousLineNum = -2;
    result.lineNumbers[0].forEach((lineNumber, index) => {
      if (lineNumber === previousLineNum + 1) {
        currentGroup.push(lineNumber);
      } else {
        if (currentGroup.length) {
          groupedLines.push(currentGroup);
        }
        currentGroup = [lineNumber];
      }
      previousLineNum = lineNumber;
      if (index === result.lineNumbers[0].length - 1 && currentGroup.length) {
        groupedLines.push(currentGroup);
      }
    });

  } else if (groupingMode === 'heading') {
    // Group by heading - find the nearest heading above each line
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    let currentHeadingLine = -1;
    let currentGroup: number[] = [];

    for (const lineNumber of result.lineNumbers[0]) {
      // Check if current line is a heading
      const isHeading = headingRegex.test(lines[lineNumber]);

      // Find the nearest heading above this line
      let newHeadingLine = -1;
      for (let i = lineNumber - 1; i >= 0; i--) {
        if (headingRegex.test(lines[i])) {
          newHeadingLine = i;
          break;
        }
      }

      // If we found a new heading above or this is a heading, start a new group
      if (newHeadingLine !== currentHeadingLine || isHeading) {
        if (currentGroup.length) {
          groupedLines.push(currentGroup);
          groupTitleLine.push(currentHeadingLine);
        }
        currentGroup = [];
        // Set current heading to:
        // - The current line if it's a heading
        // - The heading above if found
        // - -1 if no heading found
        currentHeadingLine = isHeading ? lineNumber : (newHeadingLine !== -1 ? newHeadingLine : -1);
      }

      // Add line to current group
      currentGroup.push(lineNumber);
    }

    // Push the final group
    if (currentGroup.length) {
      groupedLines.push(currentGroup);
      groupTitleLine.push(currentHeadingLine);
    }

  } else if (groupingMode === 'item') {
    // Group by indentation - group lines that are indented under the first line
    // Special handling to keep code blocks intact and prevent splitting them across items

    let currentGroup: number[] = [];
    let baseIndent = -1;
    let lastLine = -1;
    let inCodeBlock = false;
    let codeBlockStartLine = -1;

    for (const lineNumber of result.lineNumbers[0]) {
      const line = lines[lineNumber];
      const match = REGEX.leadingWhitespace.exec(line);
      const indent = match ? match[1].length : 0;

      // Check for code block boundaries
      const isCodeBlockStart = REGEX.codeBlockStart.test(line);
      const isCodeBlockEnd = REGEX.codeBlockEnd.test(line);

      // Handle code block transitions
      if (isCodeBlockStart && !inCodeBlock) {
        inCodeBlock = true;
        codeBlockStartLine = lineNumber;
      } else if (isCodeBlockEnd && inCodeBlock) {
        inCodeBlock = false;
        // Force this line to be included in the current group to keep code block intact
        currentGroup.push(lineNumber);
        lastLine = lineNumber;
        continue;
      }

      // If we're inside a code block, always add to current group
      if (inCodeBlock) {
        // If this is the first line and we're starting a new group, set up the group
        if (currentGroup.length === 0) {
          currentGroup = [lineNumber];
          baseIndent = indent;
        } else {
          currentGroup.push(lineNumber);
        }
        lastLine = lineNumber;
        continue;
      }

      // Normal grouping logic for non-code-block lines
      // Start a new group if:
      // - This is the first line
      // - Current indent is less than or equal to base indent
      // - The line is not consecutive to the last line
      if (currentGroup.length === 0 || indent <= baseIndent || lineNumber > lastLine + 1) {
        if (currentGroup.length > 0) {
          groupedLines.push([...currentGroup]);
        }
        currentGroup = [lineNumber];
        baseIndent = indent;
      } else {
        // Add to current group if indented more than base
        currentGroup.push(lineNumber);
      }
      lastLine = lineNumber;
    }

    // Push final group
    if (currentGroup.length > 0) {
      groupedLines.push([...currentGroup]);
    }
  }

  return [groupedLines, groupTitleLine];
}

/**
 * Extracts unique tags per group from grouped line numbers
 * @param groupedLines Array of line number groups
 * @param db Note database
 * @param externalId Note ID
 * @param tagPrefix Tag prefix to remove
 * @returns Array of unique tags per group
 */
function extractTagsPerGroup(
  groupedLines: number[][],
  db: NoteDatabase,
  externalId: string,
  tagSettings: TagSettings
): string[][] {
  return groupedLines.map(group => {
    const uniqueTags: Set<string> = new Set();
    for (const lineNumber of group) {
      const lineTags = db.notes[externalId].getTagsAtLine(lineNumber);
      for (const tag of lineTags) {
        // Format tag (remove prefix, keep original format for accurate sorting)
        const formattedTag = (tag.startsWith(tagSettings.tagPrefix)
            ? tag.slice(tagSettings.tagPrefix.length) : tag)
          .toLowerCase();
        uniqueTags.add(formattedTag);
      }
    }
    const allTags = Array.from(uniqueTags);
    
    // Clear the Set after converting to array
    uniqueTags.clear();

    // Filter out parent tags (tags that have children) - same logic as kanban.ts
    const leafTags = allTags.filter(tag => 
      !allTags.some(t => t.startsWith(tag + '/') || t.startsWith(tag + tagSettings.valueDelim))
    );

    return sortTags(leafTags, tagSettings.valueDelim);
  });
}

/**
 * Normalizes the indentation of a group of lines in a note.
 * The goal is to remove the common leading whitespace from the lines,
 * while maintaining the hierarchy of nested items.
 * Some lines may be part of a nested item in the group,
 * and some may be nested under parents that are not in the group.
 * @param noteText The text of the note.
 * @param groupLines The lines to normalize.
 * @param lineTransformer Optional callback to transform each line before output.
 *                        Receives the normalized text and original line number.
 * @returns The normalized text.
*/
export function normalizeIndentation(
  noteText: string[],
  groupLines: number[],
  lineTransformer?: (text: string, lineNum: number) => string
): string {
    if (groupLines.length === 0) return '';

    let groupText: string[] = [];
    let parentLines: number[] = [];
    let parentIndent: number[] = [];
    let normalizedIndent: number[] = [];  // This array stores the *normalized* indentation for each parent line

    for (let i = Math.min(...groupLines); i <= Math.max(...groupLines); i++) {
      // Blank lines: include in output but don't affect hierarchy tracking
      if (!noteText[i] || noteText[i].trim() === '') {
        if (groupLines.includes(i)) {
          groupText.push('');
        }
        continue;
      }

      const lineIndentation = noteText[i].match(REGEX.leadingWhitespace)?.[0].length ?? 0;

      // Update indentation arrays
      while (parentIndent.length > 0 && lineIndentation <= parentIndent[parentIndent.length - 1]) {
        parentLines.pop();
        parentIndent.pop();
        normalizedIndent.pop();
      }

      // Calculate normalized indentation
      let currentNormalizedIndent = 0;
      if (parentIndent.length > 0) {
        // If we have a parent, our indentation is relative to it
        currentNormalizedIndent = normalizedIndent[normalizedIndent.length - 1] + 
          (lineIndentation - parentIndent[parentIndent.length - 1]);
      } else {
        // If no parent, this is a root level line
        currentNormalizedIndent = 0;
      }

      parentLines.push(i);
      parentIndent.push(lineIndentation);
      normalizedIndent.push(currentNormalizedIndent);

      if (!groupLines.includes(i)) {
        continue;
      }

      // Find the first parent that appears in the group
      let parent = -1;
      for (let j = parentLines.length - 2; j >= 0; j--) {
        if (groupLines.includes(parentLines[j])) {
          parent = j;
          break;
        }
      }

      // Update normalized indentation based on the found parent
      if (parent !== -1) {
        // If we found a parent in the group, update our normalized indentation
        normalizedIndent[normalizedIndent.length - 1] = normalizedIndent[parent] + 
          (lineIndentation - parentIndent[parent]);
      } else {
        // If no parent in the group, this is a root level line
        normalizedIndent[normalizedIndent.length - 1] = 0;
      }

      const sliceIndex = Math.max(0, lineIndentation - normalizedIndent[normalizedIndent.length - 1]);
      let text = noteText[i].slice(sliceIndex);
      // Apply optional line transformer
      if (lineTransformer) {
        text = lineTransformer(text, i);
      }
      groupText.push(text);
    }

    const result = groupText.join('\n');
    
    // Clear temporary arrays to prevent memory leaks
    groupText.length = 0;
    parentLines.length = 0;
    parentIndent.length = 0;
    normalizedIndent.length = 0;
    
    return result;
}

/**
 * Compares two tag arrays for a specific sort criterion
 * @param aTags First tag array
 * @param bTags Second tag array
 * @param sortBy Sort criterion
 * @param sortOrder Sort order (-1 for desc, 1 for asc)
 * @param tagSettings Tag settings for value delimiter
 * @returns Comparison result (-1, 0, 1)
 */
function compareTagArrays(
  aTags: string[],
  bTags: string[],
  sortBy: string,
  sortOrder: number,
  tagSettings: TagSettings
): number {
  // Find matching tags for sorting
  const aMatchingTags = aTags.filter(tag => 
    tag.startsWith(sortBy + '/') || tag.startsWith(sortBy + tagSettings.valueDelim)
  );
  const bMatchingTags = bTags.filter(tag => 
    tag.startsWith(sortBy + '/') || tag.startsWith(sortBy + tagSettings.valueDelim)
  );
  // For ascending order, use the first (smallest) tag; for descending, use the last (largest) tag
  const aTagValue = aMatchingTags.length > 0 
    ? (sortOrder === 1 ? aMatchingTags[0] : aMatchingTags[aMatchingTags.length - 1])
    : undefined;

  const bTagValue = bMatchingTags.length > 0 
    ? (sortOrder === 1 ? bMatchingTags[0] : bMatchingTags[bMatchingTags.length - 1])
    : undefined;

  // Handle missing tags - put them at the end regardless of sort order
  if (!aTagValue && !bTagValue) {
    return 0; // Both missing, treat as equal
  } else if (!aTagValue) {
    return 1; // a missing, always put at end
  } else if (!bTagValue) {
    return -1; // b missing, always put at end
  }

  // Both have values, proceed with normal comparison using utility function
  const result = compareTagValues(aTagValue, bTagValue, tagSettings.valueDelim) * sortOrder;
  return result;
}

/**
 * Sorts sections within a single result based on tag criteria
 * @param result The result whose sections to sort
 * @param sortByArray Array of sort criteria
 * @param sortOrderArray Array of sort orders
 * @param tagSettings Configuration for tag formatting
 */
function sortSectionsWithinResult(
  result: GroupedResult,
  sortByArray: string[],
  sortOrderArray: string[],
  tagSettings: TagSettings
): void {
  if (!result.tags || result.tags.length <= 1) return;

  // Create array of indices to sort
  const indices = Array.from({ length: result.tags.length }, (_, i) => i);

  indices.sort((aIndex, bIndex) => {
    for (let i = 0; i < sortByArray.length; i++) {
      const sortBy = sortByArray[i];
      const sortOrder = sortOrderArray?.[i]?.startsWith('d') ? -1 : 1;

      // Skip note-level sorting criteria for section sorting
      if (['created', 'modified', 'notebook', 'title'].includes(sortBy)) {
        continue;
      }

      // Sort sections by their text content
      if (sortBy === 'text') {
        const aText = result.text[aIndex] || '';
        const bText = result.text[bIndex] || '';
        const comparison = aText.localeCompare(bText) * sortOrder;
        if (comparison !== 0) return comparison;
        continue;
      }

      const aTags = result.tags[aIndex] || [];
      const bTags = result.tags[bIndex] || [];

      const comparison = compareTagArrays(aTags, bTags, sortBy, sortOrder, tagSettings);

      if (comparison !== 0) return comparison;
    }

    // Break ties using minimum line number
    const aMinLine = Math.min(...result.lineNumbers[aIndex]);
    const bMinLine = Math.min(...result.lineNumbers[bIndex]);
    return aMinLine - bMinLine;
  });

  // Reorder all arrays based on sorted indices
  const originalLineNumbers = [...result.lineNumbers];
  const originalText = [...result.text];
  const originalHtml = [...result.html];
  const originalTags = [...result.tags];
  const originalTextExpanded = result.textExpanded ? [...result.textExpanded] : null;
  const originalHtmlExpanded = result.htmlExpanded ? [...result.htmlExpanded] : null;
  const originalExpandLevels = result.expandLevels ? [...result.expandLevels] : null;
  const originalLineNumbersExpanded = result.lineNumbersExpanded ? [...result.lineNumbersExpanded] : null;

  indices.forEach((originalIndex, newIndex) => {
    result.lineNumbers[newIndex] = originalLineNumbers[originalIndex];
    result.text[newIndex] = originalText[originalIndex];
    result.html[newIndex] = originalHtml[originalIndex];
    result.tags[newIndex] = originalTags[originalIndex];
    if (originalTextExpanded) result.textExpanded[newIndex] = originalTextExpanded[originalIndex];
    if (originalHtmlExpanded) result.htmlExpanded[newIndex] = originalHtmlExpanded[originalIndex];
    if (originalExpandLevels) result.expandLevels[newIndex] = originalExpandLevels[originalIndex];
    if (originalLineNumbersExpanded) result.lineNumbersExpanded[newIndex] = originalLineNumbersExpanded[originalIndex];
  });

  // Clear temporary arrays to prevent memory leaks
  indices.length = 0;
  originalLineNumbers.length = 0;
  originalText.length = 0;
  originalHtml.length = 0;
  originalTags.length = 0;
  if (originalTextExpanded) originalTextExpanded.length = 0;
  if (originalHtmlExpanded) originalHtmlExpanded.length = 0;
  if (originalExpandLevels) originalExpandLevels.length = 0;
  if (originalLineNumbersExpanded) originalLineNumbersExpanded.length = 0;
}

/**
 * Sort search results based on the specified options with fallbacks to global settings
 * @param results - Array of grouped results to sort
 * @param options - Optional sorting options (query-specific overrides)
 * @param tagSettings - Tag processing settings
 * @param resultSettings - Global result settings for fallbacks
 * @returns Sorted array of results
 */
export function sortResults<T extends SortableItem>(
  results: T[], 
  options: { 
    sortBy?: string, 
    sortOrder?: string
  } | undefined,
  tagSettings: TagSettings,
  resultSettings: {
    resultSort: string,
    resultOrder: string
  }
): T[] {
  // Use query-specific options with fallbacks to global settings
  const effectiveSortBy = options?.sortBy || resultSettings.resultSort;
  const effectiveSortOrder = options?.sortOrder || resultSettings.resultOrder;

  const sortByArray = effectiveSortBy?.toLowerCase()
    .split(',')
    .map(s => s.trim())
    .map(s => s.startsWith(tagSettings.tagPrefix.toLowerCase())
      ? s.slice(tagSettings.tagPrefix.length) : s)
    .filter(s => s);

  const sortOrderArray = effectiveSortOrder?.toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(s => s);

  if (!sortByArray?.length) return results;
  
  // Sort sections within each result for custom tag sorting
  const isCustomTagSort = sortByArray.some(sortBy => 
    !['created', 'modified', 'notebook', 'title'].includes(sortBy)
  );
  if (isCustomTagSort) {
    results.forEach(result => {
      // Only sort sections if the result has text and html properties (is a GroupedResult)
      if ('text' in result && 'html' in result) {
        sortSectionsWithinResult(result as GroupedResult, sortByArray, sortOrderArray, tagSettings);
      }
    });
  }

  return results.sort((a, b) => {
    for (let i = 0; i < sortByArray.length; i++) {
      const sortBy = sortByArray[i];
      // Get corresponding sort order or default to 'asc'
      const sortOrder = sortOrderArray?.[i]?.startsWith('d') ? -1 : 1;

      let comparison = 0;

      if (sortBy === 'created') {
        comparison = (a.createdTime - b.createdTime) * sortOrder;
      } else if (sortBy === 'modified') {
        comparison = (a.updatedTime - b.updatedTime) * sortOrder;
      } else if (sortBy === 'notebook') {
        comparison = a.notebook.localeCompare(b.notebook) * sortOrder;
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title) * sortOrder;
      } else if (sortBy === 'text') {
        const aText = (a as any).text?.[0] ?? a.title;
        const bText = (b as any).text?.[0] ?? b.title;
        comparison = aText.localeCompare(bText) * sortOrder;
      } else if (a.tags && b.tags) {
        // For tag-based sorting, aggregate tags from all groups
        const aTags = a.tags ? sortTags(a.tags.flat(), tagSettings.valueDelim) : [];
        const bTags = b.tags ? sortTags(b.tags.flat(), tagSettings.valueDelim) : [];
        
        comparison = compareTagArrays(aTags, bTags, sortBy, sortOrder, tagSettings);
      } else {
        // Default to modified time if we don't have tags
        comparison = (a.updatedTime - b.updatedTime) * sortOrder;
      }

      if (comparison !== 0) {
        return comparison;
      }
    }

    // Break ties using minimum line number
    return (Math.min(...a.lineNumbers[0]) - Math.min(...b.lineNumbers[0]));
  });
}