# OnSpot Travel — Assistant Tickets

Application web interne pour analyser rapidement les tickets de support complexes : génère un résumé structuré, identifie ce que chaque pôle (FO / BO / Agence) a dit, propose un message client prêt à l'envoi et des instructions internes.

## Comment ça marche

- `index.html`, `style.css`, `script.js` : l'interface, à coller le contenu du ticket et lancer l'analyse.
- `api/analyze.js` : une fonction serverless (exécutée par Vercel) qui reçoit le ticket, l'envoie à l'API Gemini avec les instructions métier, et renvoie le résultat structuré.
- La clé API Gemini reste **côté serveur uniquement** — elle n'est jamais visible dans le navigateur ni dans le code envoyé sur GitHub.

## Déploiement (étape par étape)

### 1. Mettre le projet sur GitHub

```bash
cd onspot-ticket-app
git init
git add .
git commit -m "Premier déploiement"
```

Créez un nouveau repository sur GitHub (vide, sans README), puis :

```bash
git remote add origin https://github.com/VOTRE_COMPTE/onspot-ticket-app.git
git branch -M main
git push -u origin main
```

Le fichier `.gitignore` empêche déjà d'envoyer votre clé API par erreur.

### 2. Déployer sur Vercel

1. Allez sur [vercel.com](https://vercel.com) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **Add New > Project**.
3. Sélectionnez le repository `onspot-ticket-app`.
4. Avant de cliquer sur Deploy, ouvrez **Environment Variables** et ajoutez :
   - **Name** : `GEMINI_API_KEY`
   - **Value** : votre clé API Gemini
5. Cliquez sur **Deploy**.

Après quelques secondes, Vercel vous donne une URL du type `onspot-ticket-app.vercel.app`. L'application est prête, partagez ce lien avec votre équipe.

### 3. Mettre à jour l'app plus tard

À chaque fois que vous modifiez les fichiers et faites :

```bash
git add .
git commit -m "Description du changement"
git push
```

Vercel redéploie automatiquement la nouvelle version en quelques secondes.

## Tester en local (facultatif)

Si vous avez Node.js installé :

```bash
npm install -g vercel
cp .env.example .env
# remplissez .env avec votre clé API
vercel dev
```

Puis ouvrez `http://localhost:3000`.

## Notes importantes

- **Confidentialité** : le contenu des tickets est envoyé à l'API Gemini de Google pour l'analyse. Ne collez pas de données ultra-sensibles (numéros de carte bancaire complets, mots de passe) dans le champ de contenu.
- **Historique** : les tickets traités sont sauvegardés uniquement dans le navigateur de chaque utilisateur (pas de base de données partagée). Vider le cache du navigateur effacera cet historique.
- **Identification des pôles (FO/BO/Agence)** : l'IA se base sur des indices (langue utilisée, présence d'un nom d'agence, type d'échange) pour deviner qui a écrit quoi, car cette information n'est pas toujours explicite dans le texte brut. Si un message ne peut pas être attribué avec certitude, il apparaît dans une section "Non identifié" plutôt que d'être deviné au hasard. Plus vous utiliserez l'outil, plus vous pourrez ajuster ces règles dans `api/analyze.js` (section `SYSTEM_PROMPT`) si vous remarquez des erreurs récurrentes.
- **Coût** : l'API Gemini propose un palier gratuit généreux (modèle `gemini-2.0-flash`). Si votre volume de tickets devient très important, vérifiez les quotas sur [Google AI Studio](https://aistudio.google.com).

## Ajuster le comportement de l'IA

Toutes les règles métier (ton, format des messages, logique FO/BO/Agence, anonymisation des prestataires) sont définies dans la constante `SYSTEM_PROMPT` au début du fichier `api/analyze.js`. C'est le seul endroit à modifier pour changer la façon dont l'IA analyse vos tickets.
