export type Language = 'en' | 'uk' | 'ru';

export const translations: Record<Language, Record<string, string>> = {
  en: {
    tabDashboard: 'Dashboard',
    tabInventory: 'Inventory',
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
    inventoryTitle: 'Inventory',
    inventorySub: 'Manage industrial edge devices',
    searchPlaceholder: 'Search by hostname, IP address...',
    addBox: 'Add Box',
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
    back: 'Back'
  },
  uk: {
    tabDashboard: 'Панель приладів',
    tabInventory: 'Інвентар',
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
    inventoryTitle: 'Інвентар',
    inventorySub: 'Управління промисловими крайовими пристроями',
    searchPlaceholder: 'Пошук за ім\'ям хоста, IP-адресою...',
    addBox: 'Додати Box',
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
    back: 'Назад'
  },
  ru: {
    tabDashboard: 'Панель',
    tabInventory: 'Инвентарь',
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
    inventoryTitle: 'Инвентарь',
    inventorySub: 'Управление промышленными краевыми устройствами',
    searchPlaceholder: 'Поиск по имени хоста, IP-адресу...',
    addBox: 'Добавить Box',
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
    debugLogs: 'Системные журналы отладки',
    auditLogs: 'Журналы аудита',
    
    // Common
    save: 'Сохранить',
    cancel: 'Отмена',
    back: 'Назад'
  }
};
