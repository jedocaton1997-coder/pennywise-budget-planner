import type { CardTransaction } from "../domain/creditCardEngine";

export type BillPaymentRecord = {
  id: string;
  billId: number;
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
  id: number;
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

export function processBillPayment({
  bill,
  wallet,
  paymentMethod,
  paymentDate,
}: {
  bill: BillForPayment;
  wallet: WalletForBillPayment;
  paymentMethod: string;
  paymentDate: string;
}): PaymentResult {
  const amount = Number(bill.amount || 0);
  const method = paymentMethod.trim();
  const key = billPaymentKey(bill, paymentDate);

  if (!method) {
    return { bill, wallet, processed: false, duplicate: false, message: "Select a payment account first." };
  }

  const history = bill.paymentHistory ?? [];
  const existingHistory = history.find((record) => record.id === key);
  const existingAccountTransaction = (wallet.accountTransactions ?? []).find((transaction) => transaction.notes?.includes(key));
  const existingCardTransaction = (wallet.transactions ?? []).find((transaction) => transaction.notes?.includes(key));
  if (existingHistory || existingAccountTransaction || existingCardTransaction) {
    return { bill, wallet, processed: false, duplicate: true, message: `${bill.name} payment was already recorded.` };
  }

  const accounts = wallet.accounts ?? [];
  const cards = wallet.cards ?? [];
  const account = accounts.find((candidate) => candidate.name === method);
  const card = cards.find((candidate) => candidate.active !== false && candidate.name === method);
  const transactionId = Math.max(Date.now(), Math.abs([...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0)));
  const accountType = account ? "bank" : card ? "credit-card" : "other";
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
        description: `Payment: ${bill.name}`,
        type: "Expense",
        category: bill.category || "Bills & Payments",
        amount,
        status: "Posted",
        notes: `${key} · Bill payment automatically recorded`,
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

  return {
    bill: applyBillProgress(bill, record),
    wallet: nextWallet,
    processed: true,
    duplicate: false,
    message: `${bill.name} paid from ${method}.`,
  };
}
