import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";

type CloudState<T> = {
  value: T;
  updatedAt: string;
};
type CachedState<T> = CloudState<T>;

// Firestore rejects `undefined` anywhere inside nested arrays/objects. Forms may
// legitimately produce optional properties, so strip only undefined values
// before every write while preserving null, false, zero, and empty strings.
const firestoreSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useFirestoreState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean, string] {
  const cacheKey = `pennywise.firestore.${firebaseAuth.currentUser?.uid ?? "signed-out"}.${key}`;
  const readCache=():CachedState<T>|null=>{try{return JSON.parse(localStorage.getItem(cacheKey)||"null") as CachedState<T>|null}catch{return null}};
  const [value, setValue] = useState<T>(()=>readCache()?.value??initialValue);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const lastRemote = useRef("");
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setError("Sign in again to synchronize this section.");
      setReady(true);
      return;
    }
    const reference = doc(firestore, "users", user.uid, "appData", key);
    return onSnapshot(reference, async (snapshot) => {
      if (snapshot.exists()) {
        const cloud=snapshot.data() as CloudState<T>,remote=cloud.value??initialValue,cached=readCache(),useCached=Boolean(cached&&cached.updatedAt>(cloud.updatedAt??"")),resolved=useCached?cached!.value:remote,serialized=JSON.stringify(resolved);
        lastRemote.current = serialized;
        if(serialized!==JSON.stringify(valueRef.current)){
          valueRef.current=resolved;
          setValue(resolved);
        }
        if(useCached)void setDoc(reference,{value:firestoreSafe(resolved),updatedAt:cached!.updatedAt}).catch(()=>setError("Saved on this device. Cloud synchronization is still pending."));
      } else {
        lastRemote.current = JSON.stringify(initialValue);
        await setDoc(reference, { value: firestoreSafe(initialValue), updatedAt: new Date().toISOString() });
      }
      setError("");
      setReady(true);
    }, () => {
      setError("Unable to synchronize this section with Firestore.");
      setReady(true);
    });
  }, [key]);

  const setSyncedValue: Dispatch<SetStateAction<T>> = (update) => {
    const nextValue =
      typeof update === "function"
        ? (update as (current: T) => T)(valueRef.current)
        : update;
    const updatedAt = new Date().toISOString();
    valueRef.current = nextValue;
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ value: firestoreSafe(nextValue), updatedAt }),
    );
    setValue(nextValue);
  };

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!ready || !user) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastRemote.current) return;
    const updatedAt=new Date().toISOString();
    localStorage.setItem(cacheKey,JSON.stringify({value:firestoreSafe(value),updatedAt}));
    void setDoc(doc(firestore, "users", user.uid, "appData", key), {
      value: firestoreSafe(value),
      updatedAt,
    }).then(() => {
      lastRemote.current = serialized;
      setError("");
    }).catch(() => setError("Your latest change could not be synchronized. Please check your connection and try again."));
  }, [cacheKey, key, ready, value]);

  return [value, setSyncedValue, ready, error];
}
