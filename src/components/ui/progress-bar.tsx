import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
    value: number
    max: number
}

export function ProgressBar({ value, max, className, ...props }: ProgressBarProps) {
    const percentage = Math.round((value / max) * 100)

    return (
        <div className={cn("w-full bg-secondary h-2 rounded-full overflow-hidden", className)} {...props}>
            <div
                className="h-full bg-primary transition-all duration-300 ease-in-out"
                style={{ width: `${percentage}%` }}
            />
        </div>
    )
}
