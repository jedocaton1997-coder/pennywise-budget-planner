export type InstitutionCategory =
  | "traditional_bank"
  | "thrift_bank"
  | "digital_bank"
  | "digital_first_bank"
  | "e_wallet"
  | "international_wallet"
  | "manual";

export type FinancialInstitution = {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  category: InstitutionCategory;
  countryCode: "PH" | "GLOBAL";
  logoPath: string;
};

export const financialInstitutions: FinancialInstitution[] = [
  {
    id: "bpi",
    name: "Bank of the Philippine Islands",
    shortName: "BPI",
    aliases: ["bpi", "bank of the philippine islands"],
    category: "traditional_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/bpi.svg",
  },
  {
    id: "bdo",
    name: "BDO Unibank",
    shortName: "BDO",
    aliases: ["bdo", "bdo unibank", "banco de oro"],
    category: "traditional_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/bdo.svg",
  },
  {
    id: "metrobank",
    name: "Metropolitan Bank & Trust Company",
    shortName: "Metrobank",
    aliases: ["metrobank", "metropolitan bank", "mbtc"],
    category: "traditional_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/metrobank.svg",
  },
  {
    id: "unionbank",
    name: "UnionBank of the Philippines",
    shortName: "UnionBank",
    aliases: ["unionbank", "union bank", "ubp"],
    category: "traditional_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/unionbank.svg",
  },
  {
    id: "gotyme-bank",
    name: "GoTyme Bank",
    shortName: "GoTyme",
    aliases: ["gotyme", "go tyme", "gotyme bank"],
    category: "digital_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/gotyme.svg",
  },
  {
    id: "maya-bank",
    name: "Maya Bank",
    shortName: "Maya Bank",
    aliases: ["maya bank"],
    category: "digital_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/maya-bank.svg",
  },
  {
    id: "tonik-bank",
    name: "Tonik Digital Bank",
    shortName: "Tonik",
    aliases: ["tonik", "tonik bank", "tonik digital bank"],
    category: "digital_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/tonik.svg",
  },
  {
    id: "seabank",
    name: "SeaBank Philippines",
    shortName: "SeaBank",
    aliases: ["seabank", "sea bank"],
    category: "digital_first_bank",
    countryCode: "PH",
    logoPath: "/institution-logos/seabank.svg",
  },
  {
    id: "gcash",
    name: "GCash",
    shortName: "GCash",
    aliases: ["gcash", "g cash"],
    category: "e_wallet",
    countryCode: "PH",
    logoPath: "/institution-logos/gcash.svg",
  },
  {
    id: "maya-wallet",
    name: "Maya Wallet",
    shortName: "Maya",
    aliases: ["maya wallet", "paymaya", "pay maya"],
    category: "e_wallet",
    countryCode: "PH",
    logoPath: "/institution-logos/maya-wallet.svg",
  },
  {
    id: "shopeepay",
    name: "ShopeePay",
    shortName: "ShopeePay",
    aliases: ["shopeepay", "shopee pay"],
    category: "e_wallet",
    countryCode: "PH",
    logoPath: "/institution-logos/shopeepay.svg",
  },
  {
    id: "grabpay",
    name: "GrabPay",
    shortName: "GrabPay",
    aliases: ["grabpay", "grab pay"],
    category: "e_wallet",
    countryCode: "PH",
    logoPath: "/institution-logos/grabpay.svg",
  },
  {
    id: "coins-ph",
    name: "Coins.ph",
    shortName: "Coins.ph",
    aliases: ["coins.ph", "coins ph", "coins"],
    category: "e_wallet",
    countryCode: "PH",
    logoPath: "/institution-logos/coins-ph.svg",
  },
  {
    id: "cash",
    name: "Cash",
    shortName: "Cash",
    aliases: ["cash", "wallet", "physical cash"],
    category: "manual",
    countryCode: "PH",
    logoPath: "/institution-logos/cash.svg",
  },
];
