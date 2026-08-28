import { useWalletSnapshot } from "../hooks/useWalletSnapshot";

type WalletOption = { id: number; name: string; active?: boolean };
type WalletData = { accounts?: WalletOption[]; cards?: WalletOption[] };

export function ConnectedAccountSelect({name="account",defaultValue="",required=false,showBanks=true,showCards=true,showOther=true}:{name?:string;defaultValue?:string;required?:boolean;showBanks?:boolean;showCards?:boolean;showOther?:boolean}) {
  const [wallet]=useWalletSnapshot<WalletData>({});
  const accounts=wallet.accounts??[],cards=(wallet.cards??[]).filter(card=>card.active!==false);
  return <select name={name} required={required} defaultValue={defaultValue}>
    <option value="" disabled>Select an account</option>
    {showBanks&&!!accounts.length&&<optgroup label="Bank accounts">{accounts.map(account=><option key={`bank-${account.id}`} value={account.name}>{account.name}</option>)}</optgroup>}
    {showCards&&!!cards.length&&<optgroup label="Credit cards">{cards.map(card=><option key={`card-${card.id}`} value={card.name}>{card.name}</option>)}</optgroup>}
    {showBanks&&showOther&&<optgroup label="Other"><option value="Cash">Cash</option><option value="eWallet">eWallet</option></optgroup>}
  </select>;
}
