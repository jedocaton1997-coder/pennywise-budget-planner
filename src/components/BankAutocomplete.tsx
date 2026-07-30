import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Bank } from "../types/banking";
import {
  findBankMatch,
  getBankSuggestions,
} from "../utils/bankMatcher";
import { BankLogo } from "./BankLogo";

type BankAutocompleteProps = {
  value: string;
  selectedBankId: string | null;
  onValueChange: (value: string) => void;
  onBankSelect: (bank: Bank | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
};

export function BankAutocomplete({
  value,
  selectedBankId,
  onValueChange,
  onBankSelect,
  label = "Bank or financial institution",
  placeholder = "Example: BPI or Metrobank",
  required = false,
}: BankAutocompleteProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const suggestions = getBankSuggestions(value, 6);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectBank(bank: Bank) {
    onValueChange(bank.shortName);
    onBankSelect(bank);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    onValueChange(nextValue);
    const detectedBank = findBankMatch(nextValue);
    if (detectedBank) onBankSelect(detectedBank);
    else if (selectedBankId) onBankSelect(null);
    setIsOpen(true);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      event.preventDefault();
      const selected = suggestions[highlightedIndex];
      if (selected) selectBank(selected);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className="bank-autocomplete" ref={containerRef}>
      <label htmlFor={inputId} className="form-label">{label}</label>
      <div className="bank-autocomplete__input-wrapper">
        <BankLogo bankId={selectedBankId} bankName={value} size="small" />
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-activedescendant={highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {isOpen && suggestions.length > 0 && (
        <div id={listboxId} className="bank-autocomplete__menu" role="listbox">
          {suggestions.map((bank, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <button
                id={`${inputId}-option-${index}`}
                key={bank.id}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                className={["bank-autocomplete__option", isHighlighted ? "bank-autocomplete__option--highlighted" : ""].filter(Boolean).join(" ")}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectBank(bank)}
              >
                <BankLogo bankId={bank.id} bankName={bank.shortName} size="small" />
                <span className="bank-autocomplete__option-copy">
                  <strong>{bank.shortName}</strong>
                  <small>{bank.displayName}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
