import joplin from 'api';

const defTagRegex = /(?<=^|\s)#([^\s#]*\w)/g;

export async function parseUniqueTags(text: string): Promise<string[]> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  let tagRegex = defTagRegex;
  if (userRegex) {
    tagRegex = new RegExp(userRegex, 'g');
  }

  const tagsMatch = text.toLowerCase().match(tagRegex);
  let uniqueTags = tagsMatch ? [...new Set(tagsMatch)] : [];

  const excludeRegex = await joplin.settings.value('itags.excludeRegex');
  if (excludeRegex) {
    const excludeReg = new RegExp(excludeRegex, 'g');
    uniqueTags = uniqueTags.filter((tag) => !tag.match(excludeReg)) || [];
  }

  return uniqueTags;
}

export async function parseTagsLines(text: string): Promise<{ tag: string, lines: number[], count: number, index: number }[]> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  let tagRegex = defTagRegex;
  if (userRegex) {
    tagRegex = new RegExp(userRegex, 'g');
  }

  const tags = await parseUniqueTags(text);

  if (tags.length === 0) {
    return [];
  }

  // For each tag, list the lines it appears in
  const lines = text.toLocaleLowerCase().split('\n');
  const tagsLines = tags.map((tag) => {
    const tagLines: number[] = lines.reduce((acc, line, index) => {
      if (line.match(tagRegex)?.includes(tag)) {
        acc.push(index);
      }
      return acc;
    }, []);
    return { tag, lines: tagLines, count: tagLines.length, index: 0 };
  });

  // Sort by the tag name
  tagsLines.sort((a, b) => a.tag.localeCompare(b.tag));

  // Sort by the number of appearances (most common tags first)
  tagsLines.sort((a, b) => b.count - a.count);

  return tagsLines;
}
