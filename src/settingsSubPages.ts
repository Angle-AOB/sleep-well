import type { SettingsSubPage } from './routing'

/** 列表项名称、子页顶栏标题与测试契约共用同一组 i18n 键。 */
export const settingsSubPageTitleKeys: Record<SettingsSubPage, string> = {
  screening: 'settingsScreening',
  reminders: 'settingsReminders',
  backup: 'settingsBackup',
  diagnostics: 'settingsDiagnostics',
  about: 'settingsAbout'
}
