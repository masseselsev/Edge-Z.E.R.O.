export type Language = 'en' | 'uk' | 'ru';

export const translations: Record<Language, Record<string, string>> = {
  en: {
    tabDashboard: 'Dashboard',
    tabInventory: 'Fleet',
    tabLibrary: 'Library',
    tabInitScripts: 'Init Scripts',
    tabLogs: 'Logs',
    tabSettings: 'Settings',
    
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
    logoutButton: 'Logout'
  },
  uk: {
    tabDashboard: 'Панель приладів',
    tabInventory: 'Вузли (Fleet)',
    tabLibrary: 'Бібліотека',
    tabInitScripts: 'Скрипти ініціалізації',
    tabLogs: 'Журнали',
    tabSettings: 'Налаштування',
    
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
    logoutButton: 'Вийти'
  },
  ru: {
    tabDashboard: 'Панель',
    tabInventory: 'Узлы (Fleet)',
    tabLibrary: 'Библиотека',
    tabInitScripts: 'Скрипты инициализации',
    tabLogs: 'Журналы',
    tabSettings: 'Настройки',
    
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
    logoutButton: 'Выйти'
  }
};
