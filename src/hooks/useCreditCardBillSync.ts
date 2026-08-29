import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";
import {
  applyPayment,
  adjustToWeekday,
  calculateDueDate,
  ensureDueDateAfterStatement,
  latestClosedStatementDate,
  minimumDue as calculateMinimumDue,
  previousStatementDate,
  reconciledStatementDue,
  reconciledStatementStatus,
  statementCutoffDate,
  statementFromCycle,
} from "../domain/creditCardEngine";

type AnyRecord = Record<string, any>;
const walletCacheKey = "pennywise.wallet.snapshot";

const readLocalWalletUpdatedAt = () => {
  try {
    return String(JSON.parse(localStorage.getItem(walletCacheKey) || "null")?.updatedAt || "");
  } catch {
    return "";
  }
};

const rawIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;

const reminderIso = (date: Date) => adjustToWeekday(rawIso(date));

const stableId = (value: string) =>
  Math.abs(
    [...value].reduce(
      (hash, char) => (hash * 31 + char.charCodeAt(0)) | 0,
      0,
    ),
  );

const dueDate = (card: AnyRecord, statement: string) =>
  calculateDueDate(card as never, statement);

const amountOf = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const sameAmount = (left: unknown, right: unknown) =>
  Math.abs(amountOf(left) - amountOf(right)) < 0.005;
const paymentFingerprint = (cardId: unknown, date: unknown, amount: unknown) =>
  `${String(cardId)}|${String(date || "")}|${amountOf(amount).toFixed(2)}`;

const isInactiveStatus = (status: unknown) =>
  ["paid", "skipped", "cancelled"].includes(String(status ?? "").toLowerCase());

const paymentId = (value: string) => stableId(`card-payment:${value}`);
const paymentMarker = (value: unknown) =>
  String(value ?? "").match(/(?:bill-payment|card-payment):[^·]+/)?.[0] ?? "";
const cardTransactionDate = (transaction: AnyRecord) =>
  String(transaction.postedDate || transaction.transactionDate || "");
const cardTransactionDeleteKeys = (transaction: AnyRecord) =>
  [
    paymentMarker(transaction.notes),
    `${String(transaction.cardId)}|${cardTransactionDate(transaction)}|${String(transaction.type)}|${amountOf(transaction.amount).toFixed(2)}`,
    `${String(transaction.cardId)}|${cardTransactionDate(transaction)}|${String(transaction.type)}|${amountOf(transaction.amount).toFixed(2)}|${String(transaction.description ?? "")}`,
    `${String(transaction.cardId)}|${cardTransactionDate(transaction)}|${String(transaction.type)}|${String(transaction.amount)}|${String(transaction.description ?? "")}`,
  ].filter(Boolean);
const cardTransactionIsDeleted = (transaction: AnyRecord, deletedKeys: Set<string>) =>
  cardTransactionDeleteKeys(transaction).some((key) => deletedKeys.has(key));
const cardTransactionPaymentIsDeleted = (transaction: AnyRecord, deletedFingerprints: Set<string>) =>
  String(transaction.type ?? "").toLowerCase() === "payment" &&
  deletedFingerprints.has(paymentFingerprint(transaction.cardId, cardTransactionDate(transaction), transaction.amount));
const cardPaymentDeleteKeys = (payment: AnyRecord) =>
  [paymentMarker(payment.notes), String(payment.id), `card-payment:${String(payment.id)}`].filter(Boolean);
const cardPaymentIsDeleted = (payment: AnyRecord, deletedKeys: Set<string>) =>
  cardPaymentDeleteKeys(payment).some((key) => deletedKeys.has(key));
const cardPaymentFingerprintIsDeleted = (payment: AnyRecord, deletedFingerprints: Set<string>) =>
  deletedFingerprints.has(paymentFingerprint(payment.cardId, payment.date, payment.amount));

const reconciliationRecord = (record: AnyRecord) =>
  /reconciled credit card payment/i.test(String(record.notes ?? ""));

const cardPaymentFor = (
  records: AnyRecord[],
  cardId: unknown,
  date: string,
  amount: number,
  marker = "",
) => records.find((record: AnyRecord) =>
  String(record.cardId) === String(cardId) &&
  String(record.date) === date &&
  sameAmount(record.amount, amount) &&
  (!marker || String(record.notes ?? "").includes(marker)),
);

const paymentTransactionFor = (
  records: AnyRecord[],
  cardId: unknown,
  date: string,
  amount: number,
  marker = "",
) => records.find((record: AnyRecord) =>
  String(record.type ?? "").toLowerCase() === "payment" &&
  String(record.cardId) === String(cardId) &&
  String(record.postedDate || record.transactionDate) === date &&
  sameAmount(record.amount, amount) &&
  (!marker || String(record.notes ?? "").includes(marker)),
);

const linkedPaymentTransaction = ({
  id,
  cardId,
  account,
  date,
  amount,
  notes,
}: {
  id: number;
  cardId: unknown;
  account: string;
  date: string;
  amount: number;
  notes: string;
}) => ({
  id,
  cardId,
  type: "payment",
  description: `Payment from ${account}`,
  category: "Credit Card Payment",
  amount,
  transactionDate: date,
  postedDate: date,
  status: "posted",
  notes,
  expenseCounted: false,
});
const cardPaymentDisplayTransaction = (payment: AnyRecord) =>
  linkedPaymentTransaction({
    id: (Number(payment.id) || paymentId(String(payment.id || ""))) + 1,
    cardId: payment.cardId,
    account: String(payment.account || "Payment account"),
    date: String(payment.date || ""),
    amount: amountOf(payment.amount),
    notes: String(payment.notes || ""),
  });
const linkedPaymentTransactionIsDeleted = (
  payment: Parameters<typeof linkedPaymentTransaction>[0],
  deletedKeys: Set<string>,
) => cardTransactionIsDeleted(linkedPaymentTransaction(payment), deletedKeys);
const linkedPaymentFingerprintIsDeleted = (
  payment: Parameters<typeof linkedPaymentTransaction>[0],
  deletedFingerprints: Set<string>,
) => deletedFingerprints.has(paymentFingerprint(payment.cardId, payment.date, payment.amount));

const normalizeLookup = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[•·]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function resolvePaymentAccount(method: string, accounts: AnyRecord[] = []) {
  const normalizedMethod = normalizeLookup(method);
  const compactMethod = normalizedMethod.replace(/\s+/g, "");
  return (
    accounts.find((account) => String(account.id) === method) ??
    accounts.find((account) => normalizeLookup(account.name) === normalizedMethod) ??
    accounts.find((account) => {
      const accountName = normalizeLookup(account.name);
      return Boolean(accountName) && (normalizedMethod.includes(accountName) || accountName.includes(normalizedMethod));
    }) ??
    accounts.find((account) => {
      const last4 = String(account.last4 ?? "");
      return Boolean(last4) && compactMethod.includes(last4);
    })
  );
}

function bankTransactionMatchesCardPayment(
  transaction: AnyRecord,
  marker: string,
  accountId: unknown,
  date: string,
  amount: number,
  cardName: string,
) {
  const notes = String(transaction.notes ?? "");
  if (marker && notes.includes(marker)) return true;
  return (
    String(transaction.accountId) === String(accountId) &&
    String(transaction.date) === date &&
    sameAmount(transaction.amount, amount) &&
    /credit\s*card\s*payment/i.test(`${transaction.category ?? ""} ${transaction.description ?? ""}`) &&
    normalizeLookup(transaction.description).includes(normalizeLookup(cardName))
  );
}

function appendMissingBankPaymentSide({
  accounts,
  accountTransactions,
  method,
  marker,
  cardName,
  date,
  amount,
  id,
}: {
  accounts: AnyRecord[];
  accountTransactions: AnyRecord[];
  method: string;
  marker: string;
  cardName: string;
  date: string;
  amount: number;
  id: number;
}) {
  const account = resolvePaymentAccount(method, accounts);
  if (!account) return { accounts, accountTransactions, repaired: false };
  const exists = accountTransactions.some((transaction) =>
    bankTransactionMatchesCardPayment(transaction, marker, account.id, date, amount, cardName),
  );
  if (exists) return { accounts, accountTransactions, repaired: false };

  return {
    repaired: true,
    accounts: accounts.map((candidate) =>
      String(candidate.id) === String(account.id)
        ? { ...candidate, balance: amountOf(candidate.balance) - amount }
        : candidate,
    ),
    accountTransactions: [
      ...accountTransactions,
      {
        id,
        accountId: account.id,
        date,
        description: `Credit card payment to ${cardName}`,
        type: "Transfer",
        category: "Credit Card Payment",
        amount,
        status: "Posted",
        notes: `${marker} · Credit card payment transfer automatically recorded`,
      },
    ],
  };
}

function repairPaymentAllocationToStatement({
  payments,
  statements,
  payment,
  cardId,
  statementDate,
  amount,
  date,
}: {
  payments: AnyRecord[];
  statements: AnyRecord[];
  payment: AnyRecord | undefined;
  cardId: unknown;
  statementDate: string;
  amount: number;
  date: string;
}) {
  if (!payment) return { payments, statements, repaired: false };
  const targetStatement = statements.find(
    (statement) =>
      String(statement.cardId) === String(cardId) &&
      String(statement.statementDate) === statementDate,
  );
  if (!targetStatement) return { payments, statements, repaired: false };

  const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
  const alreadyStatement = allocations.some(
    (allocation: AnyRecord) =>
      allocation.cycle === "statement" &&
      String(allocation.statementId) === String(targetStatement.id),
  );
  const hasCurrentCycle = allocations.some((allocation: AnyRecord) => allocation.cycle === "current-cycle");
  if (alreadyStatement || !hasCurrentCycle) return { payments, statements, repaired: false };

  const paymentIdValue = String(payment.id);
  const repairedPayments = payments.map((candidate) =>
    String(candidate.id) === paymentIdValue
      ? {
          ...candidate,
          allocations: [{ statementId: targetStatement.id, cycle: "statement", amount, date }],
        }
      : candidate,
  );

  let appliedDelta = amount;
  const repairedStatements = statements.map((statement) => {
    if (String(statement.id) !== String(targetStatement.id)) return statement;
    const statementBalance = amountOf(statement.statementBalance);
    const previousApplied = amountOf(statement.paymentsApplied);
    const nextApplied = Math.min(statementBalance || previousApplied + amount, Math.max(previousApplied, previousApplied + appliedDelta));
    const nextRemaining = Math.max(0, amountOf(statement.remainingDue) - appliedDelta);
    return {
      ...statement,
      paymentsApplied: nextApplied,
      remainingDue: nextRemaining,
      status: nextRemaining <= 0 ? "Paid" : "Partially paid",
    };
  });

  return { payments: repairedPayments, statements: repairedStatements, repaired: true };
}

function repairBillPaymentAllocationsFromPayments({
  payments,
  statements,
  bills,
}: {
  payments: AnyRecord[];
  statements: AnyRecord[];
  bills: AnyRecord[];
}) {
  let repaired = false;
  let nextPayments = payments;
  let nextStatements = statements;

  for (const payment of nextPayments) {
    const marker = paymentMarker(payment.notes);
    if (!marker.startsWith("bill-payment:")) continue;
    const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
    if (!allocations.some((allocation: AnyRecord) => allocation.cycle === "current-cycle")) continue;

    const bill = bills.find((candidate) => {
      const source = creditCardStatementSource(candidate.sourceKey);
      if (!source || String(source.cardId) !== String(payment.cardId)) return false;
      if (String(marker).startsWith(`bill-payment:${String(candidate.id)}:`)) return true;
      return (candidate.paymentHistory ?? []).some((record: AnyRecord) => String(record.id ?? "").includes(marker));
    });
    const source = creditCardStatementSource(bill?.sourceKey);
    if (!source) continue;

    const repair = repairPaymentAllocationToStatement({
      payments: nextPayments,
      statements: nextStatements,
      payment,
      cardId: payment.cardId,
      statementDate: source.statementDate,
      amount: amountOf(payment.amount),
      date: String(payment.date || ""),
    });
    if (!repair.repaired) continue;
    nextPayments = repair.payments;
    nextStatements = repair.statements;
    repaired = true;
  }

  return { payments: nextPayments, statements: nextStatements, repaired };
}

function dedupeReconciledPayments(records: AnyRecord[]) {
  const result: AnyRecord[] = [];
  const indexByKey = new Map<string, number>();
  for (const record of records) {
    const key = `${String(record.cardId)}|${String(record.date)}|${amountOf(record.amount).toFixed(2)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push(record);
      continue;
    }
    const existing = result[existingIndex];
    // A card can only have one posting for the same card/date/amount. Prefer the
    // original user/payment-processor entry over a repair entry and discard the
    // duplicate instead of subtracting it from the balance again.
    if (reconciliationRecord(existing) && !reconciliationRecord(record)) result[existingIndex] = record;
  }
  return result;
}

function dedupeReconciledTransactions(records: AnyRecord[]) {
  const result: AnyRecord[] = [];
  const indexByKey = new Map<string, number>();
  for (const record of records) {
    if (String(record.type).toLowerCase() !== "payment") {
      result.push(record);
      continue;
    }
    const key = `${String(record.cardId)}|${String(record.postedDate || record.transactionDate)}|${amountOf(record.amount).toFixed(2)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push(record);
      continue;
    }
    const existing = result[existingIndex];
    if (reconciliationRecord(existing) && !reconciliationRecord(record)) result[existingIndex] = record;
  }
  return result;
}

function creditCardStatementSource(sourceKey: unknown) {
  const match = String(sourceKey ?? "").match(/^credit-card-statement:([^:]+):([\d-]+)$/);
  return match ? { cardId: match[1], statementDate: match[2] } : null;
}

function postedCardActivity(
  wallet: AnyRecord,
  card: AnyRecord,
  cycleStart: string,
  cycleEnd: string,
) {
  const cardId = String(card.id);

  const transactions = (wallet.transactions ?? []).filter(
    (transaction: AnyRecord) =>
      String(transaction.cardId) === cardId &&
      transaction.status === "posted" &&
      transaction.type !== "payment" &&
      transaction.postedDate >= cycleStart &&
      transaction.postedDate <= cycleEnd,
  );

  const payments = (wallet.payments ?? []).filter(
    (payment: AnyRecord) =>
      String(payment.cardId) === cardId &&
      payment.status === "Posted" &&
      payment.date >= cycleStart &&
      payment.date <= cycleEnd,
  );

  const activity = transactions.reduce(
    (sum: number, transaction: AnyRecord) =>
      sum +
      (["refund", "credit"].includes(transaction.type)
        ? -amountOf(transaction.amount)
        : amountOf(transaction.amount)),
    0,
  );

  const paid = payments.reduce(
    (sum: number, payment: AnyRecord) => sum + amountOf(payment.amount),
    0,
  );

  return { activity, paid };
}

function postedPaymentsAfterStatement(
  wallet: AnyRecord,
  card: AnyRecord,
  statementDate: string,
) {
  const cardId = String(card.id);
  const todayText = rawIso(new Date());

  return (wallet.payments ?? [])
    .filter(
      (payment: AnyRecord) =>
        String(payment.cardId) === cardId &&
        payment.status === "Posted" &&
        payment.date > statementDate &&
        payment.date <= todayText,
    )
    .reduce((sum: number, payment: AnyRecord) => sum + amountOf(payment.amount), 0);
}

function paymentsForStatement(wallet: AnyRecord, cardId: unknown, statementId: unknown) {
  return (wallet.payments ?? [])
    .filter(
      (payment: AnyRecord) =>
        String(payment.cardId) === String(cardId) &&
        payment.status === "Posted" &&
        (payment.allocations ?? []).some(
          (allocation: AnyRecord) => String(allocation.statementId) === String(statementId),
        ),
    )
    .sort((left: AnyRecord, right: AnyRecord) => String(left.date).localeCompare(String(right.date)));
}

function statementAmountDue({
  existingStatement,
  rebuiltStatement,
  paidAfterStatement,
}: {
  existingStatement?: AnyRecord;
  rebuiltStatement: AnyRecord;
  paidAfterStatement: number;
}) {
  const existingPayments = amountOf(existingStatement?.paymentsApplied);

  const rebuiltBalance = Math.max(0, amountOf(rebuiltStatement.statementBalance));

  // For the currently generated statement, the transaction ledger is the source
  // of truth. A generated statement can initially close at zero and be saved as
  // Paid before all of its posted activity has synchronized. Do not let that stale
  // status suppress a subsequently rebuilt balance. Genuine payments remain
  // authoritative through paymentsApplied/paidAfterStatement.
  return reconciledStatementDue(rebuiltBalance, existingPayments, paidAfterStatement);
}

export function useCreditCardBillSync() {
  const [wallet, setWallet] = useState<AnyRecord | null>(null);
  const [bills, setBills] = useState<AnyRecord[] | null>(null);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;

    const stopWallet = onSnapshot(
      doc(firestore, "users", user.uid, "appData", "wallet"),
      (snapshot) => setWallet(snapshot.exists() ? snapshot.data() : null),
    );

    const stopBills = onSnapshot(
      doc(firestore, "users", user.uid, "appData", "bills"),
      (snapshot) => setBills(snapshot.exists() ? snapshot.data().value ?? [] : []),
    );

    return () => {
      stopWallet();
      stopBills();
    };
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user || !wallet || !bills) return;

    const todayText = rawIso(new Date());
    const generatedStatements: AnyRecord[] = [];
    const deletedCardTransactionKeys = new Set<string>((wallet.deletedCardTransactionKeys ?? []).map((value: unknown) => String(value)));
    const deletedCardPaymentKeys = new Set<string>((wallet.deletedCardPaymentKeys ?? []).map((value: unknown) => String(value)));
    const deletedCardPaymentFingerprints = new Set<string>((wallet.deletedCardPaymentFingerprints ?? []).map((value: unknown) => String(value)));
    const cleanedPayments = dedupeReconciledPayments(wallet.payments ?? []).filter(
      (payment: AnyRecord) =>
        !cardPaymentIsDeleted(payment, deletedCardPaymentKeys) &&
        !cardTransactionIsDeleted(cardPaymentDisplayTransaction(payment), deletedCardTransactionKeys) &&
        !cardPaymentFingerprintIsDeleted(payment, deletedCardPaymentFingerprints),
    );
    const cleanedTransactions = dedupeReconciledTransactions(wallet.transactions ?? []).filter(
      (transaction: AnyRecord) =>
        !cardTransactionIsDeleted(transaction, deletedCardTransactionKeys) &&
        !cardTransactionPaymentIsDeleted(transaction, deletedCardPaymentFingerprints),
    );
    const effectiveWallet = { ...wallet, payments: cleanedPayments, transactions: cleanedTransactions };
    const removedDuplicateWalletEntries =
      cleanedPayments.length !== (wallet.payments ?? []).length ||
      cleanedTransactions.length !== (wallet.transactions ?? []).length;

    const currentGeneratedRaw = (wallet.cards ?? [])
      .filter((card: AnyRecord) => card.active !== false)
      .map((card: AnyRecord) => {
        const day = Number(card.statementDay || 1);
        const statementDate = latestClosedStatementDate(day, todayText);
        const cycleStart = previousStatementDate(day, statementDate);
        const cycleEnd = statementCutoffDate(statementDate);
        const sourceKey = `credit-card-statement:${card.id}:${statementDate}`;
        const { activity, paid } = postedCardActivity(
          effectiveWallet,
          card,
          cycleStart,
          cycleEnd,
        );
        const paymentDue = dueDate(card, statementDate);
        const paidAfterStatement = postedPaymentsAfterStatement(
          effectiveWallet,
          card,
          statementDate,
        );
        const reminderDate = new Date(`${paymentDue}T12:00:00`);
        reminderDate.setDate(reminderDate.getDate() - 7);

        const existingStatement = (wallet.statements ?? []).find(
          (statement: AnyRecord) =>
            String(statement.cardId) === String(card.id) &&
            statement.statementDate === statementDate,
        );

        const previousStatement = [...(wallet.statements ?? [])]
          .filter(
            (statement: AnyRecord) =>
              String(statement.cardId) === String(card.id) &&
              statement.statementDate < statementDate,
          )
          .sort((a: AnyRecord, b: AnyRecord) =>
            b.statementDate.localeCompare(a.statementDate),
          )[0];

        const rebuiltStatement = statementFromCycle(
          card as never,
          (effectiveWallet.transactions ?? []) as never,
          cycleStart,
          statementDate,
          amountOf(previousStatement?.remainingDue),
          existingStatement?.id ?? stableId(sourceKey),
        );

        const amount = statementAmountDue({
          existingStatement,
          rebuiltStatement,
          paidAfterStatement,
        });

        const paymentsApplied = Math.max(
          amountOf(existingStatement?.paymentsApplied),
          paidAfterStatement,
        );
        const statementBalance = Math.max(0, amountOf(rebuiltStatement.statementBalance));
        const remainingDue = amount;
        const statementPayments = paymentsForStatement(effectiveWallet, card.id, rebuiltStatement.id);
        const latestPayment = statementPayments.at(-1);
        const actualAmount = Math.min(statementBalance, paymentsApplied);
        const minimumDue = amount > 0
          ? Math.min(amount, calculateMinimumDue(card as never, statementBalance))
          : 0;

        const statement = {
          ...rebuiltStatement,
          paymentsBeforeClose: paid,
          statementBalance,
          minimumDue,
          remainingDue,
          paymentsApplied,
          status: reconciledStatementStatus(remainingDue, paymentsApplied),
          generatedAutomatically: true,
        };

        generatedStatements.push(statement);

        return {
          id: stableId(sourceKey),
          sourceKey,
          name: card.name,
          category: "Credit Card",
          amount: remainingDue > 0 ? remainingDue : statementBalance,
          dueDate: paymentDue,
          frequency: "One-time",
          planType: "One-time",
          account: "",
          status: amount > 0 ? "Upcoming" : "Paid",
          autopay: Boolean(card.autoPaymentEnabled),
          autopayAccount: card.linkedAccount || "",
          reminder: reminderIso(reminderDate),
          notes: `Generated automatically from the ${cycleStart} – ${cycleEnd} credit-card billing cycle.`,
          statementDate,
          cycleStart,
          cycleEnd,
          originalStatement: statementBalance,
          minimumDue: statement.minimumDue,
          plannedPayment: remainingDue,
          actualAmount: actualAmount > 0 ? actualAmount : undefined,
          paidAmount: actualAmount > 0 ? actualAmount : undefined,
          actualDate: latestPayment?.date,
          paymentDate: latestPayment?.date,
          paidOccurrenceDate: actualAmount > 0 ? paymentDue : undefined,
          lastPaymentDate: latestPayment?.date,
          lastPaymentAmount: actualAmount > 0 ? actualAmount : undefined,
          lastPaymentMethod: latestPayment?.account,
        };
      });

    // Rebuild settled historical statements as paid bill records. They are hidden
    // from the active Bills & Payments lists by status, but Cash Flow needs them
    // in the original payment cycle with Expected and Actual values intact.
    const currentSourceKeys = new Set(currentGeneratedRaw.map((bill: AnyRecord) => String(bill.sourceKey)));
    const historicalGeneratedRaw = (wallet.statements ?? []).flatMap((statement: AnyRecord) => {
      const card = (wallet.cards ?? []).find(
        (candidate: AnyRecord) => String(candidate.id) === String(statement.cardId),
      );
      const statementBalance = amountOf(statement.statementBalance);
      if (!card || statementBalance <= 0 || !statement.statementDate) return [];

      const sourceKey = `credit-card-statement:${card.id}:${statement.statementDate}`;
      if (currentSourceKeys.has(sourceKey)) return [];

      const remainingDue = Math.max(0, amountOf(statement.remainingDue));
      const statementPayments = paymentsForStatement(effectiveWallet, card.id, statement.id);
      const latestPayment = statementPayments.at(-1);
      const allocatedPayments = statementPayments.reduce(
        (total: number, payment: AnyRecord) =>
          total +
          (payment.allocations ?? [])
            .filter((allocation: AnyRecord) => String(allocation.statementId) === String(statement.id))
            .reduce((sum: number, allocation: AnyRecord) => sum + amountOf(allocation.amount), 0),
        0,
      );
      const paymentsApplied = Math.max(amountOf(statement.paymentsApplied), allocatedPayments);
      const actualAmount = Math.min(statementBalance, paymentsApplied);
      const isPaid = remainingDue <= 0 || String(statement.status).toLowerCase() === "paid";
      if (!isPaid && remainingDue <= 0) return [];

      const paymentDue = ensureDueDateAfterStatement(
        statement.statementDate,
        statement.dueDate || dueDate(card, statement.statementDate),
      );
      const reminderDate = new Date(`${paymentDue}T12:00:00`);
      reminderDate.setDate(reminderDate.getDate() - 7);

      return [{
        id: stableId(sourceKey),
        sourceKey,
        name: card.name,
        category: "Credit Card",
        amount: isPaid ? statementBalance : remainingDue,
        dueDate: paymentDue,
        frequency: "One-time",
        planType: "One-time",
        account: latestPayment?.account || "",
        status: isPaid ? "Paid" : "Upcoming",
        autopay: Boolean(card.autoPaymentEnabled),
        autopayAccount: card.linkedAccount || "",
        reminder: reminderIso(reminderDate),
        notes: `Generated automatically from the ${statement.cycleStart} – ${statement.cycleEnd} credit-card billing cycle.`,
        statementDate: statement.statementDate,
        cycleStart: statement.cycleStart,
        cycleEnd: statement.cycleEnd,
        originalStatement: statementBalance,
        minimumDue: amountOf(statement.minimumDue),
        plannedPayment: remainingDue,
        actualAmount: actualAmount > 0 ? actualAmount : undefined,
        paidAmount: actualAmount > 0 ? actualAmount : undefined,
        actualDate: latestPayment?.date,
        paymentDate: latestPayment?.date,
        paidOccurrenceDate: actualAmount > 0 ? paymentDue : undefined,
        lastPaymentDate: latestPayment?.date,
        lastPaymentAmount: actualAmount > 0 ? actualAmount : undefined,
        lastPaymentMethod: latestPayment?.account,
      }];
    });

    const generatedRaw = [...currentGeneratedRaw, ...historicalGeneratedRaw];

    const generatedBySourceKey = new Map<string, AnyRecord>(
      generatedRaw.map((bill: AnyRecord) => [String(bill.sourceKey), bill]),
    );
    const generated = generatedRaw.filter((bill: AnyRecord) => bill.amount > 0);

    const next = bills.filter((bill) => {
      const sourceKey = String(bill.sourceKey ?? "");
      const isGeneratedCreditCardBill = /^credit-card-statement:[^:]+:/.test(sourceKey);
      if (!isGeneratedCreditCardBill) return true;
      // A settled statement is historical financial data. Keep it in Firestore so
      // Cash Flow can continue showing its Expected and Actual amounts in the
      // original cycle, while active bill views hide it by its Paid status.
      if (String(bill.status ?? "").toLowerCase() === "paid") return true;
      const currentGeneratedBill = generatedBySourceKey.get(sourceKey);
      if (currentGeneratedBill) {
        return amountOf(currentGeneratedBill.amount) > 0 && !isInactiveStatus(currentGeneratedBill.status);
      }
      return amountOf(bill.amount) > 0 && !isInactiveStatus(bill.status);
    });
    let changed = next.length !== bills.length;

    for (const bill of generated) {
      const index = next.findIndex((item) => item.sourceKey === bill.sourceKey);
      if (index < 0) {
        next.push(bill);
        changed = true;
      } else {
        const existing = next[index];
        const merged = {
          ...bill,
          account: existing.account,
          autopayAccount: existing.autopayAccount || bill.autopayAccount,
          notes: existing.notes || bill.notes,
          // Paid statements remain part of the historical Cash Flow cycle.
          // Restore them if an older repair accidentally hid the generated row.
          hiddenFromCashFlow:
            String(existing.status ?? bill.status).toLowerCase() === "paid"
              ? false
              : existing.hiddenFromCashFlow === true,
        };
        if (JSON.stringify(existing) !== JSON.stringify(merged)) {
          next[index] = merged;
          changed = true;
        }
      }
    }

    // A statement source key identifies exactly one obligation. Collapse older
    // duplicate generated records while preferring the copy that contains paid
    // history or an explicit Cash Flow visibility choice.
    const uniqueBills: AnyRecord[] = [];
    const generatedIndex = new Map<string, number>();
    for (const bill of next) {
      const sourceKey = String(bill.sourceKey ?? "");
      if (!/^credit-card-statement:[^:]+:/.test(sourceKey)) {
        uniqueBills.push(bill);
        continue;
      }
      const priorIndex = generatedIndex.get(sourceKey);
      if (priorIndex === undefined) {
        generatedIndex.set(sourceKey, uniqueBills.length);
        uniqueBills.push(bill);
        continue;
      }
      const prior = uniqueBills[priorIndex];
      const priorScore = Number(String(prior.status).toLowerCase() === "paid") * 4 + Number((prior.paymentHistory ?? []).length > 0) * 2 + Number(prior.hiddenFromCashFlow === true);
      const billScore = Number(String(bill.status).toLowerCase() === "paid") * 4 + Number((bill.paymentHistory ?? []).length > 0) * 2 + Number(bill.hiddenFromCashFlow === true);
      if (billScore > priorScore) uniqueBills[priorIndex] = bill;
      changed = true;
    }
    next.splice(0, next.length, ...uniqueBills);

    if (changed) {
      void setDoc(doc(firestore, "users", user.uid, "appData", "bills"), {
        value: next.sort(
          (a: AnyRecord, b: AnyRecord) =>
            String(a.dueDate || "").localeCompare(String(b.dueDate || "")) ||
            String(a.name || "").localeCompare(String(b.name || "")),
        ),
        updatedAt: new Date().toISOString(),
      });
    }

    const currentStatements = wallet.statements ?? [];
    let mergedStatements = [...currentStatements];
    let mergedAccounts = [...(wallet.accounts ?? [])];
    let mergedAccountTransactions = [...(wallet.accountTransactions ?? [])];
    const cardIdByText = new Map(
      (wallet.cards ?? []).map((card: AnyRecord) => [String(card.id), card.id]),
    );
    const cardNameById = new Map(
      (wallet.cards ?? []).map((card: AnyRecord) => [String(card.id), String(card.name ?? "Credit card")]),
    );
    let walletChanged = removedDuplicateWalletEntries;
    let mergedPayments = cleanedPayments.map((payment: AnyRecord) => {
      const cardId = cardIdByText.get(String(payment.cardId));
      if (cardId === undefined || payment.cardId === cardId) return payment;
      walletChanged = true;
      return { ...payment, cardId };
    });
    const mergedTransactions = cleanedTransactions.map((transaction: AnyRecord) => {
      const cardId = cardIdByText.get(String(transaction.cardId));
      if (cardId === undefined || transaction.cardId === cardId) return transaction;
      walletChanged = true;
      return { ...transaction, cardId };
    });

    for (const statement of generatedStatements) {
      const index = mergedStatements.findIndex(
        (item: AnyRecord) =>
          String(item.cardId) === String(statement.cardId) &&
          item.statementDate === statement.statementDate,
      );

      if (index < 0) {
        mergedStatements.push(statement);
        walletChanged = true;
      } else {
        const existing = mergedStatements[index];
        const merged = {
          ...existing,
          ...statement,
        };
        if (JSON.stringify(existing) !== JSON.stringify(merged)) {
          mergedStatements[index] = merged;
          walletChanged = true;
        }
      }
    }

    const paymentAllocationRepair = repairBillPaymentAllocationsFromPayments({
      payments: mergedPayments,
      statements: mergedStatements,
      bills: next,
    });
    if (paymentAllocationRepair.repaired) {
      mergedPayments = paymentAllocationRepair.payments;
      mergedStatements = paymentAllocationRepair.statements;
      walletChanged = true;
    }

    for (const bill of bills) {
      const source = creditCardStatementSource(bill.sourceKey);
      if (!source || String(bill.status ?? "").toLowerCase() !== "paid") continue;

      const historicalPaymentDate = bill.lastPaymentDate ?? bill.paymentDate ?? bill.actualDate;
      const paymentRecords = Array.isArray(bill.paymentHistory) && bill.paymentHistory.length
        ? bill.paymentHistory
        : historicalPaymentDate
          ? [
              {
                id: `bill-payment:${bill.id}:${bill.dueDate}:${historicalPaymentDate}`,
                amount: amountOf(bill.lastPaymentAmount ?? bill.actualAmount ?? bill.paidAmount ?? bill.amount),
                paymentDate: historicalPaymentDate,
                paymentMethod: bill.lastPaymentMethod || bill.account || bill.autopayAccount || "Payment account",
              },
            ]
          : [];

      for (const record of paymentRecords) {
        const recordId = String(record.id ?? `bill-payment:${bill.id}:${bill.dueDate}:${record.paymentDate}`);
        if (deletedCardPaymentKeys.has(recordId) || deletedCardTransactionKeys.has(recordId)) continue;
        const amount = amountOf(record.amount ?? bill.amount);
        const date = String(record.paymentDate ?? bill.lastPaymentDate ?? bill.dueDate ?? todayText);
        const method = String(record.paymentMethod ?? bill.lastPaymentMethod ?? bill.account ?? bill.autopayAccount ?? "Payment account");
        if (amount <= 0) continue;

        const normalizedCardId = cardIdByText.get(source.cardId) ?? source.cardId;
        const generatedPaymentId = paymentId(recordId);
        const generatedNotes = `${recordId} · Reconciled credit card payment from ${method}`;
        const generatedTransaction = {
          id: generatedPaymentId + 1,
          cardId: normalizedCardId,
          account: method,
          date,
          amount,
          notes: generatedNotes,
        };
        if (
          linkedPaymentTransactionIsDeleted(generatedTransaction, deletedCardTransactionKeys) ||
          linkedPaymentFingerprintIsDeleted(generatedTransaction, deletedCardPaymentFingerprints)
        ) {
          walletChanged = true;
          continue;
        }
        const existingPayment =
          cardPaymentFor(mergedPayments, normalizedCardId, date, amount, recordId) ||
          cardPaymentFor(mergedPayments, normalizedCardId, date, amount);
        const existingTransaction =
          paymentTransactionFor(mergedTransactions, normalizedCardId, date, amount, recordId) ||
          paymentTransactionFor(mergedTransactions, normalizedCardId, date, amount);
        const allocationRepair = repairPaymentAllocationToStatement({
          payments: mergedPayments,
          statements: mergedStatements,
          payment: existingPayment,
          cardId: normalizedCardId,
          statementDate: source.statementDate,
          amount,
          date,
        });
        if (allocationRepair.repaired) {
          mergedPayments = allocationRepair.payments;
          mergedStatements = allocationRepair.statements;
          walletChanged = true;
        }
        const bankRepair = appendMissingBankPaymentSide({
          accounts: mergedAccounts,
          accountTransactions: mergedAccountTransactions,
          method,
          marker: recordId,
          cardName: cardNameById.get(String(normalizedCardId)) ?? bill.name,
          date,
          amount,
          id: generatedPaymentId + 2,
        });
        if (bankRepair.repaired) {
          mergedAccounts = bankRepair.accounts;
          mergedAccountTransactions = bankRepair.accountTransactions;
          walletChanged = true;
        }

        // Some older saves contain the posted payment/allocation but not the
        // companion transaction used by the credit-card history UI. Add only
        // the missing display record; never apply or subtract the payment twice.
        if (existingPayment && !existingTransaction) {
          const id = Number(existingPayment.id) || paymentId(recordId);
          const notes = String(existingPayment.notes || `${recordId} · Reconciled credit card payment from ${method}`);
          const repairedTransaction = {
            id: id + 1,
            cardId: normalizedCardId,
            account: method,
            date,
            amount,
            notes,
          };
          if (
            deletedCardTransactionKeys.has(recordId) ||
            linkedPaymentTransactionIsDeleted(repairedTransaction, deletedCardTransactionKeys) ||
            linkedPaymentFingerprintIsDeleted(repairedTransaction, deletedCardPaymentFingerprints)
          ) continue;
          mergedTransactions.push(linkedPaymentTransaction(repairedTransaction));
          walletChanged = true;
          continue;
        }
        if (existingPayment && existingTransaction) continue;

        const cardStatements = mergedStatements.filter(
          (statement: AnyRecord) => String(statement.cardId) === String(normalizedCardId),
        );
        const result = applyPayment(cardStatements as never, amount, date, 0);
        const updatedStatements = new Map(
          result.statements.map((statement: AnyRecord) => [String(statement.id), statement]),
        );
        for (let index = 0; index < mergedStatements.length; index += 1) {
          const replacement = updatedStatements.get(String(mergedStatements[index].id));
          if (replacement) mergedStatements[index] = replacement;
        }

        mergedPayments.push({
          id: generatedPaymentId,
          cardId: normalizedCardId,
          account: method,
          date,
          amount,
          option: "Bill payment",
          status: "Posted",
          notes: generatedNotes,
          allocations: result.allocations,
        });
        if (!existingTransaction) {
          if (
            !deletedCardTransactionKeys.has(recordId) &&
            !linkedPaymentTransactionIsDeleted(generatedTransaction, deletedCardTransactionKeys) &&
            !linkedPaymentFingerprintIsDeleted(generatedTransaction, deletedCardPaymentFingerprints)
          ) {
            mergedTransactions.push(linkedPaymentTransaction(generatedTransaction));
          }
        }
        walletChanged = true;
      }
    }

    // Repair only legacy bank transactions that were created by the bill-payment
    // processor but missed the card-payment side. Avoid guessing from ordinary
    // bank expenses; that can duplicate old card payments and distort balances.
    for (const bankTransaction of wallet.accountTransactions ?? []) {
      const transactionType = String(bankTransaction.type ?? "").toLowerCase();
      if (transactionType !== "expense" && transactionType !== "transfer") continue;
      const marker = paymentMarker(bankTransaction.notes);
      if (!marker || deletedCardPaymentKeys.has(marker) || deletedCardTransactionKeys.has(marker)) continue;
      if (!String(bankTransaction.notes ?? "").includes("Bill payment automatically recorded") && !String(bankTransaction.notes ?? "").includes("Credit card payment transfer")) continue;

      const description = String(bankTransaction.description ?? "")
        .replace(/^payment\s*:\s*/i, "")
        .replace(/^credit\s*card\s*payment\s*to\s*/i, "")
        .trim()
        .toLowerCase();
      const category = String(bankTransaction.category ?? "").toLowerCase();
      const looksLikeCardPayment =
        /credit\s*card/.test(category) || /^payment\s*:/i.test(String(bankTransaction.description ?? ""));
      if (!looksLikeCardPayment || !description) continue;

      const paidCard = (wallet.cards ?? []).find((card: AnyRecord) => {
        const cardName = String(card.name ?? "").trim().toLowerCase();
        return card.active !== false && cardName && (description === cardName || description.includes(cardName));
      });
      if (!paidCard) continue;

      const amount = amountOf(bankTransaction.amount);
      const date = String(bankTransaction.date ?? "");
      if (amount <= 0 || !date) continue;

      const account = (wallet.accounts ?? []).find(
        (item: AnyRecord) => String(item.id) === String(bankTransaction.accountId),
      );
      const method = String(account?.name ?? "Bank account");
      const generatedPaymentId = paymentId(marker);
      const generatedNotes = `${marker} · Reconciled credit card payment from ${method}`;
      const generatedTransaction = {
        id: generatedPaymentId + 1,
        cardId: paidCard.id,
        account: method,
        date,
        amount,
        notes: generatedNotes,
      };
      if (
        linkedPaymentTransactionIsDeleted(generatedTransaction, deletedCardTransactionKeys) ||
        linkedPaymentFingerprintIsDeleted(generatedTransaction, deletedCardPaymentFingerprints)
      ) {
        walletChanged = true;
        continue;
      }
      const existingPayment =
        cardPaymentFor(mergedPayments, paidCard.id, date, amount, marker) ||
        cardPaymentFor(mergedPayments, paidCard.id, date, amount);
      const existingTransaction =
        paymentTransactionFor(mergedTransactions, paidCard.id, date, amount, marker) ||
        paymentTransactionFor(mergedTransactions, paidCard.id, date, amount);
      const bankRepair = appendMissingBankPaymentSide({
        accounts: mergedAccounts,
        accountTransactions: mergedAccountTransactions,
        method,
        marker,
        cardName: String(paidCard.name ?? "Credit card"),
        date,
        amount,
        id: generatedPaymentId + 2,
      });
      if (bankRepair.repaired) {
        mergedAccounts = bankRepair.accounts;
        mergedAccountTransactions = bankRepair.accountTransactions;
        walletChanged = true;
      }

      if (existingPayment && !existingTransaction) {
        const id = Number(existingPayment.id) || paymentId(marker);
        const notes = String(existingPayment.notes || `${marker} · Reconciled credit card payment from ${method}`);
        const repairedTransaction = {
          id: id + 1,
          cardId: paidCard.id,
          account: method,
          date,
          amount,
          notes,
        };
        if (
          deletedCardTransactionKeys.has(marker) ||
          linkedPaymentTransactionIsDeleted(repairedTransaction, deletedCardTransactionKeys) ||
          linkedPaymentFingerprintIsDeleted(repairedTransaction, deletedCardPaymentFingerprints)
        ) continue;
        mergedTransactions.push(linkedPaymentTransaction(repairedTransaction));
        walletChanged = true;
        continue;
      }
      if (existingPayment && existingTransaction) continue;

      const cardStatements = mergedStatements.filter(
        (statement: AnyRecord) => String(statement.cardId) === String(paidCard.id),
      );
      const result = applyPayment(cardStatements as never, amount, date, 0);
      const updatedStatements = new Map(
        result.statements.map((statement: AnyRecord) => [String(statement.id), statement]),
      );
      for (let index = 0; index < mergedStatements.length; index += 1) {
        const replacement = updatedStatements.get(String(mergedStatements[index].id));
        if (replacement) mergedStatements[index] = replacement;
      }

      mergedPayments.push({
        id: generatedPaymentId,
        cardId: paidCard.id,
        account: method,
        date,
        amount,
        option: "Bill payment",
        status: "Posted",
        notes: generatedNotes,
        allocations: result.allocations,
      });
      if (!existingTransaction) {
        if (
          !deletedCardTransactionKeys.has(marker) &&
          !linkedPaymentTransactionIsDeleted(generatedTransaction, deletedCardTransactionKeys) &&
          !linkedPaymentFingerprintIsDeleted(generatedTransaction, deletedCardPaymentFingerprints)
        ) {
          mergedTransactions.push(linkedPaymentTransaction(generatedTransaction));
        }
      }
      walletChanged = true;
    }

    if (walletChanged) {
      const localUpdatedAt = readLocalWalletUpdatedAt();
      if (localUpdatedAt && localUpdatedAt > String(wallet.updatedAt || "")) return;
      void setDoc(doc(firestore, "users", user.uid, "appData", "wallet"), {
        ...wallet,
        deletedCardTransactionKeys: [...deletedCardTransactionKeys],
        deletedCardPaymentKeys: [...deletedCardPaymentKeys],
        deletedCardPaymentFingerprints: [...deletedCardPaymentFingerprints],
        statements: mergedStatements.sort((a: AnyRecord, b: AnyRecord) =>
          b.statementDate.localeCompare(a.statementDate),
        ),
        accounts: mergedAccounts,
        accountTransactions: mergedAccountTransactions,
        payments: mergedPayments,
        transactions: mergedTransactions,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [wallet, bills]);
}
