import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDj7gph99HNi80aAle_xjVqVG6J7gGOCS0",
  authDomain: "misi-8828e.firebaseapp.com",
  projectId: "misi-8828e",
  storageBucket: "misi-8828e.firebasestorage.app",
  messagingSenderId: "452773353034",
  appId: "1:452773353034:web:cfd08acf05c043f36ef8b3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
