const rows = {
  bannerFit: ["Целиком", "Full image", "全体を表示"],
  bannerCrop: ["Обрезать", "Crop", "切り抜く"],
  style_forest: ["Хвойный лес", "Forest", "深い森"],
  style_wine: ["Бордо", "Bordeaux", "ボルドー"],
  style_slate: ["Серебряный туман", "Silver mist", "銀の霧"],
  planMode: ["Что посмотреть", "What to watch", "視聴プラン"],
  plan_all: ["Для меня", "For me", "おすすめ"],
  plan_continue: ["Продолжить", "Continue", "続きを見る"],
  plan_new: ["Начать новое", "Start something new", "新しく始める"],
  planSpare: ["Останется", "Time left", "残り時間"],
  siteStyle: ["Стиль сайта", "Site style", "サイトのスタイル"],
  yourAtmosphere: ["Твоя атмосфера", "Your atmosphere", "あなたの雰囲気"],
  style_graphite: ["Графит", "Graphite", "グラファイト"],
  style_iris: ["Ирис", "Iris", "アイリス"],
  style_lagoon: ["Лагуна", "Lagoon", "ラグーン"],
  style_ember: ["Тлеющий закат", "Ember", "残照"],
  style_midnight: ["Полночь", "Midnight", "真夜中"],
  eveningPlan: ["План на вечер", "Tonight's plan", "今夜のプラン"],
  aLittleTime: ["Ещё немного истории", "A little more story", "物語をもう少し"],
  eveningHint: ["Сколько у тебя времени? Выбери один из вариантов — скорость просмотра уже учтена.", "How much time do you have? Pick one option — your playback speed is included.", "再生速度を考慮した候補から、使える時間に合う作品を一つ選ぼう。"],
  availableTime: ["Свободное время", "Available time", "使える時間"],
  minutesShort: ["мин", "min", "分"],
  eveningEmpty: ["Пока нет подходящего варианта. Увеличь время или добавь сериал в «Смотрю» или «Запланировано».", "No match yet. Try more time or add a series to Watching or Planned.", "今は候補がありません。時間を増やすか、作品を視聴中・視聴予定に追加してください。"],
  eveningEstimate: ["≈ Примерное время: длительность ещё не просмотренных серий может отличаться.", "≈ Estimated time: unwatched episodes may have different lengths.", "≈ 目安の時間です。未視聴エピソードの長さは異なる場合があります。"],
  profileBanner: ["Изменить баннер", "Change banner", "バナーを変更"],
  cropBanner: ["Настрой баннер", "Adjust banner", "バナーを調整"],
  removeBanner: ["Убрать баннер", "Remove banner", "バナーを削除"],
  personalDetails: ["О тебе", "About you", "プロフィール編集"],
  yourSpace: ["Твоё аниме-пространство", "Your anime space", "あなたのアニメ空間"],

  emailSent: ["Проверь почту", "Check your email", "メールをご確認ください"],
  switchAccount: ["Сменить аккаунт", "Switch account", "アカウントを切り替える"],
  addAccount: ["Добавить аккаунт", "Add account", "アカウントを追加"],
  currentAccount: ["Сейчас", "Current", "使用中"],
  accountExpired: ["Войди в этот аккаунт ещё раз", "Sign in to this account again", "このアカウントに再ログインしてください"],
  spotlight: ["В центре внимания", "In the spotlight", "注目の作品"],
  loginIdentifier: ["Почта или никнейм", "Email or nickname", "メールアドレスまたはニックネーム"],
  loginUnavailable: ["Вход по никнейму пока недоступен. Войди по почте.", "Nickname sign-in is unavailable. Use your email.", "ニックネームでログインできません。メールアドレスをご利用ください。"],
  home: ["Главная", "Home", "ホーム"],
  catalog: ["Каталог", "Catalogue", "作品一覧"],
  library: ["Мои списки", "My lists", "マイリスト"],
  profile: ["Профиль", "Profile", "プロフィール"],
  login: ["Войти", "Sign in", "ログイン"],
  register: ["Регистрация", "Create account", "新規登録"],
  logout: ["Выйти", "Sign out", "ログアウト"],
  search: ["Найти аниме…", "Find anime…", "アニメを検索…"],
  theme: ["Сменить тему", "Change theme", "テーマ切替"],
  light: ["Светлая", "Light", "ライト"],
  dark: ["Тёмная", "Dark", "ダーク"],
  language: ["Язык", "Language", "言語"],
  tagline: [
    "Твоё место в мире аниме",
    "Your space for anime",
    "あなたのアニメ空間",
  ],
  heroTitle: [
    "Хороший вечер. Ещё одна серия.",
    "A quiet evening. One more episode.",
    "くつろぐ夜に、もう一話。",
  ],
  heroCopy: [
    "Выбирай истории по настроению. Собирай любимое. Продолжай с того самого момента.",
    "Find a story for your mood. Keep your favourites. Pick up where you left off.",
    "気分に合う物語を見つけて、お気に入りに。続きは、いつでも。",
  ],
  random: ["Выбери за меня", "Surprise me", "おまかせ"],
  explore: ["Выбрать аниме", "Explore anime", "アニメを探す"],
  continue: ["Продолжить просмотр", "Continue watching", "視聴を続ける"],
  continueEmpty: [
    "Твои истории будут ждать здесь",
    "Your stories will be waiting here",
    "続きはここから",
  ],
  continueHint: [
    "Начни просмотр — и мы сохраним серию и время.",
    "Start watching and we’ll remember the episode and time.",
    "見始めると、話数と再生位置が保存されます。",
  ],
  tryPlayer: ["Попробовать плеер", "Try the player", "プレーヤーを試す"],
  curated: [
    "Небольшая подборка для начала",
    "A little collection to get started",
    "はじめのおすすめ作品",
  ],
  all: ["Все", "All", "すべて"],
  allStories: ["Все истории", "All stories", "すべての作品"],
  order: ["Порядок", "Sort", "並び替え"],
  picked: ["Выбор Yoru", "Yoru picks", "Yoru セレクト"],
  newest: ["Сначала новые", "Newest first", "新しい順"],
  alphabetical: ["По названию", "Title A–Z", "タイトル順"],
  found: ["Найдено", "Results", "件数"],
  empty: ["Пока ничего нет", "Nothing here yet", "まだ何もありません"],
  emptyHint: [
    "Попробуй другой поиск или добавь аниме в этот список.",
    "Try another search or add an anime to this list.",
    "検索条件を変えるか、作品をリストに追加してください。",
  ],
  reset: ["Сбросить фильтры", "Reset filters", "絞り込みを解除"],
  favorites: ["Любимые", "Favourites", "お気に入り"],
  watching: ["Смотрю", "Watching", "視聴中"],
  completed: ["Просмотрено", "Completed", "視聴済み"],
  planned: ["Запланировано", "Plan to watch", "視聴予定"],
  onhold: ["Отложено", "On hold", "保留中"],
  dropped: ["Брошено", "Dropped", "視聴中止"],
  ongoing: ["Онгоинг", "Ongoing", "放送中"],
  status: ["Статус просмотра", "Watch status", "視聴状況"],
  none: ["Не в списке", "Not in a list", "未登録"],
  myCollections: ["Мои подборки", "My collections", "マイコレクション"],
  createCollection: [
    "Создать страницу",
    "Create a list page",
    "リストページを作成",
  ],
  collectionName: ["Название страницы", "Page name", "ページ名"],
  create: ["Создать", "Create", "作成"],
  rename: ["Переименовать", "Rename", "名前を変更"],
  remove: ["Удалить", "Remove", "削除"],
  deleteCollectionHint: [
    "Удалится только подборка. Статусы и история просмотра останутся.",
    "Only this collection will be removed. Your watch statuses and history will stay.",
    "このコレクションのみ削除されます。視聴状況と履歴は残ります。",
  ],
  cancel: ["Отмена", "Cancel", "キャンセル"],
  save: ["Сохранить", "Save", "保存"],
  saved: ["Сохранено", "Saved", "保存しました"],
  close: ["Закрыть", "Close", "閉じる"],
  details: ["Подробнее", "Details", "詳細"],
  watch: ["Смотреть", "Watch", "視聴する"],
  addFavorite: ["В любимые", "Add to favourites", "お気に入りに追加"],
  removeFavorite: [
    "Убрать из любимых",
    "Remove favourite",
    "お気に入りから削除",
  ],
  addCollection: [
    "Добавить в подборку",
    "Add to collection",
    "コレクションに追加",
  ],
  noCollections: [
    "Создай первую подборку в «Моих списках».",
    "Create your first collection in My lists.",
    "マイリストからコレクションを作成できます。",
  ],
  season: ["Сезон 1", "Season 1", "シーズン1"],
  episodes: ["серий", "episodes", "話"],
  episode: ["Серия", "Episode", "第"],
  movie: ["Фильм", "Movie", "映画"],
  video: ["Видео", "Video", "動画"],
  demo: ["Sintel — деморолик", "Sintel — demo trailer", "Sintel — デモ予告編"],
  noSource: [
    "Видео пока не подключено",
    "No video source yet",
    "動画はまだ登録されていません",
  ],
  sourceHint: [
    "Открой свой видеофайл. Он останется на твоём устройстве.",
    "Open a video file. It stays on your device.",
    "端末の動画ファイルを開けます。アップロードはされません。",
  ],
  chooseFile: ["Открыть видеофайлы", "Open video files", "動画ファイルを開く"],
  fileHint: [
    "Можно выбрать несколько файлов — они назначатся сериям по порядку. После перезагрузки выбери их снова.",
    "Select several files to assign them to episodes in order. Reopen them after reloading the page.",
    "複数のファイルを選ぶと、順に各話へ割り当てます。ページを再読み込みした後は、再選択が必要です。",
  ],
  speed: ["Скорость", "Speed", "再生速度"],
  cinema: ["Режим кино", "Cinema mode", "シネマモード"],
  normal: ["Обычный вид", "Normal view", "通常表示"],
  next: ["Следующая серия", "Next episode", "次の話へ"],
  skipIntro: ["Пропустить заставку", "Skip opening", "オープニングをスキップ"],
  autoSkip: [
    "Автопропуск заставки",
    "Skip openings automatically",
    "オープニングを自動スキップ",
  ],
  autoNext: [
    "Переход к следующей серии",
    "Go to the next episode",
    "次の話へ自動で移動",
  ],
  autoPlay: [
    "Автозапуск следующей серии",
    "Play the next episode automatically",
    "次の話を自動再生",
  ],
  playerSettings: ["Настройки просмотра", "Playback settings", "再生設定"],
  segmentHint: [
    "Автопропуск работает по границам заставки для этой серии. Укажи время в секундах.",
    "Opening skips use this episode’s timestamps. Enter times in seconds.",
    "この話の開始・終了時刻に合わせてスキップします。秒単位で入力してください。",
  ],
  introStart: ["Начало, сек.", "Start, seconds", "開始（秒）"],
  introEnd: ["Конец, сек.", "End, seconds", "終了（秒）"],
  saveSegment: ["Сохранить границы", "Save timestamps", "時刻を保存"],
  noSegment: [
    "Для этой серии границы заставки ещё не заданы.",
    "No opening timestamps for this episode yet.",
    "この話のオープニング時刻は未設定です。",
  ],
  segmentSaved: [
    "Границы заставки сохранены",
    "Opening timestamps saved",
    "オープニング時刻を保存しました",
  ],
  introSkipped: [
    "Заставка пропущена",
    "Opening skipped",
    "オープニングをスキップしました",
  ],
  keyboard: [
    "Пробел — пауза · ← → — 10 сек. · F — полный экран · M — звук",
    "Space — pause · ← → — 10 sec · F — fullscreen · M — mute",
    "Space：一時停止 · ← →：10秒移動 · F：全画面 · M：ミュート",
  ],
  noAutoplay: [
    "Нажми ▶, чтобы запустить видео: браузер ограничил автозапуск.",
    "Press ▶ to play: your browser blocked autoplay.",
    "自動再生が制限されています。▶ を押してください。",
  ],
  videoError: [
    "Не удалось открыть видео. Попробуй MP4/H.264 или WebM.",
    "Could not play this video. Try MP4/H.264 or WebM.",
    "動画を再生できません。MP4/H.264 または WebM をお試しください。",
  ],
  localVideo: ["Локальный файл", "Local file", "ローカルファイル"],
  sourceLoading: ["Подключаем видео…", "Loading video…", "動画を読み込み中…"],
  filesLoaded: ["Открыто файлов", "Files opened", "選択したファイル数"],
  authRequired: [
    "Войди, чтобы сохранять в списки",
    "Sign in to save to your lists",
    "リストに保存するにはログインしてください",
  ],
  authHint: [
    "Твои списки, настройки и прогресс будут доступны в твоём аккаунте.",
    "Your lists, preferences and progress belong to your account.",
    "リスト、設定、視聴履歴をアカウントに保存できます。",
  ],
  email: ["Электронная почта", "Email", "メールアドレス"],
  password: ["Пароль", "Password", "パスワード"],
  name: ["Имя", "Name", "名前"],
  passwordHint: ["Не менее 8 символов", "At least 8 characters", "8文字以上"],
  forgot: ["Забыли пароль?", "Forgot password?", "パスワードをお忘れですか？"],
  resetPassword: [
    "Восстановить пароль",
    "Reset password",
    "パスワードをリセット",
  ],
  newPassword: ["Новый пароль", "New password", "新しいパスワード"],
  passwordUpdated: [
    "Пароль обновлён",
    "Password updated",
    "パスワードを更新しました",
  ],
  checkEmail: [
    "Проверь почту и перейди по ссылке подтверждения.",
    "Check your email and follow the confirmation link.",
    "確認メールのリンクを開いてください。",
  ],
  resetEmail: [
    "Если такой аккаунт есть, письмо для восстановления будет отправлено на почту.",
    "If this account exists, a password reset email will be sent.",
    "登録済みのアドレスには、再設定メールが送信されます。",
  ],
  authNotConfigured: [
    "Регистрация пока не подключена",
    "Accounts are not connected yet",
    "アカウント機能は準備中です",
  ],
  authSetupHint: [
    "Владелец сайта ещё не подключил базу данных. Каталог можно посмотреть уже сейчас.",
    "The site owner hasn’t connected the database yet. You can browse the catalogue now.",
    "管理者によるデータベースの設定が必要です。作品一覧はご覧いただけます。",
  ],
  authError: [
    "Не удалось войти. Проверь почту, пароль и подтверждение адреса.",
    "Sign-in failed. Check your email, password and email confirmation.",
    "ログインできません。メールアドレス、パスワード、認証状況をご確認ください。",
  ],
  requestError: [
    "Не удалось выполнить запрос. Проверь соединение и попробуй ещё раз.",
    "The request failed. Check your connection and try again.",
    "処理に失敗しました。接続を確認して再試行してください。",
  ],
  rateLimit: [
    "Слишком много запросов. Попробуй чуть позже.",
    "Too many requests. Please try again later.",
    "リクエストが多すぎます。少し待ってからお試しください。",
  ],
  loading: ["Загрузка…", "Loading…", "読み込み中…"],
  syncing: ["Сохраняем…", "Saving…", "保存中…"],
  syncError: [
    "Не удалось сохранить изменения. Повторить",
    "Could not save changes. Retry",
    "変更を保存できませんでした。再試行",
  ],
  synced: [
    "Сохранено в аккаунте",
    "Saved to your account",
    "アカウントに保存済み",
  ],
  profileHint: [
    "Твоё пространство, твои настройки",
    "Your space, your preferences",
    "あなたの空間、あなたの設定",
  ],
  profileSaved: [
    "Профиль обновлён",
    "Profile updated",
    "プロフィールを更新しました",
  ],
  libraryGuest: [
    "Создай место для любимых историй",
    "A home for your favourite stories",
    "お気に入りの物語を集めよう",
  ],
  guestCopy: [
    "Войди или зарегистрируйся, чтобы собирать списки, создавать подборки и продолжать просмотр на другом устройстве.",
    "Sign in or create an account to save lists, make collections and continue on another device.",
    "ログインまたは登録すると、リストの保存やコレクションの作成、別端末での続きの視聴ができます。",
  ],
  privateLists: [
    "Личные списки. Другие пользователи их не видят.",
    "Private lists. Other users cannot see them.",
    "個人用リストです。他のユーザーには表示されません。",
  ],
  about: ["О проекте", "About", "このサイトについて"],
  aboutCopy: [
    "Личный аниме-каталог с подборками и удобным плеером. Стартовая подборка пока небольшая и не обновляется автоматически.",
    "A personal anime catalogue with collections and a comfortable player. The starter catalogue is small and does not update automatically.",
    "コレクションとプレーヤーを備えた個人向けアニメカタログです。初期の作品一覧は少数で、自動更新はされません。",
  ],
  contentNotice: [
    "Серии аниме пока не подключены. Можно открыть свои файлы или деморолик Sintel.",
    "Anime episodes are not connected yet. Open your own files or the Sintel demo trailer.",
    "本編動画はまだ登録されていません。端末の動画や Sintel のデモ予告編を再生できます。",
  ],
  sources: [
    "Обложки: MyAnimeList. Демо: Sintel © Blender Foundation, CC BY 3.0, W3C.",
    "Posters: MyAnimeList. Demo: Sintel © Blender Foundation, CC BY 3.0, W3C.",
    "ポスター：MyAnimeList。デモ：Sintel © Blender Foundation、CC BY 3.0、W3C。",
  ],
  footer: [
    "Ещё одна история, которая останется с тобой.",
    "One more story to stay with you.",
    "心に残る物語を、もうひとつ。",
  ],
  invalidName: [
    "Введи название от 1 до 60 символов.",
    "Use a name between 1 and 60 characters.",
    "名前は1〜60文字で入力してください。",
  ],
  duplicateName: [
    "Подборка с таким названием уже есть.",
    "A collection with this name already exists.",
    "同じ名前のコレクションが既にあります。",
  ],
  collectionLimit: [
    "Можно создать до 50 подборок.",
    "You can create up to 50 collections.",
    "コレクションは50件まで作成できます。",
  ],
  invalidSegments: [
    "Конец должен быть позже начала и не выходить за длительность видео.",
    "The end must follow the start and stay within the video duration.",
    "終了時刻は開始時刻より後、動画の長さより前に設定してください。",
  ],
  readError: [
    "Не удалось загрузить профиль. Проверь подключение базы данных.",
    "Could not load your profile. Check the database connection.",
    "プロフィールを読み込めません。データベース接続を確認してください。",
  ],
  retry: ["Повторить", "Retry", "再試行"],
  removeFromList: ["Убрать из списков", "Remove from lists", "リストから削除"],
  progress: ["Прогресс", "Progress", "進捗"],
  viewed: ["Просмотрено", "Watched", "視聴済み"],
  opening: ["Заставка", "Opening", "オープニング"],
  ongoingHint: [
    "Личная категория для аниме, за выходом которых ты следишь.",
    "A personal category for shows you follow as they air.",
    "放送を追いかけている作品の個人用カテゴリです。",
  ],
  settingsHint: [
    "Все три функции включаются независимо. Без перехода автозапуск не применяется.",
    "Each switch is independent. Autoplay applies only when the next episode is selected.",
    "3つの機能を個別に設定できます。次の話へ移動しない場合、自動再生は適用されません。",
  ],
  duration: ["Длительность", "Duration", "再生時間"],
  nameHint: ["Как к тебе обращаться", "What should we call you?", "表示名"],
  collectionsEmpty: [
    "Здесь будут твои собственные страницы-подборки.",
    "Your custom collection pages will appear here.",
    "作成したコレクションページがここに表示されます。",
  ],
  loginAgain: [
    "Сессия завершена. Войди снова.",
    "Your session has expired. Please sign in again.",
    "セッションが終了しました。もう一度ログインしてください。",
  ],
};
export const dictionaries = Object.fromEntries(
  ["ru", "en", "ja"].map((l, i) => [
    l,
    Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v[i]])),
  ]),
);
export const genreLabels = {
  Приключения: ["Приключения", "Adventure", "冒険"],
  Фэнтези: ["Фэнтези", "Fantasy", "ファンタジー"],
  Экшен: ["Экшен", "Action", "アクション"],
  Романтика: ["Романтика", "Romance", "恋愛"],
  Комедия: ["Комедия", "Comedy", "コメディ"],
  Повседневность: ["Повседневность", "Slice of life", "日常"],
  Спорт: ["Спорт", "Sports", "スポーツ"],
};
export const langIndex = (l) => ({ ru: 0, en: 1, ja: 2 })[l] ?? 0;
const extra = {
  phone: ["Телефон", "Phone", "電話番号"],
  phoneHint: [
    "Номер с кодом страны, например +7… или +81…",
    "Include the country code, e.g. +7… or +81…",
    "国番号を含めて入力してください（例：+81…）",
  ],
  sendCode: ["Получить код", "Send code", "コードを送信"],
  verifyCode: ["Подтвердить код", "Verify code", "コードを確認"],
  code: ["Код из SMS", "SMS code", "SMSコード"],
  phoneDisabled: [
    "Вход по телефону ещё не подключён владельцем сайта.",
    "Phone sign-in has not been enabled by the site owner.",
    "電話番号ログインはまだ設定されていません。",
  ],
  appleDisabled: [
    "Вход через Apple ещё не подключён владельцем сайта.",
    "Apple sign-in has not been enabled by the site owner.",
    "Apple ログインはまだ設定されていません。",
  ],
  apple: ["Продолжить с Apple", "Continue with Apple", "Apple で続ける"],
  bio: ["О себе", "Bio", "自己紹介"],
  nickname: ["Никнейм", "Nickname", "ニックネーム"],
  avatar: ["Сменить аватар", "Change avatar", "アバターを変更"],
  avatarHint: [
    "JPG, PNG или WebP, до 2 МБ",
    "JPG, PNG or WebP, up to 2 MB",
    "JPG・PNG・WebP、2 MB まで",
  ],
  avatarError: [
    "Выбери JPG, PNG или WebP размером до 2 МБ.",
    "Choose a JPG, PNG or WebP file up to 2 MB.",
    "2 MB 以下の JPG・PNG・WebP を選んでください。",
  ],
  manageStatuses: ["Настроить статусы", "Manage statuses", "ステータスを管理"],
  createStatus: ["Добавить статус", "Add status", "ステータスを追加"],
  statusName: ["Название статуса", "Status name", "ステータス名"],
  deleteStatusHint: [
    "Аниме останутся в библиотеке, но этот статус будет снят.",
    "Anime will remain in your library without this status.",
    "作品はライブラリに残り、このステータスのみ解除されます。",
  ],
  export: [
    "Скачать резервную копию списков",
    "Export a backup of your lists",
    "リストのバックアップを保存",
  ],
  notRated: ["Без оценки", "Not rated", "未評価"],
  rating: ["Моя оценка", "My rating", "自分の評価"],
  notes: ["Личная заметка", "Private note", "自分用メモ"],
  notesHint: [
    "Например, с какой серии смотреть с друзьями",
    "For example, where to start watching with friends",
    "友達と何話から見るか、など",
  ],
  episodeMissing: [
    "Для следующей серии нужно открыть файл.",
    "Open a file for the next episode.",
    "次の話のファイルを選んでください。",
  ],
  unsaved: [
    "Изменения пока не сохранены",
    "Changes are not saved yet",
    "変更はまだ保存されていません",
  ],
  phoneInvalid: [
    "Введи международный номер: + и от 7 до 15 цифр.",
    "Use an international number: + and 7 to 15 digits.",
    "国際電話番号（+ と7〜15桁の数字）を入力してください。",
  ],
};
for (const [key, values] of Object.entries(extra))
  ["ru", "en", "ja"].forEach((l, i) => (dictionaries[l][key] = values[i]));
for (const dictionary of Object.values(dictionaries))
  for (const key of Object.keys(dictionary))
    dictionary[key] = dictionary[key].replaceAll("Yoru", "yooickuu");
const online = {
  onlineCatalog: [
    "Онлайн-каталог · AniLiberty",
    "Online catalogue · AniLiberty",
    "オンライン作品一覧 · AniLiberty",
  ],
  providerError: [
    "Источник временно недоступен. Повтори попытку.",
    "The provider is temporarily unavailable. Try again.",
    "配信元に接続できません。再試行してください。",
  ],
  providerBlocked: [
    "Источник ограничил доступ к этому тайтлу.",
    "The provider has restricted this title.",
    "配信元がこの作品の視聴を制限しています。",
  ],
  sourceNotice: [
    "Видео и описания предоставляет AniLiberty. Доступность и озвучка зависят от источника.",
    "Video and descriptions are provided by AniLiberty. Availability and audio depend on the provider.",
    "動画とあらすじは AniLiberty が提供します。配信状況と音声は提供元によって異なります。",
  ],
  loadMore: ["Показать ещё", "Load more", "もっと見る"],
  catalogTotal: [
    "релизов у источника",
    "releases at the provider",
    "配信元の作品数",
  ],
  allTypes: ["Сериалы и фильмы", "Series and movies", "シリーズ・映画"],
  series: ["Сериалы", "Series", "シリーズ"],
  movies: ["Фильмы", "Movies", "映画"],
  metadataLanguage: [
    "Описание на языке источника",
    "Description in the provider’s language",
    "あらすじは提供元の言語です",
  ],
  fallback: [
    "Источник недоступен. Показана стартовая подборка без онлайн-видео.",
    "Provider unavailable. Showing a starter selection without online video.",
    "配信元に接続できないため、動画のない初期作品一覧を表示しています。",
  ],
  openingEnding: [
    "Автопропуск опенинга и эндинга",
    "Skip openings and endings",
    "OP・EDを自動スキップ",
  ],
  noReleasedEpisodes: [
    "Серии ещё не опубликованы источником.",
    "The provider has not published episodes yet.",
    "配信元がまだエピソードを公開していません。",
  ],
};
for (const [key, v] of Object.entries(online))
  ["ru", "en", "ja"].forEach((l, i) => (dictionaries[l][key] = v[i]));
for (const l of ["ru", "en", "ja"]) {
  dictionaries[l].autoSkip = dictionaries[l].openingEnding;
  dictionaries[l].curated = dictionaries[l].onlineCatalog;
  dictionaries[l].contentNotice = dictionaries[l].sourceNotice;
  dictionaries[l].aboutCopy = dictionaries[l].sourceNotice;
}
const ongoing = {
  airing: ["Выходит", "Airing", "放送中"],
  ongoingTooltip: [
    "Онгоинг: новые серии ещё выходят",
    "Ongoing: new episodes are still being released",
    "放送中：新しいエピソードが順次公開されます",
  ],
  ongoingOnly: ["Только онгоинги", "Ongoing only", "放送中のみ"],
  latest: ["Последние обновления", "Recently updated", "更新順"],
};
for (const [k, v] of Object.entries(ongoing))
  ["ru", "en", "ja"].forEach((l, i) => (dictionaries[l][k] = v[i]));
dictionaries.ru.airing = "Онгоинг";
dictionaries.ru.dropped = "Дропнул";
dictionaries.ru.planned = "В планах";
dictionaries.ru.search = "Найти тайтл…";
dictionaries.ru.noSegment = "Для этой серии таймкоды опенинга ещё не заданы.";
const refinements = {
  play:['Воспроизвести','Play','再生'],pause:['Пауза','Pause','一時停止'],
  videoControls:['Управление видео','Video controls','再生コントロール'],
  seek:['Позиция воспроизведения','Playback position','再生位置'],
  mute:['Выключить звук','Mute','消音'],unmute:['Включить звук','Unmute','消音解除'],
  volume:['Громкость','Volume','音量'],fullscreen:['На весь экран','Fullscreen','全画面'],
  episodeList:['Серии','Episodes','エピソード'],
  previous:['Назад','Previous','前へ'],nextPage:['Далее','Next','次へ'],page:['Страница','Page','ページ'],goPage:['Перейти к странице','Go to page','ページへ移動'],
  hiddenGems:['Менее популярные','Less popular','人気の低い順'],oldest:['Сначала старые','Oldest first','古い順'],
  picked:['Популярные','Popular','人気順'],allTypes:['Все форматы','All formats','すべての形式'],
  ova:['OVA / OAD','OVA / OAD','OVA / OAD'],webSeries:['Веб-сериалы','Web series','Webアニメ'],specials:['Спешлы','Specials','特別編'],
  announced:['Анонс','Announced','発表済み'],
};
for(const [key,values] of Object.entries(refinements))['ru','en','ja'].forEach((l,i)=>dictionaries[l][key]=values[i]);
const multipleSources={
  catalogScope:['Каталог','Catalogue scope','カタログ範囲'],
  allCatalogues:['Все каталоги','All catalogues','すべてのカタログ'],
  videoCatalogue:['Каталог с видео','Video catalogue','動画配信カタログ'],
  catalogOnly:['Без видео','No video','動画なし'],
  catalogNoVideo:['Тайтл есть в каталоге. Совместимый источник видео пока не найден — можно сохранить в список.','This title is in the catalogue. No compatible video source has been found yet; you can save it to a list.','カタログに登録されていますが、対応する動画配信元がまだありません。リストに保存できます。'],
  combinedHint:['Записи в источниках до удаления совпадений. Карточка не гарантирует наличие видео.','Source counts before deduplication. A catalogue entry does not guarantee video availability.','重複を除く前の配信元ごとの件数です。動画がない作品も含まれます。'],
  partialCatalog:['Один из каталогов временно недоступен. Показаны результаты другого.','One catalogue is unavailable. Results from the other are shown.','一部のカタログに接続できません。他のカタログの結果を表示しています。'],
  onlineCatalog:['Объединённый каталог','Combined catalogue','統合カタログ'],
  sourceNotice:['Каталог и обложки: AniLiberty и Kitsu. Видео: AniLiberty; доступность и озвучка зависят от источника.','Catalogue and covers: AniLiberty and Kitsu. Video: AniLiberty; availability and audio depend on the provider.','作品情報と画像：AniLiberty・Kitsu。動画：AniLiberty。配信状況と音声は提供元によって異なります。'],
};
for(const [key,values] of Object.entries(multipleSources))['ru','en','ja'].forEach((l,i)=>dictionaries[l][key]=values[i]);
for(const l of ['ru','en','ja']){dictionaries[l].curated=dictionaries[l].onlineCatalog;dictionaries[l].contentNotice=dictionaries[l].sourceNotice;dictionaries[l].aboutCopy=dictionaries[l].sourceNotice;}
for(const [i,l] of ['ru','en','ja'].entries())dictionaries[l].statusLimit=['Можно создать до 30 статусов.','You can create up to 30 statuses.','ステータスは30件まで作成できます。'][i];
const authRefinements={
 setupGuide:['Подключить регистрацию — инструкция','Set up registration — guide','登録機能の設定ガイド'],
 emailUnconfirmed:['Сначала подтверди почту по ссылке из письма.','Confirm your email using the link in the message first.','メール内のリンクからメールアドレスを確認してください。'],
 emailDeliveryUnavailable:['Отправка писем на этот адрес ещё не настроена владельцем сайта.','The site owner has not configured email delivery to this address yet.','このメールアドレスへの送信はまだサイト管理者が設定していません。'],
 emailInvalid:['Проверь адрес электронной почты.','Check your email address.','メールアドレスを確認してください。'],
 signupDisabled:['Регистрация временно отключена владельцем сайта.','Registration is currently disabled by the site owner.','現在、サイト管理者により新規登録が無効になっています。'],
 smsUnavailable:['Не удалось отправить SMS. Проверь номер или попробуй позже.','Could not send an SMS. Check the number or try again later.','SMSを送信できませんでした。番号を確認するか、後で再試行してください。'],
 authNotConfigured:['Регистрация ещё не подключена','Registration is not connected yet','登録機能はまだ接続されていません'],
 authSetupHint:['Владельцу сайта осталось подключить сервис аккаунтов. Пока можно просматривать каталог.','The site owner still needs to connect the account service. You can browse the catalogue in the meantime.','サイト管理者によるアカウントサービスの接続が必要です。作品一覧は閲覧できます。'],
};
for(const [k,v] of Object.entries(authRefinements))['ru','en','ja'].forEach((l,i)=>dictionaries[l][k]=v[i]);

const playerRefinements={
 quality:['Качество','Quality','画質'],
 pip:['Картинка в картинке','Picture in picture','ピクチャーインピクチャー'],
 previousEpisode:['Предыдущая серия','Previous episode','前のエピソード'],
 cropAvatar:['Выбери кадр','Crop your avatar','アバターの切り抜き'],
 cropDrag:['Перемести фото мышью или стрелками','Move the photo with the pointer or arrow keys','ドラッグまたは矢印キーで写真を移動'],
 preview:['Предпросмотр','Preview','プレビュー'],
 zoom:['Масштаб','Zoom','拡大'],
 avatarInputError:['Выбери фото JPG, PNG или WebP до 20 МБ.','Choose a JPG, PNG or WebP photo up to 20 MB.','20 MB 以下の JPG・PNG・WebP 写真を選んでください。'],
 videoUnsupported:['Этот браузер не поддерживает формат видео. Попробуй обновить его.','This browser does not support this video format. Try updating it.','このブラウザは動画形式に対応していません。更新してお試しください。'],
 playerActionError:['Не удалось включить этот режим. Попробуй после запуска видео.','Could not enable this mode. Try after starting playback.','このモードを開始できません。動画を再生してからお試しください。'],
 completedEpisodes:['Серий завершено','Episodes completed','視聴完了エピソード'],
 averageRating:['Средняя оценка','Average rating','平均評価'],
};
for(const [key,values] of Object.entries(playerRefinements))['ru','en','ja'].forEach((lang,index)=>{dictionaries[lang][key]=values[index];});
const watchRefresh={
 heroTitle:['Аниме под твоё настроение.','Anime for every mood.','今の気分に、ぴったりのアニメ。'],
 heroCopy:['Знакомые миры и неожиданные открытия. Выбирай аниме — мы запомним, где ты остановился.','Familiar worlds and unexpected discoveries. Find your next anime. We’ll remember where you left off.','大好きな世界も、思いがけない出会いも。次に観たいアニメを見つけよう。続きはいつでもここから。'],
 season:['Сезон','Season','シーズン'],audio:['Озвучка','Audio','音声'],audioRussian:['русская','Russian','ロシア語'],audioJapanese:['японская · оригинал','Japanese · original','日本語・オリジナル'],
 backToCatalogue:['К каталогу','Back to catalogue','作品一覧へ'],moreStories:['Ещё истории','More to discover','ほかの作品もチェック'],synopsis:['О сюжете','The story','あらすじ'],
 previousPoster:['Предыдущий постер','Previous poster','前のポスター'],nextPoster:['Следующий постер','Next poster','次のポスター'],
 skipLoading:['Ищем отметки заставок…','Finding opening and ending timestamps…','OP・EDの区間を確認中…'],
 skipUnavailable:['Для этой версии серии отметки заставок пока не найдены.','Opening and ending timestamps aren’t available for this cut yet.','このバージョンのOP・ED区間はまだ登録されていません。'],
 randomUnavailable:['Сейчас не удалось подобрать доступное видео. Попробуй ещё раз.','Couldn’t find an available video right now. Try again.','再生できる作品が見つかりませんでした。もう一度お試しください。'],
 sourceNotice:['Каталог и обложки: AniLiberty, AnimeVost и Kitsu. Видео: AniLiberty и AnimeVost. Таймкоды: источник видео и AniSkip.','Catalogue and posters: AniLiberty, AnimeVost and Kitsu. Video: AniLiberty and AnimeVost. Skip times: the video provider and AniSkip.','作品情報・画像：AniLiberty、AnimeVost、Kitsu。動画：AniLiberty、AnimeVost。スキップ区間：配信元、AniSkip。'],
};
for(const [k,v] of Object.entries(watchRefresh))['ru','en','ja'].forEach((l,i)=>dictionaries[l][k]=v[i]);
for(const l of ['ru','en','ja'])dictionaries[l].aboutCopy=dictionaries[l].sourceNotice;
const releasePolish = {
 library:['Списки','Lists','リスト'],allStories:['Все','All','すべて'],
 dropped:['Брошено','Dropped','視聴中止'],planned:['Запланировано','Plan to watch','視聴予定'],
 createStatus:['Создать список','Create list','リストを作成'],manageStatuses:['Управление списками','Manage lists','リストを管理'],
 statusName:['Название списка','List name','リスト名'],savedAnime:['Аниме в списках','Saved anime','登録作品'],
 showPassword:['Показать пароль','Show password','パスワードを表示'],hidePassword:['Скрыть пароль','Hide password','パスワードを隠す'],
 history:['История просмотра','Watch history','視聴履歴'],historyEmpty:['Здесь появятся просмотренные серии.','Your watched episodes will appear here.','視聴したエピソードがここに表示されます。'],
 discover:['Что посмотреть','Discover','作品を探す'],discoveryCopy:['Найди своё следующее аниме: по настроению, оценкам или формату.','Find your next anime by mood, rating or format.','気分・評価・形式から、次に見る作品を探そう。'],
 allAnime:['Все аниме','All anime','すべてのアニメ'],popular:['Популярное у зрителей','Popular with viewers','視聴者に人気'],
 topRated:['Высокие оценки','Top rated','高評価'],airingNow:['Сейчас выходит','Currently airing','現在放送中'],films:['На один вечер','Movie night','映画を楽しむ'],
 availableOnly:['С доступным источником','With a video source','配信元がある作品'],
 audienceRating:['Оценка зрителей','Audience rating','視聴者評価'],noAudienceRating:['Пока без оценки','Not rated yet','評価はまだありません'],
 nicknameTaken:['Этот ник уже занят','This nickname is already taken','このニックネームは使用されています'],
 nicknameCheckFailed:['Не удалось проверить ник. Попробуй ещё раз.','Could not check the nickname. Please try again.','ニックネームを確認できませんでした。もう一度お試しください。'],
 deleteAccount:['Удалить аккаунт','Delete account','アカウントを削除'],
 deleteAccountCopy:['Профиль, списки, история и аватар будут удалены. Это нельзя отменить. После двух удалений с одной почтой за 3 дня новая регистрация будет доступна через 3 дня. На этот срок останется только защищённая отметка почты.','Your profile, lists, history and avatar will be deleted permanently. After two deletions using the same email within 3 days, registration is paused for 3 days. Only a protected email fingerprint is retained for this period.','プロフィール・リスト・履歴・アバターは完全に削除され、元に戻せません。同じメールアドレスで3日以内に2回削除すると、再登録は3日間停止されます。その期間はメールアドレスの保護された識別情報のみ保持されます。'],
 deleteAccountConfirm:['Я понимаю, что восстановить данные будет нельзя','I understand my data cannot be restored','データを復元できないことを理解しました'],
 deleteAccountUnavailable:['Удаление аккаунта пока не подключено. Попробуй позже.','Account deletion is not available yet. Please try later.','アカウント削除はまだ利用できません。後でもう一度お試しください。'],
 deleteAccountFailed:['Не удалось завершить удаление. Попробуй ещё раз.','Could not finish deleting the account. Please retry.','アカウントを削除できませんでした。もう一度お試しください。'],
 deletingAccount:['Удаляем аккаунт…','Deleting account…','アカウントを削除中…'],
 registrationCooldown:['После повторного удаления нужно подождать 3 дня перед новой регистрацией.','Please wait 3 days after repeated account deletion before registering again.','アカウントを繰り返し削除した場合、再登録まで3日間お待ちください。'],
};
for(const [key,values] of Object.entries(releasePolish))['ru','en','ja'].forEach((l,i)=>dictionaries[l][key]=values[i]);

const octoberLayout={recommended:['Рекомендуем посмотреть','Recommended for you','おすすめのアニメ'],exploreCatalog:['Открыть каталог','Explore catalogue','カタログを見る'],genre:['Жанр','Genre','ジャンル'],allGenres:['Все жанры','All genres','すべてのジャンル']};
for(const [key,values] of Object.entries(octoberLayout))['ru','en','ja'].forEach((l,i)=>dictionaries[l][key]=values[i]);
