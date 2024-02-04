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
