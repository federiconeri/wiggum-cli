/**
 * JSON Repair Utility
 * Fixes common JSON syntax errors from AI responses
 */

/**
 * Attempt to repair malformed JSON from AI responses
 */
export function repairJson(text: string): string {
  let json = text;

  // Remove any leading/trailing whitespace
  json = json.trim();

  // Remove trailing commas before ] or }
  json = json.replace(/,(\s*[\]}])/g, '$1');

  // Fix missing commas between array elements or object properties
  // Pattern: value followed by newline and another value without comma
  json = json.replace(/("|\d|true|false|null|\]|\})(\s*\n\s*)("|\[|\{)/g, '$1,$2$3');

  // Fix single quotes to double quotes (but not inside strings)
  // This is a simplified approach - may not work for all cases
  json = json.replace(/'/g, '"');

  // Remove JavaScript-style comments
  json = json.replace(/\/\/.*$/gm, '');
  json = json.replace(/\/\*[\s\S]*?\*\//g, '');

  // Fix unquoted keys (simple cases)
  json = json.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Remove any text before the first { or [
  const firstBrace = json.indexOf('{');
  const firstBracket = json.indexOf('[');
  let startIndex = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex > 0) {
    json = json.substring(startIndex);
  }

  // Remove any text after the last } or ]
  const lastBrace = json.lastIndexOf('}');
  const lastBracket = json.lastIndexOf(']');
  let endIndex = -1;

  if (lastBrace !== -1 && lastBracket !== -1) {
    endIndex = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    endIndex = lastBrace;
  } else if (lastBracket !== -1) {
    endIndex = lastBracket;
  }

  if (endIndex !== -1 && endIndex < json.length - 1) {
    json = json.substring(0, endIndex + 1);
  }

  return json;
}

/**
 * Parse JSON with repair attempts
 * Tries to fix common issues before parsing
 */
export function parseJsonSafe<T>(text: string): T | null {
  // First try parsing as-is
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try with repairs
  }

  // Try repairing the JSON
  try {
    const repaired = repairJson(text);
    return JSON.parse(repaired) as T;
  } catch {
    // Repair failed
  }

  // Last resort: try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const repaired = repairJson(jsonMatch[1]);
      return JSON.parse(repaired) as T;
    } catch {
      // Still failed
    }
  }

  // Try finding a JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const repaired = repairJson(objectMatch[0]);
      return JSON.parse(repaired) as T;
    } catch {
      // Still failed
    }
  }

  return null;
}
