import { useState } from "react";
import { AddCreditCardForm } from "./components/AddCreditCardForm";
import { BankLogo } from "./components/BankLogo";
import type { CreditCard } from "./types/banking";
import "./styles/bank-components.css";

const initialCards: CreditCard[] = [
  {
    id: "sample-bpi",
    bankId: "bpi",
    bankName: "BPI",
    cardName: "BPI Rewards",
    lastFourDigits: "4821",
  },
  {
    id: "sample-metrobank",
    bankId: "metrobank",
    bankName: "Metrobank",
    cardName: "Metrobank Titanium",
    lastFourDigits: "0934",
  },
];

export default function CreditCardWallet() {
  const [cards, setCards] = useState<CreditCard[]>([]);

  function addCard(card: CreditCard) {
    setCards((current) => [...current, card]);
  }

  return (
    <main className="app-shell credit-card-wallet">
      <section className="wallet-header">
        <div>
          <h1>Credit Card Wallet</h1>
          <p>
            Track balances, statements, billing cycles, and
            payments.
          </p>
        </div>
      </section>

      <div className="wallet-layout">
        <section className="card-list-section">
          <div className="section-heading">
            <div>
              <h2>Your cards</h2>
              <p>
                Bank logos are detected from the stored bank
                ID.
              </p>
            </div>

            <span className="card-count">
              {cards.length} cards
            </span>
          </div>

          <div className="credit-card-grid">
            {cards.map((card) => (
              <article
                key={card.id}
                className="credit-card-tile"
              >
                <div className="credit-card-tile__top">
                  <BankLogo
                    bankId={card.bankId}
                    bankName={card.bankName}
                    size="medium"
                  />

                  <span>
                    •••• {card.lastFourDigits}
                  </span>
                </div>

                <div>
                  <h3>{card.cardName}</h3>
                  <p>{card.bankName}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside>
          <AddCreditCardForm onAddCard={addCard} />
        </aside>
      </div>
    </main>
  );
}
