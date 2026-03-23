import Link from "next/link";

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <Link href="/" className="text-2xl font-bold tracking-tight text-white">
                🧠 AI Code Reviewer
            </Link>
            <div className="flex items-center gap-4">
                <Link
                    href="/pricing"
                    className="text-sm text-gray-400 hover:text-white transition"
                >
                    Pricing
                </Link>
                <Link
                    href="/api/auth/signin"
                    className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition"
                >
                    Sign In
                </Link>
            </div>
        </nav>
    );
}
