import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import AccountsCardsDashboard from "./AccountsCardsDashboard";
import "./AccountsCardsDashboard.css";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { BankLogo } from './components/BankLogo'
import { BankAutocomplete } from './components/BankAutocomplete'
import { CategoryFields } from './components/CategoryFields'
import { CategoryIcon } from './components/CategoryIcon'
import { ConnectedAccountSelect } from './components/ConnectedAccountSelect'
import { useFirestoreState } from "./hooks/useFirestoreState";
import { createInstallment, type Installment } from "./domain/planningEngine";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  History,
  ArrowLeftRight,
  Plus,
  Receipt,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  applyPayment,
  adjustToWeekday,
  calculateDueDate,
  CardConfig,
  CardPayment,
  CardStatement,
  CardTransaction,
  computeCard,
  createInstallmentSchedule,
  peso,
  previousStatementDate,
  statementCutoffDate,
  statementFromCycle,
} from "./domain/creditCardEngine";
import { firebaseAuth, firestore } from "./lib/firebase";

type Props = { onNotice: (text: string) => void };
const emptyCard: CardConfig = {
  id: 0, bankId: null, name: "", bank: "", last4: "", creditLimit: 0,
  openingBalance: 0, color: "#334155", linkedAccount: "", active: false,
  includeInNetBalance: true,
  statementDay: 1, dueDateRule: "fixed-next-month", fixedDueDay: 1,
  daysAfterStatement: 21, minimumType: "fixed", minimumFixed: 0,
  minimumPercentage: 0, manualMinimum: 0, interestRate: 0, annualFee: 0,
  autoPaymentEnabled: false, autoPaymentMethod: "Minimum payment",
  forecastPreference: "minimum", customPlannedAmount: 0, notes: "",
};
const emptyAccount = { id: 0, name: "", bank: "", type: "Savings", balance: 0, last4: "", customLogo: "" };
type AccountRecord = typeof emptyAccount;
type AccountTransaction = { id: number; accountId: number; date: string; description: string; type: "Income" | "Expense" | "Transfer"; category: string; amount: number; status: "Posted"; notes?: string };
type TransferEndpoint = { key: string; label: string; name: string; kind: "account" | "card"; id: number };
type WalletCloudData = {
  accounts: AccountRecord[];
  cards: CardConfig[];
  accountTransactions: AccountTransaction[];
  transactions: CardTransaction[];
  statements: CardStatement[];
  payments: CardPayment[];
};
type LocalWalletSnapshot = WalletCloudData & { updatedAt: string };
type NetWorthFilter = "All" | "Assets" | "Liabilities";
const maskedMoney = "₱••••••••";
const logoTextColor = (hex: string) => {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 168 ? "#10242c" : "#ffffff";
};
const loadWallet = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};
const loadLocalWalletSnapshot=():LocalWalletSnapshot|null=>loadWallet<LocalWalletSnapshot|null>("pennywise.wallet.snapshot",null);
const truthyFlag=(value:unknown)=>value===true||value==="true"||value===1||value==="1"||value==="yes"||value==="on";
const falseyFlag=(value:unknown)=>value===false||value==="false"||value===0||value==="0"||value==="no"||value==="off";
const cardIsIncludedInNetWorth=(card:CardConfig)=>{
  if(truthyFlag(card.excludeFromNetBalance)||truthyFlag(card.excludedFromNetBalance)||truthyFlag(card.excludeFromNetWorth))return false;
  if(falseyFlag(card.includeInNetBalance))return false;
  return true;
};
const normalizeCards=(items:CardConfig[]=[]):CardConfig[]=>items.map(card=>({...card,includeInNetBalance:cardIsIncludedInNetWorth(card)}));
const cardsSeed: CardConfig[] = [
  {
    id: 1,
    bankId:'bdo',
    name: "BDO Visa Classic",
    bank: "BDO",
    last4: "1234",
    creditLimit: 50000,
    openingBalance: 4950.30,
    color: "#123da4",
    linkedAccount: "BPI Savings",
    active: true,
    includeInNetBalance: true,
    statementDay: 15,
    dueDateRule: "fixed-next-month",
    fixedDueDay: 5,
    daysAfterStatement: 21,
    minimumType: "higher-of",
    minimumFixed: 500,
    minimumPercentage: 3,
    manualMinimum: 0,
    interestRate: 3,
    annualFee: 2250,
    autoPaymentEnabled: false,
    autoPaymentMethod: "Minimum payment",
    forecastPreference: "remaining",
    customPlannedAmount: 0,
    notes: "Primary rewards card",
  },
  {
    id: 2,
    bankId:'bpi',
    name: "BPI Gold Mastercard",
    bank: "Bank of the Philippine Islands",
    last4: "5678",
    creditLimit: 80000,
    openingBalance: -5879.30,
    color: "#171717",
    linkedAccount: "Metrobank Savings",
    active: true,
    includeInNetBalance: true,
    statementDay: 27,
    dueDateRule: "days-after-statement",
    fixedDueDay: 18,
    daysAfterStatement: 21,
    minimumType: "fixed",
    minimumFixed: 850,
    minimumPercentage: 3,
    manualMinimum: 0,
    interestRate: 3,
    annualFee: 2500,
    autoPaymentEnabled: true,
    autoPaymentMethod: "Minimum payment",
    forecastPreference: "minimum",
    customPlannedAmount: 0,
    notes: "",
  },
];
const txSeed: CardTransaction[] = [
  {
    id: 1,
    cardId: 1,
    type: "purchase",
    description: "Groceries",
    category: "Groceries",
    amount: 7000,
    transactionDate: "2026-07-03",
    postedDate: "2026-07-04",
    status: "posted",
    expenseCounted: true,
  },
  {
    id: 2,
    cardId: 1,
    type: "purchase",
    description: "Airline ticket",
    category: "Travel",
    amount: 3000,
    transactionDate: "2026-07-11",
    postedDate: "2026-07-12",
    status: "posted",
    expenseCounted: true,
  },
  {
    id: 3,
    cardId: 1,
    type: "purchase",
    description: "Fuel and transport",
    category: "Transportation",
    amount: 3500,
    transactionDate: "2026-07-17",
    postedDate: "2026-07-18",
    status: "posted",
    expenseCounted: true,
  },
  {
    id: 4,
    cardId: 2,
    type: "purchase",
    description: "Existing migrated balance activity",
    category: "Other",
    amount: 40000,
    transactionDate: "2026-07-10",
    postedDate: "2026-07-10",
    status: "posted",
    expenseCounted: true,
  },
  {
    id: 5,
    cardId: 2,
    type: "refund",
    description: "Merchant refund",
    category: "Shopping",
    amount: 2000,
    transactionDate: "2026-07-16",
    postedDate: "2026-07-17",
    status: "posted",
    expenseCounted: false,
  },
];
const statementSeed: CardStatement[] = [
  {
    ...statementFromCycle(
      cardsSeed[0],
      txSeed,
      "2026-06-16",
      "2026-07-15",
      0,
      101,
    ),
    dueDate: "2026-08-05",
  },
  {
    ...statementFromCycle(
      cardsSeed[1],
      txSeed,
      "2026-06-28",
      "2026-07-27",
      0,
      102,
    ),
    generatedAutomatically: false,
  },
];

export default function CreditCardManagement({ onNotice }: Props) {
  const [cards, setCards] = useState<CardConfig[]>(()=>normalizeCards(loadWallet("pennywise.cards", []))),
    [accounts, setAccounts] = useState<AccountRecord[]>(()=>loadWallet("pennywise.accounts", [])),
    [accountTransactions, setAccountTransactions] = useState<AccountTransaction[]>(()=>loadWallet("pennywise.accountTransactions", [])),
    [transactions, setTransactions] = useState<CardTransaction[]>(()=>loadWallet("pennywise.cardTransactions", [])),
    [statements, setStatements] = useState<CardStatement[]>(()=>loadWallet("pennywise.statements", [])),
    [payments, setPayments] = useState<CardPayment[]>(()=>loadWallet("pennywise.cardPayments", [])),
    [accountView, setAccountView] = useState<"bank" | "credit">("bank"),
    [selectedAccountId, setSelectedAccountId] = useState(1),
    [selectedId, setSelectedId] = useState(1),
    [modal, setModal] = useState<
      "card" | "edit-card" | "account" | "edit-account" | "transaction" | "edit-transaction" | "account-transaction" | "edit-account-transaction" | "account-statement" | "payment" | "statement" | "transfer" | null
    >(null),
    [editingCardTransaction,setEditingCardTransaction]=useState<CardTransaction|null>(null),
    [editingAccountTransaction,setEditingAccountTransaction]=useState<AccountTransaction|null>(null),
    [filter, setFilter] = useState("All"),
    [netWorthFilter,setNetWorthFilter]=useState<NetWorthFilter>("All"),
    [hideNetWorth,setHideNetWorth]=useState(()=>localStorage.getItem("pennywise.hideNetWorth")==="true"),
    [walletReady,setWalletReady]=useState(false),
    [walletError,setWalletError]=useState(""),
    [logoColors,setLogoColors]=useState<Record<string,string>>({});
  const [installments, setInstallments] = useFirestoreState<Installment[]>("installments", []);
  const lastSyncedWallet=useRef("");
  const walletCarousel=useRef<HTMLDivElement>(null);
  const rememberLogoColor=(key:string,color:string)=>setLogoColors(current=>current[key]===color?current:{...current,[key]:color});
  const moveCarousel=(direction:-1|1)=>walletCarousel.current?.scrollBy({left:direction*292,behavior:"smooth"});
  const privatePeso=(value:number)=>hideNetWorth?maskedMoney:peso(value);
  const privateValue=(value:string)=>hideNetWorth?maskedMoney:value;
  const applyNetWorthFilter=(value:NetWorthFilter)=>{setNetWorthFilter(value);if(value==="Assets"&&accounts.length){setAccountView("bank");setSelectedAccountId(accounts[0].id)}if(value==="Liabilities"){const card=cards.find(item=>item.active!==false&&cardIsIncludedInNetWorth(item));if(card){setAccountView("credit");setSelectedId(card.id)}}};
  const firestoreSafeWallet=(value:WalletCloudData)=>JSON.parse(JSON.stringify(value)) as WalletCloudData;
  const persistWalletNow=(next:WalletCloudData)=>{
    const user=firebaseAuth.currentUser;
    if(!user){setWalletError("Sign in again to save your changes.");return Promise.reject(new Error("Not signed in"))}
    const safe=firestoreSafeWallet(next),serialized=JSON.stringify(safe);
    return setDoc(doc(firestore,"users",user.uid,"appData","wallet"),{...safe,updatedAt:new Date().toISOString()}).then(()=>{lastSyncedWallet.current=serialized;setWalletError("")}).catch(error=>{setWalletError("Your latest change could not be synchronized. Please check your connection and try again.");throw error});
  };
  useEffect(()=>{localStorage.setItem("pennywise.accounts",JSON.stringify(accounts))},[accounts]);
  useEffect(()=>{localStorage.setItem("pennywise.accountTransactions",JSON.stringify(accountTransactions))},[accountTransactions]);
  useEffect(()=>{localStorage.setItem("pennywise.cards",JSON.stringify(cards))},[cards]);
  useEffect(()=>{localStorage.setItem("pennywise.cardTransactions",JSON.stringify(transactions))},[transactions]);
  useEffect(()=>{localStorage.setItem("pennywise.statements",JSON.stringify(statements))},[statements]);
  useEffect(()=>{localStorage.setItem("pennywise.cardPayments",JSON.stringify(payments))},[payments]);
  useEffect(()=>{localStorage.setItem("pennywise.hideNetWorth",String(hideNetWorth))},[hideNetWorth]);
  useEffect(()=>{
    if(!walletReady)return;
    const snapshot:LocalWalletSnapshot={accounts,cards,accountTransactions,transactions,statements,payments,updatedAt:new Date().toISOString()};
    localStorage.setItem("pennywise.wallet.snapshot",JSON.stringify(snapshot));
  },[walletReady,accounts,cards,accountTransactions,transactions,statements,payments]);
  useEffect(()=>{
    const user=firebaseAuth.currentUser;
    if(!user){setWalletError("Sign in again to synchronize your wallet.");setWalletReady(true);return;}
    const walletRef=doc(firestore,"users",user.uid,"appData","wallet");
    return onSnapshot(walletRef,async snapshot=>{
      if(snapshot.exists()){
        const data=snapshot.data() as WalletCloudData&{updatedAt?:string};
        const remote:WalletCloudData={accounts:data.accounts??[],cards:data.cards??[],accountTransactions:data.accountTransactions??[],transactions:data.transactions??[],statements:data.statements??[],payments:data.payments??[]},local=loadLocalWalletSnapshot(),localIsNewer=Boolean(local&&local.updatedAt>(data.updatedAt??""));
        const mergedCards=[...(remote.cards??[])];
        if(localIsNewer)for(const localCard of local!.cards??[]){const index=mergedCards.findIndex(remoteCard=>remoteCard.id===localCard.id);if(index>=0)mergedCards[index]=localCard;else mergedCards.push(localCard)}
        const normalized:WalletCloudData=localIsNewer?{accounts:local!.accounts??[],cards:normalizeCards(mergedCards),accountTransactions:local!.accountTransactions??[],transactions:local!.transactions??[],statements:local!.statements??[],payments:local!.payments??[]}:{...remote,cards:normalizeCards(remote.cards)};
        const normalizedStatements=normalized.statements.map(statement=>{const card=normalized.cards.find(item=>item.id===statement.cardId),statementDate=adjustToWeekday(statement.statementDate),cycleStart=card?previousStatementDate(card.statementDay,statementDate):statement.cycleStart,cycleEnd=card?statementCutoffDate(statementDate):statement.cycleEnd;if(card&&statement.generatedAutomatically!==false){const rebuilt=statementFromCycle(card,normalized.transactions,cycleStart,statementDate,statement.previousBalance??0,statement.id),paymentsApplied=statement.paymentsApplied??rebuilt.paymentsApplied,remainingDue=Math.max(0,rebuilt.statementBalance-paymentsApplied);return{...rebuilt,paymentsApplied,remainingDue,status:remainingDue<=0?"Paid":statement.status}}return{...statement,statementDate,dueDate:adjustToWeekday(statement.dueDate),cycleStart,cycleEnd}});
        lastSyncedWallet.current=JSON.stringify({...normalized,statements:normalizedStatements});
        setAccounts(normalized.accounts);setCards(normalized.cards);setAccountTransactions(normalized.accountTransactions);setTransactions(normalized.transactions);setStatements(normalizedStatements);setPayments(normalized.payments);
        if(localIsNewer)void setDoc(walletRef,{...firestoreSafeWallet(normalized),updatedAt:local!.updatedAt}).catch(()=>setWalletError("Saved on this device. Cloud synchronization is still pending."));
      }else{
        const local:WalletCloudData={accounts,cards,accountTransactions,transactions,statements,payments};
        lastSyncedWallet.current=JSON.stringify(local);
        await setDoc(walletRef,{...firestoreSafeWallet(local),updatedAt:new Date().toISOString()});
      }
      setWalletError("");setWalletReady(true);
    },()=>{setWalletError("Unable to synchronize with Firestore. Check the database rules.");setWalletReady(true)});
  },[]);
  useEffect(()=>{
    if(!walletReady||!firebaseAuth.currentUser)return;
    const data:WalletCloudData={accounts,cards,accountTransactions,transactions,statements,payments},serialized=JSON.stringify(data);
    if(serialized===lastSyncedWallet.current)return;
    void setDoc(doc(firestore,"users",firebaseAuth.currentUser.uid,"appData","wallet"),{...firestoreSafeWallet(data),updatedAt:new Date().toISOString()}).then(()=>{lastSyncedWallet.current=serialized;setWalletError("")}).catch(()=>setWalletError("Your latest change could not be synchronized. Please check your connection and try again."));
  },[walletReady,accounts,cards,accountTransactions,transactions,statements,payments]);
  if(!walletReady)return <section className="feature-page credit-wallet"><article className="surface"><p className="empty-card">Loading your accounts and cards…</p></article></section>;
  const reservedForCard=(card:CardConfig)=>installments
    .filter(item=>item.type==="Credit-card installment"&&item.linkedCard===card.name&&!item.archived&&item.status!=="Completed")
    .reduce((sum,item)=>sum+Math.max(0,Number(item.remainingPayable||0)),0);
  const todayIso = new Date().toISOString().slice(0, 10);
  const activeCards=cards.filter((card)=>card.active!==false);
  const includedLiabilityCards=activeCards.filter(cardIsIncludedInNetWorth);
  const excludedLiabilityCards=activeCards.filter(card=>!cardIsIncludedInNetWorth(card));
  const cardMatchTerms=(card:CardConfig)=>[String(card.id),card.name,card.bank,card.last4&&`•••• ${card.last4}`,card.last4].filter(Boolean).map(value=>String(value).trim().toLowerCase());
  const installmentBelongsToExcludedCard=(installment:Installment)=>{
    const values=[installment.linkedCard,installment.fundingSource].filter(Boolean).map(value=>String(value).trim().toLowerCase());
    if(!values.length)return false;
    return excludedLiabilityCards.some(card=>{
      const terms=cardMatchTerms(card);
      return values.some(value=>terms.some(term=>value===term||value.includes(term)));
    });
  };
  const totalAssets=accounts.reduce((sum,account)=>sum+Math.max(0,Number(account.balance||0)),0);
  const totalCardLiabilities=includedLiabilityCards.reduce((sum,card)=>sum+Math.max(0,computeCard(card,transactions,statements,payments,todayIso,reservedForCard(card)).currentBalance),0);
  const totalInstallmentLiabilities=installments.filter(item=>!item.archived&&item.status!=="Completed"&&!installmentBelongsToExcludedCard(item)).reduce((sum,item)=>sum+Math.max(0,Number(item.remainingPayable||0)),0);
  const totalLiabilities=totalCardLiabilities+totalInstallmentLiabilities,netWorth=totalAssets-totalLiabilities;
  const visibleAccounts=netWorthFilter==="Liabilities"?[]:accounts,visibleCards=netWorthFilter==="Assets"?[]:netWorthFilter==="Liabilities"?includedLiabilityCards:activeCards;
  const effectiveAccountView=netWorthFilter==="Assets"?"bank":netWorthFilter==="Liabilities"?"credit":accountView;
  const selectedAccount = visibleAccounts.find((account) => account.id === selectedAccountId) ?? visibleAccounts[0] ?? emptyAccount,
    selected = visibleCards.find((c) => c.id === selectedId) ?? visibleCards[0] ?? emptyCard;
  const selectedAccountTransactions = accountTransactions.filter((transaction) => transaction.accountId === selectedAccount.id),
    computed = computeCard(selected, transactions, statements, payments, todayIso, reservedForCard(selected));
  const sharedLimitRootId=selected.sharedLimitCardId??selected.id,
    sharedLimitOwner=cards.find(card=>card.id===sharedLimitRootId)??selected,
    sharedLimitCards=cards.filter(card=>card.active&&(card.id===sharedLimitRootId||card.sharedLimitCardId===sharedLimitRootId)),
    effectiveCreditLimit=sharedLimitOwner.creditLimit,
    effectiveAvailableCredit=selected.sharedLimitCardId||sharedLimitCards.length>1
      ? Math.max(0,effectiveCreditLimit-sharedLimitCards.reduce((total,card)=>total+Math.max(0,computeCard(card,transactions,statements,payments).currentBalance)+reservedForCard(card),0))
      : computed.availableCredit;
  const accountStatementRows=[...selectedAccountTransactions].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id),
    transactionEffect=(transaction:AccountTransaction)=>transaction.type==="Income"?transaction.amount:transaction.type==="Expense"?-transaction.amount:0,
    totalCredits=accountStatementRows.filter(transaction=>transaction.type==="Income").reduce((sum,transaction)=>sum+transaction.amount,0),
    totalDebits=accountStatementRows.filter(transaction=>transaction.type==="Expense").reduce((sum,transaction)=>sum+transaction.amount,0),
    openingAccountBalance=selectedAccount.balance-accountStatementRows.reduce((sum,transaction)=>sum+transactionEffect(transaction),0);
  let runningAccountBalance=openingAccountBalance;
  const accountStatementBalances=new Map<number,number>();
  accountStatementRows.forEach(transaction=>{runningAccountBalance+=transactionEffect(transaction);accountStatementBalances.set(transaction.id,runningAccountBalance)});
  const averageDailyBalance=accountStatementRows.length?accountStatementRows.reduce((sum,transaction)=>sum+(accountStatementBalances.get(transaction.id)??0),0)/accountStatementRows.length:selectedAccount.balance,
    accountStatementPeriod=accountStatementRows.length?`${pretty(accountStatementRows[0].date)} – ${pretty(accountStatementRows[accountStatementRows.length-1].date)}`:"No activity yet";
  const accountPeriodMap=new Map<string,AccountTransaction[]>();
  accountStatementRows.forEach(transaction=>{const key=transaction.date.slice(0,7),period=accountPeriodMap.get(key)??[];period.push(transaction);accountPeriodMap.set(key,period)});
  const currentMonthKey=new Date().toISOString().slice(0,7),accountPeriods=[...accountPeriodMap.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([key,rows])=>{const [year,month]=key.split("-").map(Number),start=`${key}-01`,end=`${key}-${String(new Date(year,month,0).getDate()).padStart(2,"0")}`;return{key,title:key===currentMonthKey?"Current statement period":"Previous statement period",range:`${pretty(start)} – ${pretty(end)}`,cutoff:end,rows:[...rows].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id)}});
  const displayedStatementDate=adjustToWeekday(computed.lastStatement?.statementDate??computed.currentCycleStart),
    displayedCycleEnd=computed.lastStatement?.cycleEnd??statementCutoffDate(displayedStatementDate),
    displayedCycleStart=computed.lastStatement?.cycleStart??previousStatementDate(selected.statementDay,displayedStatementDate),
    displayedDueDate=adjustToWeekday(computed.lastStatement?.dueDate??calculateDueDate(selected,displayedStatementDate)),
    paymentsAfterStatement=payments.filter(payment=>payment.cardId===selected.id&&payment.status==="Posted"&&payment.date>displayedStatementDate).reduce((total,payment)=>total+payment.amount,0);
  const transferEndpoints: TransferEndpoint[] = [
    ...accounts.map((account) => ({
      key: `account:${account.id}`,
      label: `${account.name} · ${account.bank || account.type}${account.last4 ? ` · •••• ${account.last4}` : ""}`,
      name: account.name,
      kind: "account" as const,
      id: account.id,
    })),
    ...activeCards.map((card) => ({
      key: `card:${card.id}`,
      label: `${card.name} · ${card.bank} · •••• ${card.last4}`,
      name: card.name,
      kind: "card" as const,
      id: card.id,
    })),
  ];
  const selectedTransferKey = effectiveAccountView === "bank" ? `account:${selectedAccount.id}` : `card:${selected.id}`;
  const saveTransfer = (fromKey: string, toKey: string, amount: number, date: string, notes: string) => {
    const from = transferEndpoints.find((endpoint) => endpoint.key === fromKey);
    const to = transferEndpoints.find((endpoint) => endpoint.key === toKey);
    if (!from || !to) { onNotice("Select a valid source and destination."); return; }
    if (from.key === to.key) { onNotice("Choose two different accounts or cards."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { onNotice("Enter a valid transfer amount."); return; }

    const baseId = Date.now();
    if (from.kind === "account" || to.kind === "account") {
      setAccounts((current) => current.map((account) => {
        if (from.kind === "account" && account.id === from.id) return { ...account, balance: Number(account.balance || 0) - amount };
        if (to.kind === "account" && account.id === to.id) return { ...account, balance: Number(account.balance || 0) + amount };
        return account;
      }));
      const accountEntries: AccountTransaction[] = [];
      if (from.kind === "account") accountEntries.push({ id: baseId, accountId: from.id, date, description: `Transfer to ${to.name}`, type: "Transfer", category: "Transfer", amount, status: "Posted", notes: `Outgoing transfer${notes ? ` · ${notes}` : ""}` });
      if (to.kind === "account") accountEntries.push({ id: baseId + 1, accountId: to.id, date, description: `Transfer from ${from.name}`, type: "Transfer", category: "Transfer", amount, status: "Posted", notes: `Incoming transfer${notes ? ` · ${notes}` : ""}` });
      if (accountEntries.length) setAccountTransactions((current) => [...accountEntries, ...current]);
    }

    if (from.kind === "card") {
      setTransactions((current) => [{ id: baseId + 2, cardId: from.id, type: "adjustment", description: `Transfer to ${to.name}`, category: "Transfer", amount, transactionDate: date, postedDate: date, status: "posted", notes: `Outgoing transfer${notes ? ` · ${notes}` : ""}`, expenseCounted: false }, ...current]);
    }
    if (to.kind === "card") {
      setPayments((current) => [{ id: baseId + 3, cardId: to.id, account: from.name, date, amount, option: "Transfer payment", status: "Posted", notes: `Transfer from ${from.name}${notes ? ` · ${notes}` : ""}`, allocations: [{ cycle: "current-cycle", amount, date }] }, ...current]);
    }

    setModal(null);
    onNotice(`${peso(amount)} transferred from ${from.name} to ${to.name}`);
  };
  const savePayment = (
    amount: number,
    account: string,
    date: string,
    option: string,
    notes: string,
  ) => {
    const result = applyPayment(
      statements.filter((s) => s.cardId === selected.id),
      amount,
      date,
      Math.max(0, computed.thisStatementSoFar),
    );
    setStatements((current) =>
      current.map((s) => result.statements.find((x) => x.id === s.id) ?? s),
    );
    setPayments((current) => [
      ...current,
      {
        id: Date.now(),
        cardId: selected.id,
        account,
        date,
        amount,
        option,
        status: "Posted",
        notes,
        allocations: result.allocations,
      },
    ]);
    setModal(null);
    onNotice(
      `${peso(amount)} payment posted · ${result.allocations.length} allocation${result.allocations.length === 1 ? "" : "s"}`,
    );
  };
  const saveTransaction = (txn: CardTransaction | CardTransaction[]) => {
    const entries = Array.isArray(txn) ? txn : [txn];
    setTransactions((current) => [...current, ...entries]);
    setModal(null);
    onNotice(
      `${entries.length} ${entries.length === 1 ? "transaction" : "installment charges"} added to ${selected.name}`,
    );
  };
  const saveCard = (card: CardConfig) => {
    const nextCards=[...cards,card];
    setCards(nextCards);
    setSelectedId(card.id);
    const localSnapshot:LocalWalletSnapshot={accounts,cards:nextCards,accountTransactions,transactions,statements,payments,updatedAt:new Date().toISOString()};
    localStorage.setItem("pennywise.wallet.snapshot",JSON.stringify(localSnapshot));
    setModal(null);onNotice(`${card.name} added and saved`);
    void persistWalletNow(localSnapshot).catch(()=>{});
  };
  const updateCard = (card: CardConfig) => {
    const nextCards=cards.map((item) => item.id === card.id ? card : item);
    setCards(nextCards);
    const localSnapshot:LocalWalletSnapshot={accounts,cards:nextCards,accountTransactions,transactions,statements,payments,updatedAt:new Date().toISOString()};
    localStorage.setItem("pennywise.wallet.snapshot",JSON.stringify(localSnapshot));
    setModal(null);onNotice(`${card.name} updated and saved`);
    void persistWalletNow(localSnapshot).catch(()=>{});
  };
  const archiveCard = (card: CardConfig) => {
    const nextCards=cards.map(item=>item.id===card.id?{...item,active:false}:item),next=nextCards.find(item=>item.id!==card.id&&item.active);
    setCards(nextCards);if(next)setSelectedId(next.id);
    const localSnapshot:LocalWalletSnapshot={accounts,cards:nextCards,accountTransactions,transactions,statements,payments,updatedAt:new Date().toISOString()};
    localStorage.setItem("pennywise.wallet.snapshot",JSON.stringify(localSnapshot));
    setModal(null);onNotice(`${card.name} archived`);
    void persistWalletNow(localSnapshot).catch(()=>{});
  };
  const visibleTransactions = transactions.filter(
    (t) =>
      t.cardId === selected.id &&
      (filter === "All" || t.type === filter.toLowerCase().replace("s", "")),
  );
  const closedStatementTransactions = visibleTransactions.filter((transaction) => transaction.postedDate >= displayedCycleStart && transaction.postedDate <= displayedCycleEnd);
  const transactionCycles = groupTransactionsByBillingCycle(selected, visibleTransactions, computed.currentCycleStart, statementCutoffDate(computed.nextStatementDate), computed.lastStatement);
  const displayedCycle=transactionCycles.find(cycle=>cycle.start===displayedCycleStart&&cycle.end===displayedCycleEnd),displayedCycleTransactions=displayedCycle?.transactions??closedStatementTransactions;
  const cycleSum=(type:CardTransaction["type"])=>displayedCycleTransactions.filter(transaction=>transaction.type===type).reduce((sum,transaction)=>sum+transaction.amount,0),cyclePurchases=cycleSum("purchase"),cycleInstallments=cycleSum("installment"),cycleFees=cycleSum("fee"),cycleInterest=cycleSum("interest"),cycleRefunds=cycleSum("refund"),cycleCredits=cycleSum("credit"),cyclePayments=cycleSum("payment"),cycleNet=cyclePurchases+cycleInstallments+cycleFees+cycleInterest-cycleRefunds-cycleCredits-cyclePayments;
  const displayedStatementBalance=computed.lastStatement?.statementBalance??Math.max(0,cyclePurchases+cycleInstallments+cycleFees+cycleInterest-cycleRefunds-cycleCredits-cyclePayments),
    displayedPaymentStatus=computed.lastStatement?computed.paymentStatus:displayedStatementBalance>0?"Upcoming":"No payment due";
  const statementForViewing:CardStatement=computed.lastStatement??{id:0,cardId:selected.id,cycleStart:displayedCycle?.start??displayedCycleStart,cycleEnd:displayedCycle?.end??displayedCycleEnd,statementDate:displayedStatementDate,dueDate:displayedDueDate,previousBalance:Math.max(0,displayedStatementBalance-cycleNet),purchases:cyclePurchases,installments:cycleInstallments,fees:cycleFees,interest:cycleInterest,paymentsBeforeClose:cyclePayments,refunds:cycleRefunds,credits:cycleCredits,statementBalance:displayedStatementBalance,minimumDue:Math.min(displayedStatementBalance,selected.minimumFixed||displayedStatementBalance),remainingDue:Math.max(0,displayedStatementBalance-paymentsAfterStatement),paymentsApplied:paymentsAfterStatement,status:displayedStatementBalance-paymentsAfterStatement<=0?"Paid":paymentsAfterStatement>0?"Partially paid":"Closed",generatedAutomatically:true};
  return (
    <section className="feature-page credit-wallet">
      {walletError&&<p className="auth-message" role="status">{walletError}</p>}
      <div className="fp-head">
        <div>
          <h2>Accounts & Cards</h2>
          <p>Manage savings, checking, and credit cards in one place.</p>
        </div>
      </div>

      <AccountsCardsDashboard
        accounts={accounts}
        cards={cards}
        accountTransactions={accountTransactions}
        cardTransactions={transactions}
        statements={statements}
        payments={payments}
        selectedAccountId={selectedAccountId}
        selectedCardId={selectedId}
        onSelectAccount={(id) => setSelectedAccountId(Number(id))}
        onSelectCard={(id) => setSelectedId(Number(id))}
        hideBalances={hideNetWorth}
        onAddBankAccount={() => setModal("account")}
        onAddCreditCard={() => setModal("card")}
        onEditAccount={() => setModal("edit-account")}
        onEditCard={() => setModal("edit-card")}
        onAddAccountTransaction={() => setModal("account-transaction")}
        onAddCardTransaction={() => setModal("transaction")}
        onTransfer={() => setModal("transfer")}
        onPayCard={() => setModal("payment")}
        onViewAccountStatement={() => setModal("account-statement")}
        onViewCardStatement={() => setModal("statement")}
      />

      {modal === "payment" && (
        <PaymentModal
          card={selected}
          computed={computed}
          onClose={() => setModal(null)}
          onPay={savePayment}
        />
      )}{" "}
      {modal === "transaction" && (
        <InstallmentAwareTransactionModal
          card={selected}
          onClose={() => setModal(null)}
          onSave={saveTransaction}
        />
      )}{" "}
      {modal === "edit-transaction" && editingCardTransaction && <EditCardTransactionModal transaction={editingCardTransaction} card={selected} onClose={()=>setModal(null)} onSave={updated=>{setTransactions(current=>current.map(transaction=>transaction.id===updated.id?updated:transaction));setModal(null);onNotice(`${updated.description} updated`)}} onDelete={()=>{setTransactions(current=>current.filter(transaction=>transaction.id!==editingCardTransaction.id));setModal(null);onNotice(`${editingCardTransaction.description} deleted`)}} onConvert={(installment,updatedTransaction)=>{setInstallments(current=>[installment,...current]);setTransactions(current=>current.map(transaction=>transaction.id===updatedTransaction.id?updatedTransaction:transaction));setModal(null);onNotice(`${updatedTransaction.description} converted to installment`)}}/>}{" "}
      {modal === "account-statement" && <Modal title="Statement of Account" subtitle={`${selectedAccount.name} · ${accountStatementPeriod}`} onClose={()=>setModal(null)} wide><div className="account-statement modal-account-statement"><div className="account-statement-summary"><Metric label="Credit transactions" value={String(accountStatementRows.filter(transaction=>transaction.type==="Income").length)}/><Metric label="Debit transactions" value={String(accountStatementRows.filter(transaction=>transaction.type==="Expense").length)}/><Metric label="Available balance" value={privatePeso(selectedAccount.balance)}/><Metric label="Current balance" value={privatePeso(selectedAccount.balance)}/><Metric label="Average daily balance" value={privatePeso(averageDailyBalance)}/><Metric label="Total credits" value={privatePeso(totalCredits)}/><Metric label="Total debits" value={privatePeso(totalDebits)}/></div><div className="account-statement-head compact-statement-head"><span aria-hidden="true"/><span>Transaction date</span><span>Description</span><span>Category</span><span>Amount</span><span>Running balance</span></div>{accountStatementRows.length?accountStatementRows.map(transaction=><div className="account-statement-row clickable-row" role="button" tabIndex={0} key={transaction.id} onClick={()=>{setEditingAccountTransaction(transaction);setModal("edit-account-transaction")}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setEditingAccountTransaction(transaction);setModal("edit-account-transaction")}}}><CategoryIcon value={transaction.category} className="account-row-leading-icon"/><span>{pretty(transaction.date)}</span><span><b>{transaction.description}</b><small>{transaction.type}</small></span><span>{transaction.category}</span><strong className={transaction.type==="Income"?"positive":"negative"}>{transaction.type==="Income"?"+":transaction.type==="Expense"?"−":""}{privatePeso(transaction.amount)}</strong><strong>{privatePeso(accountStatementBalances.get(transaction.id)??selectedAccount.balance)}</strong></div>):<p className="empty-card">No transactions in this statement period.</p>}</div></Modal>}{" "}
      {modal === "account-transaction" && (
        <AccountTransactionModal account={selectedAccount} onClose={() => setModal(null)} onSave={(entries) => {
          setAccountTransactions(current => [...current, ...entries]);
          setAccounts(current => current.map(account => account.id === selectedAccount.id ? {...account, balance: entries.reduce((balance, entry) => entry.type === "Income" ? balance + entry.amount : entry.type === "Expense" ? balance - entry.amount : balance, account.balance)} : account));
          setModal(null);onNotice(`${entries.length} transaction${entries.length === 1 ? "" : "s"} added to ${selectedAccount.name}`);
        }}/>
      )}{" "}
      {modal === "edit-account-transaction" && editingAccountTransaction && <AccountTransactionModal account={selectedAccount} transaction={editingAccountTransaction} onClose={()=>setModal(null)} onSave={entries=>{const updated=entries[0];setAccountTransactions(current=>current.map(transaction=>transaction.id===updated.id?updated:transaction));const oldEffect=editingAccountTransaction.type==="Income"?editingAccountTransaction.amount:editingAccountTransaction.type==="Expense"?-editingAccountTransaction.amount:0,newEffect=updated.type==="Income"?updated.amount:updated.type==="Expense"?-updated.amount:0;setAccounts(current=>current.map(account=>account.id===selectedAccount.id?{...account,balance:account.balance-oldEffect+newEffect}:account));setModal(null);onNotice(`${updated.description} updated`)}} onDelete={()=>{const effect=editingAccountTransaction.type==="Income"?editingAccountTransaction.amount:editingAccountTransaction.type==="Expense"?-editingAccountTransaction.amount:0;setAccountTransactions(current=>current.filter(transaction=>transaction.id!==editingAccountTransaction.id));setAccounts(current=>current.map(account=>account.id===selectedAccount.id?{...account,balance:account.balance-effect}:account));setModal(null);onNotice(`${editingAccountTransaction.description} deleted`)}}/>}{" "}
      {modal === "card" && (
        <CardModal cards={cards} onClose={() => setModal(null)} onSave={saveCard} />
      )}{" "}
      {modal === "edit-card" && (
        <CardModal card={selected} cards={cards} onClose={() => setModal(null)} onSave={updateCard} onDelete={()=>archiveCard(selected)} />
      )}{" "}
      {modal === "account" && (
        <AccountModal
          onClose={() => setModal(null)}
          onSave={(a) => {
            setAccounts((v) => [...v, { ...a, id: Date.now() }]);setModal(null);onNotice(`${a.name} account added`);
          }}
        />
      )}{" "}
      {modal === "edit-account" && (
        <AccountModal
          account={selectedAccount}
          onClose={() => setModal(null)}
          onSave={(a) => {setAccounts((current) => current.map((item) => item.id === selectedAccount.id ? {...item, ...a} : item));setModal(null);onNotice(`${a.name} updated`);}}
          onDelete={()=>{const remaining=accounts.filter(account=>account.id!==selectedAccount.id);setAccounts(remaining);setSelectedAccountId(remaining[0]?.id??0);setModal(null);onNotice(`${selectedAccount.name} deleted`)}}
        />
      )}{" "}
      {modal === "transfer" && <TransferMoneyModal endpoints={transferEndpoints} defaultFromKey={selectedTransferKey} onClose={()=>setModal(null)} onTransfer={saveTransfer}/>} {" "}
      {modal === "statement" && (
        <StatementModal
          statement={statementForViewing}
          transactions={displayedCycleTransactions}
          payments={payments.filter((p) => p.cardId === selected.id)}
          onClose={() => setModal(null)}
          onEditTransaction={transaction=>{setEditingCardTransaction(transaction);setModal("edit-transaction")}}
        />
      )}
    </section>
  );
}

const Metric = ({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div>
    <span>{label}</span>
    <b className={tone}>{value}</b>
  </div>
);
function NetWorthSummary({totalAssets,totalLiabilities,netWorth,filter,hidden,onToggleHidden,onFilter}:{totalAssets:number;totalLiabilities:number;netWorth:number;filter:NetWorthFilter;hidden:boolean;onToggleHidden:()=>void;onFilter:(value:NetWorthFilter)=>void}){
  const amount=filter==="Assets"?totalAssets:filter==="Liabilities"?totalLiabilities:netWorth;
  const title=filter==="Assets"?"Assets":filter==="Liabilities"?"Liabilities":"Net Worth";
  const helper=filter==="Assets"?"Total value of asset accounts":filter==="Liabilities"?"Total outstanding liabilities":"Assets minus liabilities";
  const tone=filter==="Liabilities"?"liability":amount<0?"negative":amount>0?"positive":"neutral";
  const formatted=hidden?maskedMoney:peso(amount);
  return <article className={`surface net-worth-summary-card ${tone}`}>
    <div className="net-worth-main">
      <div>
        <span>{title}</span>
        <button type="button" className="net-worth-eye" aria-label={hidden?"Show balances":"Hide balances"} onClick={onToggleHidden}>{hidden?<EyeOff/>:<Eye/>}</button>
      </div>
      <strong>{formatted}</strong>
      <small>{helper}</small>
    </div>
    <div className="net-worth-breakdown" aria-label="Net worth breakdown">
      <span><small>Total Assets</small><b>{hidden?maskedMoney:peso(totalAssets)}</b></span>
      <span><small>Total Liabilities</small><b>{hidden?maskedMoney:peso(totalLiabilities)}</b></span>
      <span><small>Net Worth</small><b className={netWorth<0?"negative":netWorth>0?"positive":""}>{hidden?maskedMoney:peso(netWorth)}</b></span>
    </div>
    <div className="net-worth-filter" role="tablist" aria-label="Net worth filter">
      {(["All","Assets","Liabilities"] as NetWorthFilter[]).map(option=><button key={option} type="button" role="tab" aria-selected={filter===option} className={filter===option?"active":""} onClick={()=>onFilter(option)}>{option}</button>)}
    </div>
  </article>
}
const Row = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);
function AccountTransactionPeriod({title,range,cutoff,rows,balances,accountBalance,onEdit}:{title:string;range:string;cutoff:string;rows:AccountTransaction[];balances:Map<number,number>;accountBalance:number;onEdit:(transaction:AccountTransaction)=>void}){const credits=rows.filter(row=>row.type==="Income").reduce((sum,row)=>sum+row.amount,0),debits=rows.filter(row=>row.type==="Expense").reduce((sum,row)=>sum+row.amount,0);return <section className="transaction-cycle"><div className="transaction-cycle-title"><span><b>{title}</b><small>{range} · Cutoff {pretty(cutoff)}</small></span><div className="cycle-totals account-period-totals"><span><small>Transactions</small><b>{rows.length}</b></span><span><small>Total credits</small><b className="positive">{peso(credits)}</b></span><span><small>Total debits</small><b>{peso(debits)}</b></span></div></div>{rows.map(transaction=><div className="account-statement-row clickable-row" role="button" tabIndex={0} key={transaction.id} onClick={()=>onEdit(transaction)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdit(transaction)}}}><CategoryIcon value={transaction.category} className="account-row-leading-icon"/><span>{pretty(transaction.date)}</span><span><b>{transaction.description}</b><small>{transaction.type}</small></span><span>{transaction.category}</span><strong className={transaction.type==="Income"?"positive":"negative"}>{transaction.type==="Income"?"+":transaction.type==="Expense"?"−":""}{peso(transaction.amount)}</strong><strong>{peso(balances.get(transaction.id)??accountBalance)}</strong></div>)}</section>}

function TransactionCycle({title,range,transactions,onEdit}:{title:string;range:string;transactions:CardTransaction[];onEdit:(transaction:CardTransaction)=>void}){const total=transactions.reduce((sum,transaction)=>sum+(["refund","credit","payment"].includes(transaction.type)?-transaction.amount:transaction.amount),0);return <section className="transaction-cycle"><div className="transaction-cycle-title"><span><b>{title}</b><small>{range} · Cutoff {range.split(" – ")[1]??range}</small></span><div className="cycle-totals"><span><small>Transactions</small><b>{transactions.length}</b></span><span><small>Cycle total</small><b className={total<0?"positive":""}>{peso(total)}</b></span></div></div>{transactions.length?transactions.map(t=><div className="history-row clickable-row" role="button" tabIndex={0} key={t.id} onClick={()=>onEdit(t)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEdit(t)}}}><CategoryIcon value={t.category} className="account-row-leading-icon"/><span>{pretty(t.postedDate)}</span><span><b>{t.description}</b><small>{t.expenseCounted?'Counts once as expense':'Liability/credit activity'}</small></span><span>{t.type}</span><span>{t.category}</span><strong className={["refund","credit","payment"].includes(t.type)?"positive":""}>{["refund","credit","payment"].includes(t.type)?"−":""}{peso(t.amount)}</strong><em>{t.status}</em></div>):<div className="empty-cycle">No transactions in this billing cycle.</div>}</section>}
function groupTransactionsByBillingCycle(card:CardConfig,transactions:CardTransaction[],currentStart:string,currentEnd:string,lastStatement?:CardStatement){
  const cycles=new Map<string,{start:string;end:string;transactions:CardTransaction[]}>();
  cycles.set(`${currentStart}|${currentEnd}`,{start:currentStart,end:currentEnd,transactions:[]});
  if(lastStatement)cycles.set(`${lastStatement.cycleStart}|${lastStatement.cycleEnd}`,{start:lastStatement.cycleStart,end:lastStatement.cycleEnd,transactions:[]});
  for(const transaction of transactions){
    let matching=[...cycles.values()].find(cycle=>transaction.postedDate>=cycle.start&&transaction.postedDate<=cycle.end);
    if(!matching){
      const date=new Date(`${transaction.postedDate}T12:00:00`),days=(year:number,month:number)=>new Date(year,month+1,0).getDate(),isoDate=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
      let statementDate=new Date(date.getFullYear(),date.getMonth(),Math.min(card.statementDay,days(date.getFullYear(),date.getMonth())),12);
      if(date>=statementDate)statementDate=new Date(date.getFullYear(),date.getMonth()+1,Math.min(card.statementDay,days(date.getFullYear(),date.getMonth()+1)),12);
      const statementText=adjustToWeekday(isoDate(statementDate)),startText=previousStatementDate(card.statementDay,statementText),endText=statementCutoffDate(statementText),key=`${startText}|${endText}`;
      matching=cycles.get(key)??{start:startText,end:endText,transactions:[]};cycles.set(key,matching);
    }
    matching.transactions.push(transaction);
  }
  return [...cycles.values()].sort((a,b)=>b.end.localeCompare(a.end)).map(cycle=>({...cycle,title:cycle.start===currentStart&&cycle.end===currentEnd?"Current billing cycle":lastStatement&&cycle.start===lastStatement.cycleStart&&cycle.end===lastStatement.cycleEnd?"Previous statement":"Billing cycle",transactions:cycle.transactions.sort((a,b)=>b.postedDate.localeCompare(a.postedDate))}));
}
const pretty = (date: string) =>
  new Date(`${date}T12:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const dayBefore=(date:string)=>{const value=new Date(`${date}T12:00:00`);value.setDate(value.getDate()-1);return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`};
async function readLogoFile(file:File){if(file.size>5_000_000)throw new Error("Choose an image smaller than 5 MB.");if(file.type==="image/svg+xml"){if(file.size>100_000)throw new Error("Choose an SVG smaller than 100 KB.");return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Logo could not be read."));reader.readAsDataURL(file)})}const url=URL.createObjectURL(file);try{const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error("Logo image is invalid."));element.src=url}),canvas=document.createElement("canvas"),size=160;canvas.width=size;canvas.height=size;const context=canvas.getContext("2d");if(!context)throw new Error("Logo could not be processed.");context.clearRect(0,0,size,size);const scale=Math.min(size/image.width,size/image.height),width=image.width*scale,height=image.height*scale;context.drawImage(image,(size-width)/2,(size-height)/2,width,height);return canvas.toDataURL("image/webp",.82)}finally{URL.revokeObjectURL(url)}}

function PaymentModal({
  card,
  computed,
  onClose,
  onPay,
}: {
  card: CardConfig;
  computed: ReturnType<typeof computeCard>;
  onClose: () => void;
  onPay: (
    amount: number,
    account: string,
    date: string,
    option: string,
    notes: string,
  ) => void;
}) {
  const options = [
    ["Minimum amount due", computed.lastStatement?.minimumDue || 0],
    ["Remaining statement amount", computed.lastStatement?.remainingDue || 0],
    ["Full current balance", Math.max(computed.currentBalance, 0)],
    ["Custom amount", 0],
  ] as const;
  const [choice, setChoice] = useState("Remaining statement amount"),
    [custom, setCustom] = useState("");
  const amount =
    choice === "Custom amount"
      ? Number(custom)
      : options.find((o) => o[0] === choice)?.[1] || 0;
  return (
    <Modal
      title="Pay credit card"
      subtitle="Payments are liability transfers—not new expenses."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onPay(
            amount,
            String(new FormData(e.currentTarget).get("account")),
            String(new FormData(e.currentTarget).get("date")),
            choice,
            String(new FormData(e.currentTarget).get("notes") || ""),
          );
        }}
      >
        <label className="payment-card-field">
          Credit card
          <span><BankLogo bankId={card.bankId} bankName={card.bank} size="small"/><input value={`${card.name} •••• ${card.last4}`} disabled /></span>
        </label>
        <div>
          <label>
            Payment account
            <ConnectedAccountSelect defaultValue={card.linkedAccount} required/>
          </label>
          <label>
            Payment date
            <input name="date" type="date" defaultValue="2026-07-20" required />
          </label>
        </div>
        <label>
          Payment option
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {options.map(([label]) => (
              <option key={label}>{label}</option>
            ))}
          </select>
        </label>
        {choice === "Custom amount" && (
          <label>
            Payment amount
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              type="number"
              min="1"
              required
              autoFocus
            />
          </label>
        )}
        <label>
          Statement receiving payment
          <input
            value={
              computed.lastStatement
                ? `${pretty(computed.lastStatement.statementDate)} · ${peso(computed.lastStatement.remainingDue)} remaining`
                : "Current cycle"
            }
            disabled
          />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button disabled={amount <= 0} className="primary submit">
          Post {peso(amount)} payment
        </button>
      </form>
    </Modal>
  );
}

function TransactionModal({
  card,
  onClose,
  onSave,
}: {
  card: CardConfig;
  onClose: () => void;
  onSave: (t: CardTransaction) => void;
}) {
  const [type, setType] = useState<CardTransaction["type"]>("purchase");
  return (
    <Modal
      title="Add card transaction"
      subtitle="Posted activity is assigned to the correct billing cycle automatically."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            id: Date.now(),
            cardId: card.id,
            type,
            description: String(f.get("description")),
            category: String(f.get("category")),
            amount: Number(f.get("amount")),
            transactionDate: String(f.get("transactionDate")),
            postedDate: String(f.get("postedDate")),
            status: String(f.get("status")) as CardTransaction["status"],
            notes: String(f.get("notes") || ""),
            expenseCounted: [
              "purchase",
              "installment",
              "fee",
              "interest",
            ].includes(type),
          });
        }}
      >
        <div className="form-grid">
          <label>
            Transaction type
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as CardTransaction["type"])
              }
            >
              {[
                "purchase",
                "installment",
                "fee",
                "interest",
                "refund",
                "credit",
                "adjustment",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Card
            <input value={card.name} disabled />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Description
            <input name="description" required autoFocus />
          </label>
          <label>
            Category
            <select name="category">
              <option>Groceries</option>
              <option>Transportation</option>
              <option>Utilities</option>
              <option>Shopping</option>
              <option>Travel</option>
              <option>Medical</option>
              <option>Fees</option>
              <option>Other</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Amount
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Status
            <select name="status">
              <option>posted</option>
              <option>pending</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Transaction date
            <input
              name="transactionDate"
              type="date"
              defaultValue="2026-07-20"
              required
            />
          </label>
          <label>
            Posted date
            <input
              name="postedDate"
              type="date"
              defaultValue="2026-07-20"
              required
            />
          </label>
        </div>
        {type === "installment" && (
          <div className="installment-note">
            <Receipt />
            <span>
              <b>Installment charge</b>
              <small>
                Enter only the installment amount for this billing cycle.
              </small>
            </span>
          </div>
        )}
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button className="primary submit">
          <Plus />
          Add transaction
        </button>
      </form>
    </Modal>
  );
}

function InstallmentAwareTransactionModal({
  card,
  onClose,
  onSave,
}: {
  card: CardConfig;
  onClose: () => void;
  onSave: (t: CardTransaction | CardTransaction[]) => void;
}) {
  const [type, setType] = useState<CardTransaction["type"]>("purchase");
  const [entryMode, setEntryMode] = useState<"manual" | "csv">("manual");
  const [importError, setImportError] = useState("");
  const csvTemplate = "date,description,category,amount,type,notes\n2026-07-20,Sample purchase,Shopping,1250.00,purchase,";

  async function importCsv(file: File) {
    setImportError("");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setImportError("The CSV file does not contain any transactions.");
      return;
    }
    const headers = rows[0].map((value) => value.trim().toLowerCase());
    const required = ["date", "description", "category", "amount", "type"];
    if (!required.every((header) => headers.includes(header))) {
      setImportError("The CSV columns do not match the template. Download the template and try again.");
      return;
    }
    const allowedTypes = new Set(["purchase", "fee", "interest", "refund", "credit", "adjustment"]);
    const values = rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, index) => {
      const value = (name: string) => row[headers.indexOf(name)]?.trim() ?? "";
      const transactionType = value("type").toLowerCase();
      const amount = Number(value("amount").replace(/[,₱$]/g, ""));
      const transactionDate = value("date");
      if (!value("description") || !value("category") || !Number.isFinite(amount) || amount <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !allowedTypes.has(transactionType)) {
        throw new Error(`Row ${index + 2} has an invalid or missing value.`);
      }
      return {
        id: Date.now() + index,
        cardId: card.id,
        type: transactionType as CardTransaction["type"],
        description: value("description"),
        category: value("category"),
        amount,
        transactionDate,
        postedDate: transactionDate,
        status: "posted" as const,
        notes: value("notes"),
        expenseCounted: ["purchase", "fee", "interest"].includes(transactionType),
      };
    });
    if (!values.length) {
      setImportError("The CSV file does not contain any transactions.");
      return;
    }
    onSave(values);
  }
  return (
    <Modal
      title="Add card transaction"
      subtitle="Posted activity is assigned to the correct billing cycle automatically."
      onClose={onClose}
    >
      <div className="transaction-entry-tabs" role="tablist" aria-label="Transaction entry method">
        <button type="button" role="tab" aria-selected={entryMode === "manual"} className={entryMode === "manual" ? "active" : ""} onClick={() => setEntryMode("manual")}>Add one transaction</button>
        <button type="button" role="tab" aria-selected={entryMode === "csv"} className={entryMode === "csv" ? "active" : ""} onClick={() => setEntryMode("csv")}>Import CSV</button>
      </div>
      {entryMode === "csv" ? (
        <div className="card-csv-import">
          <div>
            <b>Import transactions to {card.name}</b>
            <p>Every valid row will be added to this card and assigned to its correct statement cycle.</p>
          </div>
          <div className="csv-column-guide" aria-label="CSV columns">
            {['date','description','category','amount','type','notes (optional)'].map(column => <span key={column}>{column}</span>)}
          </div>
          <a className="outline" download="pennywise-card-transactions-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvTemplate)}`}>Download CSV template</a>
          <label className="primary csv-file-button">
            Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={async event => {
              const file = event.target.files?.[0];
              if (!file) return;
              try { await importCsv(file); } catch (error) { setImportError(error instanceof Error ? error.message : "The CSV file could not be imported."); }
              event.target.value = "";
            }} />
          </label>
          <small>Notes may be blank and edited later. Imported transactions are posted automatically.</small>
          {importError && <div className="form-error" role="alert">{importError}</div>}
        </div>
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            description = String(f.get("description")),
            category = String(f.get("category")),
            date = String(f.get("transactionDate"));
          if (type === "installment") {
            const original = Number(f.get("originalAmount")),
              down = Number(f.get("downPayment") || 0),
              count = Number(f.get("installmentCount")),
              amount = (original - down) / count;
            onSave(
              createInstallmentSchedule(
                {
                  id: Date.now(),
                  cardId: card.id,
                  description,
                  originalAmount: original,
                  downPayment: down,
                  numberOfInstallments: count,
                  installmentAmount: amount,
                  startDate: date,
                  frequency: "Monthly",
                  remainingInstallments: count,
                  remainingPrincipal: original - down,
                  status: "Active",
                },
                category,
              ),
            );
            return;
          }
          onSave({
            id: Date.now(),
            cardId: card.id,
            type,
            description,
            category,
            amount: Number(f.get("amount")),
            transactionDate: date,
            postedDate: date,
            status: "posted",
            notes: String(f.get("notes") || ""),
            expenseCounted: ["purchase", "fee", "interest"].includes(type),
          });
        }}
      >
        <div className="form-grid">
          <label>
            Transaction type
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as CardTransaction["type"])
              }
            >
              {[
                "purchase",
                "installment",
                "fee",
                "interest",
                "refund",
                "credit",
                "adjustment",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Card
            <input value={card.name} disabled />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {type === "installment" ? "Purchase name" : "Description"}
            <input name="description" required autoFocus />
          </label>
        </div>
        <CategoryFields />
        {type === "installment" ? (
          <>
            <div className="form-grid">
              <label>
                Original amount
                <input
                  name="originalAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Down payment
                <input
                  name="downPayment"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue="0"
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Number of installments
                <input
                  name="installmentCount"
                  type="number"
                  min="2"
                  max="60"
                  defaultValue="6"
                  required
                />
              </label>
              <label>
                Payment frequency
                <input value="Monthly" disabled />
              </label>
            </div>
            <div className="installment-note">
              <Receipt />
              <span>
                <b>Automatic installment schedule</b>
                <small>
                  Only each monthly charge enters its applicable billing cycle.
                </small>
              </span>
            </div>
          </>
        ) : (
          <div>
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
          </div>
        )}
        <div className="form-grid">
          <label>
            {type === "installment" ? "Start date" : "Transaction date"}
            <input
              name="transactionDate"
              type="date"
              defaultValue="2026-07-20"
              required
            />
          </label>
        </div>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button className="primary submit">
          <Plus />
          {type === "installment"
            ? "Create installment plan"
            : "Add transaction"}
        </button>
      </form>
      )}
    </Modal>
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function EditCardTransactionModal({transaction,card,onClose,onSave,onDelete,onConvert}:{transaction:CardTransaction;card:CardConfig;onClose:()=>void;onSave:(transaction:CardTransaction)=>void;onDelete:()=>void;onConvert?:(installment:Installment,updatedTransaction:CardTransaction)=>void}){
  const [mode,setMode]=useState<"edit"|"convert">("edit");
  const canConvert=transaction.type==="purchase"&&transaction.status==="posted"&&!/converted-to-installment/i.test(transaction.notes||"");
  if(mode==="convert"&&canConvert){
    return <Modal title="Convert to installment" subtitle={`Create an installment plan from ${transaction.description}.`} onClose={onClose}>
      <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),count=Math.max(1,Number(form.get("count")||1)),start=String(form.get("start")),original=Number(form.get("original")||transaction.amount),downPayment=Number(form.get("downPayment")||0),interest=Number(form.get("interest")||0),fees=Number(form.get("fees")||0),installment=createInstallment({id:Date.now(),name:String(form.get("name")||transaction.description),merchant:String(form.get("merchant")||transaction.description),category:String(form.get("category")||transaction.category),type:"Credit-card installment",original,downPayment,interest,fees,count,paidCount:0,frequency:"Monthly",start,nextDue:start,fundingSource:String(form.get("fundingSource")||card.linkedAccount||card.name),linkedCard:card.name,mode:"Expense by Installment",notes:`Converted from card transaction ${transaction.id}. Original purchase is retained as a neutralized reference.`,archived:false}),updatedTransaction={...transaction,type:"adjustment" as const,amount:0,notes:`converted-to-installment:${installment.id} · Original amount ${peso(original)} · ${transaction.notes||""}`.trim(),expenseCounted:false};onConvert?.(installment,updatedTransaction)}}>
        <div className="installment-note">
          <WalletCards/>
          <span><b>Conversion behavior</b><small>The full installment amount reserves card credit now. Monthly charges will be posted automatically by the Installments schedule.</small></span>
        </div>
        <div className="form-grid"><label>Installment name<input name="name" required autoFocus defaultValue={transaction.description}/></label><label>Merchant<input name="merchant" required defaultValue={transaction.description}/></label></div>
        <CategoryFields defaultValue={transaction.category}/>
        <div className="form-grid"><label>Original purchase amount<input name="original" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={transaction.amount}/></label><label>Down payment<input name="downPayment" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0"/></label></div>
        <div className="form-grid"><label>Interest<input name="interest" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0"/></label><label>Fees<input name="fees" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0"/></label></div>
        <div className="form-grid"><label>Total months<input name="count" type="number" min="1" max="120" required defaultValue="12"/></label><label>Start date<input name="start" type="date" required defaultValue={transaction.postedDate||transaction.transactionDate}/></label></div>
        <div className="form-grid"><label>Connected credit card<input value={card.name} disabled/></label><label>Payment / funding source<input name="fundingSource" defaultValue={card.linkedAccount||card.name}/></label></div>
        <div className="record-edit-actions"><button className="outline" type="button" onClick={()=>setMode("edit")}>Back to edit</button><button className="primary" type="submit"><WalletCards/>Convert to installment</button></div>
      </form>
    </Modal>
  }
  return <Modal title="Edit card transaction" subtitle={`Update this transaction for ${card.name}.`} onClose={onClose}><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),type=String(form.get("type")) as CardTransaction["type"],date=String(form.get("date"));onSave({...transaction,type,description:String(form.get("description")),category:String(form.get("category")),amount:Number(form.get("amount")),transactionDate:date,postedDate:date,status:"posted",notes:String(form.get("notes")||""),expenseCounted:["purchase","installment","fee","interest"].includes(type)})}}><div className="form-grid"><label>Transaction type<select name="type" defaultValue={transaction.type}>{["purchase","installment","fee","interest","refund","credit","adjustment"].map(type=><option key={type}>{type}</option>)}</select></label><label>Card<input value={card.name} disabled/></label></div><label>Description<input name="description" required defaultValue={transaction.description}/></label><CategoryFields defaultValue={transaction.category}/><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={transaction.amount}/></label><label>Transaction date<input name="date" type="date" required defaultValue={transaction.transactionDate}/></label></div><label>Notes (optional)<textarea name="notes" rows={2} defaultValue={transaction.notes}/></label>{canConvert&&<button className="outline submit" type="button" onClick={()=>setMode("convert")}><WalletCards/>Convert transaction to installment</button>}<div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={onDelete}><Trash2/>Delete transaction</button></div></form></Modal>
}

function AccountTransactionModal({account,transaction,onClose,onSave,onDelete}:{account:AccountRecord;transaction?:AccountTransaction;onClose:()=>void;onSave:(entries:AccountTransaction[])=>void;onDelete?:()=>void}) {
  const [mode,setMode]=useState<"manual"|"csv">("manual"),[error,setError]=useState("");
  const template="date,description,category,amount,type,notes\n2026-07-20,Sample expense,Groceries,1250.00,Expense,";
  async function importFile(file:File){
    setError("");const rows=parseCsv(await file.text()),headers=(rows[0]??[]).map(value=>value.trim().toLowerCase()),required=["date","description","category","amount","type"];
    if(!required.every(field=>headers.includes(field))){setError("The CSV columns do not match the template.");return;}
    const entries=rows.slice(1).filter(row=>row.some(cell=>cell.trim())).map((row,index)=>{const value=(name:string)=>row[headers.indexOf(name)]?.trim()??"",amount=Number(value("amount").replace(/[,₱$]/g,"")),type=value("type") as AccountTransaction["type"],date=value("date");if(!value("description")||!value("category")||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!["Income","Expense","Transfer"].includes(type))throw new Error(`Row ${index+2} has an invalid or missing value.`);return{id:Date.now()+index,accountId:account.id,date,description:value("description"),type,category:value("category"),amount,status:"Posted" as const,notes:value("notes")};});
    if(!entries.length){setError("The CSV file does not contain any transactions.");return;}onSave(entries);
  }
  return <Modal title={transaction?"Edit account transaction":"Add account transaction"} subtitle={`Record activity for ${account.name}. Transactions are posted automatically.`} onClose={onClose}>
    {!transaction&&<>
    <div className="transaction-entry-tabs" role="tablist"><button type="button" className={mode==="manual"?"active":""} onClick={()=>setMode("manual")}>Add one transaction</button><button type="button" className={mode==="csv"?"active":""} onClick={()=>setMode("csv")}>Import CSV</button></div>
    </>}
    {!transaction&&mode==="csv"?<div className="card-csv-import"><div><b>Import transactions to {account.name}</b><p>Notes are optional and can be added later.</p></div><div className="csv-column-guide">{["date","description","category","amount","type","notes (optional)"].map(field=><span key={field}>{field}</span>)}</div><a className="outline" download="pennywise-account-transactions-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}>Download CSV template</a><label className="primary csv-file-button">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{await importFile(file)}catch(reason){setError(reason instanceof Error?reason.message:"The CSV file could not be imported.")}event.target.value=""}}/></label>{error&&<div className="form-error" role="alert">{error}</div>}</div>:
    (transaction||mode==="manual")&&<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);onSave([{id:transaction?.id??Date.now(),accountId:account.id,date:String(form.get("date")),description:String(form.get("description")),type:String(form.get("type")) as AccountTransaction["type"],category:String(form.get("category")),amount:Number(form.get("amount")),status:"Posted",notes:String(form.get("notes")||"")}])}}><div className="form-grid"><label>Transaction type<select name="type" defaultValue={transaction?.type??"Expense"}><option>Expense</option><option>Income</option><option>Transfer</option></select></label><label>Account<input value={account.name} disabled/></label></div><label>Description<input name="description" required autoFocus defaultValue={transaction?.description}/></label><CategoryFields defaultValue={transaction?.category}/><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={transaction?.amount}/></label><label>Transaction date<input name="date" type="date" defaultValue={transaction?.date??"2026-07-20"} required/></label></div><label>Notes (optional)<textarea name="notes" rows={2} defaultValue={transaction?.notes}/></label>{transaction?<div className="record-edit-actions"><button className="primary" type="submit">Save changes</button><button className="danger-outline" type="button" onClick={onDelete}><Trash2/>Delete transaction</button></div>:<button className="primary submit"><Plus/>Add transaction</button>}</form>}
  </Modal>
}

function TransferMoneyModal({
  endpoints,
  defaultFromKey,
  onClose,
  onTransfer,
}: {
  endpoints: TransferEndpoint[];
  defaultFromKey: string;
  onClose: () => void;
  onTransfer: (fromKey: string, toKey: string, amount: number, date: string, notes: string) => void;
}) {
  const fallbackFrom = endpoints.find((endpoint) => endpoint.key === defaultFromKey)?.key ?? endpoints[0]?.key ?? "";
  const fallbackTo = endpoints.find((endpoint) => endpoint.key !== fallbackFrom)?.key ?? "";
  const [fromKey, setFromKey] = useState(fallbackFrom);
  const [toKey, setToKey] = useState(fallbackTo);
  const [error, setError] = useState("");

  return (
    <Modal
      title="Transfer money"
      subtitle="Move money between bank accounts, e-wallets, and credit cards."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          const form = new FormData(event.currentTarget);
          const amount = Number(form.get("amount"));
          if (!fromKey || !toKey) {
            setError("Select both source and destination.");
            return;
          }
          if (fromKey === toKey) {
            setError("Source and destination must be different.");
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            setError("Enter a valid transfer amount.");
            return;
          }
          onTransfer(
            fromKey,
            toKey,
            amount,
            String(form.get("date")),
            String(form.get("notes") || ""),
          );
        }}
      >
        <div className="form-grid">
          <label>
            From
            <select value={fromKey} onChange={(event) => setFromKey(event.target.value)} required>
              {endpoints.map((endpoint) => (
                <option key={endpoint.key} value={endpoint.key}>
                  {endpoint.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={toKey} onChange={(event) => setToKey(event.target.value)} required>
              {endpoints.map((endpoint) => (
                <option key={endpoint.key} value={endpoint.key}>
                  {endpoint.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Amount
            <input name="amount" type="number" min="0.01" step="0.01" required autoFocus />
          </label>
          <label>
            Transfer date
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </label>
        </div>
        <label>
          Notes
          <textarea name="notes" rows={2} placeholder="Optional transfer note" />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary submit" type="submit">
          <ArrowLeftRight />
          Transfer money
        </button>
      </form>
    </Modal>
  );
}

function CardModal({
  card,
  cards,
  onClose,
  onSave,
  onDelete,
}: {
  card?: CardConfig;
  cards: CardConfig[];
  onClose: () => void;
  onSave: (c: CardConfig) => void;
  onDelete?: () => void;
}) {
  const [rule, setRule] =
      useState<CardConfig["dueDateRule"]>(card?.dueDateRule ?? "fixed-next-month"),
    [bankName,setBankName]=useState(card?.bank ?? ''),[bankId,setBankId]=useState<string|null>(card?.bankId ?? null),[customLogo,setCustomLogo]=useState(card?.customLogo??""),[logoError,setLogoError]=useState(""),[sharesLimit,setSharesLimit]=useState(Boolean(card?.sharedLimitCardId));
  const shareableCards=cards.filter(candidate=>candidate.active&&candidate.id!==card?.id);
  return (
    <Modal
      title={card ? "Edit credit card" : "Add credit card"}
      subtitle="Set the card details, credit limit, and billing-cycle dates."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            statementDay = Number(f.get("statementDay")),
            excludeFromNetWorth = f.get("excludeFromNetBalance") === "on",
            nextCard: CardConfig = {
              id: card?.id ?? Date.now(),
              bankId,
              customLogo,
              name: String(f.get("name")),
              bank: bankName,
              last4: String(f.get("last4")),
              creditLimit: Number(f.get("limit")),
              sharedLimitCardId: sharesLimit ? Number(f.get("sharedLimitCardId")) || null : null,
              openingBalance: Number(f.get("openingBalance")),
              color: String(f.get("color")),
              linkedAccount: String(f.get("account")),
              active: f.get("status") === "Active",
              includeInNetBalance: !excludeFromNetWorth,
              excludeFromNetBalance: excludeFromNetWorth,
              excludedFromNetBalance: excludeFromNetWorth,
              excludeFromNetWorth,
              statementDay,
              dueDateRule: rule,
              fixedDueDay: Number(f.get("fixedDueDay") || 1),
              daysAfterStatement: Number(f.get("daysAfterStatement") || 1),
              manualDueDate: String(f.get("manualDueDate") || ""),
              minimumType: card?.minimumType ?? "fixed",
              minimumFixed: card?.minimumFixed ?? 0,
              minimumPercentage: card?.minimumPercentage ?? 0,
              manualMinimum: card?.manualMinimum ?? 0,
              interestRate: card?.interestRate ?? 0,
              annualFee: card?.annualFee ?? 0,
              autoPaymentEnabled: card?.autoPaymentEnabled ?? false,
              autoPaymentMethod: card?.autoPaymentMethod ?? "Remaining statement",
              forecastPreference: card?.forecastPreference ?? "remaining",
              customPlannedAmount: card?.customPlannedAmount ?? 0,
              notes: card?.notes ?? "",
            };
          onSave(nextCard);
        }}
      >
        <h3 className="form-section-title">Basic information</h3>
        <div className="form-grid">
          <label>
            Card name
            <input name="name" required autoFocus defaultValue={card?.name} />
          </label>
          <BankAutocomplete value={bankName} selectedBankId={bankId} onValueChange={setBankName} onBankSelect={bank=>setBankId(bank?.id??null)} required/>
        </div>
        <div className="shared-limit-setting">
          <label className="autopay-check">
            <input type="checkbox" checked={sharesLimit} disabled={!shareableCards.length} onChange={event=>setSharesLimit(event.target.checked)} />
            This card shares a credit limit with another card
          </label>
          {sharesLimit&&<label>Share credit limit with<select name="sharedLimitCardId" required defaultValue={card?.sharedLimitCardId??""}><option value="" disabled>Select a credit card</option>{shareableCards.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name} · •••• {candidate.last4}</option>)}</select><small className="field-help">Both cards use one combined limit. Their balances reduce the same available credit.</small></label>}
          {!shareableCards.length&&<small className="field-help">Add another credit card before enabling a shared limit.</small>}
        </div>
        <div className="net-balance-setting">
          <label className="autopay-check">
            <input name="excludeFromNetBalance" type="checkbox" defaultChecked={card?.includeInNetBalance===false} />
            Exclude this card from Net Worth totals
          </label>
          <small className="field-help">The card remains tracked, but its balance is not counted in Total Liabilities or Net Worth.</small>
        </div>
        <div className="logo-upload-row"><BankLogo bankId={bankId} bankName={bankName} customLogo={customLogo} size="large"/><label>Custom logo (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{setCustomLogo(await readLogoFile(file));setLogoError("")}catch(error){setLogoError(error instanceof Error?error.message:"Logo could not be loaded.")}event.target.value=""}}/><small>PNG, JPG, WebP, or SVG. Images are optimized automatically.</small></label>{customLogo&&<button type="button" className="link" onClick={()=>setCustomLogo("")}>Use automatic logo</button>}{logoError&&<div className="form-error">{logoError}</div>}</div>
        <div className="form-grid">
          <label>
            Last four digits
            <input name="last4" pattern="[0-9]{4}" maxLength={4} required defaultValue={card?.last4} />
          </label>
          <label>
            Credit limit
            <input name="limit" type="number" min="1" required defaultValue={card?.creditLimit} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Opening balance
            <input name="openingBalance" type="number" step="0.01" defaultValue={card?.openingBalance ?? 0} />
          </label>
          <label>
            Card color
            <input name="color" type="color" defaultValue={card?.color ?? "#176a3a"} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Payment source (optional)
            <select name="account" defaultValue={card?.linkedAccount ?? ""}>
              <option value="">No linked account</option>
              <option>BPI Savings</option>
              <option>Metrobank Savings</option>
              <option>Cash</option>
            </select>
            <small className="field-help">Only preselects where future card payments come from.</small>
          </label>
          <label>
            Status
            <select name="status" defaultValue={card?.active === false ? "Archived" : "Active"}>
              <option>Active</option>
              <option>Archived</option>
            </select>
          </label>
        </div>
        <h3 className="form-section-title">Billing cycle</h3>
        <div className="form-grid">
          <label>
            Statement day
            <input
              name="statementDay"
              type="number"
              min="1"
              max="31"
              defaultValue={card?.statementDay ?? 15}
              required
            />
          </label>
          <label>
            Due-date rule
            <select
              value={rule}
              onChange={(e) =>
                setRule(e.target.value as CardConfig["dueDateRule"])
              }
            >
              <option value="fixed-next-month">
                Fixed day of following month
              </option>
              <option value="days-after-statement">Days after statement</option>
              <option value="manual">Confirm every statement</option>
            </select>
          </label>
        </div>
        {rule === "fixed-next-month" && (
          <label>
            Fixed payment due day
            <input
              name="fixedDueDay"
              type="number"
              min="1"
              max="31"
              defaultValue={card?.fixedDueDay ?? 5}
              required
            />
          </label>
        )}
        {rule === "days-after-statement" && (
          <label>
            Days after statement
            <input
              name="daysAfterStatement"
              type="number"
              min="1"
              defaultValue={card?.daysAfterStatement ?? 21}
              required
            />
          </label>
        )}
        {rule === "manual" && (
          <label>
            Next payment due date
            <input name="manualDueDate" type="date" required defaultValue={card?.manualDueDate} />
          </label>
        )}
        {card?<div className="record-edit-actions"><button className="primary" type="submit">Save credit card changes</button><button className="danger-outline" type="button" onClick={onDelete}><Trash2/>Archive credit card</button></div>:<button className="primary submit"><Plus/>Add card and open billing cycle</button>}
      </form>
    </Modal>
  );
}

function AccountModal({account,onClose,onSave,onDelete}:{account?:{name:string;bank:string;type:string;balance:number;last4?:string;customLogo?:string};onClose:()=>void;onSave:(a:{name:string;bank:string;bankId?:string|null;type:string;balance:number;last4:string;customLogo:string})=>void;onDelete?:()=>void}){const[type,setType]=useState(account?.type??'Savings'),[bank,setBank]=useState(account?.bank??''),[bankId,setBankId]=useState<string|null>(null),[customLogo,setCustomLogo]=useState(account?.customLogo??""),[logoError,setLogoError]=useState("");
  return <Modal title={account?"Edit bank account":"Add bank account"} subtitle="Manage a savings, checking, cash, or digital-wallet account." onClose={onClose} className="bank-account-modal">
    <form className="bank-account-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({name:String(f.get('name')),bank,bankId,type,balance:Number(f.get('balance')),last4:String(f.get('last4')||''),customLogo})}}>
      <div className="form-grid"><label>Account name<input name="name" required autoFocus placeholder="e.g. BPI Savings" defaultValue={account?.name}/></label><BankAutocomplete value={bank} selectedBankId={bankId} onValueChange={setBank} onBankSelect={match=>setBankId(match?.id??null)} label="Institution" required/></div>
      <div className="form-grid"><label>Account type<select value={type} onChange={e=>setType(e.target.value)}><option>Savings</option><option>Checking</option><option>Cash</option><option>Digital wallet</option></select></label><label>Last four account digits<input name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="1234" defaultValue={account?.last4??''}/></label></div><label>Current balance<input name="balance" type="number" step="0.01" defaultValue={account?.balance??0} required/></label>
      <div className="logo-upload-row"><BankLogo bankName={bank} customLogo={customLogo} size="large"/><label>Custom logo (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{setCustomLogo(await readLogoFile(file));setLogoError("")}catch(error){setLogoError(error instanceof Error?error.message:"Logo could not be loaded.")}event.target.value=""}}/><small>PNG, JPG, WebP, or SVG. Images are optimized automatically.</small></label>{customLogo&&<button type="button" className="link" onClick={()=>setCustomLogo("")}>Use automatic logo</button>}{logoError&&<div className="form-error">{logoError}</div>}</div>
      {account?<div className="record-edit-actions"><button className="primary" type="submit">Save bank account changes</button><button className="danger-outline" type="button" disabled={!onDelete} onClick={onDelete}><Trash2/>Delete bank account</button></div>:<button className="primary submit"><Plus/>Add bank account</button>}
    </form>
  </Modal>
}

function StatementModal({
  statement,
  transactions,
  payments,
  onClose,
  onEditTransaction,
}: {
  statement?: CardStatement;
  transactions: CardTransaction[];
  payments: CardPayment[];
  onClose: () => void;
  onEditTransaction?: (transaction: CardTransaction) => void;
}) {
  return (
    <Modal
      title="Statement breakdown"
      subtitle="Closed statement values remain historically fixed."
      onClose={onClose}
      wide
    >
      {statement ? (
        <div className="statement-modal-body">
          <div className="statement-dates">
            <span>
              <small>Statement</small>
              <b>{pretty(statement.statementDate)}</b>
            </span>
            <span>
              <small>Due</small>
              <b>{pretty(statement.dueDate)}</b>
            </span>
          </div>
          <dl>
            <Row
              label="Previous unpaid balance"
              value={peso(statement.previousBalance)}
            />
            <Row label="Posted purchases" value={peso(statement.purchases)} />
            <Row label="Installments" value={peso(statement.installments)} />
            <Row
              label="Fees + interest"
              value={peso(statement.fees + statement.interest)}
            />
            <Row
              label="Payments before closing"
              value={`−${peso(statement.paymentsBeforeClose)}`}
            />
            <Row
              label="Refunds + credits"
              value={`−${peso(statement.refunds + statement.credits)}`}
            />
            <Row
              label="Original statement balance"
              value={peso(statement.statementBalance)}
            />
            <Row
              label="Payments applied after closing"
              value={`−${peso(statement.paymentsApplied)}`}
            />
            <Row
              label="Remaining amount due"
              value={peso(statement.remainingDue)}
            />
          </dl>
          <h3>Transactions on this statement</h3>
          <div className="statement-transaction-head"><span aria-hidden="true"/><span>Date</span><span>Description</span><span>Category</span><span>Amount</span></div>
          {transactions.length?transactions.map(transaction=><div className="statement-transaction-row clickable-row" role="button" tabIndex={0} key={transaction.id} onClick={()=>onEditTransaction?.(transaction)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onEditTransaction?.(transaction)}}}><CategoryIcon value={transaction.category} className="account-row-leading-icon"/><span>{pretty(transaction.postedDate)}</span><span><b>{transaction.description}</b><small>{transaction.type}</small></span><span>{transaction.category}</span><strong className={["refund","credit","payment"].includes(transaction.type)?"positive":""}>{["refund","credit","payment"].includes(transaction.type)?"−":""}{peso(transaction.amount)}</strong></div>):<div className="empty-cycle">No transactions recorded for this statement period.</div>}
          <h3>Payment allocation history</h3>
          {payments.flatMap((p) =>
            p.allocations.map((a, i) => (
              <div className="allocation-row" key={`${p.id}-${i}`}>
                <span>{pretty(a.date)}</span>
                <b>{peso(a.amount)}</b>
                <em>
                  {a.cycle}
                  {a.statementId ? ` · statement ${a.statementId}` : ""}
                </em>
              </div>
            )),
          )}
        </div>
      ) : (
        <div className="empty-card">No closed statement yet.</div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={["modal", wide ? "card-setup-modal" : "", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
