"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"
import { useTheme } from "@/lib/client/theme"

const Toaster = ({ ...props }: ToasterProps) => {
	const theme = useTheme()
	return (
		<Sonner
			theme={theme === "lime" ? "dark" : "light"}
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--color-popover)",
					"--normal-text": "var(--color-popover-foreground)",
					"--normal-border": "var(--color-border)",
					"--error-bg": "var(--color-danger)",
					"--error-text": "var(--color-danger-foreground)",
					"--error-border": "var(--color-danger-border)",
					"--warning-bg": "var(--color-warning)",
					"--warning-text": "var(--color-warning-foreground)",
					"--warning-border": "var(--color-warning-border)",
					"--info-bg": "var(--color-info)",
					"--info-text": "var(--color-info-foreground)",
					"--info-border": "var(--color-info-border)",
					"--success-bg": "var(--color-success)",
					"--success-text": "var(--color-success-foreground)",
					"--success-border": "var(--color-success-border)",
				} as React.CSSProperties
			}
			{...props}
		/>
	)
}

export { Toaster }
