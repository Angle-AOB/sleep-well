import type { SettingsSubPage } from './routing'

/** 列表项名称、子页顶栏标题与测试契约共用同一组 i18n 键。 */
export const settingsSubPageTitleKeys: Record<SettingsSubPage, string> = {
  screening: 'settingsScreening',
  reminders: 'settingsReminders',
  backup: 'settingsBackup',
  diagnostics: 'settingsDiagnostics',
  about: 'settingsAbout'
}

/**
 * 子页顶栏标题：默认与列表项同名；诊断页改用不同措辞，
 * 避免顶栏 h1 与面板自身的可访问名称「诊断信息」重复。
 */
export const settingsSubPageHeadingKeys: Record<SettingsSubPage, string> = {
  ...settingsSubPageTitleKeys,
  diagnostics: 'settingsDiagnosticsHeading'
}
