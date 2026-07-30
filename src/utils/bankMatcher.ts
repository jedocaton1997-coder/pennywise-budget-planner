import { banks } from "../data/banks";
import type { Bank } from "../types/banking";

const PRODUCT_WORDS = new Set([
  "rewards",
  "reward",
  "titanium",
  "platinum",
  "gold",
  "classic",
  "signature",
  "infinite",
  "infinity",
  "premier",
  "premium",
  "visa",
  "mastercard",
  "master",
  "jcb",
  "amex",
  "american",
  "express",
  "credit",
  "debit",
  "card",
  "cards",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeProductWords(value: string): string {
  return normalizeText(value)
    .split(" ")
    .filter((word) => !PRODUCT_WORDS.has(word))
    .join(" ")
    .trim();
}

function getNormalizedBankTerms(bank: Bank): string[] {
  return [bank.shortName, bank.displayName, ...bank.aliases]
    .map(normalizeText)
    .filter(Boolean);
}

function scoreBankMatch(input: string, bank: Bank): number {
  const normalizedInput = normalizeText(input);
  const simplifiedInput = removeProductWords(input);
  if (!normalizedInput) return 0;
  const terms = getNormalizedBankTerms(bank);
  let highestScore = 0;
  for (const term of terms) {
    if (!term) continue;
    if (normalizedInput === term) {
      highestScore = Math.max(highestScore, 100);
      continue;
    }
    if (simplifiedInput === term) {
      highestScore = Math.max(highestScore, 95);
      continue;
    }
    if (normalizedInput.startsWith(`${term} `)) {
      highestScore = Math.max(highestScore, 90);
      continue;
    }
    if (simplifiedInput.startsWith(`${term} `)) {
      highestScore = Math.max(highestScore, 85);
      continue;
    }
    if (term.length >= 3 && normalizedInput.includes(term)) {
      highestScore = Math.max(highestScore, 75);
      continue;
    }
    if (term.length >= 3 && simplifiedInput.includes(term))
      highestScore = Math.max(highestScore, 70);
  }
  return highestScore;
}

export function findBankMatch(input: string): Bank | null {
  const matches = banks
    .map((bank) => ({ bank, score: scoreBankMatch(input, bank) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
  return matches[0]?.bank ?? null;
}

export function getBankSuggestions(input: string, maximumResults = 5): Bank[] {
  const normalizedInput = normalizeText(input);
  if (!normalizedInput) return banks.slice(0, maximumResults);
  return banks
    .map((bank) => ({ bank, score: scoreBankMatch(input, bank) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maximumResults)
    .map((result) => result.bank);
}

export function getInitials(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "BK";
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}
