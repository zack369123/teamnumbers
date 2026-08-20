/**
 * @typedef {{ id: number, name: string, number: string }} Player
 */

/** @param {string} value */
const cleanName = (value) => value.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 18);

/**
 * Accepts the two shapes people actually paste: a bare run of numbers
 * ("0, 1, 2, 3, 10, 88") and a line-per-player list ("SMITH, 12"). Any chunk with
 * no letters in it is treated as numbers, so a pure number list is never swallowed
 * into a single name field. Repeats are preserved — two 21s means two prints.
 *
 * @param {string} text
 * @returns {Player[]}
 */
export const parseRoster = (text) => {
  /** @type {{ name: string, number: string }[]} */
  const entries = [];

  /** @param {string} chunk */
  const pushNumbers = (chunk) => {
    for (const digits of chunk.split(/[^0-9]+/).filter(Boolean)) {
      entries.push({ name: "", number: digits.slice(0, 3) });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!/[a-z]/i.test(trimmed)) {
      pushNumbers(trimmed);
      continue;
    }

    const trailing = trimmed.match(/^(.*?)[\s,;\t]+(\d{1,3})$/);
    if (trailing) {
      entries.push({ name: cleanName(trailing[1]), number: trailing[2] });
      continue;
    }

    const leading = trimmed.match(/^(\d{1,3})[\s,;\t]+(.*)$/);
    if (leading) {
      entries.push({ name: cleanName(leading[2]), number: leading[1] });
      continue;
    }

    entries.push({ name: cleanName(trimmed), number: "" });
  }

  return entries.map((entry, index) => ({
    id: index + 1,
    name: entry.name,
    number: entry.number || String(index + 1),
  }));
};
