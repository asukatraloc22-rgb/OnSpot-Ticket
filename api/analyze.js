// api/analyze.js

const SYSTEM_PROMPT = `Tu es un assistant IA expert, spécialisé dans l'analyse de tickets pour la conciergerie de voyage OnSpot Travel.

CONTEXTE MÉTIER
Plateforme : OS Connect.
Pôles : 
- FO (Front Office) : contact client, visible agence, instructions au BO.
- BO (Back Office) : contact prestataires, logistique, souvent en anglais.
- AGV (Agence) : partenaire vendeur (ex: Voyamar).

RÈGLES D'ANALYSE STRICTES
1. Résumé détaillé et factuel : Le résumé ne doit pas survoler le problème. Il doit décomposer les faits chronologiquement de manière exhaustive.
2. Détection d'incohérences : Tu dois traquer activement les contradictions (ex: un agent dit que c'est remboursable, un autre dit le contraire plus tard, ou un prestataire contredit une agence). 
3. Langue : Rédige TOUTE ta réponse (résumé, messages, instructions) dans la langue demandée par l'utilisateur.
4. Confidentialité : Ne jamais nommer les prestataires dans les messages clients ("l'hôtel", "notre partenaire").
5. Zéro Hallucination : Si une info manque (ex: PNR, date), signale-le avec la balise [À VÉRIFIER] ou [INFO MANQUANTE].
6. Instruction Spécifique : Si l'utilisateur te donne une consigne spécifique, tu DOIS prioriser cette consigne dans la rédaction de tes messages de sortie.

FORMAT DE SORTIE (JSON STRICT)
Réponds UNIQUEMENT en JSON valide. Ne génère aucun texte avant ou après.

{
  "resume": {
    "issue_principale": "string, 1 ligne maximum",
    "details_chronologiques": ["string (fait 1)", "string (fait 2)"],
    "incoherences_detectees": "string détaillant les contradictions trouvées, ou 'Aucune incohérence majeure détectée.'",
    "actions_effectuees": "string",
    "a_faire": "string",
    "infos_manquantes": "string (ou vide)"
  },
  "messages": {
    "client": "string (Le message prêt à envoyer, ou vide si la consigne demande de ne pas en faire)",
    "agence": "string (Le message prêt à envoyer, ou vide si non pertinent)"
  },
  "instructions_internes": {
    "fo": "string",
    "bo": "string",
    "priorite": "string (Basse / Normale / Haute / Urgente)"
  }
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API Gemini manquante." });
  }

  const {
    ticketNumber,
    clientName,
    ticketContent,
    canal,              // 'email' | 'whatsapp' (Crisp retiré)
    langue,             // ex: 'Français', 'Anglais'
    consigneSpecifique  // ex: "Fais juste un message pour l'agence concernant le refus de l'hôtel"
  } = req.body || {};

  if (!ticketContent || !ticketContent.trim()) {
    return res.status(400).json({ error: 'Le contenu du ticket est vide.' });
  }

  const userPrompt = `
NUMÉRO DE TICKET : ${ticketNumber || 'Non fourni'}
NOM DU CLIENT : ${clientName || 'Non fourni'}
CANAL SOUHAITÉ : ${canal || 'Non défini'}
LANGUE DE RÉPONSE EXIGÉE : ${langue || 'Français'}
CONSIGNE SPÉCIFIQUE DE L'UTILISATEUR : "${consigneSpecifique || 'Analyse complète standard'}"

CONTENU BRUT DU TICKET :
"""
${ticketContent}
"""

Analyse ce ticket et réponds EXACTEMENT selon le schéma JSON. Si la 'CONSIGNE SPÉCIFIQUE' demande de ne générer qu'un type de message, laisse les autres champs de messages vides.`;

  try {
    const geminiResponse = await fetch(
     `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.2, // Baissé à 0.2 pour plus de factuel et moins de créativité/hallucination
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return res.status(502).json({ error: `Erreur API Gemini`, details: errText });
    }

    const data = await geminiResponse.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return res.status(502).json({ error: "Réponse vide." });

    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      return res.status(502).json({ error: "Erreur JSON.", rawText });
    }

    return res.status(200).json({ success: true, result: parsed });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.', details: err.message });
  }
}
