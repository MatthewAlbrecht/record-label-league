"use client";

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "convex/_generated/api";

type User = {
	id: string;
	email: string;
	displayName: string;
};

type AuthContextType = {
	isAuthenticated: boolean;
	user: User | null;
	login: (email: string, password: string) => Promise<boolean>;
	logout: () => void;
	signup: (email: string, password: string, displayName: string) => Promise<boolean>;
	updateDisplayName: (userId: string, displayName: string) => Promise<boolean>;
	isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const loginAction = useAction(api.auth.login);
	const signupAction = useAction(api.auth.signup);
	const updateDisplayNameMutation = useMutation(api.users.updateDisplayName);

	// Restore auth state from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem("auth-user");
			if (stored) {
				const parsedUser = JSON.parse(stored) as User;
				setUser(parsedUser);
				setIsAuthenticated(true);
			}
		} catch (error) {
			console.error("Failed to restore auth state:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const login = async (
		email: string,
		password: string,
	): Promise<boolean> => {
		try {
			console.log("Auth context: calling loginAction");
			const result = await loginAction({ email, password });
			console.log("Auth context: loginAction result:", result);
			if (result.success) {
				console.log("Auth context: login successful, updating state");
				setUser(result.user);
				setIsAuthenticated(true);
				localStorage.setItem("auth-user", JSON.stringify(result.user));
				return true;
			}
			console.log("Auth context: login unsuccessful");
			return false;
		} catch (error) {
			console.error("Auth context: Login error:", error);
			throw error;
		}
	};

	const signup = async (
		email: string,
		password: string,
		displayName: string,
	): Promise<boolean> => {
		try {
			const result = await signupAction({ email, password, displayName });
			if (result.success) {
				setUser(result.user);
				setIsAuthenticated(true);
				localStorage.setItem("auth-user", JSON.stringify(result.user));
				return true;
			}
			return false;
		} catch (error) {
			console.error("Signup error:", error);
			return false;
		}
	};

	const logout = (): void => {
		setIsAuthenticated(false);
		setUser(null);
		localStorage.removeItem("auth-user");
		window.location.href = "/";
	};

	const updateDisplayName = async (
		userId: string,
		displayName: string,
	): Promise<boolean> => {
		try {
			console.log("Auth context: updating display name");
			await updateDisplayNameMutation({
				userId: userId as Parameters<typeof updateDisplayNameMutation>[0]["userId"],
				displayName,
			});
			console.log("Auth context: display name updated successfully");

			// Update local state
			const updatedUser = { ...user!, displayName };
			setUser(updatedUser);
			localStorage.setItem("auth-user", JSON.stringify(updatedUser));
			return true;
		} catch (error) {
			console.error("Auth context: Update display name error:", error);
			return false;
		}
	};

	return (
		<AuthContext.Provider
			value={{
				isAuthenticated,
				user,
				login,
				logout,
				signup,
				updateDisplayName,
				isLoading,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}
