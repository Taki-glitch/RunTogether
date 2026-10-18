RunTogether V2.0 — navigation, parcours extérieurs et course libre GPS
======================================================================

Nouveautés V2.0
- Accueil avec 3 modes de course : Piste d'athlétisme (tout le V1.0, inchangé), Parcours extérieur (objectif distance ou durée) et Course libre GPS. Barre de navigation : Accueil, Progression, Réglages. Rien n'a été supprimé : la synchro est dans Réglages, l'historique/records/bilans/plan sont dans Progression (onglets Sorties extérieures, Piste, Plan 10 km).
- Un seul moteur de séance extérieure : chrono, pause/reprise/fin, GPS filtré (précision > 30 m et sauts > 10 m/s ignorés, trous de signal signalés), allure moyenne et actuelle, alerte d'objectif, signal à chaque km, bilan avec tracé dessiné en SVG (sans carte en ligne, donc hors connexion), temps au km. Séance sauvegardée toutes les 10 s : reprise proposée après une fermeture accidentelle.
- Données : nouvelle liste "activities" (sorties extérieures) fusionnée comme les chronos (suppressions conservées). Aucune migration : les anciennes données restent valides. Les sorties GPS de 2 km ou plus comptent dans la progression vers le 10 km.
- Sports : registre RT_SPORTS dans nav.js (seule la course est active). Pour ajouter un sport : une entrée enabled:true avec ses modes + une vue "view-<mode>".
- Icônes : les fichiers sont à la racine (comme dans ton dépôt) ; les chemins "icons/..." de la V1.0 pointaient vers un dossier inexistant, c'est corrigé. firebase-config (1).js était un doublon : supprimé.

Limites connues (à tester sur tes appareils)
- Le GPS d'un site peut s'arrêter quand l'écran se verrouille (surtout iPhone/iPad) : garde l'écran allumé ; le chrono reste exact, la distance de la coupure est estimée en ligne droite.
- Mets à jour tous tes appareils avant de t'en servir : une ancienne version V1.0 encore ouverte n'enregistre pas les sorties extérieures.
- Chaque sortie ajoute ~1 Ko au document Firestore (limite 1 Mo, alerte à 700 Ko dans "Vérifier la sauvegarde").
- Aucune configuration Firebase supplémentaire : firestore.rules est inchangé.

Historique V1.0 (conservé)
==========================

Inclus
- L'interface sombre et les cartes de la V0.3/V0.5 sont conservées.
- Chronométrage téléphone partagé pour Tom, Tika et Taki et chronos individuels.
- Séries personnalisées, cibles, tableau de bord, historique modifiable, tendance, plan de progression.
- Export CSV et sauvegarde/import JSON.
- V0.7 : compte à rebours de récupération entre les répétitions, bips/vibration, enchaînement automatique des répétitions et des séries, départ automatique optionnel.
- V0.8 : objectifs automatiques (cible = 2 % plus rapide que la moyenne des 3 derniers chronos sur la distance), conseils pour progresser.
- V0.8 : sortie longue en tours de piste (10 km = 25 tours de 400 m) avec allure, écart à la cible, arrivée prévue, temps de chaque tour ; progression vers le 10 km et prochaine sortie suggérée.
- V0.8 : synchro corrigée : suppressions et corrections ne reviennent plus, les autres appareils se mettent à jour en direct.
- V0.9 : passages intermédiaires tous les 400 m pendant une répétition (chrono partagé et individuels), bipeur d'allure (100/200/400 m, un son par coureur), bilan de séance en face-à-face avec volume, échauffement et effort ressenti (RPE), séances du plan à cocher, mode plein soleil.
- V1.0 : application installable (iPhone, iPad, Android, ordinateur) et utilisable hors connexion ; mode piste plein écran avec gros boutons ; choix des coureurs présents ; répétition en cours retrouvée après une fermeture accidentelle ; confirmations renforcées et retour arrière après effacement ou import.
- V1.0 : records personnels, courbes par coureur et par distance, volume hebdomadaire, comparaison avec la séance précédente et la moyenne récente, régularité des tours ; bibliothèque de séances, modification d'une série, plan par objectif (5 km, 10 km, améliorer son temps) avec niveau suggéré.
- V1.0 : synchro plus claire (hors ligne, en cours, synchronisé), bouton « Vérifier la sauvegarde en ligne », rappel de sauvegarde JSON.
- Synchronisation multi-appareils via Firebase Authentication (e-mail/mot de passe) et Cloud Firestore.
- Fusion des résultats locaux et en ligne à la connexion, sans écraser volontairement l'un des deux historiques.
- Mode local toujours utilisable sans configuration Firebase.

IMPORTANT : la synchronisation cloud n'est pas active tant que ton projet Firebase n'est pas configuré.

Activer la synchronisation (à faire une seule fois)
1. Va sur https://console.firebase.google.com/ et crée un projet Firebase.
2. Dans les paramètres du projet, ajoute une application Web et copie les valeurs fournies.
3. Remplace les valeurs "REMPLACER_..." dans firebase-config.js par celles de ton application.
4. Dans Firebase Authentication > Sign-in method, active "E-mail/Mot de passe".
5. Dans Firestore Database, crée une base de données.
6. Dans l'onglet Rules de Firestore, colle le contenu de firestore.rules et publie les règles.
7. Héberge l'application sur HTTPS (par exemple GitHub Pages). Les modules Firebase ne fonctionneront généralement pas correctement en ouvrant simplement index.html avec file://.
8. Ouvre RunTogether, crée un compte avec une adresse e-mail et un mot de passe d'au moins 6 caractères. Connecte-toi avec ce même compte sur les autres appareils.

Sécurité
- Les règles Firestore proposées limitent la lecture et l'écriture au compte authentifié correspondant.
- Ne publie jamais de clé privée ou de mot de passe dans les fichiers. La configuration Firebase pour une application Web contient une clé API publique ; la sécurité repose aussi sur les règles Firebase.
- Les données sont stockées localement et dans le document Firestore associé au compte. Toute personne disposant du même compte peut consulter ces données.

Fichiers à publier ensemble (V2.0) : index.html, state.js, progress.js, extras.js, seances.js, suivi.js, outdoor.js, nav.js, pwa.js, sync.js, sw.js, manifest.webmanifest, firebase-config.js et les 3 icônes (icon-192.png, icon-512.png, apple-touch-icon.png). firestore.rules inchangé.

Installation
- Décompresse le ZIP et héberge son contenu sur GitHub Pages ou un hébergement HTTPS.
- Pour un usage local hors connexion, ouvre la version locale et utilise les exports JSON/CSV.
