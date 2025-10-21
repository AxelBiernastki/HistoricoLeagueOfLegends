const cds = require('@sap/cds');



const REGIONAL_HOSTS = new Set(['americas','europe','asia','sea']);

const PLATFORM_TO_REGION = {
  // Américas
  BR1:'americas', NA1:'americas', LA1:'americas', LA2:'americas',
  // Europa
  EUW1:'europe', EUN1:'europe', TR1:'europe', RU:'europe',
  // Ásia
  KR:'asia', JP1:'asia',
  // Oceania + SEA (v2)
  OC1:'sea', SG2:'sea', PH2:'sea', TH2:'sea', TW2:'sea', VN2:'sea',
};

const REGIONAL_PROBE_ORDER = ['americas','europe','asia','sea'];

const QUEUE_LABEL = {
  420: "Ranked Solo/Duo",
  440: "Ranked Flex",
  400: "Normal Draft",
  430: "Normal Blind",
  450: "ARAM",
  700: "Clash",
  830: "Co-op vs AI (Intro)",
  840: "Co-op vs AI (Beginner)",
  850: "Co-op vs AI (Intermediate)",
  1700: "Arena",
}

// --- Mapa básico de Summoner Spells (id -> nome/arquivo) ---
const SUMMONER_SPELLS = {
  1: { name: "Cleanse", file: "SummonerBoost.png" },
  3: { name: "Exhaust", file: "SummonerExhaust.png" },
  4: { name: "Flash", file: "SummonerFlash.png" },
  6: { name: "Ghost", file: "SummonerHaste.png" },
  7: { name: "Heal", file: "SummonerHeal.png" },
  11: { name: "Smite", file: "SummonerSmite.png" },
  12: { name: "Teleport", file: "SummonerTeleport.png" },
  13: { name: "Clarity", file: "SummonerMana.png" },
  14: { name: "Ignite", file: "SummonerDot.png" },
  21: { name: "Barrier", file: "SummonerBarrier.png" },
};

// --- patch do Data Dragon a partir de info.gameVersion ---
function patchFrom(gameVersion) {
  if (!gameVersion) return "latest";
  const [maj, min] = String(gameVersion).split(".");
  return `${maj}.${min}.1`;
}

// --- URL da imagem do campeão ---
function championImgUrl(championName, gameVersion) {
  if (!championName) return "";
  const patch = patchFrom(gameVersion);
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${encodeURIComponent(championName)}.png`;
}

// --- URL da imagem das Spells ---
function spellImgUrl(spellId, gameVersion) {
  const meta = SUMMONER_SPELLS[spellId];
  if (!meta) return "";
  const patch = patchFrom(gameVersion);
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${meta.file}`
}

// --- logger simples com request id ---
function mkLog(reqId) {
  const pfx = `[RIOT][${reqId}]`;
  return {
    info: (...a) => console.log(pfx, ...a),
    warn: (...a) => console.warn(pfx, ...a),
    error: (...a) => console.error(pfx, ...a),
  };
}

function maskKey(k) {
  if (!k) return '(vazia)';
  if (k.length <= 8) return `${k[0]}***${k.slice(-1)}`;
  return `${k.slice(0, 4)}***${k.slice(-4)}`;
}

function hostFor(input) {
  const s = String(input || '').trim();
  if (!s) return 'americas';
  const low = s.toLowerCase();
  if (REGIONAL_HOSTS.has(low)) return low;        
  const up = s.toUpperCase();
  return PLATFORM_TO_REGION[up] || 'americas';    
}

async function tryGetAccountAt(region, gameName, tagLine, log) {
  const base = `https://${region}.api.riotgames.com`;
  const url  = `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  try {
    return await getJson(url, log);               // { puuid, ... }
  } catch (e) {
    if (e && e.status === 404) return null;       // só significa “não é aqui”
    throw e;                                       // outros erros sobem (403, 429, etc.)
  }
}

// Tenta na região preferida e, se 404, tenta nas demais
async function resolveRegionForRiotId(gameName, tagLine, userRegion, log) {
  const first = hostFor(userRegion);
  const order = [first, ...REGIONAL_PROBE_ORDER.filter(r => r !== first)];

  for (const reg of order) {
    const acc = await tryGetAccountAt(reg, gameName, tagLine, log);
    if (acc?.puuid) return { region: reg, account: acc };
  }
  return { region: first, account: null };
}


// Função auxiliar que pega a chave de API configurada para chamada X-Riot-Token
function headers(log) {
  const key = process.env.RIOT_API_KEY;
  log.info('headers(): RIOT_API_KEY presente?', !!key, 'mascara=', maskKey(key || ''));
  if (!key) throw new Error('RIOT_API_KEY não configurada.');
  return { 'X-Riot-Token': key };
}

async function getJson(url, log) {
  log.info('GET', url);
  const t0 = Date.now();
  const res = await fetch(url, { headers: headers(log) }).catch((e) => {
    log.error('fetch falhou ANTES de resposta', e && e.message);
    throw e;
  });

  const dt = Date.now() - t0;
  log.info('Resposta HTTP', res.status, res.statusText, `(${dt}ms)`);

  if (!res.ok) {
    const text = await res.text().catch(() => '(sem body)');
    const err = new Error(`Riot API error ${res.status}: ${text}`);
    err.status = res.status;
    log.error('getJson ERROR', err.message);
    throw err;
  }
  const json = await res.json().catch((e) => {
    log.error('Falha ao parsear JSON', e && e.message);
    throw e;
  });
  log.info('JSON recebido OK (keys):', Object.keys(json || {}));
  return json;
}

module.exports = cds.service.impl((srv) => {
  srv.on('ultimasPartidas', async (req) => {
    const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const log = mkLog(reqId);
    const started = Date.now();

    log.info('Handler ultimasPartidas - INICIO');
    log.info('req.data=', req.data);

    try {
      const { gameName, tagLine, region } = req.data || {};

      if (!gameName || !tagLine) {
        log.warn('Parâmetros ausentes: gameName/tagLine');
        return req.reject(400, 'Informe seu Nick e sua Tag');
      }

      // 1) Descobrir região correta para o Riot ID + obter PUUID
      const { region: reg, account } =
        await resolveRegionForRiotId(gameName, tagLine, region, log);

      if (!account?.puuid) {
        log.warn('Riot ID não encontrado em nenhuma região.');
        return req.reject(404, 'Riot ID não encontrado (verifique Nick#Tag).');
      }

      const puuid = account.puuid;
      const base  = `https://${reg}.api.riotgames.com`;
      log.info('Região final:', reg, 'Base URL:', base, 'PUUID:', puuid);

      // 2) IDs de partidas
      const idsUrl = `${base}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10`;
      log.info('Buscando match IDs via', idsUrl);
      const matchIds = await getJson(idsUrl, log);
      log.info('Total de matchIds:', Array.isArray(matchIds) ? matchIds.length : '(não é array)');

      // 3) Detalhes das partidas
      const details = await Promise.all(
        (matchIds || []).map(async (matchId, idx) => {
          const url = `${base}/lol/match/v5/matches/${matchId}`;
          log.info(`[#${idx + 1}/${matchIds.length}] Match ${matchId} → ${url}`);
          try {
            const m = await getJson(url, log);
            const keys = m && m.info ? Object.keys(m.info) : [];
            log.info(`Match ${matchId} OK; info keys:`, keys.slice(0, 6), '...');
            return { ok: true, match: m, id: matchId };
          } catch (err) {
            log.error(`Match ${matchId} FALHOU`, err && (err.status || err.message));
            return { ok: false, id: matchId, error: err };
          }
        })
      );

      const okCount = details.filter(d => d.ok).length;
      const failCount = details.length - okCount;
      log.info(`Detalhes agregados: OK=${okCount} FAIL=${failCount}`);

      // 4) Summary achatado (compatível com seu CDS/UI5)
      const summaries = details
        .filter(d => d.ok && d.match && d.match.info)
        .map(d => {
          const info = d.match.info;
          const parts = Array.isArray(info.participants) ? info.participants : [];
          const me = parts.find(p => p && p.puuid === puuid) || {};

          const kills   = Number(me.kills ?? 0);
          const deaths  = Number(me.deaths ?? 0);
          const assists = Number(me.assists ?? 0);
          const kda     = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;
          const kdaStr  = `${kills}/${deaths}/${assists} (${kda.toFixed(1)})`;

          const gameDurationSec = Number(info.gameDuration ?? 0);
          const durationMin     = Math.max(1, Math.round(gameDurationSec / 60));
          const gameStartMs     = Number(info.gameStartTimestamp ?? 0);
          const queueId         = Number(info.queueId ?? 0);
          const gameType        = QUEUE_LABEL[queueId] || (queueId ? `Queue ${queueId}` : '—');

          const champion    = String(me.championName ?? '—');
          const gameVersion = info.gameVersion;
          const championImg = championImgUrl(champion, gameVersion);

          const s1 = Number(me.summoner1Id ?? 0);
          const s2 = Number(me.summoner2Id ?? 0);

          return {
            matchId: d.id,
            result: me.win ? 'Win' : 'Loss',
            kda: kdaStr,
            durationMin,
            champion,
            championImg,

            spell1_id: s1,
            spell1_name: (SUMMONER_SPELLS[s1]?.name) || "",
            spell1_img:  spellImgUrl(s1, gameVersion),

            spell2_id: s2,
            spell2_name: (SUMMONER_SPELLS[s2]?.name) || "",
            spell2_img:  spellImgUrl(s2, gameVersion),

            gameType,
            gameStart: gameStartMs ? new Date(gameStartMs).toISOString() : null,
            lpDelta: null
          };
        })
        .sort((a, b) => {
          const ta = a.gameStart ? +new Date(a.gameStart) : 0;
          const tb = b.gameStart ? +new Date(b.gameStart) : 0;
          return tb - ta;
        });

      log.info('Summaries prontos:', summaries.length);
      log.info('Handler ultimasPartidas - FIM em', (Date.now() - started), 'ms');
      return summaries;

    } catch (e) {
      log.error('CATCH ultimasPartidas', {
        message: e && e.message,
        status: e && e.status,
        name: e && e.name,
        stack: e && e.stack,
      });

      if (e && typeof e.status === 'number') {
        if (e.status === 403) return req.reject(403, 'Acesso negado pela Riot API (verifique RIOT_API_KEY).');
        if (e.status === 429) return req.reject(429, 'Rate limit da Riot API atingido. Tente novamente em instantes.');
        if (e.status === 404) return req.reject(404, 'Recurso não encontrado na Riot API.');
        return req.reject(e.status, e.message || 'Erro ao chamar Riot API.');
      }
      if (e && /RIOT_API_KEY/i.test(e.message || '')) {
        return req.reject(500, 'RIOT_API_KEY não configurada no ambiente.');
      }
      return req.reject(500, `Erro inesperado ao chamar Riot API: ${e && e.message ? e.message : 'sem detalhes'}`);
    }
  });
});
