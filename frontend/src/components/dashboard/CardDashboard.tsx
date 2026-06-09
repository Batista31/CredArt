"use client";

import { useEffect, useState } from "react";
import { getUserCards } from "@/lib/api";

interface Card {
  card_id: string;
  card_name: string;
  issuer: string;
  points_balance: number;
  cash_value_inr: number;
  expiring_soon: number;
}

// Mock data for demo when backend is unavailable
const MOCK_CARDS: Card[] = [
  {
    card_id: "c1",
    card_name: "HDFC Regalia",
    issuer: "HDFC Bank",
    points_balance: 46500,
    cash_value_inr: 4650,
    expiring_soon: 2000,
  },
  {
    card_id: "c2",
    card_name: "Axis Atlas",
    issuer: "Axis Bank",
    points_balance: 18200,
    cash_value_inr: 3640,
    expiring_soon: 0,
  },
  {
    card_id: "c3",
    card_name: "SBI SimplyCLICK",
    issuer: "SBI",
    points_balance: 9800,
    cash_value_inr: 490,
    expiring_soon: 500,
  },
];

export default function CardDashboard({ userId }: { userId: string }) {
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    getUserCards(userId)
      .then(setCards)
      .catch(() => setCards(MOCK_CARDS));
  }, [userId]);

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div
          key={card.card_id}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-sm text-gray-900">{card.card_name}</p>
              <p className="text-xs text-gray-400">{card.issuer}</p>
            </div>
            <span className="text-xs bg-brand-50 text-brand-500 px-2 py-0.5 rounded-full font-medium">
              {card.points_balance.toLocaleString()} pts
            </span>
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>≈ ₹{card.cash_value_inr.toLocaleString()}</span>
            {card.expiring_soon > 0 && (
              <span className="text-amber-600 font-medium">
                ⚠ {card.expiring_soon.toLocaleString()} expiring
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
