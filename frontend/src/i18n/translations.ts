export type Language = 'en' | 'uk' | 'ru';

export const translations: Record<Language, Record<string, string>> = {
  en: {
    tabDashboard: 'Dashboard',
    tabInventory: 'Fleet',
    tabProfiles: 'Profiles',
    tabLibrary: 'Library',
    tabInitScripts: 'Init Scripts',
    tabLogs: 'Logs',
    tabSettings: 'Settings',
    tabVsm2Flasher: 'VSM2 Flasher',
    tabEdgeBro: 'Edge-B.R.O.',
    profilesSub: 'Installation profiles and OS defaults',
    profilesSubTabDefaults: 'Default Profile',
    profilesDefaultTitle: 'Default Installation Settings',
    profilesDefaultAccounts: 'Default Accounts',
    
    // Status
    systemStatus: 'System Status',
    online: 'Online',
    offline: 'Offline',
    loading: 'Loading...',
    
    // Dashboard Tab
    dashboardTitle: 'Dashboard',
    dashboardSub: 'Real-time system overview',
    totalDevices: 'Total Devices',
    pendingProvision: 'Pending Provision',
    activeAlerts: 'Active Alerts',
    
    // Inventory Tab
    inventoryTitle: 'Managed Nodes',
    inventorySub: 'Deploy, configure, and provision industrial edge fleet.',
    searchPlaceholder: 'Search by hostname, IP address...',
    addBox: 'Add Node',
    macAddress: 'MAC Address',
    ipAddress: 'IP Address',
    location: 'Location',
    status: 'Status',
    actions: 'Actions',
    delete: 'Delete',
    edit: 'Edit',
    
    // Settings Tab
    settingsTitle: 'Settings',
    settingsSub: 'App configuration',
    language: 'Language',
    selectLanguage: 'Select Language',
    
    // Log options
    taskLogs: 'Task Logs',
    debugLogs: 'System Debug Logs',
    auditLogs: 'Audit Logs',
    systemLogsTitle: '>_ System & Security Logs',
    systemLogsSub: 'Monitor real-time orchestrator daemon operations, user actions, and errors.',
    searchLogsPlaceholder: 'Search logs...',
    debugViewLabel: 'DEBUG VIEW',
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    back: 'Back',

    // Authentication
    loginTitle: 'Sign In',
    loginUsername: 'Username',
    loginPassword: 'Password',
    loginSubmit: 'Sign In',
    loginError: 'Invalid username or password',
    logoutButton: 'Logout',

    // New Settings Options
    settingsSubTabPreferences: 'System Preferences',
    settingsSubTabUsers: 'Users & Alerts',
    settingsSubTabLocations: 'Provision Profiles (Locations)',
    settingsSystemConfig: 'System Configuration',
    settingsApiHost: 'API Host Address',
    settingsDefaultTz: 'Default Timezone',
    settingsProvisionDefaults: 'Provisioning Defaults & Network settings',
    settingsDefaultGateway: 'Default Gateway',
    settingsDefaultDns: 'Default DNS',
    settingsDefaultSsh: 'Default SSH Public Key',
    settingsDefaultLocale: 'System Locale',
    settingsDefaultKeyboard: 'Keyboard Layout',
    generateKeypair: 'Generate Ed25519 Keypair',
    keypairGeneratedTitle: 'Master Ed25519 Keypair Generated',
    keypairGeneratedDesc: 'The public key has been saved to your profile and will be automatically baked into all provisioned nodes.',
    copyPublicKey: 'Copy Public Key',
    copyPrivateKey: 'Copy Private Key',
    downloadPrivateKey: 'Download Private Key (id_ed25519)',
    settingsDefaultMirror: 'Package Mirror Host',
    settingsDefaultNtp: 'NTP Time Server',
    settingsDefaultRootPassword: 'Default Root Password',
    descDefaultRootPassword: 'Leave blank to keep existing password.',
    settingsUserAccounts: 'User Accounts',
    settingsAddUser: 'Add User',
    settingsTgBotConfig: 'Telegram Bot Notifications',
    settingsTgBotToken: 'Telegram Bot Token',
    settingsTgChatId: 'Default Telegram Chat ID',
    settingsLocationsTitle: 'Provision Profiles (Locations)',
    settingsAddLocation: 'Add Location',

    // Descriptions & States
    descApiHost: 'IP address of this orchestrator server. Used by the PXE boxes during the Debian/Ubuntu boot stage to pull post-install configurations.',
    descDefaultTz: 'Default local time offset configured on road-recording boxes if not overridden by the location profile.',
    descProvisionDefaults: 'These system defaults configure the network cards of boxes at install time. Location profiles (Tashkent, Kiev, etc.) override these settings to supply custom gateways and timezone maps per object.',
    descTgBotToken: 'API Token of the bot used by the orchestrator to dispatch alerts.',
    descTgChatId: 'Default channel or group chat ID where installation callback milestones are posted.',
    locNoDescription: 'No description',
    settingsCreateProfile: 'Create Provision Profile',
    settingsConfigureProfile: 'Configure: {name}',
    settingsNetworkConfig: 'Network settings',
    settingsSaveProfile: 'Save Profile',
    settingsSelectLocationHint: 'Select a location configuration from the list or add a new one to manage its provisioning profile.',
    settingsLoadingLocations: 'Loading Locations...',
    settingsNoLocations: 'No Locations added yet.',

    // DHCP settings
    settingsDhcpTitle: 'DHCP Server Configuration',
    settingsDhcpMode: 'DHCP Mode',
    settingsDhcpInterface: 'Network Interface',
    settingsDhcpStart: 'IP Pool Start',
    settingsDhcpEnd: 'IP Pool End',
    settingsDhcpNetmask: 'Netmask',
    settingsDhcpRouter: 'Gateway',
    settingsDhcpDns: 'DNS Server'
  },
  uk: {
    tabDashboard: 'Панель приладів',
    tabInventory: 'Вузли (Fleet)',
    tabProfiles: 'Профілі',
    tabLibrary: 'Бібліотека',
    tabInitScripts: 'Скрипти ініціалізації',
    tabLogs: 'Журнали',
    tabSettings: 'Налаштування',
    tabVsm2Flasher: 'VSM2 Прошивальник',
    tabEdgeBro: 'Edge-B.R.O.',
    profilesSub: 'Профілі встановлення та налаштування ОС за замовчуванням',
    profilesSubTabDefaults: 'Профіль за замовчуванням',
    profilesDefaultTitle: 'Параметри встановлення за замовчуванням',
    profilesDefaultAccounts: 'Облікові записи за замовчуванням',
    
    // Status
    systemStatus: 'Статус системи',
    online: 'Онлайн',
    offline: 'Офлайн',
    loading: 'Завантаження...',
    
    // Dashboard Tab
    dashboardTitle: 'Панель приладів',
    dashboardSub: 'Огляд системи в реальному часі',
    totalDevices: 'Всього пристроїв',
    pendingProvision: 'Очікують налаштування',
    activeAlerts: 'Активні сповіщення',
    
    // Inventory Tab
    inventoryTitle: 'Керовані вузли',
    inventorySub: 'Розгортання, налаштування та конфігурація промислового крайового флоту.',
    searchPlaceholder: 'Пошук за ім\'ям хоста, IP-адресою...',
    addBox: 'Додати вузол',
    macAddress: 'MAC-адреса',
    ipAddress: 'IP-адреса',
    location: 'Розташування',
    status: 'Статус',
    actions: 'Дії',
    delete: 'Видалити',
    edit: 'Редагувати',
    
    // Settings Tab
    settingsTitle: 'Налаштування',
    settingsSub: 'Конфігурація додатку',
    language: 'Мова',
    selectLanguage: 'Виберіть мову',
    
    // Log options
    taskLogs: 'Журнали завдань',
    debugLogs: 'Системні журнали налагодження',
    auditLogs: 'Журнали аудиту',
    
    // Common
    save: 'Зберегти',
    cancel: 'Скасувати',
    back: 'Назад',

    // Authentication
    loginTitle: 'Вхід до системи',
    loginUsername: 'Ім\'я користувача',
    loginPassword: 'Пароль',
    loginSubmit: 'Увійти',
    loginError: 'Невірні ім\'я користувача або пароль',
    logoutButton: 'Вийти',

    // New Settings Options
    settingsSubTabPreferences: 'Системні уподобання',
    settingsSubTabUsers: 'Користувачі та сповіщення',
    settingsSubTabLocations: 'Профілі встановлення (Локації)',
    settingsSystemConfig: 'Системна конфігурація',
    settingsApiHost: 'IP-адреса API хоста',
    settingsDefaultTz: 'Часовий пояс за замовчуванням',
    settingsProvisionDefaults: 'Параметри встановлення та мережі за замовчуванням',
    settingsDefaultGateway: 'Шлюз за замовчуванням',
    settingsDefaultDns: 'DNS за замовчуванням',
    settingsDefaultSsh: 'Публічний SSH-ключ за замовчуванням',
    settingsDefaultLocale: 'Локаль системи',
    settingsDefaultKeyboard: 'Розкладка клавіатури',
    settingsDefaultMirror: 'Дзеркало пакетів',
    settingsDefaultNtp: 'NTP сервер часу',
    settingsDefaultRootPassword: 'Пароль Root за замовчуванням',
    descDefaultRootPassword: 'Залиште порожнім, щоб зберегти поточний пароль.',
    settingsUserAccounts: 'Облікові записи користувачів',
    settingsAddUser: 'Додати користувача',
    settingsTgBotConfig: 'Налаштування Telegram бота',
    settingsTgBotToken: 'Токен Telegram бота',
    settingsTgChatId: 'ID Telegram чату за замовчуванням',
    settingsLocationsTitle: 'Профілі встановлення (Локації)',
    settingsAddLocation: 'Додати локацію',

    // Descriptions & States
    descApiHost: 'IP-адреса цього сервера оркестратора. Використовується боксами при завантаженні PXE для отримання пост-інсталяційних скриптів.',
    descDefaultTz: 'Часовий пояс за замовчуванням для боксів відеозапису, якщо не перевизначено профілем локації.',
    descProvisionDefaults: 'Ці налаштування конфігурують мережеві карти боксів під час встановлення ОС. Профілі локацій (Ташкент, Київ тощо) перевизначають їх для кожного об\'єкта.',
    descTgBotToken: 'Токен API бота, що використовується оркестратором для надсилання сповіщень.',
    descTgChatId: 'ID чату або групи за замовчуванням, куди надсилаються звіти про етапи встановлення.',
    locNoDescription: 'Немає опису',
    settingsCreateProfile: 'Створити профіль встановлення',
    settingsConfigureProfile: 'Налаштування: {name}',
    settingsNetworkConfig: 'Мережеві налаштування',
    settingsSaveProfile: 'Зберегти профіль',
    settingsSelectLocationHint: 'Виберіть локацію зі списку або додайте нову для управління профілем мережевої розмітки та встановлення.',
    settingsLoadingLocations: 'Завантаження локацій...',
    settingsNoLocations: 'Локації ще не додано.',

    // DHCP settings
    settingsDhcpTitle: 'Конфігурація DHCP-сервера',
    settingsDhcpMode: 'Режим DHCP',
    settingsDhcpInterface: 'Мережевий інтерфейс',
    settingsDhcpStart: 'Початок діапазону IP',
    settingsDhcpEnd: 'Кінець діапазону IP',
    settingsDhcpNetmask: 'Маска підмережі',
    settingsDhcpRouter: 'Шлюз',
    settingsDhcpDns: 'DNS-сервер'
  },
  ru: {
    tabDashboard: 'Панель',
    tabInventory: 'Узлы (Fleet)',
    tabProfiles: 'Профили',
    tabLibrary: 'Библиотека',
    tabInitScripts: 'Скрипты инициализации',
    tabLogs: 'Журналы',
    tabSettings: 'Настройки',
    tabVsm2Flasher: 'VSM2 Прошивальщик',
    tabEdgeBro: 'Edge-B.R.O.',
    profilesSub: 'Профили установки и настройки ОС по умолчанию',
    profilesSubTabDefaults: 'Профиль по умолчанию',
    profilesDefaultTitle: 'Параметры установки по умолчанию',
    profilesDefaultAccounts: 'Учётные записи по умолчанию',
    
    // Status
    systemStatus: 'Статус системы',
    online: 'Онлайн',
    offline: 'Офлайн',
    loading: 'Загрузка...',
    
    // Dashboard Tab
    dashboardTitle: 'Панель управления',
    dashboardSub: 'Обзор системы в реальном времени',
    totalDevices: 'Всего устройств',
    pendingProvision: 'Ожидают настройки',
    activeAlerts: 'Активные уведомления',
    
    // Inventory Tab
    inventoryTitle: 'Управляемые узлы',
    inventorySub: 'Развертывание, настройка и конфигурация промышленного краевого флота.',
    searchPlaceholder: 'Поиск по имени хоста, IP-адресу...',
    addBox: 'Добавить узел',
    macAddress: 'MAC-адрес',
    ipAddress: 'IP-адрес',
    location: 'Расположение',
    status: 'Статус',
    actions: 'Действия',
    delete: 'Удалить',
    edit: 'Редактировать',
    
    // Settings Tab
    settingsTitle: 'Настройки',
    settingsSub: 'Конфигурация приложения',
    language: 'Язык',
    selectLanguage: 'Выберите язык',
    
    // Log options
    taskLogs: 'Журналы задач',
    debugLogs: 'Системные журнали отладки',
    auditLogs: 'Журналы аудита',
    
    // Common
    save: 'Сохранить',
    cancel: 'Отмена',
    back: 'Назад',

    // Authentication
    loginTitle: 'Вход в систему',
    loginUsername: 'Имя пользователя',
    loginPassword: 'Пароль',
    loginSubmit: 'Войти',
    loginError: 'Неверное имя пользователя или пароль',
    logoutButton: 'Выйти',

    // New Settings Options
    settingsSubTabPreferences: 'Системные предпочтения',
    settingsSubTabUsers: 'Пользователи и оповещения',
    settingsSubTabLocations: 'Профили установки (Локации)',
    settingsSystemConfig: 'Системная конфигурация',
    settingsApiHost: 'IP-адрес API хоста',
    settingsDefaultTz: 'Часовой пояс по умолчанию',
    settingsProvisionDefaults: 'Параметры установки и сети по умолчанию',
    settingsDefaultGateway: 'Шлюз по умолчанию',
    settingsDefaultDns: 'DNS по умолчанию',
    settingsDefaultSsh: 'Публичный SSH-ключ по умолчанию',
    settingsDefaultLocale: 'Локаль системы',
    settingsDefaultKeyboard: 'Раскладка клавиатуры',
    settingsDefaultMirror: 'Зеркало пакетов',
    settingsDefaultNtp: 'NTP сервер времени',
    settingsDefaultRootPassword: 'Пароль Root по умолчанию',
    descDefaultRootPassword: 'Оставьте пустым, чтобы сохранить текущий пароль.',
    settingsUserAccounts: 'Учетные записи пользователей',
    settingsAddUser: 'Добавить пользователя',
    settingsTgBotConfig: 'Настройки Telegram бота',
    settingsTgBotToken: 'Токен Telegram бота',
    settingsTgChatId: 'ID Telegram чата по умолчанию',
    settingsLocationsTitle: 'Профили установки (Локации)',
    settingsAddLocation: 'Добавить локацию',

    // Descriptions & States
    descApiHost: 'IP-адрес этого сервера оркестратора. Используется боксами при загрузке PXE для получения пост-установочных скриптов.',
    descDefaultTz: 'Часовой пояс по умолчанию для видеорегистрирующих боксов, если не переопределен профилем локации.',
    descProvisionDefaults: 'Эти настройки конфигурируют сетевые карты боксов во время установки ОС. Профили локаций (Ташкент, Киев и др.) переопределяют их для каждого объекта.',
    descTgBotToken: 'Токен API бота, используемый оркестратором для отправки уведомлений.',
    descTgChatId: 'ID чата или группы по умолчанию, куда отправляются отчеты о вехах установки.',
    locNoDescription: 'Нет описания',
    settingsCreateProfile: 'Создать профиль установки',
    settingsConfigureProfile: 'Настройка: {name}',
    settingsNetworkConfig: 'Сетевые настройки',
    settingsSaveProfile: 'Сохранить профиль',
    settingsSelectLocationHint: 'Выберите локацию из списка или добавьте новую для управления профилем сетевой разметки и установки.',
    settingsLoadingLocations: 'Загрузка локаций...',
    settingsNoLocations: 'Локации еще не добавлены.',

    // DHCP settings
    settingsDhcpTitle: 'Конфигурация DHCP-сервера',
    settingsDhcpMode: 'Режим DHCP',
    settingsDhcpInterface: 'Сетевой интерфейс',
    settingsDhcpStart: 'Начало диапазона IP',
    settingsDhcpEnd: 'Конец диапазона IP',
    settingsDhcpNetmask: 'Маска подсети',
    settingsDhcpRouter: 'Шлюз',
    settingsDhcpDns: 'DNS-сервер'
  }
};
