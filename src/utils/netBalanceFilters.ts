type CardLike={id:number|string;name?:string;active?:boolean;includeInNetBalance?:boolean}
type CardTransactionLike={cardId:number|string}
type BillLike={sourceKey?:string;category?:string;name?:string}

export function includedCardIds(cards:CardLike[]=[]){
  return new Set(cards.filter(card=>card.active!==false&&card.includeInNetBalance!==false).map(card=>String(card.id)))
}

export function usesIncludedCard<T extends CardTransactionLike>(transaction:T,cards:CardLike[]=[]){
  return includedCardIds(cards).has(String(transaction.cardId))
}

export function filterIncludedCardTransactions<T extends CardTransactionLike>(transactions:T[]=[],cards:CardLike[]=[]){
  const ids=includedCardIds(cards)
  return transactions.filter(transaction=>ids.has(String(transaction.cardId)))
}

export function billUsesIncludedCard<T extends BillLike>(bill:T,cards:CardLike[]=[]){
  const source=String(bill.sourceKey??'')
  const sourceMatch=source.match(/^credit-card-statement:(\d+):/)
  if(sourceMatch)return includedCardIds(cards).has(sourceMatch[1])

  if(!/credit\s*card/i.test(String(bill.category??'')))return true

  const billName=String(bill.name??'').replace(/\s+statement$/i,'').trim().toLowerCase()
  const matchingCard=cards.find(card=>String(card.name??'').trim().toLowerCase()===billName)
  return matchingCard?matchingCard.includeInNetBalance!==false:true
}
