(function (global) {
  "use strict";

  // English message templates are stable keys. Add dialogue/story namespaces here later.
  const ko = Object.freeze({
    "STAGE": "스테이지", "STAGE {stage}": "스테이지 {stage}", "GOLD / CAPACITY": "골드 / 최대 보유량",
    "HP": "체력", "TIME": "남은 시간", "TAP": "탭", "TOTAL DPS": "총 DPS", "TAP DAMAGE": "탭 피해량",
    "MONSTER {number} / {total}": "몬스터 {number} / {total}", "STAGE BOSS · 10 / 10": "스테이지 보스 · 10 / 10",
    "REGION BOSS · 10 / 10": "지역 보스 · 10 / 10", "GUARDIAN": "가디언", "REGION BOSS": "지역 보스",
    "MIMIC": "미믹", "NAZAR": "나자르", "SPECIAL": "특수 전투", "NAZAR ACTIVE": "나자르 활성", "NAZAR INACTIVE": "나자르 비활성",
    "Stage {stage} Sentinel": "스테이지 {stage} 수문장", "Region {region} Warden": "지역 {region} 지배자",
    "GIVE UP": "도전 포기", "BOSS FAILED": "보스 도전 실패", "FARMING STAGE {stage}": "스테이지 {stage} 파밍",
    "NEXT BOSS HP: {hp}": "재도전 보스 체력: {hp}", "CHALLENGE BOSS": "보스 재도전",
    "TAP OR PRESS SPACE · Z · X · ENTER": "탭 또는 SPACE · Z · X · ENTER", "Attack area": "전투 영역", "Attack monster": "몬스터 공격",
    "Combat stats": "전투 능력치", "Game sections": "게임 메뉴", "LUTIE": "루티", "HERO": "주인공",
    "NEXT COST": "다음 강화 비용", "LV. {level}": "레벨 {level}", "Lv. {level}": "레벨 {level}", "MAX": "최대",
    "MAX +{levels}": "최대 +{levels}", "BAG Lv. {level}": "가방 레벨 {level}", "UPGRADE BAG · {cost} G": "가방 강화 · {cost} G",
    "ALL +{amount} · {cost} G": "전체 +{amount} · {cost} G", "ACTIVE SKILLS": "액티브 스킬", "Temporary reconstruction": "임시 재구현",
    "COMING SOON": "준비 중", "READY": "사용 가능", "Lv{level}": "레벨 {level}", "{seconds}s": "{seconds}초",
    "ROSTER": "보유 목록", "Guardians": "가디언", "CURRENT GOLD": "보유 골드", "SORT": "정렬", "ACQUIRED": "획득 순",
    "NAME": "이름", "GROUP": "그룹", "Not discovered": "미발견", "Discovered · Awaiting this run": "발견 완료 · 이번 회차 미획득",
    "REINC. {level}": "환생 {level}", "LEVEL": "레벨", "NONE": "없음", "MANA STONE": "마나 스톤", "Mana Stones": "마나 스톤",
    "{rarity} Lv.{level}": "{rarity} 레벨 {level}", "NORMAL": "일반", "HIGH": "고급", "LEGENDARY": "전설",
    "HUMAN": "인간", "MACHINE": "기계", "BEAST": "야수", "DRAGON": "용", "FAIRY": "요정", "SPIRIT": "정령", "ANGEL": "천사", "DEMON": "악마",
    "INVENTORY": "인벤토리", "{count} STONES": "스톤 {count}개",
    "Stone power is capped by the current Stage. One stone can be equipped to one Guardian.": "스톤 효과 레벨은 현재 스테이지가 상한입니다. 스톤 하나는 가디언 한 명에게만 장착할 수 있습니다.",
    "DPS +{percent}% · Effective Lv.{level}": "DPS +{percent}% · 적용 레벨 {level}",
    "SELECT MANA STONE": "마나 스톤 선택", "Remove the equipped Mana Stone": "장착된 마나 스톤 해제", "EQUIPPED": "장착 중",
    "MOVE FROM {name}": "{name}에게서 이동", "{rarity} · Lv.{level}": "{rarity} · 레벨 {level}", "No Mana Stones owned.": "보유한 마나 스톤이 없습니다.",
    "CLOSE": "닫기", "Defeat Mimics and Region Bosses to find Mana Stones.": "미믹과 지역 보스를 처치해 마나 스톤을 획득하세요.",
    "Mana Stone · Lv.{level}": "마나 스톤 · 레벨 {level}", "Equipped: {name}": "장착: {name}",
    "Not equipped · Select it from a Guardian card": "미장착 · 가디언 카드에서 선택하세요",
    "STAR": "별", "Stars": "별", "PERMANENT PROGRESS": "영구 성장", "STARS IF REINCARNATING NOW": "지금 환생하면 얻는 별",
    "REINCARNATE": "환생", "REINCARNATE · LV {level}": "환생 · 레벨 {level} 필요", "ARTIFACTS": "유물", "Permanent placeholder bonuses": "임시 영구 보너스",
    "TAP Artifact": "탭 유물", "DPS Artifact": "DPS 유물", "GOLD Artifact": "골드 유물", "Current effect +{percent}%": "현재 효과 +{percent}%", "LEVEL UP": "강화",
    "PERMANENT RESET": "환생", "Reincarnate?": "환생하시겠습니까?",
    "Gold, stages and levels reset. Bag, Stars, Artifacts and Legendary Stones stay.": "골드, 스테이지와 레벨이 초기화됩니다. 가방, 별, 유물과 전설 스톤은 유지됩니다.",
    "You will receive": "획득할 별:", "{count} Stars": "별 {count}개", "CANCEL": "취소",
    "SETTINGS": "설정", "Settings": "설정", "LOCAL DATA": "로컬 데이터", "LANGUAGE": "언어", "SAVE NOW": "지금 저장", "Write current state": "현재 상태 저장",
    "EXPORT SAVE": "저장 내보내기", "Download JSON": "JSON 다운로드", "IMPORT SAVE": "저장 불러오기", "Choose JSON file": "JSON 파일 선택",
    "DAMAGE NUMBERS": "피해량 표시", "HIT ANIMATION": "피격 애니메이션", "RESET SAVE": "저장 초기화", "Erase all progress": "모든 진행 삭제",
    "Reset all progress? This cannot be undone.": "모든 진행을 초기화하시겠습니까? 되돌릴 수 없습니다.",
    "Save complete": "저장 완료", "Save exported": "저장 파일 내보내기 완료", "Save imported": "저장 파일 불러오기 완료", "Invalid JSON": "올바른 JSON이 아닙니다", "Invalid save structure": "올바른 저장 형식이 아닙니다",
    "Reincarnated · +{stars} Stars": "환생 완료 · 별 +{stars}개", "Developer Info": "개발자 / 테스트", "Save Version": "저장 버전", "Highest Stage": "최고 스테이지",
    "Monster Type": "적 종류", "Boss Target": "재도전 스테이지", "Nazar Escalation": "나자르 강화 단계", "Total TAP": "총 탭 피해량", "Total DPS": "총 DPS",
    "FORCE NAZAR": "나자르 강제 출현", "Nazar is already active": "나자르와 전투 중", "Available while farming": "파밍 중 사용 가능",
    "+100,000 GOLD": "+100,000 골드", "DEV ONLY · bypasses Bag capacity": "개발 전용 · 가방 용량 제한 무시",
    "FORCE BALLOON": "풍선 강제 도전", "DEV ONLY · challenge the next Region Boss": "개발 전용 · 다음 지역 보스에 도전", "+1H OFFLINE": "+1시간 오프라인",
    "BALLOON CHALLENGE · Stage {stage}": "풍선 도약 도전 · 스테이지 {stage}", "BALLOON SUCCESS · Stage {stage}": "풍선 도전 성공 · 스테이지 {stage}",
    "BALLOON FAILED · Return to Stage {stage}": "풍선 도전 실패 · 스테이지 {stage} 복귀",
    "OFFLINE PROGRESS": "오프라인 진행", "Temporary automatic-DPS prototype": "자동 DPS 기반 임시 계산", "Time Away": "접속하지 않은 시간", "Stages Advanced": "진행한 스테이지",
    "Gold Earned": "획득 골드", "Uncollected (capacity)": "용량 초과 미획득 골드", "Final Stage": "최종 스테이지", "Time Excluded (safety cap)": "안전 상한으로 제외된 시간",
    "{hours} h": "{hours}시간", "Offline progress applied · summary in LUTIE": "오프라인 진행 반영 · 루티 탭에서 확인",
    "NEW GUARDIAN": "가디언 획득", "MANA STONE ACQUIRED": "마나 스톤 획득", "Lv{level} {rarity}": "레벨 {level} {rarity}", "Power +{percent}%/Lv": "레벨당 효과 +{percent}%",
    "SKILL": "스킬"
  });
  let language = "en";
  function t(key, values = {}) {
    const message = language === "ko" ? ko[key] || key : key;
    return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  }
  function setLanguage(value) { language = value === "ko" ? "ko" : "en"; }
  function translateDocument(root) {
    root.documentElement.lang = language;
    root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  }
  global.I18n = Object.freeze({ t, setLanguage, translateDocument, ko });
})(window);
