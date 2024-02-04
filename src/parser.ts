export function parseUniqueTags(text: string): string[] {
  // Step 1: Remove Markdown links
  const noLinksText = text.replace(/\[.*?\]\(.*?\)/g, '');

  // Step 2: Parse tags
  const tagsMatch = noLinksText.match(/#([^\s^#]*[\w]+)/g)?.map((tag) => 
    tag.replace('#', '').toLowerCase()
  );

  // Step 3: Ensure tags are unique by converting the array of tags to a Set
  const uniqueTags = tagsMatch ? [...new Set(tagsMatch)] : [];

  return uniqueTags;
}

export function parseTagsLines(text: string): { tag: string, lines: number[], count: number }[] {
  const tags = parseUniqueTags(text);

  if (tags.length === 0) {
    return [];
  }

  const noLinksText = text.replace(/\[.*?\]\(.*?\)/g, '');

  // For each tag, list the lines it appears in
  const lines = noLinksText.split('\n');
  const tagsLines = tags.map((tag) => {
    const tagLines: number[] = lines.reduce((acc, line, index) => {
      if (line.toLowerCase().includes(`#${tag}`)) {
        acc.push(index);
      }
      return acc;
    }, []);
    return { tag, lines: tagLines, count: tagLines.length};
  });

  // Sort by the tag name
  tagsLines.sort((a, b) => a.tag.localeCompare(b.tag));

  // Sort by the number of appearances (most common tags first)
  tagsLines.sort((a, b) => b.count - a.count);

  return tagsLines;
}
