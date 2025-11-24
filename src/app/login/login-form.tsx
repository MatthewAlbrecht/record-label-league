"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";

export function LoginForm() {
	const router = useRouter();
	const params = useSearchParams();
	const next = params?.get("next");
	const { login } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		try {
			console.log("Attempting login with:", email);
			const success = await login(email, password);
			console.log("Login result:", success);
			setIsSubmitting(false);

			if (success) {
				console.log("Login successful, redirecting to:", next || "/dashboard");
				router.replace(next || "/dashboard");
			} else {
				console.log("Login failed - invalid credentials");
				setError("Invalid credentials");
			}
		} catch (err) {
			console.error("Login error:", err);
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsSubmitting(false);
		}
	}

	return (
		<main className="mx-auto max-w-sm px-4 py-10">
			<h1 className="mb-6 font-semibold text-2xl">Sign in</h1>
			<form onSubmit={onSubmit} className="space-y-4">
				<div className="flex flex-col gap-1">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="you@example.com"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</div>
				{error ? <p className="text-red-500 text-sm">{error}</p> : null}
				<Button type="submit" disabled={isSubmitting} variant="outline">
					{isSubmitting ? "Signing in..." : "Sign in"}
				</Button>
			</form>
			<p className="mt-4 text-center text-sm">
				Don't have an account?{" "}
				<Link href="/signup" className="text-blue-500 hover:underline">
					Sign up
				</Link>
			</p>
		</main>
	);
}
