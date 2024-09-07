import * as fs from "fs";
import * as path from "path";

export const readMarkdownFile = (filePath: string): string => {
  try {
    const fullPath = path.resolve(filePath);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    return fileContents;
  } catch (error) {
    console.error("Error reading file:", error);
    return "";
  }
};
