"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth-context";

export default function SignupPage() {
	const router = useRouter();
	const { signup } = useAuth();
	const [email, setEmail] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		// Validate inputs
		if (!email || !displayName || !password) {
			setError("All fields are required");
			setIsSubmitting(false);
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			setIsSubmitting(false);
			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters");
			setIsSubmitting(false);
			return;
		}

		try {
			const success = await signup(email, password, displayName);
			if (success) {
				router.replace("/dashboard");
			} else {
				setError("Signup failed");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			setError(message);
			console.error(err);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<main className="mx-auto max-w-sm px-4 py-10">
			<h1 className="mb-6 font-semibold text-2xl">Create Account</h1>
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
					<Label htmlFor="displayName">Display Name</Label>
					<Input
						id="displayName"
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						placeholder="Your Name"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="At least 6 characters"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="confirmPassword">Confirm Password</Label>
					<Input
						id="confirmPassword"
						type="password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						placeholder="Confirm your password"
					/>
				</div>
				{error ? <p className="text-red-500 text-sm">{error}</p> : null}
				<Button type="submit" disabled={isSubmitting} variant="outline">
					{isSubmitting ? "Creating account..." : "Sign Up"}
				</Button>
			</form>
			<p className="mt-4 text-center text-sm">
				Already have an account?{" "}
				<Link href="/login" className="text-blue-500 hover:underline">
					Sign in
				</Link>
			</p>
		</main>
	);
}

