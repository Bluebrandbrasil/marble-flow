# 🏛️ Marble Flow

**Marble Flow** é um sistema de alta performance tipo ERP (Enterprise Resource Planning) construído para gestão avançada de marmorarias. Ele centraliza as Operações Comerciais e a Produção em um pipeline inteligente, com uma interface Premium (Glassmorphism), Kanban interativo e rica inteligência de dados.

O projeto foi construído com as tecnologias mais modernas do ecossistema React (`Vite`, `TypeScript`, `Tailwind CSS`, `Recharts` e `Lucide Icons`). 

---

## ✨ Funcionalidades Principais

- **Smart Paste (Extração de Protocolo)**: No Dashboard de Medições (Calendário), a tela de "Adicionar" possui um *Dropzone Inteligente*. Ao colar um texto recebido pelo WhatsApp (contendo Nome, Telefone, Endereço, Cidade), o sistema preenche todos os campos do formulário automaticamente usando Regex avançado.
- **Dashboard Geográfico**: Na tela de Relatórios, a aba "Geográfico" exibe inteligência real de vendas. Conta com um *Mapa de Calor Operacional em CSS* indicando o status das medições por Zona (Convertido, Espera, Perdido), o cruzamento da taxa de conversão e a "Melhor Cidade" em tempo real usando Recharts.
- **Central de Arquivos (Fotos da Medição)**: O Kanban de Produção permite o Anexo de até 10 fotos da obra ou arquivos em PDF usando um Upload Modal customizado. Além do upload, o sistema traz um **View Mode em Carrossel Fullscreen**, com navegação por setas e zoom nativo (Scroll/Pan) para ler anotações à mão dos medidores nas pranchetas.
- **Integração Vendas -> Produção**: Ao "Converter" uma oportunidade (Medição) em Ordem de Serviço, o histórico cronológico de venda se mantém no calendário e todos os anexos técnicos saltam automaticamente do Card da Medição para o novo Card de Produção.
- **UX Premium & Glassmorphism**: O design baseia-se em transparências, fundos difusos, blurs e alertas de pulso nativos pelo TailwindCSS (`animate-pulse`). O sistema conta com ícones unificados (`lucide-react`) e gráficos profissionais (`recharts`).

---

## 🚀 Como Rodar o Projeto em Uma Nova Máquina

Siga o passo a passo abaixo para rodar o **Marble Flow** perfeitamente após clonar em um novo computador.

### 1. Clonar o Repositório
Navegue até a pasta desejada em seu computador e baixe o projeto:
```bash
git clone seu-link-do-github-aqui
cd void-universe
```

### 2. Instalar as Dependências
Como o arquivo `package.json` já contém todas as bibliotecas necessárias mapeadas (`@hello-pangea/dnd`, `lucide-react`, `recharts`, `date-fns`, etc), basta rodar o comando clássico do NPM:
```bash
npm install
```
*Isso vai baixar a pasta secreta `node_modules` corretamente.*

### 3. Configurar Variáveis de Ambiente
O projeto precisa conhecer as chaves da API do Firebase para funcionar plenamente quando evoluído para Cloud.
- Crie um arquivo com o nome exato `.env` na pasta raiz (junto do `package.json`).
- Abra o arquivo `.env.example`, **copie todo o texto de dentro dele** e **cole no seu novo `.env`**.
- Preencha com as suas Chaves Públicas do Firebase (se você já tiver ativado um projeto. Se for rodar a versão atual Mockada, basta deixar criado sem os valores).

### 4. Iniciar o Servidor de Desenvolvimento
Com as dependências instaladas e o ambiente listado, ligue o servidor local (Vite):
```bash
npm run dev
```

Pronto! Acesse `http://localhost:5173` e aproveite a plataforma.

---

## 🛠️ Tecnologias Utilizadas
- **Core**: React 18, Vite, TypeScript.
- **Styling**: TailwindCSS 3 + Estilos customizados (Glassmorphism, Animations e custom-scrollbar em index.css).
- **Componentes & Gráficos**: Recharts, Lucide React (Ícones), Radix UI.
- **Lógica e Dados**: Date-fns (Cálculos de Calendário e alertas 48h), Hello Pangea DND (Drag and Drop avançado).
