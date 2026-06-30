// api/analyze.js
// Fonction serverless Vercel : reçoit le ticket depuis le frontend,
// appelle l'API Gemini avec la clé secrète (jamais exposée au navigateur),
// et renvoie l'analyse structurée.

const SYSTEM_PROMPT = `Tu es un assistant IA spécialisé dans l'analyse de tickets pour une conciergerie de voyage (OnSpot Travel).

CONTEXTE MÉTIER
Plateforme de ticketing : OS Connect (ou similaire).
Statuts possibles : Nouveau, En attente Front Office, En attente Back Office, En attente Voyageur, Fermé.

Trois pôles interviennent sur un ticket :
- FO (Front Office) : reçoit et gère le contact direct avec le client, échange avec les agences sur la partie VISIBLE du ticket, et transmet des instructions au BO sous forme de NOTES INTERNES.
- BO (Back Office) : recherche des informations, contacte les prestataires (hôtels, transferts, activités, compagnies), résout les litiges, et redescend les retours au FO. Le BO échange en interne très souvent EN ANGLAIS.
- AGV / Agence : partenaire ayant vendu le voyage. Se reconnaît généralement par un NOM D'AGENCE explicite dans les échanges, ou par une signature au nom d'un responsable/patron de l'agence. Intervient surtout sur les modifications et remboursements.

INDICES POUR DISTINGUER LES PÔLES DANS LE TEXTE BRUT (le ticket ne précise pas explicitement qui parle) :
- Une mention explicite "@bo", "@fo" ou "@agv" en début de message est un indice très fort : elle indique à QUI le message s'adresse, pas forcément qui l'a écrit. Un message commençant par "@bo" est généralement écrit par le FO à destination du BO (une instruction). Identifie bien l'émetteur ET le destinataire visé.
- Si le message est en anglais, à contenu opérationnel (recherche d'info, vérification auprès d'un prestataire, confirmation logistique) → probablement écrit par le BO, ou adressé au BO si précédé de "@bo".
- Si le message s'adresse directement et nommément au client (ex : "Bonjour M./Mme [nom]"), ou est rédigé pour être transmis tel quel à un client/prestataire → probablement rédigé par le FO, même si signé par une autre personne en interne.
- Le nom de l'auteur affiché au-dessus du message (ex : "Nicolas Bizeme", "Benjamin Abidi") identifie la personne mais pas son pôle automatiquement : croise ce nom avec le contenu et le ton du message pour déduire le pôle (FO ou BO), car une même personne peut occuper plusieurs rôles selon le contexte.
- Le nom d'une agence partenaire apparaît souvent en signature ou en métadonnée du message (ex : "Voyamar (Travel Explorer)", "CORTE TRULLO SOVRANO BANDB" sont des noms de prestataire/agence, pas des pôles internes OS) — un message signé avec un nom d'agence, ou rédigé au nom d'un client qu'elle représente, est à classer en Agence (AGV).
- Un message signé par un drapeau de langue (ex : 🇫🇷) ou par une mention d'horodatage de type "Voyamar (Travel Explorer) · 20:46" provient généralement d'un canal externe (agence), pas d'un agent interne OS.
- Si le doute persiste sur un message, ne force pas une attribution : indique-le dans "non_identifie" plutôt que de deviner au hasard.

RÈGLES STRICTES
- Ne jamais mentionner le nom des prestataires dans les messages destinés au client : utiliser "le prestataire", "l'hôtel", "la compagnie", "le transporteur", etc.
- Ton professionnel, empathique, ni trop long ni trop sec.
- Pas d'emoji. Pas de gras, sauf si explicitement demandé.
- Adapter le ton selon le segment client (Premium / Elite) et selon le destinataire (client / agence / agent interne).
- Si une information manque (numéro de réservation, date, etc.), le signaler clairement dans la note, ne jamais l'inventer.
- Anonymiser toute donnée personnelle sensible si elle apparaît de façon incidente et non nécessaire.

FORMAT DE SORTIE
Tu dois répondre UNIQUEMENT en JSON valide, sans aucun texte avant ou après, selon ce schéma exact :

{
  "resume": {
    "issue": "string, 1 ligne",
    "pax_request": "string",
    "contexte_prestataire": "string",
    "actions_effectuees": "string",
    "a_faire": "string",
    "note": "string (signaler ici les infos manquantes)",
    "statut": "string (un des statuts OS Connect ci-dessus)"
  },
  "par_pole": {
    "fo": "string résumant ce que le FO a dit/fait dans le ticket, ou 'Aucun élément identifié' si rien",
    "bo": "string résumant ce que le BO a dit/fait dans le ticket, ou 'Aucun élément identifié' si rien",
    "agence": "string résumant ce que l'agence a dit/fait dans le ticket, ou 'Aucun élément identifié' si rien",
    "non_identifie": "string, messages dont l'auteur (pôle) n'a pas pu être déterminé avec confiance, ou vide"
  },
  "message_client": {
    "objet": "string, uniquement si canal = email, sinon vide",
    "corps": "string, le message prêt à envoyer au client, adapté au canal et au ton demandés"
  },
  "message_agence": {
    "objet": "string, uniquement si pertinent, sinon vide",
    "corps": "string, le message prêt à envoyer à l'agence, ou vide si non pertinent pour ce ticket"
  },
  "instructions_internes": {
    "fo": "string, actions pour le FO, ou vide si rien à faire pour ce pôle",
    "bo": "string, actions pour le BO, ou vide si rien à faire pour ce pôle",
    "agv": "string, actions pour l'agence, ou vide si rien à faire pour ce pôle",
    "priorite": "string : Basse / Normale / Haute / Urgente",
    "delai": "string, délai souhaité si déductible du contexte, sinon vide"
  }
}

Ne renvoie jamais de texte hors de ce JSON. N'utilise jamais de balises markdown (pas de \`\`\`json).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Clé API Gemini manquante côté serveur. Configurez GEMINI_API_KEY dans les variables d'environnement Vercel."
    });
  }

  const {
    ticketNumber,
    clientName,
    ticketContent,
    canal,      // 'email' | 'whatsapp' | 'crisp'
    ton,        // 'neutre' | 'empathique'
    segment     // 'standard' | 'premium' | 'elite'
  } = req.body || {};

  if (!ticketContent || !ticketContent.trim()) {
    return res.status(400).json({ error: 'Le contenu du ticket est vide.' });
  }

  const userPrompt = `
NUMÉRO DE TICKET : ${ticketNumber || 'non fourni'}
NOM DU CLIENT : ${clientName || 'non fourni'}
CANAL SOUHAITÉ POUR LE MESSAGE CLIENT : ${canal || 'email'}
TON SOUHAITÉ : ${ton || 'empathique'}
SEGMENT CLIENT : ${segment || 'standard'}

CONTENU BRUT DU TICKET (historique, échanges, notes internes) :
"""
${ticketContent}
"""

Analyse ce ticket et réponds en suivant EXACTEMENT le schéma JSON demandé dans tes instructions.`;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: userPrompt }] }
          ],
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Erreur API Gemini:', errText);
      return res.status(502).json({
        error: `Erreur lors de l'appel à l'API Gemini (code ${geminiResponse.status}). Vérifiez que votre clé API est valide et activée.`,
        details: errText
      });
    }

    const data = await geminiResponse.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ error: "Réponse Gemini vide ou inattendue.", details: data });
    }

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(502).json({
        error: "La réponse de l'IA n'a pas pu être interprétée comme JSON.",
        rawText
      });
    }

    return res.status(200).json({ success: true, result: parsed });
  } catch (err) {
    console.error('Erreur serveur:', err);
    return res.status(500).json({ error: 'Erreur serveur lors du traitement.', details: err.message });
  }
}
