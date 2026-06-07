// js/watchlist.js – Full with addOrUpdate and updateStatus
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

// Add or update: if exists, update status; else add new
export async function addOrUpdateWatchlist(item) {
  try {
    const col = getCollection();
    const q = query(col, where("id", "==", item.id), where("category", "==", item.category));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      // Update existing document's status
      const docRef = snapshot.docs[0].ref;
      await updateDoc(docRef, { status: item.status });
      return { success: true, isUpdate: true, docId: snapshot.docs[0].id };
    } else {
      // Add new document
      const docRef = await addDoc(col, {
        id: item.id,
        title: item.title,
        poster: item.poster,
        category: item.category,
        status: item.status,
        added: Date.now()
      });
      return { success: true, isUpdate: false, docId: docRef.id };
    }
  } catch (error) {
    console.error("Add/Update error:", error);
    return { success: false, error };
  }
}

// Update status of a document by its Firestore ID
export async function updateWatchlistStatus(docId, newStatus) {
  try {
    const docRef = doc(window.db, COLLECTION_NAME, docId);
    await updateDoc(docRef, { status: newStatus });
    return { success: true };
  } catch (error) {
    console.error("Update status error:", error);
    return { success: false, error };
  }
}

// Remove item
export async function removeFromWatchlist(docId) {
  try {
    const docRef = doc(window.db, COLLECTION_NAME, docId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error("Delete error:", error);
    return { success: false, error };
  }
}

// Get items by status and category
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

// Get all items (for debugging)
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

// Real-time subscription
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
  addOrUpdate: addOrUpdateWatchlist,
  updateStatus: updateWatchlistStatus,
  remove: removeFromWatchlist,
  getAll: getAllWatchlist,
  getByStatusAndCategory: getItemsByStatusAndCategory,
  subscribe: subscribeWatchlist
};