sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    const QUEUE_KEYS = { soloq: 420, flex: 440, aram: 450, clash: 700, arena: 1700 };
    const LS_KEY = "lol_recent_searches";

    function _dedupeKeepLatest(arr, limit = 5) {
        const map = new Map();
        for (const it of arr.sort((a, b) => b.ts - a.ts)) {
            map.set(`${it.riotId}|${it.region}`, it);
        }
        return Array.from(map.values()).slice(0, limit);
    }

    return Controller.extend("historico.lol.leagueoflegends.controller.View1", {
        // ========= Helpers de roteador =========
        _getRouter() { return this.getOwnerComponent().getRouter(); },
        _riotIdFromParts(gameName, tagLine) { return `${gameName}#${tagLine}`; },

        onInit: function () {
            const vm = new JSONModel({ rowsAll: [], rows: [], filtroModo: "todos", busy: false });
            const vh = new JSONModel({ recent: this._loadRecent() });
            this.getView().setModel(vm, "vm");
            this.getView().setModel(vh, "vh");

            // Enter no input chama buscar (vai só navegar)
            this.byId("inpRiotId").attachSubmit(this.onBuscar, this);

            // Conecta nas rotas
            const r = this._getRouter();
            r.getRoute("home").attachPatternMatched(this._onHomeMatched, this);
            r.getRoute("player").attachPatternMatched(this._onPlayerMatched, this);
        },

        // ======== Rotas ========
        _onPlayerMatched: function (oEvent) {
            // Vem da URL: /{summoner}
            const param = oEvent.getParameter("arguments").summoner || "";
            const riotId = decodeURIComponent(param);

            // mantém região selecionada (ou deixe aqui um default se quiser)
            const sel = this.byId("selRegion");
            const region = sel ? sel.getSelectedKey() : "americas";

            // Preenche input e dispara busca REAL (fromRoute = true evita nav recursiva)
            const inp = this.byId("inpRiotId");
            if (inp) inp.setValue(riotId);
            this.onBuscar({ fromRoute: true, forceRiotId: riotId, forceRegion: region });
        },

        // ======== Recentes (LS) ========
        _loadRecent: function () {
            try {
                const raw = localStorage.getItem(LS_KEY);
                const data = raw ? JSON.parse(raw) : [];
                return data.map(it => ({ key: `${it.riotId}|${it.region}`, riotId: it.riotId, region: it.region, ts: it.ts }));
            } catch { return []; }
        },
        _saveRecent: function (arr) {
            const plain = (arr || []).map(({ riotId, region, ts }) => ({ riotId, region, ts }));
            localStorage.setItem(LS_KEY, JSON.stringify(plain));
        },
        _addRecent: function (riotId, region) {
            const vh = this.getView().getModel("vh");
            const cur = vh.getProperty("/recent") || [];
            const novo = _dedupeKeepLatest([{ riotId, region, ts: Date.now() }, ...cur]);
            vh.setProperty("/recent", novo);
            this._saveRecent(novo);
        },
        onSugestaoSelecionada: function (oEvent) {
            const item = oEvent.getParameter("selectedItem");
            if (!item) return;
            const [riotId, region] = String(item.getKey()).split("|");

            // ajusta UI e navega (busca real acontece em _onPlayerMatched)
            if (this.byId("selRegion") && region) this.byId("selRegion").setSelectedKey(region);
            this._getRouter().navTo("player", { summoner: encodeURIComponent(riotId) });
        },

        // ======== Busy + util ========
        _setBusy: function (b) {
            this.byId("tblMatches").setBusy(b);
            this.getView().getModel("vm").setProperty("/busy", !!b);
        },
        _parseRiotId: function (s) {
            const str = String(s || "").trim();
            const idx = str.indexOf("#");
            if (idx <= 0 || idx >= str.length - 1) return null;
            const gameName = str.substring(0, idx).trim();
            const tagLine = str.substring(idx + 1).trim();
            return (gameName && tagLine) ? { gameName, tagLine } : null;
        },

        // ======== Chamadas OData ========
        _callUltimasPartidas: async function (gameName, tagLine, region) {
            const oModel = this.getView().getModel();
            const oCtx = oModel.bindContext("/ultimasPartidas(...)");
            oCtx.setParameter("gameName", gameName);
            oCtx.setParameter("tagLine", tagLine);
            oCtx.setParameter("region", region);
            await oCtx.execute();
            const data = await oCtx.requestObject();
            const obj = (data !== undefined) ? data : oCtx.getBoundContext().getObject();
            return Array.isArray(obj) ? obj : (obj?.value ?? []);
        },

        _applyFiltroModo: function () {
            const vm = this.getView().getModel("vm");
            const modo = vm.getProperty("/filtroModo");
            const all = vm.getProperty("/rowsAll") || [];
            let filtradas;
            if (modo === "todos") {
                filtradas = all;
            } else {
                const qid = QUEUE_KEYS[modo];
                filtradas = all.filter(r =>
                    (r.queueId != null && Number(r.queueId) === qid) ||
                    (typeof r.gameType === "string" && this._matchGameTypeText(r.gameType, modo))
                );
            }
            vm.setProperty("/rows", filtradas);
        },
        _matchGameTypeText: function (gameType, modo) {
            const gt = gameType.toLowerCase();
            if (modo === "soloq") return gt.includes("solo");
            if (modo === "flex") return gt.includes("flex");
            if (modo === "aram") return gt.includes("aram");
            if (modo === "clash") return gt.includes("clash");
            if (modo === "arena") return gt.includes("arena");
            return false;
        },
        onFiltroModo: function (oEvent) {
            const key = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("vm").setProperty("/filtroModo", key);
            this._applyFiltroModo();
        },

        fmtDate: function (iso) {
            if (!iso) return "";
            const d = new Date(iso);
            if (isNaN(d)) return "";
            const pad = n => String(n).padStart(2, "0");
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}\n ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },

        onChangeLimit: function (oEvent) {
            const key = oEvent.getParameter("item").getKey();
            this.getView().getModel("vm").setProperty("/limit", parseInt(key, 10));
            this.onBuscar({ fromRoute: true });
        },

        onRefresh: function () {
            this.onBuscar({ fromRoute: true });
            setTimeout(() => this.onScrollTop(), 1000);
        },

        onScrollTop: function () {
            const page = this.byId("pageId");
            if (!page) return;

            // Tentativa 1: método direto do Page (y, duração)
            if (page.scrollTo) {
                page.scrollTo(0, 300); // 0px de deslocamento, 300ms de animação
                return;
            }

            // Tentativa 2: via ScrollDelegate (x, y, duração)
            const del = page.getScrollDelegate && page.getScrollDelegate();
            if (del && del.scrollTo) {
                del.scrollTo(0, 0, 300);
                return;
            }

            // Fallback: scroll da janela
            window.scrollTo({ top: 0, behavior: "smooth" });
        },

        // ======== Buscar ========
        onBuscar: async function (opts) {
            const options = Object(opts);
            // Se veio da rota, executa a busca real
            if (options.fromRoute) {
                const riotId = options.forceRiotId || this.byId("inpRiotId").getValue();
                const region = options.forceRegion || this.byId("selRegion").getSelectedKey();

                const parsed = this._parseRiotId(riotId);
                if (!parsed) { MessageToast.show("Use o formato: Nick do jogador #Tag (ex.: Faker #BR1)"); return; }

                try {
                    this._setBusy(true);
                    const rows = await this._callUltimasPartidas(parsed.gameName, parsed.tagLine, region);
                    const vm = this.getView().getModel("vm");
                    vm.setProperty("/rowsAll", rows);
                    vm.setProperty("/rows", rows);
                    this._applyFiltroModo();
                    this._addRecent(this._riotIdFromParts(parsed.gameName, parsed.tagLine), region);
                } catch (err) {
                    console.error("[View1] erro na chamada da function:", err);
                    MessageBox.error("Falha ao buscar partidas.\nConfira o Riot ID e a região.\n\n" + (err?.message || ""));
                    this.getView().getModel("vm").setProperty("/rowsAll", []);
                    this.getView().getModel("vm").setProperty("/rows", []);
                } finally {
                    this._setBusy(false);
                    this.getView().getModel("vm").setProperty("/lastUpdated", new Date().toLocaleString("pt-BR"));
                }
                return;
            }

            // Se NÃO veio da rota (clique/enter), apenas navega e deixa a rota buscar
            const riotId = this.byId("inpRiotId").getValue();
            const parsed = this._parseRiotId(riotId);
            if (!parsed) { MessageToast.show("Use o formato: NickName#Tag (ex.: Tio Axel#BnTk)"); return; }
            this._getRouter().navTo("player", { summoner: encodeURIComponent(this._riotIdFromParts(parsed.gameName, parsed.tagLine)) });
        },

        // ======== Detalhe ========
        _callDetalhePartida: async function (matchId, region) {
            const oModel = this.getView().getModel();
            const oCtx = oModel.bindContext("/detalhePartida(...)");
            oCtx.setParameter("matchId", matchId);
            oCtx.setParameter("region", region);
            await oCtx.execute();
            const data = await oCtx.requestObject();
            const obj = (data !== undefined) ? data : oCtx.getBoundContext().getObject();
            return Array.isArray(obj) ? obj : (obj?.value ?? []);
        },

        onAbrirDetalhe: async function (oEvent) {
            try {
                const ctxObj = oEvent.getSource().getBindingContext("vm").getObject();
                const matchId = ctxObj.matchId;
                const region = ctxObj.resolvedRegion || this.byId("selRegion").getSelectedKey();

                this._setBusy(true);
                const parts = await this._callDetalhePartida(matchId, region);
                const tr = id => ({
                    8005: "Pressione o Ataque", 8008: "Ritmo Fatal", 8010: "Conquistador", 8021: "Agilidade nos Pés",
                    8112: "Eletrocutar", 8124: "Predador", 8128: "Colheita Sombria", 9923: "Chuva de Lâminas",
                    8214: "Invocar Aery", 8229: "Cometa Arcano", 8230: "Ímpeto Gradual",
                    8437: "Aperto dos Mortos Vivos", 8439: "Pós-Choque", 8465: "Guardião",
                    8351: "Aprimoramento Glacial", 8360: "Livro de Feitiços Deslacrado", 8369: "Primeiro Ataque"
                })[Number(id || 0)] || "";

                const team100 = parts.filter(p => p.teamId === 100).map(p => ({ ...p, runeMainName: tr(p.runeMain) }));
                const team200 = parts.filter(p => p.teamId === 200).map(p => ({ ...p, runeMainName: tr(p.runeMain) }));


                if (!this._oDetDlg) {
                    this._oDetDlg = await this.loadFragment({ name: "historico.lol.leagueoflegends.view.MatchDetail" });
                    this.getView().addDependent(this._oDetDlg);
                }
                const dlgModel = new JSONModel({
                    title: `Partida de ${ctxObj.champion} • ${ctxObj.gameType || ''}`,
                    team100, team200
                });
                this._oDetDlg.setModel(dlgModel, "dlg");
                this._oDetDlg.open();
            } catch (e) {
                console.error("[View1] detalhe erro:", e);
                MessageBox.error("Falha ao carregar detalhe da partida. \n\n" + (e?.message || ""));
            } finally {
                this._setBusy(false);
            }
        },

        onAbrirHistoricoJogador: function (oEvent) {
            // Objeto do jogador vindo do fragment
            const p = oEvent.getSource().getBindingContext("dlg").getObject();
            const riotId = (p.riotIdGameName && p.riotIdTagLine)
                ? `${p.riotIdGameName}#${p.riotIdTagLine}`
                : (p.summonerName || "");

            if (!riotId) { MessageToast.show("Não foi possível identificar o Riot ID deste jogador."); return; }

            // Ajusta região antes de navegar (se veio no detalhe)
            if (this.byId("selRegion") && p.resolvedRegion) this.byId("selRegion").setSelectedKey(p.resolvedRegion);

            // Navega para a rota do jogador (busca real acontece em _onPlayerMatched)
            this._getRouter().navTo("player", { summoner: encodeURIComponent(riotId) });

            if (this._oDetDlg) this._oDetDlg.close();
        },

        onFecharDetalhe: function () {
            if (this._oDetDlg) this._oDetDlg.close();
        }
    });
});
