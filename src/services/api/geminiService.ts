// src/services/geminiService.ts

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from "@google/generative-ai";

// !! IMPORTANT: Store your API Key securely (e.g., environment variables) !!
// Example using a placeholder - replace with your secure method
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'YOUR_API_KEY_HERE'; // Replace with actual key retrieval

if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.warn("Gemini API Key is not configured properly!");
    // Optionally throw an error or handle this case
}

const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const generationConfig = {
    temperature: 0.7, // Adjust creativity vs predictability
    topK: 1,
    topP: 1,
    maxOutputTokens: 250, // Limit output size
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Function to structure the prompt
const buildPrompt = (
    questionnaireData: any,
    currentInteraction: number,
    maxInteractions: number
): string => {

    // Format questionnaire data nicely for the prompt
    const formattedQuestionnaire = `
      - Nome: ${questionnaireData.nome || 'Não informado'}
      - Objetivo: ${questionnaireData.objetivo || 'Não informado'}
      - Dias de Treino: ${questionnaireData.trainingDays?.join(', ') || 'Não informado'}
      - Tempo Médio (min): ${questionnaireData.averageTrainingTime || 'Não informado'}
      - Incluir Cardio: ${questionnaireData.includeCardio ? 'Sim' : 'Não'}
      - Incluir Alongamento: ${questionnaireData.includeStretching ? 'Sim' : 'Não'}
      - Nível Experiência: ${questionnaireData.experienciaTreino || 'Não informado'}
      - Possui Lesões: ${questionnaireData.temLesoes ? 'Sim' : 'Não'}
      ${questionnaireData.temLesoes ? `- Detalhes Lesões: ${questionnaireData.lesoes || 'Não descrito'}` : ''}
    `;

    // Base prompt instructions
    const instructions = `
      Você é o ForcaAI, um assistente de treino virtual amigável e prestativo do app ForcaApp.
      Sua tarefa é conversar brevemente com o usuário após ele preencher um questionário, para responder dúvidas ou coletar detalhes adicionais antes de gerar o plano de treino inicial.

      Contexto do Questionário do Usuário:
      ${formattedQuestionnaire}

      Instruções para Resposta:
      1.  Analise a ÚLTIMA mensagem do usuário no histórico fornecido, considerando o contexto do questionário e da conversa anterior.
      2.  Se for uma PERGUNTA (identifique por '?', 'como', 'por que', 'qual', etc.) relacionada a treino, saúde, ou ao app, responda de forma CONCISA, útil e segura. NÃO DÊ CONSELHOS MÉDICOS ESPECÍFICOS, sugira consultar um profissional se necessário.
      3.  Se for uma INFORMAÇÃO ADICIONAL (preferência, restrição não mencionada, detalhe sobre objetivo, etc.), CONFIRME que você anotou ("Entendido!", "Anotado!", etc.).
      4.  EXTRAIA silenciosamente quaisquer pontos-chave relevantes da ÚLTIMA mensagem do usuário que devam ser considerados ao gerar o plano de treino. Formate esses pontos como um objeto JSON DENTRO DE TRIPLAS ASPAS INVERTIDAS no final da sua resposta, assim: \`\`\`json\n{"ajustes": ["ponto_extraido_1", "ponto_extraido_2"]}\n\`\`\`. Se não houver nada a extrair, use {"ajustes": []}. NÃO COMENTE sobre o JSON extraído na sua resposta visível ao usuário.
      5.  Informe ao usuário quantas interações RESTAM (Total: ${maxInteractions}, Interação Atual: ${currentInteraction}, Restantes: ${maxInteractions - currentInteraction}). Use um tom natural.
      6.  Se esta for a ÚLTIMA interação (${currentInteraction >= maxInteractions}), diga que agora você vai usar as informações para gerar o plano e que o chat está encerrando. NÃO mencione o número de interações restantes neste caso.
      7.  Mantenha as respostas CURTAS e diretas ao ponto (máximo 2-3 frases).
      8.  Se a mensagem do usuário for apenas um agradecimento ou despedida na última interação, apenas confirme o encerramento de forma amigável.
    `;
    return instructions;
};


// Function called by the ChatScreen component
export const callGeminiApi = async (
    chatHistory: Content[], // Use the Content type from the SDK
    questionnaireData: any,
    maxInteractions: number,
    currentInteraction: number
): Promise<{ text: string; extractedData: any | null }> => {

    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
        console.error("Gemini API Key is missing or invalid.");
        throw new Error("API Key não configurada.");
    }

    const instructionsPrompt = buildPrompt(questionnaireData, currentInteraction, maxInteractions);

    // Combine instructions with chat history
    // The SDK expects history in the format: [{role: "user", parts: [...]}, {role: "model", parts: [...]}, ...]
    // We prepend our instructions as the first 'user' message or modify the last user message if preferred.
    // Let's add instructions implicitly via the system message capability if available, or as part of the first turn.
    // For gemini-pro, we add it to the chat history structure. Let's make the *very first* message the instructions.
    const fullHistory: Content[] = [
        { role: "user", parts: [{ text: instructionsPrompt }] },
         // Add a placeholder model response to establish the pattern for the real history
        { role: "model", parts: [{ text: "Ok, entendido. Estou pronto para analisar a próxima mensagem do usuário." }] },
        ...chatHistory // Append the actual conversation history provided by ChatScreen
    ];


    console.log("Sending to Gemini API. History Length:", fullHistory.length);
    // console.log("Full History Sent:", JSON.stringify(fullHistory, null, 2)); // DEBUG: Log history


    try {
        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: fullHistory.slice(0, -1) // Send history *before* the last user message
        });

        const lastUserMessage = fullHistory[fullHistory.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastUserMessage); // Send only the latest message

        // const result = await model.generateContent({
        //     contents: fullHistory,
        //     generationConfig,
        //     safetySettings,
        // });


        // const response = result.response; // Use this line if using generateContent directly

        if (!result.response) {
             console.error("Gemini API response is undefined.");
             throw new Error("Resposta inválida da API Gemini.");
         }
         const response = result.response; // Use this line if using startChat().sendMessage()


        let responseText = response.text();
        let extractedData = null;

        // Basic extraction of JSON block - might need refinement
        const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
        const match = responseText.match(jsonRegex);

        if (match && match[1]) {
            try {
                extractedData = JSON.parse(match[1]);
                // Remove the JSON block from the text shown to the user
                responseText = responseText.replace(jsonRegex, '').trim();
            } catch (e) {
                console.error("Failed to parse extracted JSON:", e);
                // Don't crash, just proceed without extracted data
            }
        }

        console.log("Gemini Response Text:", responseText);
        console.log("Extracted Data:", extractedData);

        return { text: responseText, extractedData: extractedData };

    } catch (error: any) {
        console.error("Error calling Gemini API:", error);
        // Provide more specific error messages if possible
        if (error.message.includes('API key not valid')) {
            throw new Error("Chave de API inválida. Verifique sua configuração.");
        }
        if (error.message.includes('quota')) {
             throw new Error("Cota da API excedida. Tente novamente mais tarde.");
        }
         if (response?.promptFeedback?.blockReason) {
             console.error("Blocked by safety settings:", response.promptFeedback.blockReason);
             throw new Error(`Sua mensagem foi bloqueada por segurança: ${response.promptFeedback.blockReason}`);
         }

        throw new Error("Falha na comunicação com o assistente AI.");
    }
};