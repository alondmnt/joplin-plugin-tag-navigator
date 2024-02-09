const tag_regex = /(?<=\s|\()#([^\s#]*\w)/g;

export function parseUniqueTags(text: string): string[] {
  const tagsMatch = text.toLowerCase().match(tag_regex)

  const uniqueTags = tagsMatch ? [...new Set(tagsMatch)] : [];

  return uniqueTags;
}

export function parseTagsLines(text: string): { tag: string, lines: number[], count: number, index: number }[] {
  const tags = parseUniqueTags(text);

  if (tags.length === 0) {
    return [];
  }

  // For each tag, list the lines it appears in
  const lines = text.toLocaleLowerCase().split('\n');
  const tagsLines = tags.map((tag) => {
    const tagLines: number[] = lines.reduce((acc, line, index) => {
      if (line.match(tag_regex)?.includes(tag)) {
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
