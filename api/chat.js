// api/chat.js
export const maxDuration = 60; // Autorise le serveur à réfléchir pendant 60 secondes

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API Gemini manquante." });
  }

  // Ajout de fileData et mimeType ici
  const { ticketContent, analysePrecedente, question, historiqueChat, memoireIA, fileData, mimeType } = req.body || {};

  // La question n'est plus strictement obligatoire s'il y a un fichier envoyé
  if (!question && !fileData) {
    return res.status(400).json({ error: 'Veuillez poser une question ou envoyer un fichier.' });
  }

  // On reconstruit l'historique de la conversation pour Gemini
  let formatHistory = "";
  if (historiqueChat && historiqueChat.length > 0) {
    formatHistory = historiqueChat.map(msg => `${msg.role === 'user' ? 'Moi' : 'Assistant'} : ${msg.text}`).join('\n');
  }

  const systemPrompt = `Tu es l'assistant de conciergerie OnSpot Travel. Ton rôle est de répondre aux questions de l'agent concernant un ticket spécifique.
Tu dois être précis, fouiller dans le ticket brut si nécessaire, et proposer des solutions concrètes. 
Si on te fournit un fichier, analyse-le méticuleusement pour répondre à la demande.
Réponds de manière naturelle, en texte libre (pas de JSON). Utilise des listes à puces si tu énumères des éléments.`;

  const userPrompt = `
VOICI LE TICKET BRUT :
"""
${ticketContent || 'Non fourni'}
"""

VOICI TON ANALYSE INITIALE DE CE TICKET :
"""
${analysePrecedente || 'Non fournie'}
"""

RÈGLES DE CONCIERGERIE SUR-MESURE (MÉMOIRE IA - À APPLIQUER À TA RÉPONSE) :
"""
${memoireIA || 'Aucune règle spécifique définie.'}
"""

HISTORIQUE DE NOTRE DISCUSSION :
"""
${formatHistory}
"""

MA NOUVELLE QUESTION : ${question || 'Analyse le fichier joint en fonction du contexte de ce ticket.'}
`;

  // Préparation de la requête avec ou sans fichier
  const requestParts = [{ text: userPrompt }];
  if (fileData && mimeType) {
    requestParts.push({
      inlineData: {
        data: fileData,
        mimeType: mimeType
      }
    });
  }

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: requestParts }], // <-- On utilise requestParts ici
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.3 }
        })
      }
    );

    if (!geminiResponse.ok) {
      return res.status(502).json({ error: `Erreur API Gemini` });
    }

    const data = await geminiResponse.json();
    const repText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.status(200).json({ success: true, reponse: repText });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.', details: err.message });
  }
}
