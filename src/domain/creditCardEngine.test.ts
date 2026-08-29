import { allocatedPaymentsForStatement, reconciledStatementDue, reconciledStatementStatus } from "./creditCardEngine";

const equal = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
};

// A generated zero statement may have been saved as Paid before late-synced
// activity arrives. The rebuilt closed-cycle balance must become payable.
equal(reconciledStatementDue(14536.56, 0, 0), 14536.56, "closed cycle rolls into payment due");
equal(reconciledStatementStatus(14536.56, 0), "Closed", "stale paid status reopens");

// Genuine payments, not a saved status label, determine what remains due.
equal(reconciledStatementDue(15186.46, 5000, 5000), 10186.46, "partial payment reduces due");
equal(reconciledStatementStatus(10186.46, 5000), "Partially paid", "partial payment status");
equal(reconciledStatementDue(8455.75, 8455.75, 8455.75), 0, "full payment settles statement");
equal(reconciledStatementStatus(0, 8455.75), "Paid", "full payment status");

const priorStatementPayment = [{
  id: 1,
  cardId: 7,
  account: "MariBank",
  date: "2026-08-15",
  amount: 10257.5,
  option: "Bill payment",
  status: "Posted" as const,
  notes: "",
  allocations: [{ statementId: 724, cycle: "statement" as const, amount: 10257.5, date: "2026-08-15" }],
}];
equal(allocatedPaymentsForStatement(priorStatementPayment, 824), 0, "prior payment does not populate newer statement");
equal(allocatedPaymentsForStatement(priorStatementPayment, 724), 10257.5, "payment remains on its original statement");
