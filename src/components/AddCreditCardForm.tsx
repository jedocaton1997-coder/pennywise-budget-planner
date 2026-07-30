import { useState } from "react";
import type {
  Bank,
  CreditCard,
  CreditCardFormValues,
} from "../types/banking";
import { findBankMatch } from "../utils/bankMatcher";
import { BankAutocomplete } from "./BankAutocomplete";
import { BankLogo } from "./BankLogo";

type AddCreditCardFormProps = {
  onAddCard: (card: CreditCard) => void;
};

const initialValues: CreditCardFormValues = {
  bankId: null,
  bankName: "",
  cardName: "",
  lastFourDigits: "",
};

function createCardId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `card-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function AddCreditCardForm({
  onAddCard,
}: AddCreditCardFormProps) {
  const [values, setValues] =
    useState<CreditCardFormValues>(initialValues);

  const [error, setError] = useState<string | null>(null);

  function handleBankSelect(bank: Bank | null) {
    setValues((current) => ({
      ...current,
      bankId: bank?.id ?? null,
    }));
  }

  function handleLastFourChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const digitsOnly = event.target.value
      .replace(/\D/g, "")
      .slice(0, 4);

    setValues((current) => ({
      ...current,
      lastFourDigits: digitsOnly,
    }));
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);

    const detectedBank =
      values.bankId !== null
        ? null
        : findBankMatch(values.bankName);

    const finalBankId =
      values.bankId ?? detectedBank?.id ?? null;

    if (!values.bankName.trim()) {
      setError("Enter the bank name.");
      return;
    }

    if (!values.cardName.trim()) {
      setError("Enter the credit card name.");
      return;
    }

    if (!/^\d{4}$/.test(values.lastFourDigits)) {
      setError(
        "The last four digits must contain exactly four numbers.",
      );
      return;
    }

    onAddCard({
      id: createCardId(),
      bankId: finalBankId,
      bankName: values.bankName.trim(),
      cardName: values.cardName.trim(),
      lastFourDigits: values.lastFourDigits,
    });

    setValues(initialValues);
  }

  return (
    <form
      className="credit-card-form"
      onSubmit={handleSubmit}
    >
      <div className="credit-card-form__heading">
        <div>
          <h2>Add credit card</h2>
          <p>
            Enter the bank and card details. The logo will
            be selected automatically.
          </p>
        </div>

        <BankLogo
          bankId={values.bankId}
          bankName={values.bankName}
          size="large"
        />
      </div>

      <BankAutocomplete
        value={values.bankName}
        selectedBankId={values.bankId}
        required
        onValueChange={(bankName) =>
          setValues((current) => ({
            ...current,
            bankName,
          }))
        }
        onBankSelect={handleBankSelect}
      />

      <div className="form-field">
        <label
          className="form-label"
          htmlFor="card-name"
        >
          Credit card name
        </label>

        <input
          id="card-name"
          type="text"
          value={values.cardName}
          placeholder="Example: BPI Rewards"
          required
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              cardName: event.target.value,
            }))
          }
        />
      </div>

      <div className="form-field">
        <label
          className="form-label"
          htmlFor="last-four-digits"
        >
          Last four digits
        </label>

        <input
          id="last-four-digits"
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={values.lastFourDigits}
          placeholder="4821"
          required
          onChange={handleLastFourChange}
        />
      </div>

      {error && (
        <div
          className="form-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="primary-button"
      >
        Add card
      </button>
    </form>
  );
}
