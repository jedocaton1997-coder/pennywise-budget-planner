import { applyPayment, type CardPayment, type CardStatement, type CardTransaction } from "../domain/creditCardEngine";

export type BillPaymentRecord = {
  id: string;
  billId: number | string;
  billName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  accountType: "bank" | "credit-card" | "other";
  transactionId?: number;
  relatedBillDetails: {
    category: string;
    dueDate: string;
    frequency: string;
    planType?: string;
  };
};

export type BillForPayment = {
  id: number | string;
  sourceKey?: string;
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  frequency: string;
  account?: string;
  status: string;
  autopay?: boolean;
  autopayAccount?: string;
  reminder?: string;
  notes?: string;
  planType?: "One-time" | "Recurring" | "Installment";
  installmentMonths?: number;
  installmentPaidMonths?: number;
  paymentHistory?: BillPaymentRecord[];
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastPaymentMethod?: string;
  paymentTransactionId?: number;
};

export type WalletForBillPayment = {
  accounts?: Array<{ id: number; name: string; balance: number; [key: string]: unknown }>;
  cards?: Array<{ id: number; name: string; active?: boolean; [key: string]: unknown }>;
  accountTransactions?: Array<{
    id: number;
    accountId: number;
    date: string;
    description: string;
    type: "Income" | "Expense" | "Transfer";
    category: string;
    amount: number;
    status: "Posted";
    notes?: string;
  }>;
  transactions?: CardTransaction[];
  statements?: CardStatement[];
  payments?: CardPayment[];
  deletedCardTransactionKeys?: string[];
  deletedCardPaymentKeys?: string[];
  deletedCardPaymentFingerprints?: string[];
  [key: string]: unknown;
};

type PaymentResult = {
  bill: BillForPayment;
  wallet: WalletForBillPayment;
  processed: boolean;
  duplicate: boolean;
  message: string;
};

const oneTimeLabels = new Set(["one-time", "one time", "custom frequency"]);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : null;
}

function addMonths(value: string, months: number) {
  const date = parseDate(value);
  if (!date) return value;
  date.setMonth(date.getMonth() + months);
  return iso(date);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return iso(date);
}

export function nextBillDueDate(bill: BillForPayment) {
  const frequency = bill.frequency || "";
  if (/weekly/i.test(frequency) && !/every two/i.test(frequency)) return addDays(bill.dueDate, 7);
  if (/every two weeks/i.test(frequency)) return addDays(bill.dueDate, 14);
  if (/every two months/i.test(frequency)) return addMonths(bill.dueDate, 2);
  if (/quarterly/i.test(frequency)) return addMonths(bill.dueDate, 3);
  if (/semiannually/i.test(frequency)) return addMonths(bill.dueDate, 6);
  if (/annually/i.test(frequency)) return addMonths(bill.dueDate, 12);
  if (/monthly|installment/i.test(frequency)) return addMonths(bill.dueDate, 1);
  return bill.dueDate;
}

export function billPaymentKey(bill: BillForPayment, paymentDate = bill.dueDate) {
  return `bill-payment:${bill.id}:${bill.dueDate}:${paymentDate}`;
}

function isRecurringBill(bill: BillForPayment) {
  const plan = bill.planType || "";
  const frequency = (bill.frequency || "").toLowerCase();
  return plan === "Recurring" || (!oneTimeLabels.has(frequency) && plan !== "Installment");
}

function applyBillProgress(bill: BillForPayment, record: BillPaymentRecord): BillForPayment {
  const history = [...(bill.paymentHistory ?? []), record];
  const base = {
    ...bill,
    account: record.paymentMethod,
    lastPaymentDate: record.paymentDate,
    lastPaymentAmount: record.amount,
    lastPaymentMethod: record.paymentMethod,
    paymentTransactionId: record.transactionId,
    paymentHistory: history,
  };

  if (bill.planType === "Installment") {
    const paidMonths = Number(bill.installmentPaidMonths || 0) + 1;
    const totalMonths = Number(bill.installmentMonths || 0);
    const complete = totalMonths > 0 && paidMonths >= totalMonths;
    return {
      ...base,
      installmentPaidMonths: paidMonths,
      status: complete ? "Paid" : "Upcoming",
      dueDate: complete ? bill.dueDate : nextBillDueDate(bill),
    };
  }

  if (isRecurringBill(bill)) {
    return {
      ...base,
      status: "Upcoming",
      dueDate: nextBillDueDate(bill),
    };
  }

  return {
    ...base,
    status: "Paid",
  };
}

function creditCardStatementSource(bill: BillForPayment) {
  const match = String(bill.sourceKey ?? "").match(/^credit-card-statement:([^:]+):([\d-]+)$/);
  return match ? { cardId: match[1], statementDate: match[2] } : null;
}

const amountOf = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const paymentFingerprint = (cardId: unknown, date: unknown, amount: unknown) =>
  `${String(cardId)}|${String(date || "")}|${amountOf(amount).toFixed(2)}`;
const paymentMarker = (value: unknown) =>
  String(value ?? "").match(/(?:bill-payment|card-payment):[^·]+/)?.[0] ?? "";
const deletedPaymentKeysContain = (wallet: WalletForBillPayment, key: string) => {
  const deletedTransactionKeys = new Set((wallet.deletedCardTransactionKeys ?? []).map(String));
  const deletedPaymentKeys = new Set((wallet.deletedCardPaymentKeys ?? []).map(String));
  return deletedTransactionKeys.has(key) || deletedPaymentKeys.has(key);
};

function isCreditCardBill(bill: BillForPayment) {
  return Boolean(creditCardStatementSource(bill)) || /credit\s*card|statement|visa|mastercard/i.test(`${bill.category} ${bill.name}`);
}

function applyStatementBillPayment(
  statements: CardStatement[],
  source: ReturnType<typeof creditCardStatementSource>,
  amount: number,
  paymentDate: string,
) {
  if (!source) return applyPayment(statements, amount, paymentDate, 0);

  const updated = statements.map((statement) => ({ ...statement }));
  const target = updated.find(
    (statement) =>
      String(statement.cardId) === source.cardId &&
      String(statement.statementDate) === source.statementDate,
  );

  if (!target) return applyPayment(updated, amount, paymentDate, 0);

  const applied = Math.min(amount, Math.max(0, Number(target.remainingDue || 0)));
  if (applied <= 0) return { statements: updated, allocations: [{ statementId: target.id, cycle: "statement" as const, amount, date: paymentDate }], credit: 0 };

  target.remainingDue = Math.max(0, Number(target.remainingDue || 0) - applied);
  target.paymentsApplied = Number(target.paymentsApplied || 0) + applied;
  target.status = target.remainingDue === 0 ? "Paid" : "Partially paid";

  const allocations: CardPayment["allocations"] = [{ statementId: target.id, cycle: "statement", amount: applied, date: paymentDate }];
  const overage = Math.max(0, amount - applied);
  if (overage > 0) allocations.push({ cycle: "credit", amount: overage, date: paymentDate });

  return { statements: updated, allocations, credit: overage };
}

function cardForBill(bill: BillForPayment, cards: WalletForBillPayment["cards"] = []) {
  const source = creditCardStatementSource(bill);
  if (source) {
    const matched = cards.find((card) => String(card.id) === source.cardId && card.active !== false);
    if (matched) return matched;
  }

  const billName = bill.name.replace(/\s+statement$/i, "").trim().toLowerCase();
  return cards.find((card) => card.active !== false && String(card.name || "").trim().toLowerCase() === billName);
}

const normalizeLookup = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[•·]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function resolvePaymentAccount(method: string, accounts: WalletForBillPayment["accounts"] = []) {
  const normalizedMethod = normalizeLookup(method);
  const compactMethod = normalizedMethod.replace(/\s+/g, "");

  return (
    accounts.find((account) => String(account.id) === method) ??
    accounts.find((account) => normalizeLookup(account.name) === normalizedMethod) ??
    accounts.find((account) => {
      const accountName = normalizeLookup(account.name);
      if (!accountName) return false;
      return normalizedMethod.includes(accountName) || accountName.includes(normalizedMethod);
    }) ??
    accounts.find((account) => {
      const last4 = String(account.last4 ?? "");
      return Boolean(last4) && compactMethod.includes(last4);
    })
  );
}

function resolvePaymentCard(method: string, cards: WalletForBillPayment["cards"] = []) {
  const normalizedMethod = normalizeLookup(method);
  return (
    cards.find((card) => String(card.id) === method && card.active !== false) ??
    cards.find((card) => normalizeLookup(card.name) === normalizedMethod && card.active !== false) ??
    cards.find((card) => {
      const cardName = normalizeLookup(card.name);
      if (!cardName || card.active === false) return false;
      return normalizedMethod.includes(cardName) || cardName.includes(normalizedMethod);
    })
  );
}

function accountTransactionMatchesPayment(
  transaction: NonNullable<WalletForBillPayment["accountTransactions"]>[number],
  key: string,
  accountId: number,
  paymentDate: string,
  amount: number,
  paidCardName: string,
) {
  const notes = String(transaction.notes ?? "");
  if (notes.includes(key)) return true;
  return (
    transaction.accountId === accountId &&
    transaction.date === paymentDate &&
    Math.abs(Number(transaction.amount || 0) - amount) < 0.005 &&
    /credit card payment/i.test(`${transaction.category} ${transaction.description}`) &&
    normalizeLookup(transaction.description).includes(normalizeLookup(paidCardName))
  );
}

function appendBankSideCreditCardPayment(
  wallet: WalletForBillPayment,
  account: NonNullable<WalletForBillPayment["accounts"]>[number],
  bill: BillForPayment,
  key: string,
  paymentDate: string,
  amount: number,
  transactionId: number,
) {
  const accountTransactions = wallet.accountTransactions ?? [];
  const alreadyRecorded = accountTransactions.some((transaction) =>
    accountTransactionMatchesPayment(transaction, key, account.id, paymentDate, amount, bill.name),
  );

  if (alreadyRecorded) return { wallet, repaired: false };

  return {
    repaired: true,
    wallet: {
      ...wallet,
      accounts: (wallet.accounts ?? []).map((candidate) =>
        candidate.id === account.id ? { ...candidate, balance: Number(candidate.balance || 0) - amount } : candidate,
      ),
      accountTransactions: [
        ...accountTransactions,
        {
          id: transactionId,
          accountId: account.id,
          date: paymentDate,
          description: `Credit card payment to ${bill.name}`,
          type: "Transfer" as const,
          category: "Credit Card Payment",
          amount,
          status: "Posted" as const,
          notes: `${key} · Credit card payment transfer automatically recorded`,
        },
      ],
    },
  };
}

export function processBillPayment({
  bill,
  wallet,
  paymentMethod,
  paymentDate,
  paymentAmount,
}: {
  bill: BillForPayment;
  wallet: WalletForBillPayment;
  paymentMethod: string;
  paymentDate: string;
  paymentAmount?: number;
}): PaymentResult {
  const amount = Number(paymentAmount ?? bill.amount ?? 0);
  const method = paymentMethod.trim();
  const key = billPaymentKey(bill, paymentDate);

  if (!method) {
    return { bill, wallet, processed: false, duplicate: false, message: "Select a payment account first." };
  }

  const history = bill.paymentHistory ?? [];
  const accounts = wallet.accounts ?? [];
  const cards = wallet.cards ?? [];
  const account = resolvePaymentAccount(method, accounts);
  const card = resolvePaymentCard(method, cards);
  const paidCreditCard = cardForBill(bill, cards);
  const transactionId = Math.max(Date.now(), Math.abs([...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0)));
  const accountType = account ? "bank" : card ? "credit-card" : "other";
  const isCreditCardBillPayment = Boolean(paidCreditCard && isCreditCardBill(bill));

  const existingHistory = history.find((record) => record.id === key);
  const existingAccountTransaction = account
    ? (wallet.accountTransactions ?? []).find((transaction) =>
        accountTransactionMatchesPayment(transaction, key, account.id, paymentDate, amount, bill.name),
      )
    : (wallet.accountTransactions ?? []).find((transaction) => transaction.notes?.includes(key));
  const existingCardTransaction = (wallet.transactions ?? []).find((transaction) => transaction.notes?.includes(key));
  const existingCardPayment = (wallet.payments ?? []).find((payment) => String(payment.notes ?? "").includes(key));

  if (existingHistory || existingAccountTransaction || existingCardTransaction || existingCardPayment) {
    if (isCreditCardBillPayment && account && !existingAccountTransaction) {
      const repair = appendBankSideCreditCardPayment(wallet, account, bill, key, paymentDate, amount, transactionId);
      if (repair.repaired) {
        return {
          bill,
          wallet: repair.wallet,
          processed: true,
          duplicate: false,
          message: `${bill.name} payment was linked to ${account.name}.`,
        };
      }
    }

    return { bill, wallet, processed: false, duplicate: true, message: `${bill.name} payment was already recorded.` };
  }

  if (isCreditCardBillPayment && paidCreditCard) {
    const deletedFingerprints = new Set((wallet.deletedCardPaymentFingerprints ?? []).map(String));
    const marker = paymentMarker(key) || key;
    if (
      deletedPaymentKeysContain(wallet, key) ||
      deletedPaymentKeysContain(wallet, marker) ||
      deletedFingerprints.has(paymentFingerprint(paidCreditCard.id, paymentDate, amount))
    ) {
      return {
        bill,
        wallet,
        processed: false,
        duplicate: true,
        message: `${bill.name} payment was deleted and will not be recreated automatically.`,
      };
    }
  }
  const record: BillPaymentRecord = {
    id: key,
    billId: bill.id,
    billName: bill.name,
    amount,
    paymentDate,
    paymentMethod: method,
    accountType,
    transactionId,
    relatedBillDetails: {
      category: bill.category,
      dueDate: bill.dueDate,
      frequency: bill.frequency,
      planType: bill.planType,
    },
  };

  const nextWallet: WalletForBillPayment = { ...wallet };

  if (account) {
    nextWallet.accounts = accounts.map((candidate) =>
      candidate.id === account.id ? { ...candidate, balance: Number(candidate.balance || 0) - amount } : candidate,
    );
    nextWallet.accountTransactions = [
      ...(wallet.accountTransactions ?? []),
      {
        id: transactionId,
        accountId: account.id,
        date: paymentDate,
        description: isCreditCardBillPayment ? `Credit card payment to ${bill.name}` : `Payment: ${bill.name}`,
        type: isCreditCardBillPayment ? "Transfer" : "Expense",
        category: isCreditCardBillPayment ? "Credit Card Payment" : bill.category || "Bills & Payments",
        amount,
        status: "Posted",
        notes: `${key} · ${isCreditCardBillPayment ? "Credit card payment transfer automatically recorded" : "Bill payment automatically recorded"}`,
      },
    ];
  } else if (card) {
    nextWallet.transactions = [
      ...(wallet.transactions ?? []),
      {
        id: transactionId,
        cardId: card.id,
        type: "purchase",
        description: `Bill payment: ${bill.name}`,
        category: bill.category || "Bills & Payments",
        amount,
        transactionDate: paymentDate,
        postedDate: paymentDate,
        status: "posted",
        notes: `${key} · Bill paid using credit card`,
        expenseCounted: true,
      },
    ];
  }

  if (paidCreditCard && isCreditCardBill(bill)) {
    const cardStatements = (wallet.statements ?? []).filter(
      (statement) => String(statement.cardId) === String(paidCreditCard.id),
    );
    const paymentResult = applyStatementBillPayment(cardStatements, creditCardStatementSource(bill), amount, paymentDate);
    const updatedStatements = new Map(paymentResult.statements.map((statement) => [statement.id, statement]));
    const paymentId = transactionId + 10;
    const paymentNotes = `${key} · Credit card payment from ${method}`;

    nextWallet.statements = (wallet.statements ?? []).map((statement) =>
      updatedStatements.get(statement.id) ?? statement,
    );
    nextWallet.payments = [
      ...(wallet.payments ?? []),
      {
        id: paymentId,
        cardId: paidCreditCard.id,
        account: method,
        date: paymentDate,
        amount,
        option: "Bill payment",
        status: "Posted",
        notes: paymentNotes,
        allocations: paymentResult.allocations,
      },
    ];
    nextWallet.transactions = [
      ...(nextWallet.transactions ?? wallet.transactions ?? []),
      {
        id: paymentId + 1,
        cardId: paidCreditCard.id,
        type: "payment",
        description: `Payment from ${method}`,
        category: "Credit Card Payment",
        amount,
        transactionDate: paymentDate,
        postedDate: paymentDate,
        status: "posted",
        notes: paymentNotes,
        expenseCounted: false,
      },
    ];
  }

  return {
    bill: applyBillProgress(bill, record),
    wallet: nextWallet,
    processed: true,
    duplicate: false,
    message: `${bill.name} paid from ${method}.`,
  };
}
