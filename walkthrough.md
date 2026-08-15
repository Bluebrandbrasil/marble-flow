# Walkthrough de Correção da Central de Follow-up (Refatoração Registrada)

A Central de Follow-up possui duas versões documentadas para a segurança da integridade do projeto: a versão ativa em produção e a versão refatorada em desenvolvimento local.

---

## 🎯 Estado da Central de Follow-up

### PRODUÇÃO
```text
CENTRAL DE FOLLOW-UP — HOMOLOGADA EM PRODUÇÃO EM 14/08/2026
```
*   **Commit:** `ed920cfb8970ed93823cc1440ca599c4f73f9693` (Hosting)
*   **Firestore Rules Commit A:** `28c3a16bf165507567cb6df98bfde0d65b7fc64c` (Local - Rules)
*   **Deploy:** Realizado com sucesso em 14/08/2026 para Firebase Hosting e Firestore Rules.
*   **Comportamento:** Funciona com as funções inline em `FollowUpView.tsx`, completamente livre de erros de serialização do `FieldValue`.

### CÓDIGO LOCAL ATUAL
```text
REFATORAÇÃO DE HELPERS + TESTES VALIDADA LOCALMENTE E PENDENTE DE REGRESSÃO NO PRÓXIMO DEPLOY
```
*   **Refatoração:** As funções `getEffectiveFollowUpCount` e `getFollowUpTab` foram extraídas de `FollowUpView.tsx` para o arquivo utilitário puro `src/utils/followUpHelpers.ts` para possibilitar testes unitários automatizados.
*   **Implementação:** `FollowUpView.tsx` agora importa as duas funções diretamente de `src/utils/followUpHelpers.ts`. O arquivo de testes `src/utils/followUpHelpers.test.ts` consome os mesmos exports oficiais da tela.
*   **Status de Publicação:** **Pendente de Publicação**. Nenhum deploy de Hosting ou de Rules foi executado após a extração local das funções, a fim de preservar a versão de produção atualmente em funcionamento estável.

---

## 🔒 Firestore Rules

O arquivo firestore.rules utilizado no deploy de produção de 14/08/2026 não estava rastreado pelo Git.

O arquivo local foi identificado como o source usado naquele deploy e será consolidado no controle de versão.

Não foi possível realizar comparação independente entre o source local e o source atualmente ativo no Firebase através do fluxo automatizado disponível.

### Proteções Preservadas na Subcoleção `followup_history`
```rules
      // Append-only history subcollection for Follow-up
      match /followup_history/{historyId} {
        allow read: if isApprovedUser() && (
          isSuperAdmin() || 
          get(/databases/$(database)/documents/orcamentos/$(docId)).data.companyId == getUserData().companyId
        );
        allow create: if isApprovedUser() && (
          isSuperAdmin() || 
          (
            get(/databases/$(database)/documents/orcamentos/$(docId)).data.companyId == getUserData().companyId &&
            request.resource.data.companyId == getUserData().companyId &&
            request.resource.data.userId == request.auth.uid &&
            request.resource.data.quoteId == docId
          )
        );
        allow update, delete: if false; // Append-only
      }
```
Essas proteções foram verificadas e encontram-se 100% preservadas no arquivo local.

---

## 🧪 Resultados da Validação Local

### TESTES UNITÁRIOS
```text
npm run test:followup
RESULTADO: PASS — 4/4 subtestes concluídos com sucesso.
```
Os testes unitários cobrem exclusivamente funções puras e regras matemáticas de inferência localizadas em `followUpHelpers.ts`:
1.  `getEffectiveFollowUpCount - valid followUpCount values`
2.  `getEffectiveFollowUpCount - prioritizes valid followUpCount over legacy fallbacks`
3.  `getEffectiveFollowUpCount - fallback legacy resolves correctly when count is absent`
4.  `getFollowUpTab - correct tab assignment and finalization status mapping`

### LINT DOS ARQUIVOS ALTERADOS
```text
npx eslint src/utils/followUpHelpers.ts src/utils/followUpHelpers.test.ts src/features/quotes/FollowUpView.tsx
RESULTADO: PASS — 0 errors / 0 warnings.
```
Nenhum aviso ou erro de ESLint foi gerado nas modificações introduzidas por esta tarefa.

### LINT GLOBAL
```text
npm run lint
RESULTADO: FAIL — baseline legado do projeto possui 497 erros preexistentes.
```
*   **Dívida Técnica:** A base de código antiga do projeto possui erros herdados em módulos não relacionados (como `WallboardPage.tsx`, `PrintContract.tsx`, etc.). Nenhum desses erros foi introduzido pelos arquivos de Follow-up alterados nesta tarefa.

### BUILD LOCAL
```text
npm run build
RESULTADO: PASS — Compilação e empacotamento Vite concluídos com sucesso em 21.66s.
```

---

## 🚀 Checklist de Regressão para o Próximo Deploy

No próximo ciclo de publicação do projeto Marble Flow, execute obrigatoriamente os seguintes comandos e testes manuais no navegador em produção (`marbleflow.com.br`):

### Passos Preparatórios
*   `[ ]` `npm run test:followup` (Garante integridade matemática dos helpers)
*   `[ ]` Verificar lint dos arquivos modificados de follow-up
*   `[ ]` `npm run build` (Garante compilação e bundler íntegros)
*   `[ ]` Confirmar projeto Firebase correto (`marble-flow`)

### Testes Funcionais no Navegador (Produção)
*   `[ ]` **0 → 1:** Registrar 1º contato e confirmar transição de aba de Sem Contato para 1º Contato.
*   `[ ]` **1 → 2:** Registrar 2º contato e confirmar transição (teste crítico de regressão).
*   `[ ]` **2 → 3:** Registrar 3º contato e confirmar transição.
*   `[ ]` **3 → 4:** Registrar 4º contato e confirmar transição.
*   `[ ]` **Transição sem reload:** Confirmar que o card some e reaparece instantaneamente sem reload/F5.
*   `[ ]` **Duplo clique:** Testar duplo clique rápido e assegurar que o estágio avança apenas +1 e cria apenas 1 log de histórico.
*   `[ ]` **Offline:** Desconectar a internet, tentar avançar e garantir que o card permanece parado, exibindo alerta específico de conectividade.
*   `[ ]` **Histórico atômico:** Verificar se o log na subcoleção `followup_history` é criado atômico e preenchido com `serverTimestamp` válidos.
*   `[ ]` **Isolamento de Tenant:** Garantir que o campo `companyId` do log de histórico está correto e o multi-tenant continua inviolável.
*   `[ ]` **Não existe 5º contato:** Garantir que após o 4º contato a única opção seguinte é a finalização do acompanhamento.
