// src/services/api/claudeService.ts
import Anthropic from '@anthropic-ai/sdk';
// Importe a forma como você acessa suas variáveis de ambiente
// Exemplo usando react-native-dotenv:
import { EXPO_PUBLIC_ANTHROPIC_API_KEY } from '@env';

// Tipo importado ou definido no componente do chat. Reutilize se possível.
type Content = { role: 'user' | 'model'; parts: { text: string }[] };

// Verifique se a chave da API está definida
if (!EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    console.error("Chave de API da Anthropic (ANTHROPIC_API_KEY) não encontrada. Verifique suas variáveis de ambiente.");
    // Você pode querer lançar um erro aqui ou ter um estado de erro global
}

// Instancie o cliente Anthropic
const anthropic = new Anthropic({
    apiKey: EXPO_PUBLIC_ANTHROPIC_API_KEY,
});

// Modelo Claude a ser usado (ajuste conforme necessário, ex: claude-3-opus-20240229, claude-3-haiku-20240307)
const CLAUDE_MODEL = 'claude-3-sonnet-20240229';

/**
 * Testa a conexão com a API Claude fazendo uma chamada simples.
 * @returns {Promise<boolean>} True se a conexão for bem-sucedida, false caso contrário.
 */
export const testClaudeApiConnection = async (): Promise<boolean> => {
    console.log("[ClaudeService] Testando conexão com a API Claude...");
    try {
        // Faz uma chamada muito simples para verificar a autenticação e conectividade
        await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 10, // Mínimo de tokens para reduzir custo/tempo
            messages: [{ role: 'user', content: 'Ping' }],
        });
        console.log("[ClaudeService] Conexão com a API Claude bem-sucedida.");
        return true;
    } catch (error: any) {
        console.error("[ClaudeService] Falha ao testar conexão com a API Claude:", error.message || error);
        // Log detalhado do erro pode ser útil para depuração
        // console.error("Detalhes do erro:", error);
        return false;
    }
};

/**
 * Constrói uma mensagem de sistema para fornecer contexto ao Claude.
 * @param questionnaireData Dados do questionário.
 * @param adjustments Ajustes feitos pelo usuário.
 * @returns {string} A mensagem de sistema formatada.
 */
const buildSystemPrompt = (questionnaireData: any, adjustments: string[]): string => {
    let prompt = `Você é um assistente prestativo. O usuário respondeu a um questionário e pode querer fazer ajustes ou perguntas sobre os resultados.
Respostas do Questionário:
${JSON.stringify(questionnaireData, null, 2)}

Ajustes/Perguntas anteriores do usuário neste chat:
${adjustments.length > 0 ? adjustments.map((adj, i) => `${i + 1}. ${adj}`).join('\n') : 'Nenhum ajuste anterior.'}

Responda à última pergunta ou solicitação do usuário de forma concisa e útil, considerando todo o contexto fornecido.`;
    return prompt;
};

/**
 * Transforma o histórico de mensagens do formato interno para o formato da API Claude.
 * @param history Histórico de mensagens no formato { role: 'user' | 'model', parts: [{ text: string }] }.
 * @returns {Anthropic.Messages.MessageParam[]} Histórico no formato esperado pela API Claude.
 */
const transformHistoryForClaude = (history: Content[]): Anthropic.Messages.MessageParam[] => {
    return history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user', // Mapeia 'model' para 'assistant'
        content: msg.parts[0]?.text ?? '', // Assume que há sempre uma parte com texto
    }));
};

/**
 * Chama a API Claude para obter uma resposta com base na mensagem do usuário, histórico e contexto.
 * @param userMessageText A última mensagem enviada pelo usuário.
 * @param history O histórico da conversa (formato interno).
 * @param questionnaireData Os dados do questionário para contexto.
 * @param adjustments Os ajustes/perguntas anteriores do usuário no chat.
 * @returns {Promise<string>} A resposta de texto da IA.
 * @throws {Error} Se ocorrer um erro na chamada da API.
 */
export const callClaudeApi = async (
    userMessageText: string,
    history: Content[], // Histórico no formato do componente
    questionnaireData: any,
    adjustments: string[]
): Promise<string> => {
    console.log("[ClaudeService] Chamando a API Claude...");

    // 1. Construir a mensagem de sistema com o contexto
    const systemPrompt = buildSystemPrompt(questionnaireData, adjustments);

    // 2. Transformar o histórico para o formato da API Claude
    const formattedHistory = transformHistoryForClaude(history);

    // 3. Adicionar a mensagem atual do usuário ao histórico formatado
    const messagesForApi: Anthropic.Messages.MessageParam[] = [
        ...formattedHistory,
        { role: 'user', content: userMessageText },
    ];

    try {
        console.log("[ClaudeService] Enviando para API:", { model: CLAUDE_MODEL, system: systemPrompt ? 'Prompt definido' : 'Sem prompt', messagesCount: messagesForApi.length });

        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024, // Ajuste conforme necessário
            system: systemPrompt, // Adiciona o contexto como mensagem de sistema
            messages: messagesForApi,
            // Outros parâmetros opcionais: temperature, top_p, etc.
            // temperature: 0.7,
        });

        console.log("[ClaudeService] Resposta da API recebida.");

        // Extrai o texto da resposta. A API pode retornar diferentes tipos de blocos de conteúdo.
        // Vamos focar no tipo 'text' por enquanto.
        let responseText = '';
        if (response.content && response.content.length > 0) {
            const textBlock = response.content.find(block => block.type === 'text');
            if (textBlock && 'text' in textBlock) {
                responseText = textBlock.text;
            }
        }

        if (!responseText) {
            console.warn("[ClaudeService] API retornou uma resposta sem conteúdo de texto:", response);
            // Retorna uma string vazia ou lança um erro, dependendo de como você quer tratar isso
            return "(Nenhuma resposta de texto recebida)";
        }

        return responseText.trim();

    } catch (error: any) {
        console.error("[ClaudeService] Erro ao chamar a API Claude:", error.message || error);
        // Log detalhado pode ajudar
        // console.error("Detalhes do erro API:", error);

        // Lança um erro mais específico se possível, ou um erro genérico
        if (error instanceof Anthropic.APIError) {
            // Erros específicos da API Anthropic (ex: 400, 401, 429, 500)
            throw new Error(`Erro da API Claude (${error.status}): ${error.message}`);
        } else {
            // Erros genéricos (rede, etc.)
            throw new Error("Falha na comunicação com o assistente Claude.");
        }
    }
};