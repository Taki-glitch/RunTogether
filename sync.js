import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REMPLACER")
  && firebaseConfig.projectId && !firebaseConfig.projectId.includes("REMPLACER");
const KEY = "runtogether_v04";
let auth = null, db = null, currentUser = null, cloudReady = false, timer = null, unsubscribe = null;
let latestLocalState = null;

// Fusion partagée avec l'application (state.js) : la version la plus récente de chaque chrono gagne,
// et une suppression plus récente qu'une modification est conservée.
const merge = (a, b) => window.rtMergeStates ? window.rtMergeStates(a, b) : (a || b);
const canon = s => JSON.stringify(merge(s, null));

function status(message, badge) {
  $("syncMessage").textContent = message;
  $("syncBadge").textContent = badge;
}
function setSignedIn(signedIn) {
  $("syncLogout").classList.toggle("hidden", !signedIn);
  $("syncLogin").classList.toggle("hidden", signedIn);
  $("syncRegister").classList.toggle("hidden", signedIn);
  $("syncEmail").disabled = signedIn;
  $("syncPassword").disabled = signedIn;
}
function localState() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function applyLocal(merged) {
  localStorage.setItem(KEY, JSON.stringify(merged));
  latestLocalState = merged;
  window.dispatchEvent(new CustomEvent("rt-cloud-loaded", { detail: merged }));
}
async function startFirebase() {
  try {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    const app = initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);
    const { doc, getDoc, setDoc, serverTimestamp, onSnapshot } = fsMod;
    const { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = authMod;
    const docRef = user => doc(db, "runtogetherUsers", user.uid);

    window.rtCloudSave = state => {
      latestLocalState = state;
      if (!currentUser || !cloudReady) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await setDoc(docRef(currentUser), {
            state: latestLocalState, updatedAt: serverTimestamp(), schemaVersion: 8
          });
          status("Synchronisé en ligne. Les autres appareils connectés se mettent à jour automatiquement.", "Synchronisé");
        } catch (e) { status("Échec de synchronisation : " + e.message, "Erreur"); }
      }, 900);
    };

    // Écoute en direct : les chronos des autres appareils arrivent sans recharger la page.
    function listen(user) {
      if (unsubscribe) unsubscribe();
      unsubscribe = onSnapshot(docRef(user), snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const cloud = snap.data().state, local = localState();
        const merged = merge(local, cloud), mj = JSON.stringify(merged);
        const changedLocal = mj !== canon(local), changedCloud = mj !== canon(cloud);
        if (changedLocal) applyLocal(merged);
        if (changedCloud) window.rtCloudSave(merged);
        if (changedLocal) status("Nouveaux chronos reçus d’un autre appareil.", "Synchronisé");
      }, e => status("Écoute en direct impossible : " + e.message, "Erreur"));
    }

    async function syncFromCloud(user, message) {
      const ref = docRef(user), snap = await getDoc(ref), local = localState();
      if (snap.exists()) {
        const merged = merge(local, snap.data().state);
        cloudReady = true;
        applyLocal(merged);
        window.rtCloudSave(merged);
        status(message, "Connecté");
      } else {
        cloudReady = true;
        const first = merge(local, null);
        await setDoc(ref, { state: first, updatedAt: serverTimestamp(), schemaVersion: 8 });
        status("Compte connecté. Première sauvegarde en ligne effectuée.", "Connecté");
      }
      listen(user);
    }

    async function login() {
      const email = $("syncEmail").value.trim(), password = $("syncPassword").value;
      if (!email || !password) { status("Saisis ton e-mail et ton mot de passe.", "À compléter"); return; }
      try { await signInWithEmailAndPassword(auth, email, password); }
      catch (e) { status(authError(e), "Connexion impossible"); }
    }
    $("syncLogin").onclick = login;
    $("syncRegister").onclick = async () => {
      const email = $("syncEmail").value.trim(), password = $("syncPassword").value;
      if (!email || password.length < 6) { status("Saisis un e-mail et un mot de passe d’au moins 6 caractères.", "À compléter"); return; }
      try { await createUserWithEmailAndPassword(auth, email, password); }
      catch (e) { status(authError(e), "Création impossible"); }
    };
    $("syncLogout").onclick = async () => {
      cloudReady = false;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      await signOut(auth);
    };
    $("syncNow").onclick = async () => {
      if (!currentUser) { status("Connecte-toi d’abord pour synchroniser.", "Mode local"); return; }
      try { await syncFromCloud(currentUser, "Données locales et en ligne fusionnées."); }
      catch (e) { status("Échec de synchronisation : " + e.message, "Erreur"); }
    };
    onAuthStateChanged(auth, async user => {
      currentUser = user;
      setSignedIn(!!user);
      if (!user) {
        cloudReady = false;
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        status("Déconnecté : les données restent sur cet appareil.", "Mode local");
        return;
      }
      try { await syncFromCloud(user, "Compte connecté. Fusion des chronos locaux et en ligne terminée."); }
      catch (e) { cloudReady = false; status("Connexion réussie, mais accès à la base impossible : " + e.message, "Erreur Firebase"); }
    });
  } catch (e) {
    status("Firebase n’a pas pu démarrer : vérifie la configuration et la connexion internet. " + e.message, "Mode local");
  }
}
function authError(e) {
  const map = {
    "auth/invalid-credential": "Identifiants incorrects.",
    "auth/email-already-in-use": "Cette adresse possède déjà un compte : utilise Connexion.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard."
  };
  return map[e.code] || e.message || "Une erreur est survenue.";
}
if (!configured) {
  setSignedIn(false);
  $("syncLogin").disabled = true;
  $("syncRegister").disabled = true;
  $("syncNow").disabled = true;
  status("Firebase n’est pas configuré. L’application fonctionne normalement en local ; suis le guide README pour activer la synchronisation.", "Mode local");
} else {
  startFirebase();
}
