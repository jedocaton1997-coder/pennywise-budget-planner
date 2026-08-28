import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";

const walletCacheKey = "pennywise.wallet.snapshot";

type WalletShape = object & { updatedAt?: string };

const firestoreSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serialize = (value: unknown) => JSON.stringify(firestoreSafe(value));
const amountOf = (value: unknown) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const paymentFingerprint = (cardId: unknown, date: unknown, amount: unknown) =>
  `${String(cardId)}|${String(date || "")}|${amountOf(amount).toFixed(2)}`;
const paymentMarker = (value: unknown) =>
  String(value ?? "").match(/(?:bill-payment|card-payment):[^·]+/)?.[0] ?? "";
const cardTransactionDeleteKeys = (transaction: Record<string, any>) =>
  [
    paymentMarker(transaction.notes),
    `${String(transaction.cardId)}|${String(transaction.postedDate || transaction.transactionDate || "")}|${String(transaction.type)}|${amountOf(transaction.amount).toFixed(2)}`,
    `${String(transaction.cardId)}|${String(transaction.postedDate || transaction.transactionDate || "")}|${String(transaction.type)}|${amountOf(transaction.amount).toFixed(2)}|${String(transaction.description ?? "")}`,
    `${String(transaction.cardId)}|${String(transaction.postedDate || transaction.transactionDate || "")}|${String(transaction.type)}|${String(transaction.amount)}|${String(transaction.description ?? "")}`,
  ].filter(Boolean);
const cardPaymentDeleteKeys = (payment: Record<string, any>) =>
  [paymentMarker(payment.notes), String(payment.id), `card-payment:${String(payment.id)}`].filter(Boolean);
const cardPaymentDisplayTransactionDeleteKeys = (payment: Record<string, any>) =>
  cardTransactionDeleteKeys({
    id: (Number(payment.id) || 0) + 1,
    cardId: payment.cardId,
    type: "payment",
    description: `Payment from ${String(payment.account || "Payment account")}`,
    amount: amountOf(payment.amount),
    transactionDate: String(payment.date || ""),
    postedDate: String(payment.date || ""),
    notes: String(payment.notes || ""),
  });
const cardTransactionPaymentFingerprint = (transaction: Record<string, any>) =>
  paymentFingerprint(transaction.cardId, String(transaction.postedDate || transaction.transactionDate || ""), transaction.amount);
const cardPaymentFingerprint = (payment: Record<string, any>) =>
  paymentFingerprint(payment.cardId, String(payment.date || ""), payment.amount);
const sanitizeWalletSnapshot = <T extends WalletShape>(wallet: T): T => {
  const value = wallet as Record<string, any>;
  const deletedTransactions = new Set<string>((value.deletedCardTransactionKeys ?? []).map(String));
  const deletedPayments = new Set<string>((value.deletedCardPaymentKeys ?? []).map(String));
  const deletedPaymentFingerprints = new Set<string>((value.deletedCardPaymentFingerprints ?? []).map(String));
  if (!deletedTransactions.size && !deletedPayments.size && !deletedPaymentFingerprints.size) return wallet;
  return {
    ...wallet,
    transactions: Array.isArray(value.transactions)
      ? value.transactions
          .filter((transaction: Record<string, any>) => !cardTransactionDeleteKeys(transaction).some((key) => deletedTransactions.has(key)))
          .filter((transaction: Record<string, any>) => String(transaction.type).toLowerCase() !== "payment" || !deletedPaymentFingerprints.has(cardTransactionPaymentFingerprint(transaction)))
      : value.transactions,
    payments: Array.isArray(value.payments)
      ? value.payments.filter((payment: Record<string, any>) => !cardPaymentDeleteKeys(payment).some((key) => deletedPayments.has(key)))
          .filter((payment: Record<string, any>) => !cardPaymentDisplayTransactionDeleteKeys(payment).some((key) => deletedTransactions.has(key)))
          .filter((payment: Record<string, any>) => !deletedPaymentFingerprints.has(cardPaymentFingerprint(payment)))
      : value.payments,
  } as T;
};

function readCachedWallet<T extends WalletShape>(fallback: T): T | null {
  try {
    const cached = JSON.parse(localStorage.getItem(walletCacheKey) || "null") as T | null;
    return cached ? ({ ...fallback, ...cached } as T) : null;
  } catch {
    return null;
  }
}

export function readWalletSnapshot<T extends WalletShape>(fallback: T): T {
  return sanitizeWalletSnapshot(readCachedWallet(fallback) ?? fallback);
}

export function rememberWalletSnapshot<T extends WalletShape>(wallet: T, updatedAt = new Date().toISOString()): T {
  const next = sanitizeWalletSnapshot({ ...wallet, updatedAt } as T);
  localStorage.setItem(walletCacheKey, serialize(next));
  return next;
}

export function useWalletSnapshot<T extends WalletShape>(fallback: T) {
  const [wallet, setWallet] = useState<T>(() => readWalletSnapshot(fallback));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const walletRef = useRef(wallet);
  const lastRemote = useRef("");

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setReady(true);
      return;
    }

    const reference = doc(firestore, "users", user.uid, "appData", "wallet");
    return onSnapshot(
      reference,
      async (snapshot) => {
        if (!snapshot.exists()) {
          const local = rememberWalletSnapshot(readWalletSnapshot(fallback));
          lastRemote.current = serialize(local);
          await setDoc(reference, firestoreSafe(local));
          setReady(true);
          return;
        }

        const remote = sanitizeWalletSnapshot({ ...fallback, ...(snapshot.data() as T) } as T);
        const local = readCachedWallet(fallback);
        const resolved =
          local?.updatedAt && local.updatedAt > (remote.updatedAt ?? "")
            ? sanitizeWalletSnapshot(local)
            : remote;
        const serialized = serialize(resolved);

        lastRemote.current = serialized;
        if (serialized !== serialize(walletRef.current)) {
          walletRef.current = resolved;
          setWallet(resolved);
        }

        if (local?.updatedAt && local.updatedAt > (remote.updatedAt ?? "")) {
          void setDoc(reference, firestoreSafe(resolved)).catch(() =>
            setError("Saved on this device. Cloud synchronization is still pending."),
          );
        }

        setError("");
        setReady(true);
      },
      () => {
        setError("Unable to synchronize wallet data with Firestore.");
        setReady(true);
      },
    );
  }, []);

  const saveWallet = (nextWallet: T) => {
    const next = rememberWalletSnapshot(nextWallet);
    walletRef.current = next;
    setWallet(next);

    const user = firebaseAuth.currentUser;
    if (!user) return;

    const serialized = serialize(next);
    if (serialized === lastRemote.current) return;

    void setDoc(doc(firestore, "users", user.uid, "appData", "wallet"), firestoreSafe(next))
      .then(() => {
        lastRemote.current = serialized;
        setError("");
      })
      .catch(() => setError("Your latest wallet change could not be synchronized."));
  };

  return [wallet, saveWallet, ready, error] as const;
}
