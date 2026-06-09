"use client";

import CardDashboard from "@/components/dashboard/CardDashboard";
import ChatWindow from "@/components/chat/ChatWindow";

const DEMO_USER_ID = "user_riya_demo";

export default function DashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 border-r border-gray-200 overflow-y-auto bg-white p-4">
        <h2 className="text-lg font-semibold mb-4 text-brand-900">Your Cards</h2>
        <CardDashboard userId={DEMO_USER_ID} />
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b border-gray-200 px-6 py-4 bg-white">
          <h1 className="text-xl font-bold text-brand-900">CredArt</h1>
          <p className="text-sm text-gray-400">AI Rewards Concierge</p>
        </header>
        <div className="flex-1 overflow-hidden">
          <ChatWindow userId={DEMO_USER_ID} />
        </div>
      </main>
    </div>
  );
}
