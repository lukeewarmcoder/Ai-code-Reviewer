export default function PricingPage() {
    return (
        <main className="min-h-screen bg-gray-950 text-white">
            <div className="mx-auto max-w-4xl px-6 py-16 text-center">
                <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
                <p className="mt-3 text-gray-400">
                    Choose the plan that fits your workflow.
                </p>

                <div className="mt-12 grid gap-8 md:grid-cols-2">
                    {/* Free Plan */}
                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8">
                        <h2 className="text-xl font-semibold">Free</h2>
                        <p className="mt-2 text-3xl font-bold">$0</p>
                        <p className="text-sm text-gray-400">forever</p>
                        <ul className="mt-6 space-y-3 text-sm text-gray-300 text-left">
                            <li>✓ 5 reviews / day</li>
                            <li>✓ 300 lines max per review</li>
                            <li>✓ Claude AI analysis</li>
                            <li>✓ All languages supported</li>
                        </ul>
                    </div>

                    {/* PRO Plan */}
                    <div className="rounded-2xl border border-indigo-600 bg-gray-900 p-8 ring-1 ring-indigo-600/30">
                        <h2 className="text-xl font-semibold text-indigo-400">PRO</h2>
                        <p className="mt-2 text-3xl font-bold">$9<span className="text-lg font-normal text-gray-400">/mo</span></p>
                        <ul className="mt-6 space-y-3 text-sm text-gray-300 text-left">
                            <li>✓ 1,000 reviews / day</li>
                            <li>✓ 5,000 lines max per review</li>
                            <li>✓ Priority Claude AI analysis</li>
                            <li>✓ Review history saved</li>
                        </ul>
                        <button className="mt-8 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">
                            Upgrade to PRO
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
