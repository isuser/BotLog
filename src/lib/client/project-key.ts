/** Project keys: 2 to 4 letters or digits, starting with a letter (matches the database). */
export const PROJECT_KEY_PATTERN = "[A-Za-z][A-Za-z0-9]{1,3}";
export const PROJECT_KEY_MAX = 4;

/**
 * Suggests a key from a project name: initials for several words ("Mobile App" → MA), the
 * first three letters for one word ("Botlog" → BOT). Empty if no valid key can be made.
 */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  const key = raw.replace(/^[0-9]+/, "").slice(0, PROJECT_KEY_MAX);
  return new RegExp(`^${PROJECT_KEY_PATTERN}$`).test(key) ? key : "";
}
