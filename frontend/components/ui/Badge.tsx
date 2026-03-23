interface BadgeProps {
    label: string;
    color?: "green" | "yellow" | "red" | "blue" | "gray";
}

const colorMap: Record<string, string> = {
    green: "bg-green-900/40 text-green-400 border-green-700",
    yellow: "bg-yellow-900/40 text-yellow-400 border-yellow-700",
    red: "bg-red-900/40 text-red-400 border-red-700",
    blue: "bg-blue-900/40 text-blue-400 border-blue-700",
    gray: "bg-gray-800 text-gray-400 border-gray-700",
};

export default function Badge({ label, color = "gray" }: BadgeProps) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[color]}`}>
            {label}
        </span>
    );
}
