import { findBankMatch, normalizeText } from "./bankMatcher";
const cases: [string, string | null][] = [
  ["BPI", "bpi"],
  ["BPI Rewards", "bpi"],
  ["Bank of the Philippine Islands", "bpi"],
  ["Metrobank Titanium", "metrobank"],
  ["BDO Gold", "bdo"],
  ["UnionBank Visa Platinum", "unionbank"],
  ["Unknown Bank", null],
  ["", null],
];
for (const [input, expected] of cases) {
  const actual = findBankMatch(input)?.id ?? null;
  if (actual !== expected)
    throw new Error(
      `findBankMatch(${input}) expected ${expected}, received ${actual}`,
    );
}
if (normalizeText("  BPI---Rewards  ") !== "bpi")
  throw new Error("normalization failed");
