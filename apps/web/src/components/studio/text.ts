/** whether the text carries the word, at a word's start; `whole` asks
    for the word's end too (so "sofa" is not in "sofas") */
export const hasWord = (text: string, word: string, whole = true) =>
  new RegExp(
    `\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}${whole ? "\\b" : ""}`,
    "i",
  ).test(text);
