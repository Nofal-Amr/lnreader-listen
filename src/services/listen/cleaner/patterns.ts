// Ported from epub_cleaner.py (the user's EPUB watermark cleaner). Keep the
// two in sync when adding sites or patterns.

export type Sensitivity = 'low' | 'normal' | 'high';

export const SENSITIVITY_PRESETS: Record<
  Sensitivity,
  { shortWords: number; ctxHits: number; heuristic: boolean; heurHits: number }
> = {
  low: { shortWords: 6, ctxHits: 3, heuristic: false, heurHits: 4 },
  normal: { shortWords: 12, ctxHits: 2, heuristic: true, heurHits: 3 },
  high: { shortWords: 20, ctxHits: 1, heuristic: true, heurHits: 2 },
};

export const SITE_NAMES = [
  'NovelUpdates',
  'NovelFull',
  'ReadNovelFull',
  'AllNovelFull',
  'NovelOnlineFull',
  'NovelOnlineFree',
  'FreeNovelOnline',
  'FreeNovelUpdates',
  'ReadFreeNovel',
  'FreeReadNovel',
  'FreeWebNovel',
  'FreeWebNovel.com',
  'NovelBin',
  'NovelFire',
  'NovelCool',
  'NovelHall',
  'NovelHi',
  'NovelTop',
  'NovelUsb',
  'NovelGate',
  'NovelNext',
  'NovelBuddy',
  'NovelMania',
  'NovelSpread',
  'NovelRead',
  'NovelPassion',
  'NovelFlow',
  'NovelCat',
  'NovelSemperor',
  'Novel35',
  'BoxNovel',
  'Webnovel',
  'WebNovelPub',
  'LightNovelPub',
  'LightNovelWorld',
  'LightNovelCave',
  'LightNovelHeaven',
  'LightNovelReader',
  'LightNovelsTranslations',
  'ReadLightNovel',
  'LightNovelUpdates',
  'LNMTL',
  'LightNovelBastion',
  'NovelLight',
  'Novel Light',
  'Novelight',
  'NovelPub',
  'Novel Pub',
  'WuxiaWorld',
  'Wuxia World',
  'WuxiaSpot',
  'WuxiaBlog',
  'Wuxia.Blog',
  'Wuxiap',
  'WuxiaClick',
  'WuxiaWorld.co',
  'ReadWN',
  'WuxiaWorld.site',
  'WuxiaWorld.live',
  'Ranobes',
  'Ranobe',
  'RanobeHub',
  'MTLNovel',
  'MTLReader',
  'FanMTL',
  'JPMTL',
  'Foxaholic',
  'VolareNovels',
  'GravityTales',
  'TravisTranslations',
  'KolNovel',
  'BedNovel',
  'PandaNovel',
  'PandasNovel',
  'MVLEmpyr',
  'Tapread',
  'GoodNovel',
  'Dreame',
  'Inkitt',
  'Wattpad',
  'RoyalRoad',
  'Royal Road',
  'ScribbleHub',
  'Scribble Hub',
  'Webnovel.com',
  'Qidian',
  'Fanfiction.net',
  // Seen in the user's T2S rules.
  'NovLove',
  'NovelLove',
];

export const GENERIC_TLD =
  '(?:com|net|org|co|io|me|site|xyz|live|info|club|top|cc|ws|pub|blog|online|vip|cloud|tv|app|fun|cyou|world|space|store|link|ink|mobi|biz|page|cam|lol|icu|today)';
export const BRAND_TLD =
  '(?:com|net|org|co|io|me|site|xyz|live|info|club|top|cc|ws|pub|blog|online|vip|cloud|tv|app|fun|cyou|world|space|store|link|ink|mobi|biz|page|cam|lol|icu|today|so|to|ru|in|us|uk|id|ph|my|vn|asia|one|pro|ly|is|ai|gg)';

const AP = "['’]";
const NOUN_STRICT =
  '(?:chapters?|novels?|stor(?:y|ies)|contents?|translations?)';
const READ_VERB =
  '(?:reading|seeing|see|viewing|view|finding|find|found|read|spot(?:ted)?|notice[ds]?|come\\s+across|encounter(?:ed)?)';
const ELSEWHERE =
  '(?:amazon|kindle|webnovel|[\\w-]+\\.(?:com|net|org|co|io|me|site)\\b|(?:another|other|any|a|some|different)\\s+(?:\\w+\\s+)?(?:sites?|web\\s?sites?|platforms?|apps?|sources?|places?|aggregators?|pages?)|unauthori[sz]ed|pirat\\w+)';
export const PIRACY_WORDS =
  '(?:stolen|pirat(?:ed|ing|ion|e\\s+(?:sites?|websites?|translations?|versions?|cop(?:y|ies)))|piracy|plagiari[sz]\\w*|scrap(?:ed|er|ers|ing)|aggregators?|re-?upload\\w*|repost(?:ed|ing)|unauthori[sz]ed|illegal(?:ly)?|infring\\w+)';

export const SENTENCE_PATTERNS: Record<string, string[]> = {
  anti_piracy_notice: [
    '\\b(?:this|the|these)\\s+(?:\\w+\\s+){0,2}?' +
      NOUN_STRICT +
      '\\s+(?:has|have|had|was|were|is|are|been|got|being)(?:\\s+(?:been|being))?\\s+(?:\\w+\\s+){0,2}?(?:stolen|pirated|plagiari[sz]ed|scraped|ripped|leaked|reposted|re-?uploaded|(?:used|published|copied|taken|posted|reproduced)\\s+without|illegally\\s+\\w+)\\b[^.!?]*',
    '\\bif\\s+you(?:' +
      AP +
      're|\\s+are|\\s+have\\s+been)?\\s+(?:currently\\s+)?' +
      READ_VERB +
      '\\s+this\\s+(?:\\w+\\s+){0,3}?(?:on|at|from|via|in)\\s+(?:\\w+\\s+){0,4}?' +
      ELSEWHERE +
      '[^.!?]*',
    '\\bif\\s+you\\s+' +
      READ_VERB +
      '\\s+this\\s+(?:\\w+\\s+){0,3}?(?:elsewhere|anywhere\\s+else|somewhere\\s+else|on\\s+(?:any\\s+)?(?:other|another|different)\\s+\\w+)\\b[^.!?]*',
    '\\bif\\s+you(?:' +
      AP +
      're|\\s+are)\\s+not\\s+reading\\s+this\\s+(?:\\w+\\s+){0,3}?(?:on|at|from|via)\\b[^.!?]*',
    '\\b(?:please\\s+)?report\\b[^.!?]{0,80}\\b(?:stolen|pirated|piracy|infring\\w+|unauthori[sz]ed|plagiari[sz]ed)\\s+(?:chapters?|novels?|stor(?:y|ies)|contents?|translations?|copies|sites?|web\\s?sites?|platforms?|links?|versions?)\\b[^.!?]*',
    '^\\W*please\\s+report\\s+(?:it|this|them|the\\s+(?:infringement|theft|piracy|violation|thief|thieves))\\W*$',
    '^\\W*(?:this\\s+is\\s+(?:a\\s+)?)?(?:stolen|pirated|unauthori[sz]ed|illegal)\\s+(?:novel|chapter|content|story|translation|copy|site|website|version)\\W*$',
    '\\b(?:t/n|a/n|e/n|tl\\s*notes?|translator' +
      AP +
      '?s?\\s+notes?|author' +
      AP +
      '?s?\\s+notes?|editor' +
      AP +
      '?s?\\s+notes?)\\b\\W{0,3}[^.!?]{0,60}\\b' +
      PIRACY_WORDS +
      '\\b[^.!?]*',
    '\\b(?:unauthori[sz]ed|illegal|unlicensed|pirated|stolen)\\s+(?:use|usage|copy|copies|reproduction|distribution|reposting|publication|version|translation|website|site|platform|aggregator)\\b[^.!?]*',
    '\\b(?:this|the)\\s+(?:\\w+\\s+){0,2}?' +
      NOUN_STRICT +
      '\\s+(?:is\\s+(?:owned|copyrighted|protected|exclusive(?:ly)?)|is\\s+only\\s+(?:available|published|posted))\\b[^.!?]*',
    '\\b(?:this|the)\\s+(?:\\w+\\s+){0,2}?' +
      NOUN_STRICT +
      '\\s+is\\s+(?:the\\s+)?(?:intellectual\\s+property|property|copyright)\\s+of\\b[^.!?]*',
    '\\bplease\\s+(?:support|respect)\\s+(?:the\\s+|our\\s+|this\\s+)?(?:original\\s+)?(?:author|translator|writer|creator|translation\\s+(?:team|group))s?\\b[^.!?]*',
  ],
  support_promo: [
    '\\b(?:support|follow|join|donate\\s+to|subscribe\\s+to)\\s+(?:the\\s+|this\\s+|our\\s+|my\\s+)?(?:original\\s+)?(?:author|translator|writer|creator|translation\\s+(?:team|group)|us|me)s?\\b[^.!?]*\\b(?:on|at|via|through|by|with|visiting|reading|buying|purchasing|donating|subscribing|patreon|ko-?fi)\\b[^.!?]*',
    '\\b(?:support|donate|join|subscribe|follow|pledge|visit|check|find)\\b[^.!?]{0,60}\\b(?:patreon|ko-?fi|buymeacoffee|buy\\s+me\\s+a\\s+coffee|gumroad|liberapay)\\b[^.!?]*',
    '\\b(?:join|follow)\\s+(?:us|our|my)\\b[^.!?]{0,30}\\bdiscord\\b[^.!?]*',
    '\\b(?:read|get|unlock|access)\\s+(?:\\w+\\s+){0,2}?(?:advance|advanced|early)\\s+(?:chapters?|access)\\b[^.!?]*',
    '\\b(?:read|visit|find|get|support|check|go\\s+to|head\\s+(?:over\\s+)?to|continue\\s+reading)\\b[^.!?]{0,50}\\b(?:official|original|authori[sz]ed|legit\\w*|licensed)\\s+(?:site|website|web\\s+site|platform|source|translators?|translation|publisher|page|link|app)\\b[^.!?]*',
  ],
  scraper_tagline: [
    '\\bfind\\s+authori[sz]ed\\s+novels?\\s+in\\b[^.!?]*',
    '\\bfaster\\s+updates,?\\s+better\\s+experience\\b[^.!?]*',
    '\\bplease\\s+click\\s+\\S+\\s+for\\s+visiting\\b[^.!?]*',
    '\\byou\\s+can\\s+use\\s+(?:the\\s+)?(?:left|right|arrow|keyboard)\\b[^.!?]*\\b(?:keys?|buttons?)\\b[^.!?]*\\b(?:browse|navigate|switch|chapters?|pages?)\\b[^.!?]*',
    '\\buse\\s+(?:the\\s+)?(?:left|right|arrow)\\b[^.!?]*\\bkeys?\\b[^.!?]*\\bchapters?\\b[^.!?]*',
    '\\b(?:the\\s+)?(?:source|original)\\s+of\\s+this\\s+(?:content|chapter|novel|story)\\b[^.!?]*',
    '\\bthis\\s+(?:chapter|content|novel|story)\\s+(?:is\\s+|was\\s+)?(?:updated|uploaded|posted|provided|hosted|sourced)\\s+(?:by|on|at|from|first)\\b[^.!?]*',
    '\\bfollow\\s+(?:the\\s+)?(?:new|latest|current|newest)\\s+(?:novels?|chapters?|releases?|updates?)\\b[^.!?]*',
    '\\bsorry\\s+for\\s+the\\s+(?:interruption|inconvenience)\\b[^.!?]*\\b(?:stolen|pirat\\w+|site|website)\\b[^.!?]*',
    '\\b(?:content|chapter|text)\\s+(?:is\\s+)?(?:copied|stolen|taken)\\s+from\\b[^.!?]*',
  ],
};

export const PARAGRAPH_PATTERNS: Record<string, string[]> = {
  rating_prompt: [
    '^\\W*(?:please\\s+)?(?:rate|review|vote)\\b[^.!?]{0,80}\\b(?:novel|book|story|series|chapter|us|stars?|rating|library|power\\s*stones?|golden\\s+tickets?)\\b[^.!?]*\\W*$',
    '^\\W*(?:please\\s+)?(?:leave|write|drop|post)\\s+(?:us\\s+)?(?:a\\s+|an\\s+)?(?:review|rating|comments?)\\b[^.!?]*\\W*$',
    '^\\W*(?:please\\s+)?(?:add|put)\\s+(?:this|us|it|the)\\b[^.!?]{0,40}\\b(?:library|bookmarks?|favou?rites?|reading\\s+list|collection)\\b[^.!?]*\\W*$',
    '^\\W*(?:please\\s+)?(?:bookmark|share|recommend)\\s+(?:this|our)\\s+(?:novel|story|chapter|book|series|site|website|page)\\b[^.!?]*\\W*$',
    '^\\W*(?:thank\\s+you|thanks)\\s+for\\s+reading\\b[^.!?]*\\W*$',
    '^\\W*(?:happy|enjoy(?:\\s+your)?)\\s+reading\\W*$',
    '^\\W*(?:don' +
      AP +
      '?t\\s+forget\\s+to|remember\\s+to|be\\s+sure\\s+to)\\s+(?:rate|vote|review|bookmark|follow|subscribe|comment|leave)\\b[^.!?]*\\W*$',
  ],
  sponsor_or_report: [
    '^\\W*(?:sponsored\\s+content|advertisements?|report\\s+(?:chapter|error|this\\s+chapter)|translation\\s+error)\\W*$',
    // App addition: the ad-blocker nag that sites inject into chapter text.
    '^\\W*ad\\s*-?\\s*blocker\\s+detected\\b.*$',
  ],
};

const NAVTOK =
  '(?:(?:prev(?:ious)?|next)\\s+(?:chapter|ch\\.?)|table\\s+of\\s+contents|contents|index|home|toc|chapter\\s+list|back\\s+to\\s+(?:the\\s+)?(?:novel|index|list|top|menu))';
export const NAVIGATION_PATTERNS = [
  '^[\\W_]*(?:' +
    NAVTOK +
    '[\\W_]+)*(?:(?:prev(?:ious)?|next)\\s+(?:chapter|ch\\.?)|table\\s+of\\s+contents|chapter\\s+list)(?:[\\W_]+' +
    NAVTOK +
    ')*[\\W_]*$',
];

export const PROTECTED_PATTERNS = [
  '\\bamazon\\s+(?:river|rain\\s?forest|basin|jungle|forest|warriors?|women|tribe|region|delta|parrot|queen)s?\\b',
];

export const META_RE_SRC =
  '\\b(?:this|the|these|our|my)\\s+(?:\\w+\\s+){0,2}?(?:chapters?|novels?|stor(?:y|ies)|translations?|contents?|web\\s?sites?|sites?|platforms?|authors?|translators?|books?|works?|texts?)\\b';
export const CONTEXT_RE_SRC =
  '\\b(?:read(?:ing)?|visit|updat\\w*|latest|chapters?|support|author|translat\\w+|original|official|stolen|pirat\\w+|find|enjoy|bookmark\\w*|rate|vote|review|follow|join|free|fastest|faster|best|exclusive\\w*|first|available|published|posted|content|source|novels?|stor(?:y|ies)|website|site|click|link)\\b';

export const SUPPORT_HOSTS = [
  'patreon.com',
  'ko-fi.com',
  'buymeacoffee.com',
  'discord.gg',
  'discord.com',
  'paypal.me',
  'gumroad.com',
  'liberapay.com',
];
