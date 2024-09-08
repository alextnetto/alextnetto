export const extractMetadata = (
  fileContent: string
): {
  data: Record<string, string>;
  content: string;
} => {
  const metadataRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = fileContent.match(metadataRegex);

  if (match) {
    const [, metadataStr, content] = match;
    const data: Record<string, string> = {};

    metadataStr.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        data[key.trim()] = valueParts.join(":").trim();
      }
    });

    return { data, content: content.trim() };
  }

  // If no metadata is found, return the entire content
  return { data: {}, content: fileContent.trim() };
};
