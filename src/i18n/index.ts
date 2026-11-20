import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  'zh-CN': {
    translation: {
      brand: '睡眠行为训练器',
      eyebrow: '6 周 · 以行为练习为核心',
      title: '把规律，慢慢带回夜晚。',
      intro: '通过主观睡眠日记、固定起床时间与循序渐进的行为练习，建立更适合自己的睡眠习惯。',
      scopeTitle: '先了解这是什么',
      scopeBody: '这是帮助改善睡眠习惯的行为训练工具，不是睡眠监测、诊断或治疗服务。应用不会读取穿戴设备或手机的被动睡眠数据。',
      privacyTitle: '你的数据留在此设备',
      privacyBody: '偏好保存在此浏览器的本地数据库中。没有账号、云端同步、分析或遥测。清除浏览器数据、更换设备或使用隐私模式可能导致数据丢失；应用目前提供设置保存与离线应用壳。',
      preferencesTitle: '训练偏好',
      wakeTimeLabel: '期望固定起床时间',
      reminderLabel: '启用备份提醒',
      saved: '偏好已保存在此设备',
      saving: '正在保存偏好…',
      storageError: '无法保存偏好。请检查浏览器存储空间或设置，然后重试。',
      storageUnavailable: '此浏览器无法使用本地存储，偏好更改不会保存。',
      storagePersisted: '浏览器已批准增强本地存储保留',
      storageBestEffort: '浏览器未批准增强保留；请定期导出备份。',
      offlineReady: '离线应用壳已准备',
      offlinePending: '首次联网加载后准备离线资源',
      offlineUnsupported: '此浏览器不支持离线应用壳',
      offlineError: '离线资源暂时无法确认',
      localOnly: '仅保存在此设备',
      statusLabel: '应用状态',
      productLabel: '产品与偏好',
      noAccount: '不创建账号',
      noUpload: '不上传睡眠日记',
      localErrors: '错误只在本地显示',
      preferencesKicker: 'PREFERENCES',
      footer: '睡眠行为训练器 · 非医疗服务',
      footerMeta: '本地优先 · 离线可用'
    }
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false
})

export default i18n
