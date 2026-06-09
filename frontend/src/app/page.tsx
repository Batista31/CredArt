import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-5xl font-bold text-brand-900 mb-3">CredArt</h1>
        <p className="text-xl text-gray-500 mb-8">AI Rewards Concierge</p>
        <p className="text-gray-600 mb-10">
          Stop leaving points on the table. CredArt understands your lifestyle
          and finds the best way to use your rewards — in plain language.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          Open Dashboard
        </Link>
      </div>
    </main>
  );
}
