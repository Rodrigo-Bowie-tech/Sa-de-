# Minha Saúde

App para concentrar **todos os seus dados de saúde** em um só lugar: alimentação e calorias, consultas com alertas, grau de miopia e outros dados da visão, remédios, exames, vacinas, medidas, atividades físicas, sono e sintomas.

É um **PWA** (aplicativo web instalável): funciona no celular (Android e iPhone) e no computador, sem loja de aplicativos, e continua funcionando sem internet. Os dados ficam **somente no seu aparelho** (IndexedDB) — não há conta nem servidor.

## O que o app faz

| Área | Recursos |
| --- | --- |
| **Início** | Alertas do dia (consultas de hoje e amanhã, remédios pendentes, vacinas a vencer, exame de vista anual), resumo de calorias, água, peso/IMC, pressão, grau e remédios, próximas consultas. |
| **Alimentação** | Diário por refeição, contagem de calorias e macronutrientes (proteína, carboidratos, gorduras), meta diária calculada pelo perfil (Mifflin-St Jeor) com desconto das calorias gastas em exercícios, controle de água, gráfico dos últimos 7 dias. Busca em ~110 alimentos comuns (valores aproximados da tabela TACO), alimentos personalizados, lançamento só das calorias e busca online de produtos industrializados por nome ou código de barras (Open Food Facts). |
| **Agenda** | Calendário mensal, consultas/exames/retornos com profissional, local, telefone e observações. **Alertas** configuráveis (1 semana, 2 dias, 1 dia, 3 h, 2 h, 1 h, 30 min antes, na hora) e **alerta na manhã do dia da consulta** (horário ajustável). Exporta para o calendário do celular (`.ics` com alarmes) e para o Google Agenda. Depois da consulta, registre o resumo/orientações e agende o retorno. |
| **Visão** | Receitas de óculos/lentes (esférico, cilíndrico, eixo, adição, acuidade, DNP, pressão intraocular), identificação de miopia, hipermetropia, astigmatismo e presbiopia, gráfico da evolução do grau e aviso do exame anual. |
| **Medidas** | Peso (com IMC), pressão arterial, glicemia, frequência cardíaca, temperatura, saturação, cintura e % de gordura, com gráficos e faixas de referência. |
| **Remédios** | Horários, lembretes, “Tomei” por dose, adesão dos últimos 7 dias e exportação dos lembretes para o calendário. |
| **Exames, vacinas, atividades, sono, sintomas** | Registros com histórico; vacinas avisam a próxima dose; atividades estimam calorias gastas; sono calcula horas e média. |
| **Perfil** | Dados pessoais, tipo sanguíneo, alergias, doenças, cirurgias, histórico familiar, contato de emergência, plano de saúde e Cartão SUS. **Ficha de saúde** para imprimir/salvar em PDF e levar às consultas. Backup e restauração (arquivo JSON). Tema claro/escuro. |

### Sobre os alertas

- Com o app aberto ou em segundo plano, os alertas aparecem como notificação do sistema (é preciso permitir notificações) e dentro do app.
- Navegadores não permitem que um site agende notificações com o app totalmente fechado. Para garantir o aviso, use o botão **Calendário** de cada consulta: ele adiciona o compromisso ao calendário do celular já com os alarmes escolhidos.
- No iPhone, as notificações só funcionam com o app instalado na Tela de Início (iOS 16.4 ou superior).

> As faixas de referência (IMC, pressão, glicemia etc.) são informativas e não substituem a avaliação de um profissional de saúde.

## Como usar no celular

1. Publique o app (veja abaixo) e abra o endereço no celular.
2. **Android (Chrome):** menu ⋮ → **Instalar app**. **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.
3. Abra pelo ícone, vá em **Perfil** e preencha seus dados; em **Agenda**, toque em **Ativar alertas**.

### Publicação no GitHub Pages

O workflow `.github/workflows/ci.yml` roda os testes e o build em cada push e PR, e publica o app a cada push na branch padrão do repositório. Para ativar, no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (em conta gratuita, o repositório precisa ser público). O endereço fica parecido com `https://<usuario>.github.io/<repositorio>/`.

## App Treino (`/treino/`)

Segundo app instalável, publicado junto com o Minha Saúde em `https://<usuario>.github.io/<repositorio>/treino/`, com ícone, manifesto e service worker próprios. Feito para treinos de **até 1 hora**, com foco no **desenvolvimento dos braços** e exercícios para **fascite plantar**.

| Área | Recursos |
| --- | --- |
| **Treino de hoje** | Monta o treino sozinho: **15 min de aquecimento** sem impacto (sem pulos, para proteger o calcanhar), bloco de **fascite plantar** (alongamento da fáscia e da panturrilha em todo treino, elevação de calcanhar com toalha em treinos alternados, massagem com bolinha/garrafa gelada, toalha com os dedos, pé curto etc.), **braços** (bíceps, tríceps, ombros, antebraço) e alongamento final. Duração de 30, 45 ou 60 min; os exercícios variam de um treino para o outro. |
| **Durante o treino** | Cronômetro com contagem regressiva, voz anunciando cada exercício, bipes, vibração e tela sempre ligada. Séries com registro de repetições e carga e descanso automático. **Limite de 1 hora**: avisos aos 50 e 55 min, atalho para o alongamento final e encerramento automático aos 60 min (pausas não contam). |
| **Progressão** | Meta de cada série pela última vez que você fez o exercício: mantém o peso até completar o máximo de repetições em todas as séries, depois sugere subir o peso. |
| **Histórico** | Treinos, gráfico de evolução de carga por exercício e da dor no pé (0 a 10, registrada ao fim de cada treino). |
| **Exercícios** | Biblioteca com passo a passo, ritmo, material, dicas e cuidados de cada exercício, e orientações gerais para a fascite. Funciona com halteres, elástico, barra fixa ou sem equipamento (peso do corpo, cadeira, toalha, mochila, garrafas). |
| **Sincronização** | Celular e computador com os mesmos treinos e ajustes. Os dados ficam numa **gist secreta da sua conta do GitHub** (sem servidor próprio): crie um token com a permissão `gist`, cole em **Ajustes → Sincronização** e conecte os outros aparelhos pelo **código QR** ou colando o código. Sincroniza ao abrir o app, após cada alteração e a cada 5 min; funciona offline e envia depois. |

> No iPhone, o app instalado na Tela de Início não compartilha dados com o Safari: conecte a sincronização de dentro do app instalado (colando o código). As orientações sobre fascite são gerais e não substituem a avaliação de um médico ou fisioterapeuta.

## Desenvolvimento

Requer Node.js 22+.

```bash
npm install
npm run dev        # servidor de desenvolvimento (Minha Saúde)
npm run dev:treino # servidor de desenvolvimento (Treino)
npm test           # testes (cálculos, alertas, calendário, backup)
npm run build      # verificação de tipos + build de produção em dist/ (e dist/treino/)
npm run preview    # serve o build localmente
```

Tecnologias: React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (service worker e manifesto), Vitest.

```
src/
  db/          tipos e banco de dados local (Dexie)
  lib/         regras: nutrição, faixas de saúde, alertas, .ics, backup, Open Food Facts
  data/        tabela de alimentos
  components/  componentes de interface (modal, formulários, gráficos)
  hooks/       perfil, agendador de alertas, instalação
  pages/       telas do app
treino/        app Treino (index.html, ícones e src/ com dados, regras, telas e testes)
```
