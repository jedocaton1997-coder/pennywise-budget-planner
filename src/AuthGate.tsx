import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { Leaf, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { firebaseAuth } from "./lib/firebase";

type Props = { children: ReactNode };

const friendlyError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) {
    return "The email or password is incorrect.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
  if (code === "auth/network-request-failed") return "Unable to reach Firebase. Check your connection.";
  return "Sign in failed. Please try again.";
};

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(firebaseAuth, (nextUser) => {
    setUser(nextUser);
    setChecking(false);
  }), []);

  if (checking) {
    return <main className="auth-loading" aria-live="polite"><LoaderCircle/><span>Connecting to MyPersonalFinance…</span></main>;
  }

  if (user) return children;

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await signInWithEmailAndPassword(firebaseAuth, String(form.get("email")).trim(), String(form.get("password")));
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (form: HTMLFormElement) => {
    const email = String(new FormData(form).get("email")).trim();
    if (!email) {
      setMessage("Enter your email address first.");
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      setMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  };

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span><Leaf/></span><b>MyPersonalFinance</b></div>
      <div className="auth-copy"><h1>Welcome back</h1><p>Sign in to securely access your personal budget planner.</p></div>
      <form onSubmit={signIn}>
        <label>Email address<div className="auth-input"><Mail/><input name="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com"/></div></label>
        <label>Password<div className="auth-input"><LockKeyhole/><input name="password" type="password" autoComplete="current-password" required placeholder="Enter your password"/></div></label>
        {message&&<p className="auth-message" role="status">{message}</p>}
        <button className="primary auth-submit" disabled={submitting}>{submitting?<><LoaderCircle className="spin"/>Signing in…</>:"Sign in"}</button>
        <button className="auth-reset" type="button" onClick={(event)=>resetPassword(event.currentTarget.form!)}>Forgot password?</button>
      </form>
      <small>Your financial records are protected by Firebase Authentication.</small>
    </section>
  </main>;
}
