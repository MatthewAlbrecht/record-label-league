"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "~/lib/auth-context";

export default function DashboardRedirectPage() {
	const router = useRouter();
	const { isLoading } = useAuth();

	useEffect(() => {
		if (!isLoading) {
			router.replace("/");
		}
	}, [isLoading, router]);

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<p>Redirecting...</p>
		</main>
	);
}
