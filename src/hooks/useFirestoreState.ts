import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "../lib/firebase";

type CloudState<T> = {
  value: T;
  updatedAt: string;
};
type CachedState<T> = CloudState<T>;

// Firestore rejects `undefined` and arrays nested directly inside arrays.
// Some legacy sections still store compact row data as string[][], so encode
// only nested arrays for cloud writes and decode them back before app code sees
// the value.
const nestedArrayMarker = "__pennywiseNestedArray";

const jsonSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const encodeForFirestore = (value: unknown, arrayDepth = 0): unknown => {
  if (Array.isArray(value)) {
    const encoded = value.map((item) => encodeForFirestore(item, arrayDepth + 1));
    return arrayDepth > 0 ? { [nestedArrayMarker]: encoded } : encoded;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        encodeForFirestore(item, arrayDepth),
      ]),
    );
  }

  return value;
};

const decodeFromFirestore = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => decodeFromFirestore(item));

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, nestedArrayMarker) &&
      Array.isArray(record[nestedArrayMarker])
    ) {
      return (record[nestedArrayMarker] as unknown[]).map((item) =>
        decodeFromFirestore(item),
      );
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, decodeFromFirestore(item)]),
    );
  }

  return value;
};

const firestoreSafe = <T,>(value: T): T => encodeForFirestore(jsonSafe(value)) as T;
const firestoreRestore = <T,>(value: T): T => decodeFromFirestore(value) as T;

let latestWriteTime = 0;
const nextUpdatedAt = () => {
  latestWriteTime = Math.max(Date.now(), latestWriteTime + 1);
  return new Date(latestWriteTime).toISOString();
};

export function useFirestoreState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean, string] {
  const cacheKey = `pennywise.firestore.${firebaseAuth.currentUser?.uid ?? "signed-out"}.${key}`;
  const readCache=():CachedState<T>|null=>{try{return JSON.parse(localStorage.getItem(cacheKey)||"null") as CachedState<T>|null}catch{return null}};
  const [value, setValue] = useState<T>(()=>readCache()?.value??initialValue);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const lastRemote = useRef("");
  const valueRef = useRef(value);
  const pendingWrite = useRef("");

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
        const cloud=snapshot.data() as CloudState<T>,remote=firestoreRestore(cloud.value??initialValue),cached=readCache(),useCached=Boolean(cached&&cached.updatedAt>(cloud.updatedAt??"")),resolved=useCached?cached!.value:remote,serialized=JSON.stringify(resolved);
        lastRemote.current = serialized;
        if (pendingWrite.current === serialized) pendingWrite.current = "";
        if(serialized!==JSON.stringify(valueRef.current)){
          valueRef.current=resolved;
          setValue(resolved);
        }
        if(useCached)void setDoc(reference,{value:firestoreSafe(resolved),updatedAt:cached!.updatedAt}).catch(()=>setError("Saved on this device. Cloud synchronization is still pending."));
      } else {
        const cached = readCache();
        const resolved = cached?.value ?? valueRef.current ?? initialValue;
        const updatedAt = cached?.updatedAt ?? nextUpdatedAt();
        lastRemote.current = JSON.stringify(resolved);
        await setDoc(reference, { value: firestoreSafe(resolved), updatedAt });
      }
      setError("");
      setReady(true);
    }, () => {
      setError("Unable to synchronize this section with Firestore.");
      setReady(true);
    });
  }, [key]);

  const setSyncedValue: Dispatch<SetStateAction<T>> = useCallback((update) => {
    const nextValue =
      typeof update === "function"
        ? (update as (current: T) => T)(valueRef.current)
        : update;
    if (Object.is(nextValue, valueRef.current)) return;
    const updatedAt = nextUpdatedAt();
    const safeValue = jsonSafe(nextValue);
    const serialized = JSON.stringify(safeValue);
    valueRef.current = nextValue;
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ value: safeValue, updatedAt }),
    );
    pendingWrite.current = serialized;
    setValue(nextValue);
    const user = firebaseAuth.currentUser;
    if (!user) return;
    void setDoc(doc(firestore, "users", user.uid, "appData", key), {
      value: firestoreSafe(safeValue),
      updatedAt,
    }).then(() => {
      if (pendingWrite.current === serialized) {
        lastRemote.current = serialized;
        pendingWrite.current = "";
      }
      setError("");
    }).catch(() => setError("Your latest change could not be synchronized. Please check your connection and try again."));
  }, [cacheKey, key]);

  return [value, setSyncedValue, ready, error];
}
