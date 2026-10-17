RunTogether V0.8 — style V0.3 conservé
=======================================

Inclus
- L'interface sombre et les cartes de la V0.3/V0.5 sont conservées.
- Chronométrage téléphone partagé pour Tom, Tika et Taki et chronos individuels.
- Séries personnalisées, cibles, tableau de bord, historique modifiable, tendance, plan de progression.
- Export CSV et sauvegarde/import JSON.
- V0.7 : compte à rebours de récupération entre les répétitions, bips/vibration, enchaînement automatique des répétitions et des séries, départ automatique optionnel.
- V0.8 : objectifs automatiques (cible = 2 % plus rapide que la moyenne des 3 derniers chronos sur la distance), conseils pour progresser.
- V0.8 : sortie longue en tours de piste (10 km = 25 tours de 400 m) avec allure, écart à la cible, arrivée prévue, temps de chaque tour ; progression vers le 10 km et prochaine sortie suggérée.
- V0.8 : synchro corrigée : suppressions et corrections ne reviennent plus, les autres appareils se mettent à jour en direct.
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

Fichiers à publier ensemble : index.html, state.js, progress.js, sync.js, firebase-config.js (firestore.rules inchangé).

Installation
- Décompresse le ZIP et héberge son contenu sur GitHub Pages ou un hébergement HTTPS.
- Pour un usage local hors connexion, ouvre la version locale et utilise les exports JSON/CSV.
