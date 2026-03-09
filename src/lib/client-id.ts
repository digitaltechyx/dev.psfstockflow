import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const COUNTER_REF = "system/clientIdCounter";
const MIN_ID = 10000;
const MAX_ID = 99999;

/**
 * Generates a unique 5-digit client ID (10000–99999) using a Firestore counter.
 * Call when creating a new user so each client has a stable display ID.
 */
export async function generateClientId(): Promise<string> {
  return runTransaction(db, async (transaction) => {
    const ref = doc(db, "system", "clientIdCounter");
    // We need to read inside the transaction; Firestore transaction uses get() on the ref
    const snapshot = await transaction.get(ref);
    const next = snapshot.exists() ? (snapshot.data()?.lastUsed ?? MIN_ID - 1) + 1 : MIN_ID;
    if (next > MAX_ID) throw new Error("Client ID range exhausted");
    transaction.set(ref, { lastUsed: next }, { merge: true });
    return String(next);
  });
}

/**
 * Assigns client IDs to users who don't have one (e.g. existing users created before clientId was added).
 * Call from admin UI to backfill. Runs sequentially to avoid transaction contention.
 */
export async function assignClientIdsToExistingUsers(
  users: Array<{ uid: string; clientId?: string | null }>
): Promise<{ assigned: number; errors: string[] }> {
  const withoutId = users.filter((u) => u.uid && !u.clientId);
  const errors: string[] = [];
  let assigned = 0;
  for (const user of withoutId) {
    try {
      const id = await generateClientId();
      await updateDoc(doc(db, "users", user.uid), { clientId: id });
      assigned++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${user.uid}: ${msg}`);
    }
  }
  return { assigned, errors };
}
