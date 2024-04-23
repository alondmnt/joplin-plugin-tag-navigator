import joplin from 'api';
import { resultsStart, resultsEnd } from './search';

const defTagRegex = /(?<=^|\s)#([^\s#]*\w)/g; // Matches tag names starting with #
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

export async function getTagRegex(): Promise<RegExp> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  return userRegex ? new RegExp(userRegex, 'g') : defTagRegex;
}

export async function parseTagsLines(text: string, tagRegex: RegExp, ignoreCodeBlocks: boolean, inheritTags: boolean): Promise<TagLineInfo[]> {
  let inCodeBlock = false;
  let isResultBlock = false;
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
    // Skip code blocks if needed
    if ((inCodeBlock && ignoreCodeBlocks) || isResultBlock) {
      return;
    }

    const indentLevel = line.match(/^\s*/)[0].length;
    // Go over all tagsLevel
    tagsLevel.forEach((level, tag) => {
      if (indentLevel <= level) {
        // We're above the level where the tag was found, reset it
        tagsLevel.set(tag, -1);
      } else if (inheritTags && level >= 0) {
        // Add the line to the tag
        tagsMap.get(tag).lines.add(lineIndex);
      }
    });

    const matches = line.match(tagRegex);
    if (matches) {
      matches.forEach((tag) => {
        if (!tagsMap.has(tag)) {
          tagsMap.set(tag, { lines: new Set<number>(), count: 0 });
        }
        // Set tag level
        if (!tagsLevel.has(tag)) {
          tagsLevel.set(tag, indentLevel);
        } else if (tagsLevel.get(tag) < 0) {
          tagsLevel.set(tag, indentLevel);
        }

        const tagInfo = tagsMap.get(tag);
        tagInfo.lines.add(lineIndex);
        tagInfo.count++;
        tagsMap.set(tag, tagInfo);
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

export async function parseLinkLines(text: string, ignoreCodeBlocks: boolean, inheritTags: boolean): Promise<LinkExtract[]> {
  const lines = text.split('\n');
  const results: LinkExtract[] = [];
  let linkLevel = new Map<string, number>();
  let inCodeBlock = false;

  lines.forEach((line, index) => {
    // Toggle code block status
    if (line.match('```')) {
      inCodeBlock = !inCodeBlock;
    }
    // Skip code blocks if needed
    if (inCodeBlock && ignoreCodeBlocks) {
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