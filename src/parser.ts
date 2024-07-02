import { resultsStart, resultsEnd, queryStart, queryEnd, TagSettings } from './settings';
import { format } from 'date-fns';

export const defTagRegex = /(?<=^|\s)#([^\s#'"]*\w)/g; // Matches tag names starting with #
const linkRegex = /\[([^\]]+)\]\(:\/([^\)]+)\)/g; // Matches [title](:/noteId)
const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId
const wikiLinkRegex = /\[\[([^\]]+)\]\]/g; // Matches [[name of note]]

type LinkExtract = { title: string; noteId?: string; line: number };

interface TagLineInfo {
  tag: string;
  lines: number[];
  count: number;
  index: number;
}

export async function parseTagsLines(text: string, tagSettings: TagSettings): Promise<TagLineInfo[]> {
  let inCodeBlock = false;
  let isResultBlock = false;
  let isQueryBlock = false;
  let tagsMap = new Map<string, { lines: Set<number>; count: number }>();
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
        for (let i = 1; i <= tagFamily.length; i++) {
          let child = tagFamily.slice(0, i).join('/');
          // Trim all separators from the end of the child
          child = child.replace(/\/+$/, '');
          if (child.length === 0) { continue; }
          if (uniqueSet.has(child)) { continue; }
          uniqueSet.add(child);

          if (!tagsMap.has(child)) {
            tagsMap.set(child, { lines: new Set<number>(), count: 0 });
          }
          // Set tag level
          if (!tagsLevel.has(child)) {
            tagsLevel.set(child, indentLevel);
          } else if (tagsLevel.get(child) < 0) {
            tagsLevel.set(child, indentLevel);
          }

          const tagInfo = tagsMap.get(child);
          tagInfo.lines.add(lineIndex);
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
  }));

  // Sort the result as needed
  tagsLines.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return tagsLines;
}

export function parseDateTag(tag: string, tagSettings: TagSettings): string {
  // Replace the today tag with the current date, including basic arithmetics support
  if (!tag) { return tag; }
  if (tag.startsWith(tagSettings.todayTag)) {
    // Get the increment
    const increment = tag.slice(tagSettings.todayTag.length);
    // Parse the increment
    let days = 0;
    if (increment) {
      days = parseInt(increment);
      if (isNaN(days)) {
        console.error(`Error while parsing date tag: ${tag}, ${increment}.`);
        days = 0;
      }
    }
    // Calculate the date
    const date = new Date();
    date.setDate(date.getDate() + days);
    try {
      return format(date, tagSettings.dateFormat);
    } catch (error) {
      console.error(`Error while parsing date tag: ${tag}, ${days}. Error: ${error}`);
      return tag;
    }
  }
  return tag;
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