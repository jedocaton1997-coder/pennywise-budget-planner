import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";
import type { CardTransaction } from "../domain/creditCardEngine";
import type { Installment } from "../domain/planningEngine";
import { recurrenceDates } from "../domain/planningEngine";

type WalletCard = { id: number; name: string; active?: boolean };
type WalletData = {
  cards?: WalletCard[];
  transactions?: CardTransaction[];
  [key: string]: unknown;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const todayIso = () => iso(new Date());

const isCreditCardInstallment = (item: Installment) =>
  item.type === "Credit-card installment" && Boolean(item.linkedCard) && !item.archived;

const installmentTransactionKey = (installmentId: number, number: number) =>
  `Auto installment ${installmentId} #${number}`;

export function useInstallmentCreditSync() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [installments, setInstallments] = useState<Installment[] | null>(null);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    return onSnapshot(doc(firestore, "users", user.uid, "appData", "wallet"), (snapshot) => {
      setWallet(snapshot.exists() ? (snapshot.data() as WalletData) : null);
    });
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    return onSnapshot(doc(firestore, "users", user.uid, "appData", "installments"), (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as { value?: Installment[] }) : {};
      setInstallments(data.value ?? []);
    });
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user || !wallet || !installments) return;

    const cards = wallet.cards ?? [];
    const transactions = wallet.transactions ?? [];
    const today = todayIso();
    const nextTransactions: CardTransaction[] = [...transactions];
    let transactionsChanged = false;
    let installmentsChanged = false;

    const nextInstallments = installments.map((installment) => {
      if (!isCreditCardInstallment(installment) || installment.status === "Completed") return installment;

      const card = cards.find((candidate) => candidate.active !== false && candidate.name === installment.linkedCard);
      if (!card) return installment;

      const schedule = recurrenceDates(installment.start, installment.count);
      let paidCount = Number(installment.paidCount || 0);
      let remainingPayable = Number(installment.remainingPayable || 0);
      let remainingPrincipal = Number(installment.remainingPrincipal || 0);

      schedule.forEach((dueDate, index) => {
        const installmentNumber = index + 1;
        if (index < paidCount || dueDate > today) return;

        const key = installmentTransactionKey(installment.id, installmentNumber);
        const alreadyPosted = nextTransactions.some(
          (transaction) => transaction.cardId === card.id && transaction.notes?.includes(key),
        );
        if (alreadyPosted) {
          paidCount = Math.max(paidCount, installmentNumber);
          return;
        }

        const isLast = installmentNumber === installment.count;
        const monthlyAmount = isLast
          ? Math.max(0, remainingPayable)
          : Math.min(Number(installment.amount || 0), Math.max(0, remainingPayable));
        if (monthlyAmount <= 0) return;

        nextTransactions.push({
          id: Number(`${installment.id}${String(installmentNumber).padStart(3, "0")}`),
          cardId: card.id,
          type: "installment",
          description: `${installment.name} · ${installmentNumber}/${installment.count}`,
          category: installment.category || "Installment",
          amount: monthlyAmount,
          transactionDate: dueDate,
          postedDate: dueDate,
          status: "posted",
          notes: `${key} · Monthly installment posted automatically`,
          expenseCounted: true,
        });

        transactionsChanged = true;
        paidCount = installmentNumber;
        remainingPayable = Math.max(0, remainingPayable - monthlyAmount);
        remainingPrincipal = Math.max(0, remainingPrincipal - monthlyAmount);
      });

      if (
        paidCount !== installment.paidCount ||
        remainingPayable !== installment.remainingPayable ||
        remainingPrincipal !== installment.remainingPrincipal
      ) {
        installmentsChanged = true;
        return {
          ...installment,
          paidCount,
          remainingPayable,
          remainingPrincipal,
          nextDue: schedule[paidCount] ?? installment.finalDue,
          status: remainingPayable <= 0 || paidCount >= installment.count ? "Completed" : "Active",
        };
      }

      return installment;
    });

    if (!transactionsChanged && !installmentsChanged) return;

    if (transactionsChanged) {
      void setDoc(doc(firestore, "users", user.uid, "appData", "wallet"), {
        ...wallet,
        transactions: nextTransactions,
        updatedAt: new Date().toISOString(),
      });
    }

    if (installmentsChanged) {
      void setDoc(doc(firestore, "users", user.uid, "appData", "installments"), {
        value: nextInstallments,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [wallet, installments]);
}
