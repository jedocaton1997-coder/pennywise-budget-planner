export type Bank = {
  id: string;
  displayName: string;
  shortName: string;
  aliases: string[];
  logoPath: string;
  primaryColor: string;
  countryCode: string;
};

export type CreditCard = {
  id: string;
  bankId: string | null;
  bankName: string;
  cardName: string;
  lastFourDigits: string;
};

export type CreditCardFormValues = {
  bankId: string | null;
  bankName: string;
  cardName: string;
  lastFourDigits: string;
};
