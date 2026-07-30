import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";

const walletCacheKey = "pennywise.wallet.snapshot";

type WalletShape = object & { updatedAt?: string };

const firestoreSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const serialize = (value: unknown) => JSON.stringify(firestoreSafe(value));

function readCachedWallet<T extends WalletShape>(fallback: T): T | null {
  try {
    const cached = JSON.parse(localStorage.getItem(walletCacheKey) || "null") as T | null;
    return cached ? ({ ...fallback, ...cached } as T) : null;
  } catch {
    return null;
  }
}

export function readWalletSnapshot<T extends WalletShape>(fallback: T): T {
  return readCachedWallet(fallback) ?? fallback;
}

export function rememberWalletSnapshot<T extends WalletShape>(wallet: T, updatedAt = new Date().toISOString()): T {
  const next = { ...wallet, updatedAt } as T;
  localStorage.setItem(walletCacheKey, serialize(next));
  return next;
}

export function useWalletSnapshot<T extends WalletShape>(fallback: T) {
  const [wallet, setWallet] = useState<T>(() => readWalletSnapshot(fallback));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const walletRef = useRef(wallet);
  const lastRemote = useRef("");

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setReady(true);
      return;
    }

    const reference = doc(firestore, "users", user.uid, "appData", "wallet");
    return onSnapshot(
      reference,
      async (snapshot) => {
        if (!snapshot.exists()) {
          const local = rememberWalletSnapshot(readWalletSnapshot(fallback));
          lastRemote.current = serialize(local);
          await setDoc(reference, firestoreSafe(local));
          setReady(true);
          return;
        }

        const remote = { ...fallback, ...(snapshot.data() as T) } as T;
        const local = readCachedWallet(fallback);
        const resolved =
          local?.updatedAt && local.updatedAt > (remote.updatedAt ?? "")
            ? local
            : remote;
        const serialized = serialize(resolved);

        lastRemote.current = serialized;
        if (serialized !== serialize(walletRef.current)) {
          walletRef.current = resolved;
          setWallet(resolved);
        }

        if (local?.updatedAt && local.updatedAt > (remote.updatedAt ?? "")) {
          void setDoc(reference, firestoreSafe(resolved)).catch(() =>
            setError("Saved on this device. Cloud synchronization is still pending."),
          );
        }

        setError("");
        setReady(true);
      },
      () => {
        setError("Unable to synchronize wallet data with Firestore.");
        setReady(true);
      },
    );
  }, []);

  const saveWallet = (nextWallet: T) => {
    const next = rememberWalletSnapshot(nextWallet);
    walletRef.current = next;
    setWallet(next);

    const user = firebaseAuth.currentUser;
    if (!user) return;

    const serialized = serialize(next);
    if (serialized === lastRemote.current) return;

    void setDoc(doc(firestore, "users", user.uid, "appData", "wallet"), firestoreSafe(next))
      .then(() => {
        lastRemote.current = serialized;
        setError("");
      })
      .catch(() => setError("Your latest wallet change could not be synchronized."));
  };

  return [wallet, saveWallet, ready, error] as const;
}
