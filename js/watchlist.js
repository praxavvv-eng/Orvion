// js/watchlist.js – Full with duplicate prevention (Firestore query), no duplicates
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const COLLECTION_NAME = "watchlist";

function getCollection() {
  if (!window.db) throw new Error("Firestore not initialized");
  return collection(window.db, COLLECTION_NAME);
}

// ---------- Add Item with strict duplicate check ----------
export async function addToWatchlist(item) {
  try {
    const col = getCollection();
    const q = query(col, where("id", "==", item.id), where("category", "==", item.category));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      console.log("Item already exists:", item.id, item.category);
      return { success: false, error: "already_exists" };
    }
    const docRef = await addDoc(col, {
      id: item.id,
      title: item.title,
      poster: item.poster,
      category: item.category,
      status: item.status,
      added: Date.now()
    });
    console.log("Added:", docRef.id);
    return { success: true, docId: docRef.id };
  } catch (error) {
    console.error("Add error:", error);
    return { success: false, error };
  }
}

// ---------- Remove Item ----------
export async function removeFromWatchlist(docId) {
  try {
    const docRef = doc(window.db, COLLECTION_NAME, docId);
    await deleteDoc(docRef);
    console.log("Deleted:", docId);
    return { success: true };
  } catch (error) {
    console.error("Delete error:", error);
    return { success: false, error };
  }
}

// ---------- Update Item (supports category change) ----------
export async function updateWatchlistItem(id, updates) {
  try {
    const col = getCollection();
    const q = query(col, where("id", "==", id));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "not_found" };
    for (const docSnap of snapshot.docs) {
      const oldData = docSnap.data();
      const newCategory = updates.category;
      if (newCategory && newCategory !== oldData.category) {
        await deleteDoc(docSnap.ref);
        const newItem = {
          id: id,
          title: updates.title || oldData.title,
          poster: updates.poster || oldData.poster,
          category: newCategory,
          status: updates.status || oldData.status,
          added: oldData.added || Date.now()
        };
        const newDocRef = await addDoc(col, newItem);
        return { success: true, docId: newDocRef.id };
      } else {
        await updateDoc(docSnap.ref, updates);
        return { success: true, docId: docSnap.id };
      }
    }
    return { success: true };
  } catch (error) {
    console.error("Update error:", error);
    return { success: false, error };
  }
}

// ---------- Get Items by Status and Category ----------
export async function getItemsByStatusAndCategory(status, category) {
  try {
    const col = getCollection();
    const q = query(
      col,
      where("status", "==", status),
      where("category", "==", category),
      orderBy("added", "desc")
    );
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    return { success: true, items };
  } catch (error) {
    console.error("Query error:", error);
    return { success: false, items: [] };
  }
}

// ---------- Get All Items ----------
export async function getAllWatchlist() {
  try {
    const col = getCollection();
    const snapshot = await getDocs(col);
    const items = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    return { success: true, items };
  } catch (error) {
    console.error("Get all error:", error);
    return { success: false, items: [] };
  }
}

// ---------- Real-time Subscription ----------
export function subscribeWatchlist(callback) {
  try {
    const col = getCollection();
    const q = query(col, orderBy("added", "desc"));
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      callback(items);
    }, (error) => console.error("Snapshot error:", error));
  } catch (error) {
    console.error("Subscribe error:", error);
    return () => {};
  }
}

window.watchlist = {
  add: addToWatchlist,
  remove: removeFromWatchlist,
  update: updateWatchlistItem,
  getAll: getAllWatchlist,
  getByStatusAndCategory: getItemsByStatusAndCategory,
  subscribe: subscribeWatchlist
};