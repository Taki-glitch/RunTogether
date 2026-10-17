import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REMPLACER")
  && firebaseConfig.projectId && !firebaseConfig.projectId.includes("REMPLACER");
let auth = null, db = null, currentUser = null, cloudReady = false, timer = null;
let latestLocalState = null;
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
  try { return JSON.parse(localStorage.getItem("runtogether_v04") || "null"); } catch { return null; }
}
function mergeStates(local, cloud) {
  if (!local) return cloud;
  if (!cloud) return local;
  const map = new Map();
  [...(local.results || []), ...(cloud.results || [])].forEach((r, i) => {
    const id = r.id || `legacy-${r.date || ""}-${r.runner || ""}-${r.distance || ""}-${r.time || ""}-${i}`;
    map.set(id, {...r, id});
  });
  const seriesMap = new Map();
  [...(local.series || []), ...(cloud.series || [])].forEach(s => {
    const key = `${s.name}|${s.distance}|${s.reps}|${s.rest}`;
    if (!seriesMap.has(key)) seriesMap.set(key, s);
  });
  return {
    series: [...seriesMap.values()],
    results: [...map.values()].sort((a,b) => new Date(a.date || 0) - new Date(b.date || 0)),
    paces: {...(local.paces || {}), ...(cloud.paces || {})}
  };
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
    const { doc, getDoc, setDoc, serverTimestamp } = fsMod;
    const { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = authMod;
    window.rtCloudSave = state => {
      latestLocalState = state;
      if (!currentUser || !cloudReady) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await setDoc(doc(db, "runtogetherUsers", currentUser.uid), {
            state: latestLocalState, updatedAt: serverTimestamp(), schemaVersion: 6
          });
          status("Synchronisé en ligne. Les autres appareils recevront ces données à leur prochaine connexion.", "Synchronisé");
        } catch (e) { status("Échec de synchronisation : " + e.message, "Erreur"); }
      }, 900);
    };
    async function login() {
      const email = $("syncEmail").value.trim(), password = $("syncPassword").value;
      if (!email || !password) { status("Saisis ton e-mail et ton mot de passe.", "À compléter"); return; }
      try { await signInWithEmailAndPassword(auth, email, password); }
      catch(e) { status(authError(e), "Connexion impossible"); }
    }
    $("syncLogin").onclick = login;
    $("syncRegister").onclick = async () => {
      const email = $("syncEmail").value.trim(), password = $("syncPassword").value;
      if (!email || password.length < 6) { status("Saisis un e-mail et un mot de passe d’au moins 6 caractères.", "À compléter"); return; }
      try { await createUserWithEmailAndPassword(auth, email, password); }
      catch(e) { status(authError(e), "Création impossible"); }
    };
    $("syncLogout").onclick = async () => { cloudReady = false; await signOut(auth); };
    $("syncNow").onclick = async () => {
      if (!currentUser) { status("Connecte-toi d’abord pour synchroniser.", "Mode local"); return; }
      try {
        const ref = doc(db, "runtogetherUsers", currentUser.uid);
        const snap = await getDoc(ref);
        const local = localState();
        if (snap.exists()) {
          const cloud = snap.data().state;
          const merged = mergeStates(local, cloud);
          localStorage.setItem("runtogether_v04", JSON.stringify(merged));
          latestLocalState = merged;
          status("Données locales et en ligne fusionnées.", "Synchronisé");
          window.dispatchEvent(new CustomEvent("rt-cloud-loaded", {detail: merged}));
          window.rtCloudSave(merged);
        } else {
          await setDoc(ref, {state: local || {series:[],results:[],paces:{tom:4,tika:6,taki:6}}, updatedAt: serverTimestamp(), schemaVersion: 6});
          status("Première sauvegarde en ligne effectuée.", "Synchronisé");
        }
      } catch(e) { status("Échec de synchronisation : " + e.message, "Erreur"); }
    };
    onAuthStateChanged(auth, async user => {
      currentUser = user;
      setSignedIn(!!user);
      if (!user) { cloudReady = false; status("Déconnecté : les données restent sur cet appareil.", "Mode local"); return; }
      try {
        const ref = doc(db, "runtogetherUsers", user.uid);
        const snap = await getDoc(ref);
        const local = localState();
        if (snap.exists()) {
          const cloud = snap.data().state;
          // Merge instead of overwriting either copy.
          const merged = mergeStates(local, cloud);
          localStorage.setItem("runtogether_v04", JSON.stringify(merged));
          latestLocalState = merged;
          status("Compte connecté. Fusion des chronos locaux et en ligne terminée.", "Connecté");
          cloudReady = true;
          window.dispatchEvent(new CustomEvent("rt-cloud-loaded", {detail: merged}));
          // Ensure the merged data is pushed to the cloud.
          window.rtCloudSave(merged);
        } else {
          cloudReady = true;
          await setDoc(ref, {state: local || {series:[],results:[],paces:{tom:4,tika:6,taki:6}}, updatedAt: serverTimestamp(), schemaVersion: 6});
          status("Compte connecté. Première sauvegarde en ligne effectuée.", "Connecté");
        }
      } catch(e) { cloudReady = false; status("Connexion réussie, mais accès à la base impossible : " + e.message, "Erreur Firebase"); }
    });
  } catch(e) {
    status("Firebase n’a pas pu démarrer : vérifie la configuration et la connexion internet. " + e.message, "Mode local");
  }
}
function authError(e) {
  const map = {
    "auth/invalid-credential":"Identifiants incorrects.",
    "auth/email-already-in-use":"Cette adresse possède déjà un compte : utilise Connexion.",
    "auth/weak-password":"Mot de passe trop faible (6 caractères minimum).",
    "auth/invalid-email":"Adresse e-mail invalide.",
    "auth/too-many-requests":"Trop de tentatives. Réessaie plus tard."
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
