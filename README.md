# ⚽ Elite Cup

Monte seu time dos sonhos com jogadores históricos e atuais da UEFA Champions League — e simule um campeonato completo.

## 🎮 Como Jogar

1. **Escolha a formação** (4-4-2, 4-3-3, 3-5-2, 4-2-3-1 ou 5-3-2)
2. **Escolha o estilo tático** (Defensivo, Equilibrado ou Ofensivo)
3. Clique em **COMEÇAR**
4. **Selecione um clube e uma temporada** da Champions League
5. **Escale 11 jogadores** clicando no card e depois no slot desejado no campo
6. Com o time completo, clique em **⚽ INICIAR LIGA**
7. Acompanhe os resultados **jogo a jogo** e veja a classificação final

## 🖥️ Tecnologia

- HTML + CSS + JavaScript puro (ES Modules)
- Sem framework, sem backend, sem build step
- Funciona diretamente com um servidor estático

## 🚀 Rodando o Projeto

```bash
# Instalar dependências (apenas para testes)
npm install

# Servir localmente
npx serve .
```

Abra `http://localhost:3000` no navegador.

## 📊 Dados

O projeto usa dados reais de jogadores importados do dataset [EA Sports FC](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset) (Kaggle).

**Dados atuais:**
- 10 temporadas (2014-15 a 2023-24)
- 44 clubes da Champions League
- 2.742 jogadores com ratings reais
- 8.875 registros de inscrições
- Escudos via API pública [football-data.org](https://www.football-data.org/)

### Importar novos dados do Kaggle

```bash
# 1. Baixe o dataset do Kaggle e coloque o CSV em raw/
#    https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset

# 2. Execute o script de importação
node scripts/import-kaggle.mjs

# 3. Adicione escudos dos clubes
node scripts/add-crests.mjs
```

**Variáveis de ambiente opcionais:**
- `MIN_OVERALL=65` — incluir jogadores com rating menor
- `MAX_PLAYERS=30` — mais jogadores por time

## 🏗️ Estrutura do Projeto

```
├── data/                  # JSONs estáticos (clubes, jogadores, registros)
├── raw/                   # CSVs do Kaggle (não versionado)
├── scripts/               # Scripts de importação de dados
│   ├── import-kaggle.mjs  # Converte CSV → JSONs da app
│   └── add-crests.mjs     # Adiciona URLs de escudos aos clubes
├── src/
│   ├── domain/            # Lógica pura (formações, time, validação, filtros)
│   ├── data/              # Loader, integridade, repositório
│   ├── state/             # Store central observável
│   └── ui/                # Componentes DOM (field, cards, painéis)
├── styles/                # CSS (dark theme, campo, cards, liga)
├── index.html             # Entry point
└── vitest.config.mjs      # Config de testes
```

## ⚙️ Simulação da Liga

- Turno e returno completo (todos contra todos, ida e volta)
- Resultados baseados em força relativa (média de rating do elenco)
- Distribuição Poisson para gols + vantagem de mandante
- Classificação por: Pontos → Saldo de Gols → Gols Pró
- Time do usuário nomeado pelo último clube/edição selecionado

## 🧪 Testes

```bash
npm test
```

Usa Vitest + fast-check para property-based testing do núcleo de domínio.

## 📝 Licença

MIT
