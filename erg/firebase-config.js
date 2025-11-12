// firebase-config.js
// Import SDK modular versi online agar kompatibel dengan <script type="module">

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// Konfigurasi project milikmu
const firebaseConfig = {
  apiKey: "AIzaSyAUwmhxASR5m_rMRnKjgbJzNpsKHulsc_4",
  authDomain: "erg-multimediacreative.firebaseapp.com",
  projectId: "erg-multimediacreative",
  storageBucket: "erg-multimediacreative.firebasestorage.app",
  messagingSenderId: "747546422117",
  appId: "1:747546422117:web:669230aeeaac6e5fb1cf8c",
  measurementId: "G-26PC1SP01J"
};

// Inisialisasi Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
