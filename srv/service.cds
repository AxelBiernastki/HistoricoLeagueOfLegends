@path : 'lol'
service LolService {

  type MatchSummary {
    matchId     : String;
    result      : String;
    kda         : String;
    durationMin : Integer;
    champion    : String;
    championImg : String;
    spell1_id   : Integer;
    spell1_name : String;
    spell1_img  : String;
    spell2_id   : Integer;
    spell2_name : String;
    spell2_img  : String;
    gameType    : String;
    lpDelta     : Integer;
    gameStart   : Timestamp;
  }

  function ultimasPartidas(gameName : String, tagLine : String, region : String)
    returns array of MatchSummary;
}
