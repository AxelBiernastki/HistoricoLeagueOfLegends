# League of Legends Match History
<div align="center">
  <table>
    <tr>
      <td><img width="48" src="https://img.icons8.com/color/48/riot-games.png" alt="RiotGames-Icon"/></td>
      <td><img src="https://cap.cloud.sap/docs/logos/cap.svg" width="55" alt="CAP-Icon"/></a></td>
      <td><img src="https://ui5.sap.com/resources/sap/ui/documentation/sdk/images/sap-ui5-logo.svg" width="50" alt="UI5-Icon"/></a></td>
    <td><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original-wordmark.svg" width="60" alt="NodeJs-Icon"/></a></td>
    </tr>
  </table>
</div>

> Aplicação web desenvolvida com **SAP CAP** e **SAPUI5 / Fiori** para consultar o histórico recente de partidas de jogadores de **League of Legends** a partir do **Riot ID**.

## Principais funcionalidades

- busca de partidas por **Riot ID** (`Nick#Tag`)
- consulta das **últimas 10 partidas**
- exibição de informações da partida:
  - campeão utilizado
  - resultado da partida
  - KDA
  - duração
  - data
  - modo de jogo
- filtro por modo de jogo:
  - SoloQ
  - Flex
  - ARAM
  - Clash
  - Arena
- visualização de **detalhes completos da partida**
- exibição dos dois times com:
  - jogador
  - campeão
  - feitiços
  - runa principal
  - itens
  - KDA
- navegação entre jogadores pelo detalhe da partida
- armazenamento de **buscas recentes no localStorage**
- atualização manual da listagem
- roteamento por URL para acessar o histórico de um jogador diretamente

## Tecnologias

- Node.js
- SAP CAP 
- SAPUI5
- Fiori Freestyle
- OData V4
- Express
- Riot Games API
- JavaScript
- CSS
- HTML

## Arquitetura do projeto

O projeto é dividido em duas partes principais:

### Frontend
Aplicação SAPUI5 responsável pela interface, navegação, filtros, tabela de partidas e tela de detalhes.

### Backend
Serviço CAP responsável por consumir a **Riot API**, processar os dados recebidos e expor funções OData para o frontend.

## Endpoints / Funções disponíveis

### LoLService

- `ultimasPartidas(gameName, tagLine, region)`
- `detalhePartida(matchId, region)`

## Como funciona

1. O usuário informa o **Riot ID** no formato `Nick#Tag`
2. O frontend envia a requisição para o serviço OData
3. O backend consulta a **Riot API**
4. Os dados das partidas são processados e retornados para a interface
5. A aplicação exibe a lista de partidas e permite abrir o detalhe de cada uma

## Como executar

### 1. Clonar o repositório

```bash
git clone https://github.com/AxelBiernastki/Match-History-LOL.git
cd LeagueOfLegends
```

### 2. Instalar as dependências

```bash
npm install
```

### 3. Criar o arquivo .env

Crie um arquivo .env na raiz do projeto com a variável:

```env
RIOT_API_KEY=
```
A Riot disponibiliza chaves de API no seu site oficial:
[https://developer.riotgames.com/apis
](https://developer.riotgames.com/apis)

### 4. Executar a aplicação

```bash
cds watch
```

### Acesso da aplicação

Com o projeto em execução, acesse no navegador:
```bash
http://localhost:4004/historico.lol.leagueoflegends/index.html
```

## Estrutura do projeto
```txt
LeagueOfLegends/
├── app/
│   └── leagueoflegends/
│       └── webapp/
│           ├── controller/
│           │   ├── App.controller.js
│           │   └── View1.controller.js
│           ├── css/
│           │   └── style.css
│           ├── i18n/
│           │   └── i18n.properties
│           ├── imgs/
│           ├── model/
│           │   └── models.js
│           ├── view/
│           │   ├── App.view.xml
│           │   ├── MatchDetail.fragment.xml
│           │   └── View1.view.xml
│           ├── Component.js
│           ├── index.html
│           ├── manifest.json
│           ├── appGenInfo.json
│           └── package.json
│
├── srv/
│   ├── service.cds
│   └── service.js
│
├── testes/
│   └── test.http
│
├── .env
├── .gitignore
├── eslint.config.mjs
├── mta.yaml
├── package.json
├── package-lock.json
├── README.md
└── xs-security.json
```

## Observações
- este projeto não utiliza banco de dados para persistência
- o histórico recente pesquisado é salvo apenas no localStorage do navegador
- os dados exibidos são obtidos em tempo real pela Riot API
- a região informada pelo usuário é usada para localizar corretamente a conta e as partidas
- o backend faz o tratamento das informações para retornar os dados já prontos para a interface

## Diferenciais do projeto
- integração entre SAP CAP e SAPUI5
- consumo de API externa com tratamento de dados
- interface interativa com navegação entre jogadores
- detalhamento visual das partidas com ícones, runas, feitiços e itens
- uso de roteamento para acesso direto ao histórico de um jogador
