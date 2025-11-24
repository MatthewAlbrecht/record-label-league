import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { SiteHeader } from "~/app/_components/site-header";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider } from "~/lib/auth-context";
import { ThemeProvider } from "~/lib/theme-context";
import ConvexClientProvider from "~/providers/ConvexProvider";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Record Label League",
	description: "Record Label League",
	icons: [{ rel: "icon", url: "/favicon.svg" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
			<body>
				<ConvexClientProvider>
					<AuthProvider>
						<TRPCReactProvider>
							<ThemeProvider>
								<SiteHeader />
								{children}
								<Toaster />
							</ThemeProvider>
						</TRPCReactProvider>
					</AuthProvider>
				</ConvexClientProvider>
			</body>
		</html>
	);
}
