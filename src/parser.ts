import joplin from 'api';

const defTagRegex = /(?<=^|\s)#([^\s#]*\w)/g; // Matches tag names starting with #
const linkRegex = /\[([^\]]+)\]\(:\/([^\)]+)\)/g; // Matches [title](:/noteId)
const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId
const wikiLinkRegex = /\[\[([^\]]+)\]\]/g; // Matches [[name of note]]

type LinkExtract = { title: string; noteId?: string; line: number };

export async function getTagRegex(): Promise<RegExp> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  return userRegex ? new RegExp(userRegex, 'g') : defTagRegex;
}

export async function parseUniqueTags(text: string): Promise<string[]> {
  const tagsMatch = text.toLowerCase().match(await getTagRegex());
  let uniqueTags = tagsMatch ? [...new Set(tagsMatch)] : [];

  const excludeRegex = await joplin.settings.value('itags.excludeRegex');
  if (excludeRegex) {
    const excludeReg = new RegExp(excludeRegex, 'g');
    uniqueTags = uniqueTags.filter((tag) => !tag.match(excludeReg)) || [];
  }

  return uniqueTags;
}

export async function parseTagsLines(text: string, tagRegex: RegExp, ignoreCodeBlocks: boolean, inheritTags: boolean):
    Promise<{ tag: string, lines: number[], count: number, index: number }[]> {
  const tags = await parseUniqueTags(text);

  if (tags.length === 0) {
    return [];
  }

  // For each tag, list the lines it appears in
  // In an outline or indented text, each child item has all the tags of the parent items
  const lines = text.toLocaleLowerCase().split('\n');
  let inCodeBlock = false;
  let tagsLines = tags.map((tag) => {
    let tagLevel = -1;
    const tagLines: number[] = lines.reduce((acc, line, index) => {
      // skip blocks
      if (line.match('```')) {
        inCodeBlock = !inCodeBlock;
      }
      if (inCodeBlock && ignoreCodeBlocks) {
        return acc;
      }

      // remove tags from the stack
      const indentLevel = line.match(/^\s*/)[0].length;
      if (indentLevel <= tagLevel) {
        tagLevel = -1;
      }

      // add tag in line
      if (line.match(tagRegex)?.includes(tag)) {
        acc.push(index);
        if (tagLevel < 0) {
          tagLevel = indentLevel;
        }
        return acc;
      }

      // add all the tags from the higher levels
      if (inheritTags && tagLevel >= 0 && indentLevel > tagLevel) {
        acc.push(index);
      }

      return acc
    }, []);
    return { tag, lines: tagLines, count: tagLines.length, index: 0 };
  });

  // Remove tags that don't appear in the note
  tagsLines = tagsLines.filter((tagLine) => tagLine.count > 0);

  // Sort by the tag name
  tagsLines.sort((a, b) => a.tag.localeCompare(b.tag));

  // Sort by the number of appearances (most common tags first)
  tagsLines.sort((a, b) => b.count - a.count);

  return tagsLines;
}

export async function parseLinkLines(text: string): Promise<LinkExtract[]> {
    return new Promise((resolve) => {
        const lines = text.split('\n');
        const results: LinkExtract[] = [];

        lines.forEach((line, index) => {
            let match;
            // Extracting Markdown links
            while ((match = linkRegex.exec(line)) !== null) {
                results.push({
                    title: match[1],
                    noteId: match[2].match(noteIdRegex)?.[0],
                    line: index,
                });
            }
            // Resetting lastIndex since we are reusing the RegExp
            linkRegex.lastIndex = 0;

            // Extracting WikiLinks
            while ((match = wikiLinkRegex.exec(line)) !== null) {
                results.push({
                    title: match[1],
                    line: index,
                });
            }
            // Resetting lastIndex for the same reason
            wikiLinkRegex.lastIndex = 0;
        });

        resolve(results);
    });
}