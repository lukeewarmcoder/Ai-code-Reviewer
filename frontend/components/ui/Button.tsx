import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
}

export default function Button({
    variant = "primary",
    size = "md",
    className = "",
    children,
    ...props
}: ButtonProps) {
    const base = "rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50";

    const variants: Record<string, string> = {
        primary: "bg-indigo-600 text-white hover:bg-indigo-700",
        secondary: "border border-gray-700 bg-gray-800 text-white hover:bg-gray-700",
        ghost: "text-gray-400 hover:text-white hover:bg-gray-800",
    };

    const sizes: Record<string, string> = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
    };

    return (
        <button
            className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
