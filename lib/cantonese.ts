// Safety net: nudge stray written-Chinese (書面語) forms the model occasionally
// slips into toward spoken Cantonese (口語). Deliberately conservative so it
// won't corrupt valid compounds — e.g. we fix 我是→我係 but keep 於是 / 是但 /
// 是非, and turn the bookish 是否 into spoken 係咪.
const SPOKEN_FIXES: [RegExp, string][] = [
  [/為什麼/g, "點解"],
  [/為甚麼/g, "點解"],
  [/是否/g, "係咪"],
  [/是唔是/g, "係唔係"],
  // pronoun/adverb + copula 是 -> 係, but never inside a 是-compound
  // (是但 / 是非 / 是日 / 是次 / 是以 …). Longer prefixes listed first.
  [/(我哋|佢哋|我|你|佢|都|就|而|只|但|又|真|梗|唔)是(?![但否非日次以])/g, "$1係"],
  [/沒有/g, "冇"],
  [/現在/g, "而家"],
  [/什麼/g, "咩"],
  [/甚麼/g, "咩"],
];

/** Convert common written-Chinese slips in a reply to spoken Cantonese. */
export function toSpokenCantonese(text: string): string {
  return SPOKEN_FIXES.reduce((t, [re, sub]) => t.replace(re, sub), text);
}
