O problema central é que, ao apagar e recriar as conexões, os IDs internos mudaram e o sistema não está conseguindo vincular as novas mensagens recebidas aos registros antigos (que podem ter sido apagados via CASCADE ou estão órfãos). Além disso, o UAZAPI usa frequentemente IDs internos (@lid) que não batem exatamente com os IDs do WhatsApp padrão (@s.whatsapp.net), criando conversas duplicadas ou "escondidas" na aba de "Aguardando".

1. **Ajustar o processamento de webhooks do UAZAPI**:
   - Refinar a busca por conversas existentes para procurar em TODAS as conexões da mesma organização, não apenas na conexão atual. Isso evita que mensagens de um contato conhecido criem uma nova conversa se já existir uma (mesmo que em uma conexão antiga/migrada).
   - Impedir que o status de atendimento seja resetado para 'Aguardando' se a conversa já estiver 'Em atendimento', mesmo que ela seja "re-vinculada" a uma nova conexão.
   - Melhorar a normalização de JIDs para tratar melhor a diferença entre @lid e @s.whatsapp.net.

2. **Melhorar a ferramenta de limpeza de duplicatas**:
   - Atualizar a rota `/api/chat/conversations/cleanup-duplicates` para identificar e mesclar conversas duplicadas entre diferentes conexões da mesma organização (necessário após migrações manuais ou re-adição de conexões).

3. **Correção de visibilidade para Superadmin**:
   - Garantir que o Superadmin veja apenas as conexões pertinentes ao contexto atual (organização selecionada) para evitar confusão entre diferentes inquilinos (tenants).

4. **Scripts de diagnóstico**:
   - Vou disponibilizar uma rota de diagnóstico mais detalhada para que possamos ver exatamente o que aconteceu com os dados "bagunçados".

Resumo técnico:
- Modificar `backend/src/routes/uazapi.js` para busca global de conversas na organização.
- Modificar `backend/src/routes/chat.js` para aprimorar a mesclagem de duplicatas.
- Ajustar `backend/src/routes/connections.js` para melhorar a filtragem do superadmin.
