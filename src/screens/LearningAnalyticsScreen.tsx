import { SettingsDrawer } from '@/components/SettingsDrawer';

/**
 * 答題時間與學習分析 — 規劃展示頁（display-only）。
 *
 * 說明未來如何以「答題正誤 × 作答時間」輔助學習判讀。此頁不計時、
 * 不讀寫任何 analytics 資料、不改變練習排序或複習排程；內容來自
 * 技術方與（模擬）國中英文教師角色達成的共識。
 */

const CONSENSUS = [
  '時間不是難度：作答時間長可能來自閱讀速度、題幹長度、發音播放、提示、輸入方式或疲勞，不一定是題目難。',
  '時間不是能力：時間短可能是熟練，也可能是猜測、誤觸或題目線索過強；時間不能單獨判定精熟。',
  '正誤優先：作答正誤仍是排程的主要訊號；時間只能在相同條件下作為低權重輔助訊號。',
  '只跟自己比：時間與「自己的近期基準」比較，不做同儕排名，不使用固定秒數常模。',
  '先觀察後適性：第一版只做觀察與低風險建議，時間不改變 stage、複習間隔或情境填空難度。',
];

const TEACHER_REVIEW = [
  '可作答時間不等於專注時間：系統只知道「畫面上可互動到送出」經過多少時間，無法判斷學生是否真的專心，因此不用「專注力、反應能力」等說法。',
  '使用支援不代表能力較低：播放語音、使用提示或放大字體的作答應標記並分開分析，不因此降低學習階段。',
  '單次快慢不下結論：任何建議都要等「同一條件、跨多次練習重複出現」才顯示，單次異常只是資料。',
  '不顯示速度評分：不顯示倒數、單題秒數、速度分數或「太慢／猜答案／不專心」等標籤，避免學生為求快而亂猜。',
  '特殊需求不被懲罰：閱讀速度、學習焦慮、特殊教育需求與共用裝置都可能影響時間；分析不能對這些學生不利。',
];

const QUADRANT: {
  key: string;
  title: string;
  read: string;
  action: string;
  avoid: string;
  tone: 'positive' | 'caution' | 'note';
}[] = [
  {
    key: 'correct-fast',
    title: '答對 · 相對較快',
    read: '能快速且正確地提取答案，本次回應較流暢。',
    action: '維持既有複習節奏，不需要額外加強。',
    avoid: '不代表「已永久學會」，仍按排程複習。',
    tone: 'positive',
  },
  {
    key: 'correct-slow',
    title: '答對 · 相對較慢',
    read: '答案正確，但提取需要較多時間。',
    action: '安排短而頻繁的再練習，可搭配例句或相似詞。',
    avoid: '慢不等於能力差；閱讀與輸入方式都會影響時間。',
    tone: 'caution',
  },
  {
    key: 'wrong-slow',
    title: '答錯 · 相對較慢',
    read: '花費較多時間仍未答對，可能需要重新建立字義與語境連結。',
    action: '回到中文釋義與例句，安排較近的複習。',
    avoid: '不能只因時間長就斷定「不懂」——也可能受閱讀或注意力因素影響。',
    tone: 'caution',
  },
  {
    key: 'wrong-fast',
    title: '答錯 · 相對較快',
    read: '可能尚未讀完整題目，或對相似選項的辨識還不穩定。',
    action: '先完整閱讀題目與線索，再重試一次。',
    avoid: '不推論「猜測」或「不專心」，也不額外懲罰。',
    tone: 'note',
  },
];

const MUST_HAVES: { group: string; items: string[] }[] = [
  {
    group: '計時品質',
    items: [
      '從題目可互動開始、送出答案即停止；回饋與自動換題時間不計入。',
      '頁籤隱藏、暫停、語音播放期間停止累加。',
      'session 恢復（refresh／重開）無法可靠還原時，該筆標為無效。',
      '提供明確的「暫停練習」按鈕。',
    ],
  },
  {
    group: '條件分組與個人基準',
    items: [
      '依學習技能分開分析：單字卡自評、英選中、中選英、情境填空（分難度）、拼字（分長度）。',
      '有提示／語音支援的作答分開標記，不混入一般基準。',
      '同一條件至少 10 筆有效樣本、跨 2 次以上練習，才建立個人近期基準。',
      '用中位數等抗離群值統計，不用固定秒數，不與其他學生比較。',
      '單一單字的模式需跨 2 次 session 重複出現，才顯示個人化建議。',
    ],
  },
  {
    group: '學生介面',
    items: [
      '只顯示學習建議，不顯示快慢、秒數或排名。',
      '資料不足時顯示「還在累積你的練習資料」，不硬分類。',
      '明確說明「這不是速度測驗」，並允許暫停。',
    ],
  },
  {
    group: '資料治理',
    items: [
      '資料只保存在此瀏覽器，不會送到伺服器，也不用於排名或評分。',
      '分析資料獨立儲存（bounded、版本化），與核心學習進度分離。',
      '提供獨立的「清除分析資料」與「停用分析」控制。',
      '提醒共用裝置可能混入不同使用者的資料。',
    ],
  },
];

const PHASES: { phase: string; name: string; now: boolean; items: string[] }[] =
  [
    {
      phase: 'Phase 0',
      name: '規劃展示（本頁）',
      now: true,
      items: [
        '公開共識、四象限與隱私原則。',
        '不開始計時、不新增任何資料、不改變排程。',
      ],
    },
    {
      phase: 'Phase 1',
      name: '本機計時基礎',
      now: false,
      items: [
        '記錄每題可作答時間與資料品質旗標。',
        '處理切換分頁、重複送出與 session 恢復。',
        'storage schema 版本化，舊資料安全載入。',
      ],
    },
    {
      phase: 'Phase 2',
      name: '個人基準與低風險摘要',
      now: false,
      items: [
        '依題型建立個人近期中位數基準。',
        '顯示「答對但可再練熟」「建議完整閱讀再試」等保守摘要。',
        '不改變既有排程。',
      ],
    },
    {
      phase: 'Phase 3',
      name: '驗證後才考慮適性',
      now: false,
      items: [
        '實際資料證明訊號可靠後，才在相同優先級內輕微排序。',
        '錯題 → 到期複習 → 未練過 → 其餘的既有優先順序不變。',
        '時間不改 stage、不調 cloze 難度、不取代正誤規則。',
      ],
    },
  ];

const NOT_IN_SCOPE = [
  '固定秒數判定精熟或困難',
  '跨題型總平均時間',
  '依速度升降 stage 或難度',
  '同年級速度常模',
  '班級或同儕排名',
  '注意力、焦慮或診斷推論',
  '鍵盤逐鍵追蹤或裝置識別',
  '跨使用者題目難度統計（需後端與兒少資料治理）',
];

const TECH_NOTES = [
  '未來計時的統一停止點是 PracticeScreen 的 applyResult()——滑鼠、鍵盤、拼字與自評都會經過這裡。',
  '每筆作答目前只記 entryId／type／correct；新增時間欄位將是 optional，確保舊 checkpoint 與 session 能正常載入。',
  '分析資料建議存於獨立的 analytics store（bounded 樣本＋訊號次數），不污染核心 Leitner 進度。',
  '歷史紀錄沿用 bounded 模式（現有 history 已有 200 筆上限），不做無上限逐題事件。',
  '「清除所有進度」目前不清除 history；加入更敏感的時間資料前，會先釐清並修正清除語意。',
];

const SOURCES: { name: string; url: string }[] = [
  {
    name: 'Leveraging response times in learning environments（UMUAI 2023）',
    url: 'https://link.springer.com/article/10.1007/s11257-023-09386-7',
  },
  {
    name: 'Conditional Dependence between Response Time and Accuracy',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5312167/',
  },
  {
    name: 'Test engagement and rapid guessing in K–12 assessment（Frontiers in Education 2023）',
    url: 'https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2023.1127644/full',
  },
  {
    name: 'UNICEF: Data Governance for EdTech',
    url: 'https://www.unicef.org/innocenti/reports/data-governance-edtech',
  },
];

export function LearningAnalyticsScreen({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  return (
    <>
      <div className="app-header">
        <div>
          <h1>答題時間與學習分析</h1>
          <div className="sub">規劃展示 · 尚未啟用</div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      <div className="note" role="note">
        本頁是設計規劃展示。目前不會開始計時、不會分析個人表現，也不會新增或上傳任何資料。
      </div>

      <div className="card">
        <h2 className="section-title">我們已確認的方向</h2>
        <ul className="analytics-list">
          {CONSENSUS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="section-title">教學檢閱後的修正</h2>
        <p className="analytics-lead">
          由具台灣國中英文教學經驗的教師角色檢閱後修正的共識（模擬角色，供
          校對教學適切性）。
        </p>
        <ul className="analytics-list">
          {TEACHER_REVIEW.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="section-title">安全解讀：四種作答模式</h2>
        <p className="analytics-lead">
          「快慢」一律是相對自己的近期基準，不是固定秒數。有中斷、提示、
          語音支援或樣本不足時，不套用此分類。這些是保守描述，
          不是能力或動機診斷。
        </p>
        <div className="quadrant-grid">
          {QUADRANT.map((q) => (
            <div key={q.key} className={`quadrant-cell quadrant-${q.tone}`}>
              <h3 className="quadrant-title">{q.title}</h3>
              <p className="quadrant-read">{q.read}</p>
              <p className="quadrant-action">{q.action}</p>
              <p className="quadrant-avoid">{q.avoid}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">第一版一定要有</h2>
        {MUST_HAVES.map((g) => (
          <div key={g.group} className="analytics-group">
            <h3 className="analytics-group-title">{g.group}</h3>
            <ul className="analytics-list">
              {g.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="section-title">分階段實作</h2>
        {PHASES.map((p) => (
          <div key={p.phase} className="phase-card">
            <div className="phase-head">
              <span className="phase-name">
                {p.phase} · {p.name}
              </span>
              {p.now && <span className="badge-static">現在</span>}
            </div>
            <ul className="analytics-list">
              {p.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="analytics-group">
          <h3 className="analytics-group-title">目前範圍之外</h3>
          <div className="analytics-tags">
            {NOT_IN_SCOPE.map((t) => (
              <span key={t} className="badge-static badge-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">資料隱私與限制</h2>
        <ul className="analytics-list">
          <li>資料只保存在這個瀏覽器，不會傳送到伺服器，也不用於排名或評分。</li>
          <li>localStorage 沒有上傳，但也不是加密儲存；共用電腦可能混入不同使用者的資料。</li>
          <li>未來若啟用，會提供獨立的查看、清除與停用控制，並說明保留範圍。</li>
          <li>
            現況提醒：「進度與設定」中的清除進度目前會刪除熟悉度與錯題；歷史練習摘要
            是獨立儲存項目，未來會一併釐清清除語意。
          </li>
        </ul>
      </div>

      <details className="advanced-drawer">
        <summary>技術細節與研究來源</summary>
        <div className="drawer-body">
          <div className="drawer-card card">
            <h3 className="analytics-group-title">未來的技術切入點</h3>
            <ul className="analytics-list">
              {TECH_NOTES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="drawer-card card">
            <h3 className="analytics-group-title">參考研究</h3>
            <ul className="analytics-list">
              {SOURCES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className="btn-row">
        <button className="btn ghost" onClick={() => navigate('/')}>
          返回首頁
        </button>
      </div>
    </>
  );
}