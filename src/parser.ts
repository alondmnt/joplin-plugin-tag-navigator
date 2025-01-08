import { resultsStart, resultsEnd, queryStart, queryEnd, TagSettings } from './settings';
import { format } from 'date-fns';
import { load as yamlLoad } from 'js-yaml';

/**
 * Regular expressions for parsing different elements
 */
export const defTagRegex = /(?<=^|\s)#([^\s#'"]*\w)/g; // Matches tag names starting with #
const linkRegex = /\[([^\]]+)\]\(:\/([^\)]+)\)/g; // Matches [title](:/noteId)
export const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId
const wikiLinkRegex = /\[\[([^\]]+)\]\]/g; // Matches [[name of note]]

/**
 * Represents extracted link information
 */
type LinkExtract = { 
  title: string; 
  noteId?: string; 
  line: number 
};

/**
 * Information about a tag's occurrence and relationships
 */
export interface TagLineInfo {
  tag: string;
  lines: number[];
  count: number;
  index: number;
}

/**
 * Parses tags and their line numbers from text content
 * @param text The text content to parse
 * @param tagSettings Configuration for tag parsing
 * @returns Array of tag information including line numbers and relationships
 */
export async function parseTagsLines(text: string, tagSettings: TagSettings): Promise<TagLineInfo[]> {
  let inCodeBlock = false;
  let isResultBlock = false;
  let isQueryBlock = false;
  let tagsMap = new Map<string, { lines: Set<number>; count: number }>();
  let tagsLevel = new Map<string, number>();
  let tagsHeading = new Map<string, number>();
  const lines = text.toLocaleLowerCase().split('\n');

  lines.forEach((line, lineIndex) => {
    // Toggle code block status
    if (line.match('```')) {
      inCodeBlock = !inCodeBlock;
    }
    if (line.match(resultsStart)) {
      isResultBlock = true;
    }
    if (line.match(resultsEnd)) {
      isResultBlock = false;
    }
    if (line.match(queryStart)) {
      isQueryBlock = true;
    }
    if (line.match(queryEnd)) {
      isQueryBlock = false;
    }
    const isEmptyLine = line.match(/^\s*$/);  // if we skip an empty line this means that inheritance isn't broken
    // Skip code blocks if needed
    if ((inCodeBlock && tagSettings.ignoreCodeBlocks) || isResultBlock || isQueryBlock || isEmptyLine) {
      return;
    }

    // Keep tab on whether the tag contains any tags (inherited or explicit)
    let lineIsTagged = false;

    // Inherit tags from smaller indentation levels
    const indentLevel = line.match(/^\s*/)[0].length;
    tagsLevel.forEach((level, tag) => {
      if (indentLevel <= level) {
        // We're above the level where the tag was found, reset it
        tagsLevel.set(tag, -1);
      } else if (tagSettings.inheritTags && level >= 0) {
        // Add the current line to the tag
        tagsMap.get(tag).lines.add(lineIndex);
        lineIsTagged = true;
      }
    });

    // Inherit tags from headings
    const headingLevel = line.match(/^#+/)?.[0].length || 0;
    if (tagSettings.inheritTags && headingLevel > 0) {
      // Reset all tags that have a heading level higher than the current heading level
      // e.g., when going from ### (level 3) to ## (level 2), clear level 3 tags
      tagsHeading.forEach((level, tag) => {
        if (level >= headingLevel) {
          tagsHeading.set(tag, -1);  // -1 indicates tag is no longer active
        }
      });
    }

    const tagMatches = line.match(tagSettings.tagRegex);
    if (tagMatches) {
      tagMatches.forEach((tag) => {
        if (tagSettings.excludeRegex && tag.match(tagSettings.excludeRegex)) {
          return;
        }
        // Replace the today tag with the current date
        tag = parseDateTag(tag, tagSettings);  // Should probably go here and not inside the loop

        let tagFamily: string[];
        let nValues = 0;
        if (tagSettings.nestedTags) {
          const value = tag.split(tagSettings.valueDelim, 1);  // Split #parent/child=value into key-value parts
          tagFamily = value[0].split('/');  // Split #parent/child into nested parts
          nValues = value.length - 1;
        } else {
          tagFamily = [tag];
        }
        const uniqueSet = new Set<string>();
        for (let i = 1; i <= tagFamily.length + nValues; i++) {
          let child = '';
          if (i <= tagFamily.length) {
            child = tagFamily.slice(0, i).join('/');
          } else {
            child = tag;
          }
          // Trim all separators from the end of the child
          child = child.replace(/\/+$/, '');
          if (child.length === 0) { continue; }
          if (uniqueSet.has(child)) { continue; }
          uniqueSet.add(child);

          if (!tagsMap.has(child)) {
            tagsMap.set(child, {
              lines: new Set<number>(),
              count: 0,
            });
          }
          // Set tag level
          if (!tagsLevel.has(child)) {
            tagsLevel.set(child, indentLevel);
          } else if (tagsLevel.get(child) < 0) {
            tagsLevel.set(child, indentLevel);
          }

          // Set tags found in current heading
          if (tagSettings.inheritTags && headingLevel > 0) {
            if (!tagsHeading.has(child)) {
              tagsHeading.set(child, headingLevel);
            } else if (tagsHeading.get(child) === -1) {
              // Reactivate tag at current heading level
              tagsHeading.set(child, headingLevel);
            } else if (tagsHeading.get(child) > headingLevel) {
              // Keep the smallest heading level since h1 (level 1) is higher in hierarchy than h2 (level 2)
              tagsHeading.set(child, headingLevel);
            }
          }

          const tagInfo = tagsMap.get(child);
          tagInfo.lines.add(lineIndex);
          tagInfo.count++;
          tagsMap.set(child, tagInfo);
          lineIsTagged = true;
        }
      });
    }

    if (lineIsTagged) {
      // Add tags from all active heading levels to the current line
      for (const [tag, level] of tagsHeading.entries()) {
        if (level > -1) {
          const tagInfo = tagsMap.get(tag);
          if (tagInfo) {
            tagInfo.lines.add(lineIndex);
          }
        }
      }
    }
  });

  // Convert Map to array structure
  let tagsLines: TagLineInfo[] = Array.from(tagsMap.keys()).map((tag) => ({
    tag: tag,
    lines: Array.from(tagsMap.get(tag).lines),
    count: tagsMap.get(tag).count,
    index: 0,
  }));

  // Sort the result as needed
  tagsLines.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return tagsLines;
}

/**
 * Processes a date tag according to settings
 * @param tag The tag to process
 * @param tagSettings Configuration for tag processing
 * @returns Processed tag string with date calculations applied
 */
export function parseDateTag(tag: string, tagSettings: TagSettings): string {
  // Replace the today tag with the current date, including basic arithmetic support
  if (!tag) { return tag; }

  const escapedTodayTag = tagSettings.todayTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const todayTagPattern = new RegExp(`(${escapedTodayTag})([+-]?\\d*)`, 'g');

  return tag.replace(todayTagPattern, (match, todayTag, increment) => {
    // Default increment is 0 if not provided
    let days = 0;
    if (increment) {
      days = parseInt(increment, 10);
      if (isNaN(days)) {
        console.error(`Error while parsing date tag: ${tag}, ${increment}.`);
        return match; // Return the matched portion on error
      }
    }

    // Calculate the date
    const date = new Date();
    date.setDate(date.getDate() + days);

    try {
      return format(date, tagSettings.dateFormat);
    } catch (error) {
      console.error(`Error while formatting date: ${tag}, ${days}. Error: ${error}`);
      return match; // Return the matched portion on error
    }
  });
}

/**
 * Parses links and their line numbers from text content
 * @param text The text content to parse
 * @param ignoreCodeBlocks Whether to ignore links in code blocks
 * @param inheritTags Whether to inherit links from parent levels
 * @returns Array of extracted link information
 */
export async function parseLinkLines(text: string, ignoreCodeBlocks: boolean, inheritTags: boolean): Promise<LinkExtract[]> {
  const lines = text.split('\n');
  const results: LinkExtract[] = [];
  let linkLevel = new Map<string, number>();
  let inCodeBlock = false;
  let isResultBlock = false;
  let isQueryBlock = false;

  lines.forEach((line, index) => {
    // Toggle code block status
    if (line.match('```')) {
      inCodeBlock = !inCodeBlock;
    }
    if (line.match(resultsStart)) {
      isResultBlock = true;
    }
    if (line.match(resultsEnd)) {
      isResultBlock = false;
    }
    if (line.match(queryStart)) {
      isQueryBlock = true;
    }
    if (line.match(queryEnd)) {
      isQueryBlock = false;
    }
    const emptyLine = line.match(/^\s*$/);  // if we skip an empty line this means that inheritance isn't broken
    // Skip code blocks if needed
    if ((inCodeBlock && ignoreCodeBlocks) || isResultBlock || isQueryBlock || emptyLine) {
      return;
    }

    const indentLevel = line.match(/^\s*/)[0].length;
    // Go over all linkLevel
    linkLevel.forEach((level, key) => {
      if (indentLevel <= level) {
        // We're above the level where the link was found, reset it
        linkLevel.set(key, -1);
      } else if (inheritTags && level >= 0) {
        // Add the line to the link
        const result = JSON.parse(key);
        results.push({
          title: result.title,
          noteId: result.noteId,
          line: index,
        });
      }
    });

    let match: RegExpExecArray;
    // Extracting Markdown links
    while ((match = linkRegex.exec(line)) !== null) {
      results.push({
          title: match[1],
          noteId: match[2].match(noteIdRegex)?.[0],
          line: index,
      });

      // Set link level
      const key = JSON.stringify({ title: match[1], noteId: match[2].match(noteIdRegex)?.[0] });
      if (!linkLevel.has(key)) {
        linkLevel.set(key, indentLevel);
      } else if (linkLevel.get(key) < 0) {
        linkLevel.set(key, indentLevel);
      }
    }
    // Resetting lastIndex since we are reusing the RegExp
    linkRegex.lastIndex = 0;

    // Extracting WikiLinks
    while ((match = wikiLinkRegex.exec(line)) !== null) {
      results.push({
          title: match[1],
          line: index,
      });

      // Set link level
      const key = JSON.stringify({ title: match[1] });
      if (!linkLevel.has(key)) {
        linkLevel.set(key, indentLevel);
      } else if (linkLevel.get(key) < 0) {
        linkLevel.set(key, indentLevel);
      }
    }
    // Resetting lastIndex for the same reason
    wikiLinkRegex.lastIndex = 0;
  });

  return results;
}

/**
 * Front matter key-value pairs
 */
interface FrontMatter {
  [key: string]: string | string[] | number | boolean | null;
}

/**
 * Error information for front matter parsing
 */
interface ParseError {
  message: string;
  line?: number;
  value?: string;
}

/**
 * Result of front matter parsing
 */
interface FrontMatterResult {
  data: FrontMatter | null;
  lineCount: number;
  errors?: ParseError[];
}

/**
 * Parses front matter from text content
 * @param text The text content to parse
 * @returns Parsed front matter data, line count, and any parsing errors
 */
export function parseFrontMatter(text: string): FrontMatterResult {
  // Validate front matter format
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {
      data: null,
      lineCount: 0,
      errors: undefined
    };
  }

  const yamlContent = match[1];

  try {
    // Try parsing with js-yaml first
    const data = yamlLoad(yamlContent) as FrontMatter;
    return {
      data: data || null,
      lineCount: yamlContent.split('\n').length + 2,
      errors: undefined
    };
  } catch (e) {
    // Use the in-house parser as fallback
    return parseFrontMatterFallback(text);
  }
}

/**
 * Fallback in-house parser for front matter
 * @param text The text content to parse
 * @returns Parsed front matter data, line count, and any parsing errors
 */
function parseFrontMatterFallback(text: string): FrontMatterResult {
  const errors: ParseError[] = [];
  
  // Validate front matter format
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {
      data: null,
      lineCount: 0,
      errors: undefined
    };
  }

  const result: FrontMatter = {};
  const lines = match[1].split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) continue;

      // Check for invalid indentation
      const indent = line.match(/^\s*/)[0];
      if (indent.includes('\t')) {
        errors.push({
          message: 'Tabs are not allowed for indentation',
          line: i + 1
        });
      }

      // Check if line starts with a dash (list item)
      if (line.trim().startsWith('- ')) {
        if (currentKey) {
          currentArray.push(line.trim().slice(2));
        }
        continue;
      }

      // If we were collecting array items, save them before moving to new key
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = currentArray;
        currentArray = [];
      }

      // Split on first colon
      const [key, ...valueParts] = line.split(':');
      if (!key) continue;

      currentKey = key.trim();
      const value = valueParts.join(':').trim();

      // Remove surrounding quotes if present
      const unquotedValue = value.replace(/^["']|["']$/g, '');

      if (value.startsWith('[') && value.endsWith(']')) {
        // JSON-style array
        try {
          result[currentKey] = JSON.parse(value.replace(/'/g, '"'));
        } catch (e) {
          // Fallback to simple splitting if JSON parse fails
          result[currentKey] = value.slice(1, -1).split(',').map(item => 
            item.trim().replace(/^["']|["']$/g, '')
          );
        }
      } else if (unquotedValue === 'true') {
        result[currentKey] = true;
        currentKey = null;
      } else if (unquotedValue === 'false') {
        result[currentKey] = false;
        currentKey = null;
      } else if (!isNaN(Number(unquotedValue)) && unquotedValue.trim() !== '') {
        const num = Number(unquotedValue);
        if (!Number.isSafeInteger(num) && !Number.isFinite(num)) {
          errors.push({
            message: 'Number value is outside safe range',
            line: i + 1,
            value: unquotedValue
          });
        }
        result[currentKey] = num;
        currentKey = null;
      } else if (unquotedValue.trim() !== '') {
        result[currentKey] = unquotedValue;
        currentKey = null;
      }
      // If value is empty, keep currentKey for potential following list items
    } catch (e) {
      errors.push({
        message: `Parsing error: ${e.message}`,
        line: i + 1,
        value: line
      });
    }
  }

  // Validate the final structure
  if (currentKey && currentArray.length > 0) {
    try {
      result[currentKey] = currentArray;
    } catch (e) {
      errors.push({
        message: `Error finalizing array for key "${currentKey}": ${e.message}`,
        value: currentArray.join(', ')
      });
    }
  }

  return { 
    data: Object.keys(result).length > 0 ? result : null,
    lineCount: lines.length + 2,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Extracts tags from front matter content
 * @param text The text content containing front matter
 * @param tagSettings Configuration for tag processing
 * @returns Array of tag information from front matter
 */
export function parseTagsFromFrontMatter(
  text: string, 
  tagSettings: TagSettings
): TagLineInfo[] {
  const frontMatter = parseFrontMatter(text);
  if (frontMatter.errors) {
    console.warn('Front matter parsed with warnings:', frontMatter.errors);
  }
  if (!frontMatter.data || tagSettings.ignoreFrontMatter) return [];

  const tags: string[] = [];

  for (const [key, value] of Object.entries(frontMatter.data)) {
    // Skip null/undefined values 
    if (value == null) continue;

    // Convert to array if not already
    const valueArray = Array.isArray(value) ? value : [value];

    // Process based on key
    if (key.toLowerCase() === 'tags') {
      // For "tags" key, simply prefix each item and replace spaces
      tags.push(...valueArray.map(tag =>
        tagSettings.tagRegex.test(String(tag)) 
          ? String(tag).toLowerCase() 
          : `${tagSettings.tagPrefix}${String(tag).replace(/\s+/g, tagSettings.spaceReplace).toLowerCase()}`
      ));
    } else {
      // For other keys, create nested tags and replace spaces in both key and value
      const safeKey = key.replace(/\s+/g, tagSettings.spaceReplace).toLowerCase();
      tags.push(...valueArray.map(val =>
        `${tagSettings.tagPrefix}${safeKey}${tagSettings.valueDelim}${String(val).replace(/\s+/g, tagSettings.spaceReplace).toLowerCase()}`
      ));
    }
  }
  tags.push(tagSettings.tagPrefix + 'frontmatter');

  // For each tag, split nested tags, and build all intermediate tags
  const nestedTags: string[] = [];
  if (tagSettings.nestedTags) {
    for (const tag of tags) {
      const value = tag.split(tagSettings.valueDelim, 1);
      const parts = value[0].split('/');
      for (let i = 1; i <= parts.length; i++) {
        nestedTags.push(parts.slice(0, i).join('/'));
      }
      if (value[1]) {
        nestedTags.push(tag);
      }
    }
  }

  // Keep unique front matter tags, as they all point to the same lines
  const allTags = [...new Set([...tags, ...nestedTags])];
  const lines = Array.from({ length: frontMatter.lineCount }, (_, i) => i);

  // Convert to TagLineInfo[]
  return allTags.map((tag, index) => ({
    tag,
    lines,
    count: 1,
    index: 0,
  }));
}