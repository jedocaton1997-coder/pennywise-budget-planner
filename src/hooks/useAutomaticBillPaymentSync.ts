import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";
import { processBillPayment, type BillForPayment, type WalletForBillPayment } from "../utils/billPaymentProcessor";

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function shouldAutoPay(bill: BillForPayment, today: string) {
  return (
    Boolean(bill.autopay) &&
    Boolean(bill.autopayAccount || bill.account) &&
    !["Paid", "Skipped"].includes(bill.status) &&
    Boolean(bill.dueDate) &&
    bill.dueDate <= today &&
    Number(bill.amount || 0) > 0
  );
}

export function useAutomaticBillPaymentSync() {
  const [bills, setBills] = useState<BillForPayment[] | null>(null);
  const [wallet, setWallet] = useState<WalletForBillPayment | null>(null);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    return onSnapshot(doc(firestore, "users", user.uid, "appData", "bills"), (snapshot) => {
      setBills(snapshot.exists() ? ((snapshot.data().value ?? []) as BillForPayment[]) : []);
    });
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    return onSnapshot(doc(firestore, "users", user.uid, "appData", "wallet"), (snapshot) => {
      setWallet(snapshot.exists() ? (snapshot.data() as WalletForBillPayment) : null);
    });
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user || !bills || !wallet) return;

    const today = todayIso();
    let nextWallet = wallet;
    let changed = false;

    const nextBills = bills.map((bill) => {
      if (!shouldAutoPay(bill, today)) return bill;
      const result = processBillPayment({
        bill,
        wallet: nextWallet,
        paymentMethod: bill.autopayAccount || bill.account || "",
        paymentDate: bill.dueDate,
      });
      if (!result.processed) return bill;
      changed = true;
      nextWallet = result.wallet;
      return result.bill;
    });

    if (!changed) return;

    const updatedAt = new Date().toISOString();
    void setDoc(doc(firestore, "users", user.uid, "appData", "wallet"), {
      ...nextWallet,
      updatedAt,
    });
    void setDoc(doc(firestore, "users", user.uid, "appData", "bills"), {
      value: nextBills,
      updatedAt,
    });
  }, [bills, wallet]);
}
