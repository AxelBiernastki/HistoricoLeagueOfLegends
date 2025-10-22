sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"
], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    const QUEUE_KEYS = {
        soloq: 420,
        flex: 440,
        aram: 450,
        clash: 700,
        arena: 1700,
    }

    const LS_KEY = "lol_recent_searches";

    function _dedupeKeepLatest(arr, limit = 5) {
        const map = new Map();
        for (const it of arr.sort((a, b) => b.ts - a.ts)) {
            map.set(`${it.riotId}|${it.region}`, it);
        }
        return Array.from(map.values()).slice(0, limit);
    }

    return Controller.extend("historico.lol.leagueoflegends.controller.View1", {
        onInit: function () {
            const vm = new JSONModel({
                rowsAll: [],
                rows: [],
                filtroModo: "todos",
                busy: false
            });
            const vh = new JSONModel({
                recent: this._loadRecent()
            });
            this.getView().setModel(vm, "vm");
            this.getView().setModel(vh, "vh");
            console.log("[View1] onInit ok");

            this.byId("inpRiotId").attachSubmit(this.onBuscar, this);
        },

        _loadRecent: function () {
            try {
                const raw = localStorage.getItem(LS_KEY);
                const data = raw ? JSON.parse(raw) : [];
                return data.map(it => ({
                    key: `${it.riotId}|${it.region}`,
                    riotId: it.riotId,
                    region: it.region,
                    ts: it.ts
                }));
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
            this._saveRecent(novo); // <-- passa o array
        },

        onSugestaoSelecionada: function (oEvent) {
            const item = oEvent.getParameter("selectedItem");
            if (!item) return;

            const key = item.getKey(); 
            const [riotId, region] = key.split("|");

            const inp = this.byId("inpRiotId");
            const sel = this.byId("selRegion");

            inp.setValue(riotId || "");
            if (sel && region) sel.setSelectedKey(region);
            setTimeout(() => this.onBuscar(), 0);
        },

        _setBusy: function (b) {
            this.byId("tblMatches").setBusy(b);
            this.getView().getModel("vm").setProperty("/busy", !!b);
        },

        _parseRiotId: function (s) {
            const str = String(s || "").trim();        // <- trim no todo
            const idx = str.indexOf("#");
            if (idx <= 0 || idx >= str.length - 1) return null; // aceita 'Nick#Tag' ou 'Nick #Tag'
            const gameName = str.substring(0, idx).trim();
            const tagLine = str.substring(idx + 1).trim();
            return (gameName && tagLine) ? { gameName, tagLine } : null;
        },


        _callUltimasPartidas: async function (gameName, tagLine, region) {
            const oModel = this.getView().getModel();
            const oCtx = oModel.bindContext("/ultimasPartidas(...)");

            oCtx.setParameter("gameName", gameName);
            oCtx.setParameter("tagLine", tagLine);
            oCtx.setParameter("region", region);

            // Garante que a chamada seja disparada
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
            // Aceita com ou sem milissegundos
            const d = new Date(iso); // entende ISO/Z automaticamente
            if (isNaN(d)) return "";

            const pad = n => String(n).padStart(2, "0");
            const dd = pad(d.getDate());
            const mm = pad(d.getMonth() + 1);
            const yyyy = d.getFullYear();
            const HH = pad(d.getHours());
            const MM = pad(d.getMinutes());
            return `${dd}/${mm}/${yyyy}\n ${HH}:${MM}`;
        },


        onChangeLimit: function (oEvent) {
            const key = oEvent.getParameter("item").getKey();
            this.getView().getModel("vm").setProperty("/limit", parseInt(key, 10));
            this.onBuscar(); // recarrega com novo limite
        },

        onRefresh: function () {
            this.onBuscar();
        },

        onScrollTop: function () {
            const oTbl = this.byId("tblMatches");
            if (oTbl && oTbl.getDomRef()) {
                oTbl.getDomRef().scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        },

        onBuscar: async function () {
            console.log("[View1] onBuscar clicado");
            const inp = this.byId("inpRiotId");
            const sel = this.byId("selRegion");

            if (!inp || !sel) {
                console.error("[View1] Controles não encontrados", { inp: !!inp, sel: !!sel });
                MessageBox.error("Erro interno: controles não encontrados na View.");
                return;
            }

            const riotId = inp.getValue();
            const region = sel.getSelectedKey();

            const parsed = this._parseRiotId(riotId);
            if (!parsed) {
                MessageToast.show("Use o formato: NickName#Tag (ex.: Tio Axel#BnTk)");
                return;
            }

            try {
                this._setBusy(true);
                const rows = await this._callUltimasPartidas(parsed.gameName, parsed.tagLine, region);

                const vm = this.getView().getModel("vm");
                vm.setProperty("/rowsAll", rows);
                vm.setProperty("/rows", rows);
                this._applyFiltroModo();

                this._addRecent(`${parsed.gameName}#${parsed.tagLine}`, region);
                console.log("[View1] rows atualizados:", rows.length);
            } catch (err) {
                console.error("[View1] erro na chamada da function:", err);
                MessageBox.error(
                    "Falha ao buscar partidas.\n" +
                    "Confira nome de jogador não encontrado.\n\n" +
                    (err?.message || "")
                );
                this.getView().getModel("vm").setProperty("/rowsAll", []);
                this.getView().getModel("vm").setProperty("/rows", []);
            } finally {
                this._setBusy(false);
                this.getView().getModel("vm").setProperty(
                    "/lastUpdated",
                    new Date().toLocaleString("pt-BR")
                );
            }
        },

        // Chamada de Detalhes 

        _callDetalhePartida: async function(matchId, region) {
            const oModel = this.getView().getModel();
            const oCtx = oModel.bindContext("/detalhePartida(...)");
            oCtx.setParameter("matchId", matchId);
            oCtx.setParameter("region", region);
            await oCtx.execute();
            const data = await oCtx.requestObject();
            const obj = (data !== undefined) ? data : oCtx.getBoundContext().getObject();
            return Array.isArray(obj) ? obj : (obj?.value ?? []);
        },

        // -- Abre o Fragment
        onAbrirDetalhe: async function (oEvent) {
            try {
                const ctxObj = oEvent.getSource().getBindingContext("vm").getObject();
                const matchId = ctxObj.matchId;
                const region = ctxObj.resolvedRegion || this.byId("selRegion").getSelectedKey();

                this._setBusy(true);
                const parts = await this._callDetalhePartida(matchId, region);

                const team100 = parts.filter(p => p.teamId === 100);
                const team200 = parts.filter(p => p.teamId === 200);

                if(!this._oDetDlg) {
                    this._oDetDlg = await this.loadFragment({
                        name: "historico.lol.leagueoflegends.view.MatchDetail"
                    });
                    this.getView().addDependent(this._oDetDlg);
                }
                const dlgModel = new JSONModel({
                    title: `Partida de ${ctxObj.champion} • ${ctxObj.gameType || ''}`,
                    team100,
                    team200
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

        onFecharDetalhe: function() {
            if(this._oDetDlg) this._oDetDlg.close();
        }
    });
});
