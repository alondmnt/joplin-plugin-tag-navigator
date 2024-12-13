import { resultsStart, resultsEnd, queryStart, queryEnd, TagSettings } from './settings';
import { format } from 'date-fns';

export const defTagRegex = /(?<=^|\s)#([^\s#'"]*\w)/g; // Matches tag names starting with #
const linkRegex = /\[([^\]]+)\]\(:\/([^\)]+)\)/g; // Matches [title](:/noteId)
export const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId
const wikiLinkRegex = /\[\[([^\]]+)\]\]/g; // Matches [[name of note]]

type LinkExtract = { title: string; noteId?: string; line: number };

export interface TagLineInfo {
  tag: string;
  lines: number[];
  count: number;
  index: number;
  parent: boolean;  // first parent
  child: boolean;  // last child
}

export async function parseTagsLines(text: string, tagSettings: TagSettings): Promise<TagLineInfo[]> {
  let inCodeBlock = false;
  let isResultBlock = false;
  let isQueryBlock = false;
  let tagsMap = new Map<string, { lines: Set<number>; count: number; parent: boolean, child: boolean }>();
  let tagsLevel = new Map<string, number>();
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

    const indentLevel = line.match(/^\s*/)[0].length;
    // Go over all tagsLevel
    tagsLevel.forEach((level, tag) => {
      if (indentLevel <= level) {
        // We're above the level where the tag was found, reset it
        tagsLevel.set(tag, -1);
      } else if (tagSettings.inheritTags && level >= 0) {
        // Add the line to the tag
        tagsMap.get(tag).lines.add(lineIndex);
      }
    });

    const tagMatches = line.match(tagSettings.tagRegex);
    if (tagMatches) {
      tagMatches.forEach((tag) => {
        if (tagSettings.excludeRegex && tag.match(tagSettings.excludeRegex)) {
          return;
        }
        // Replace the today tag with the current date
        tag = parseDateTag(tag, tagSettings);  // Should probably go here and not inside the loop

        let tagFamily: string[];
        if (tagSettings.nestedTags) {
          tagFamily = tag.split('/');  // Split #parent/child into nested parts
        } else {
          tagFamily = [tag];
        }
        const uniqueSet = new Set<string>();
        let isParent = true;
        for (let i = 1; i <= tagFamily.length; i++) {
          let child = tagFamily.slice(0, i).join('/');
          // Trim all separators from the end of the child
          child = child.replace(/\/+$/, '');
          if (child.length === 0) { continue; }
          if (uniqueSet.has(child)) { continue; }
          uniqueSet.add(child);

          if (!tagsMap.has(child)) {
            tagsMap.set(child, {
              lines: new Set<number>(),
              count: 0,
              parent: isParent,  // first parent
              child: i === tagFamily.length,  // last child
            });
          }
          isParent = false;
          // Set tag level
          if (!tagsLevel.has(child)) {
            tagsLevel.set(child, indentLevel);
          } else if (tagsLevel.get(child) < 0) {
            tagsLevel.set(child, indentLevel);
          }

          const tagInfo = tagsMap.get(child);
          tagInfo.lines.add(lineIndex);
          if (i === tagFamily.length && !tagInfo.child) {
            // Ensure that the last child is marked as such
            tagInfo.child = true;
          }
          tagInfo.count++;
          tagsMap.set(child, tagInfo);
        }
      });
    }
  });

  // Convert Map to array structure
  let tagsLines: TagLineInfo[] = Array.from(tagsMap.keys()).map((tag) => ({
    tag: tag,
    lines: Array.from(tagsMap.get(tag).lines),
    count: tagsMap.get(tag).count,
    index: 0,
    parent: tagsMap.get(tag).parent,
    child: tagsMap.get(tag).child,
  }));

  // Sort the result as needed
  tagsLines.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return tagsLines;
}

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

interface FrontMatter {
  [key: string]: string | string[] | number | boolean | null;
}

// Add new interface for the return type
interface FrontMatterResult {
  data: FrontMatter | null;
  lineCount: number;
}

export function parseFrontMatter(text: string): FrontMatterResult {
  // Extract front matter between --- markers
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: null, lineCount: 0 };

  const result: FrontMatter = {};
  const lines = match[1].split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) continue;

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
      } catch {
        // Fallback to simple splitting if JSON parse fails
        result[currentKey] = value.slice(1, -1).split(',').map(item => 
          item.trim().replace(/^["']|["']$/g, '')
        );
      }
      currentKey = null;
    } else if (unquotedValue === 'true') {
      result[currentKey] = true;
      currentKey = null;
    } else if (unquotedValue === 'false') {
      result[currentKey] = false;
      currentKey = null;
    } else if (!isNaN(Number(unquotedValue)) && unquotedValue.trim() !== '') {
      result[currentKey] = Number(unquotedValue);
      currentKey = null;
    } else if (unquotedValue.trim() !== '') {
      result[currentKey] = unquotedValue;
      currentKey = null;
    }
    // If value is empty, keep currentKey for potential following list items
  }

  // Handle any remaining array items
  if (currentKey && currentArray.length > 0) {
    result[currentKey] = currentArray;
  }

  return { 
    data: result,
    lineCount: lines.length + 2,
  };
}

export function parseTagsFromFrontMatter(
  text: string, 
  tagSettings: TagSettings
): TagLineInfo[] {
  const frontMatter = parseFrontMatter(text);
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
        `${tagSettings.tagPrefix}${String(tag).replace(/\s+/g, tagSettings.spaceReplace)}`
      ));
    } else {
      // For other keys, create nested tags and replace spaces in both key and value
      const safeKey = key.replace(/\s+/g, tagSettings.spaceReplace);
      tags.push(...valueArray.map(val =>
        `${tagSettings.tagPrefix}${safeKey}/${String(val).replace(/\s+/g, tagSettings.spaceReplace)}`
      ));
    }
  }
  tags.push(tagSettings.tagPrefix + 'frontmatter');

  // For each tag, split nested tags, and build all intermediate tags
  const nestedTags: string[] = [];
  if (tagSettings.nestedTags) {
    for (const tag of tags) {
      const parts = tag.split('/');
      for (let i = 1; i < parts.length; i++) {
        nestedTags.push(parts.slice(0, i).join('/'));
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
    parent: !tag.includes('/'),
    child: tags.includes(tag)
  }));
}