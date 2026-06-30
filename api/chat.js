// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API Gemini manquante." });
  }

  const { ticketContent, analysePrecedente, question, historiqueChat } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: 'La question est vide.' });
  }

  // On reconstruit l'historique de la conversation pour Gemini
  let formatHistory = "";
  if (historiqueChat && historiqueChat.length > 0) {
    formatHistory = historiqueChat.map(msg => `${msg.role === 'user' ? 'Moi' : 'Assistant'} : ${msg.text}`).join('\n');
  }

  const systemPrompt = `Tu es l'assistant de conciergerie OnSpot Travel. Ton rôle est de répondre aux questions de l'agent concernant un ticket spécifique.
Tu dois être précis, fouiller dans le ticket brut si nécessaire, et proposer des solutions concrètes. 
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

HISTORIQUE DE NOTRE DISCUSSION :
"""
${formatHistory}
"""

MA NOUVELLE QUESTION : ${question}
`;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
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
