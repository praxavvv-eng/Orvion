// js/watchlist.js - Complete, production-ready with Date.now() and robust queries
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

export async function addToWatchlist(item) {
  try {
    const col = getCollection();
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

export async function updateWatchlistItem(docId, updates) {
  try {
    const docRef = doc(window.db, COLLECTION_NAME, docId);
    await updateDoc(docRef, updates);
    console.log("Updated:", docId);
    return { success: true };
  } catch (error) {
    console.error("Update error:", error);
    return { success: false, error };
  }
}

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
    console.log(`Fetched ${items.length} for ${status}/${category}`);
    return { success: true, items };
  } catch (error) {
    console.error("Query error:", error);
    return { success: false, items: [] };
  }
}

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