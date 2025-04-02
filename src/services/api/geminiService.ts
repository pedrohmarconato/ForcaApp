// src/services/api/geminiService.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from "@google/generative-ai";

// Chave API do Gemini
// Armazene sua chave em variáveis de ambiente
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// Validação da API key
if (!API_KEY) {
    console.error("AVISO CRÍTICO: Gemini API Key não está configurada!");
    // Considerar lançar um erro ou ter um estado de erro na UI
}

// Inicialização do cliente Gemini
let genAI: GoogleGenerativeAI | null = null;
let model: any = null; // Use um tipo mais específico se possível, ex: GenerativeModel

try {
    if (API_KEY) { // Só inicializa se a chave existir
        genAI = new GoogleGenerativeAI(API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-pro" });
        console.log("[GeminiService] Inicialização do cliente Gemini bem-sucedida");
    } else {
         console.warn("[GeminiService] Não foi possível inicializar o cliente Gemini: API Key ausente.");
    }
} catch (error) {
    console.error("[GeminiService] Erro ao inicializar cliente Gemini:", error);
    // Tratar o erro de inicialização (ex: desabilitar funcionalidades que dependem da IA)
}

// Configurações de geração
const generationConfig = {
    temperature: 0.7,
    topK: 1,
    topP: 1,
    maxOutputTokens: 800, // Aumentado para permitir respostas mais completas
};

// Configurações de segurança
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Função para construir o prompt com base nos dados do questionário
const buildPrompt = (
    questionnaireData: any,
    currentInteraction: number,
    maxInteractions: number
): string => {
    // Formatar dados do questionário para o prompt
    const formattedQuestionnaire = `
      - Nome: ${questionnaireData?.nome || 'Não informado'}
      - Objetivo: ${questionnaireData?.objetivo || 'Não informado'}
      - Dias de Treino: ${questionnaireData?.trainingDays?.join(', ') || 'Não informado'}
      - Tempo Médio (min): ${questionnaireData?.averageTrainingTime || 'Não informado'}
      - Incluir Cardio: ${questionnaireData?.includeCardio ? 'Sim' : 'Não'}
      - Incluir Alongamento: ${questionnaireData?.includeStretching ? 'Sim' : 'Não'}
      - Nível Experiência: ${questionnaireData?.experienciaTreino || 'Não informado'}
      - Possui Lesões: ${questionnaireData?.temLesoes ? 'Sim' : 'Não'}
      ${questionnaireData?.temLesoes ? `- Detalhes Lesões: ${questionnaireData.lesoes || 'Não descrito'}` : ''}
    `; // Adicionado '?' para safe navigation

    // Instruções para a IA
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
      5.  Informe ao usuário quantas interações RESTAM (Total: ${maxInteractions}, Interação Atual: ${currentInteraction}, Restantes: ${maxInteractions - currentInteraction}). Use um tom natural. NÃO informe se for a última.
      6.  Se esta for a ÚLTIMA interação (${currentInteraction >= maxInteractions}), diga que agora você vai usar as informações para gerar o plano e que o chat está encerrando. NÃO mencione o número de interações restantes neste caso.
      7.  Mantenha as respostas CURTAS e diretas ao ponto (máximo 2-3 frases).
      8.  Se a mensagem do usuário for apenas um agradecimento ou despedida na última interação, apenas confirme o encerramento de forma amigável.
    `;
    return instructions;
};

// Função principal para chamada da API
export const callGeminiApi = async (
    chatHistory: Content[],
    questionnaireData: any,
    maxInteractions: number,
    currentInteraction: number
): Promise<{ text: string; extractedData: any | null }> => {
    console.log('[GeminiService] Iniciando chamada API:', {
        chatHistoryLength: chatHistory.length,
        currentInteraction,
        maxInteractions,
        modelInitialized: !!model
    });

    // Verificação de configuração da API e inicialização do modelo
    if (!API_KEY) {
        console.error("[GeminiService] API Key não configurada");
        throw new Error("Chave de API do Gemini não está configurada. Verifique as variáveis de ambiente.");
    }
    if (!model) {
        console.error("[GeminiService] Modelo Gemini não inicializado");
        throw new Error("O assistente de IA não está disponível no momento. Tente novamente mais tarde.");
    }
    if (!questionnaireData) {
         console.error("[GeminiService] Dados do questionário não fornecidos para a API.");
        throw new Error("Não foi possível obter os dados do seu perfil para iniciar o chat.");
    }


    // Construir prompt com instruções
    const instructionsPrompt = buildPrompt(questionnaireData, currentInteraction, maxInteractions);

    // Histórico completo para a API
    // Garante que o histórico não seja excessivamente longo, se necessário
    const MAX_HISTORY_MESSAGES = 20; // Exemplo: Limita o histórico enviado
    const relevantHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES);

    const fullHistory: Content[] = [
        { role: "user", parts: [{ text: instructionsPrompt }] },
        { role: "model", parts: [{ text: "Ok, entendido. Estou pronto para analisar a próxima mensagem do usuário." }] },
        ...relevantHistory // Usa o histórico limitado
    ];

    console.log(`[GeminiService] Enviando para API Gemini. Histórico: ${fullHistory.length} mensagens (limitado a ${MAX_HISTORY_MESSAGES + 2})`);

    try {
        // Configurar timeout de segurança
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error("Timeout: A API demorou muito para responder."));
            }, 30000); // 30 segundos de timeout

            // Função para limpar o timeout (não estritamente necessário com Promise.race, mas boa prática)
            (timeoutPromise as any).clear = () => clearTimeout(timeoutId);
        });

        let response: any;
        try {
             // Iniciar chat e enviar a última mensagem do usuário
            const chat = model.startChat({
                generationConfig,
                safetySettings,
                history: fullHistory.slice(0, -1) // Histórico sem a última mensagem do usuário atual
            });

            const lastUserMessageContent = fullHistory[fullHistory.length - 1];

             if (!lastUserMessageContent || !lastUserMessageContent.parts || lastUserMessageContent.parts.length === 0) {
                throw new Error("Última mensagem do usuário está vazia ou inválida.");
            }

            const lastUserMessageText = lastUserMessageContent.parts[0].text;

            // Promise da chamada da API
            const apiPromise = chat.sendMessage(lastUserMessageText);

            // Executar com timeout
            response = await Promise.race([apiPromise, timeoutPromise]);

        } finally {
             // Limpa o timeout independentemente do resultado
            if ((timeoutPromise as any).clear) {
                (timeoutPromise as any).clear();
            }
        }


        if (!response || !response.response) {
            console.warn("[GeminiService] A API Gemini retornou uma resposta inválida ou vazia.", response);
            throw new Error("O assistente de IA retornou uma resposta inesperada.");
        }

        // Processar a resposta
        let responseText = response.response.text(); // Acessar .response.text()
        let extractedData = null;

        // Extrair bloco JSON
        const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
        const match = responseText.match(jsonRegex);

        if (match && match[1]) {
            try {
                extractedData = JSON.parse(match[1]);
                // Remover o bloco JSON da resposta visível ao usuário
                responseText = responseText.replace(jsonRegex, '').trim();
            } catch (jsonError) {
                console.error("[GeminiService] Erro ao parsear JSON extraído:", jsonError, "JSON String:", match[1]);
                // Não re-throw, apenas loga. Continua com a resposta de texto.
                extractedData = { ajustes: [] }; // Fallback para JSON vazio
            }
        } else {
            extractedData = { ajustes: [] }; // Garante que sempre haja um objeto
        }

        console.log("[GeminiService] Resposta recebida com sucesso:", {
            responseLength: responseText.length,
            extractedData
        });

        return {
            text: responseText || "Entendido.", // Fallback se o texto for removido e ficar vazio
            extractedData
        };

    } catch (error: any) {
        console.error("[GeminiService] Erro detalhado na chamada da API:", {
            message: error.message,
            name: error.name,
            // Evitar logar stack muito longo em produção, mas útil em dev
            stack: __DEV__ ? error.stack : error.stack?.substring(0, 300)
        });

        // Mensagens de erro mais detalhadas e específicas para o usuário
        let errorMessage = "Falha na comunicação com o assistente AI.";

        if (error.message.includes('API key') || error.message.includes('Authentication failed')) {
            errorMessage = "Problema de autenticação com o serviço de IA. Verifique a configuração.";
        } else if (error.message.includes('quota')) {
            errorMessage = "Limite de uso da API Gemini atingido. Tente novamente mais tarde.";
        } else if (error.message.includes('Timeout')) {
            errorMessage = "A conexão com o assistente expirou. Verifique sua internet e tente novamente.";
        } else if (error.response?.promptFeedback?.blockReason) {
             // Se a resposta foi bloqueada por segurança
             console.warn("[GeminiService] Resposta bloqueada por segurança:", error.response.promptFeedback);
             errorMessage = "Sua mensagem ou a resposta do assistente foi bloqueada por políticas de segurança.";
        } else if (error.message.includes('fetch') || error.message.includes('Network request failed')) {
             errorMessage = "Erro de rede ao conectar com o assistente. Verifique sua conexão.";
        } else if (error.message.includes("Modelo Gemini não inicializado")) {
            errorMessage = error.message; // Usa a mensagem específica
        }

        // Re-throw o erro com a mensagem amigável
        throw new Error(errorMessage);
    }
};

// Função de teste para verificar se a API está funcionando
export const testGeminiApiConnection = async (): Promise<boolean> => {
    if (!API_KEY) {
        console.warn("[GeminiService Test] API Key não configurada, teste impossível.");
        return false;
    }
    if (!model) {
        console.warn("[GeminiService Test] Modelo não inicializado, teste impossível.");
        return false;
    }

    try {
        console.log("[GeminiService Test] Enviando requisição de teste...");
        // Usar generateContent para um teste simples sem histórico
        const result = await model.generateContent("Olá, responda apenas com a palavra 'ok' se você estiver funcionando.");
        const text = result.response?.text();
        console.log("[GeminiService Test] Resposta recebida:", text);
        return text?.toLowerCase().trim().includes('ok') ?? false;
    } catch (error: any) {
        console.error("[GeminiService Test] Teste de conexão falhou:", error.message);
        return false;
    }
};