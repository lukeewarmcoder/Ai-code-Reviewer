export default function Footer() {
    return (
        <footer className="border-t border-gray-800 px-6 py-6 text-center text-sm text-gray-500">
            <p>
                Built with Express, Claude AI & Next.js •{" "}
                <a
                    href="https://github.com/lukeewarmcoder/Ai-code-Reviewer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 transition"
                >
                    GitHub
                </a>
            </p>
        </footer>
    );
}
