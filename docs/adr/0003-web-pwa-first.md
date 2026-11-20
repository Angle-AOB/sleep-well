# Web PWA 首发，Capacitor 延后

首版采用 React + TypeScript + Vite 的移动端 PWA，核心功能通过 Service Worker 离线运行；不为潜在的未来原生需求提前引入 React Native、Flutter 或原生壳。睡眠行为训练、统计、规则与备份格式保持在独立 TypeScript 领域层，未来若系统通知、原生文件或后台能力成为硬需求，再在现有 Web 应用上增加 Capacitor 适配。这样保留 Web 首发的低部署与跨设备访问成本，同时避免把浏览器限制误认为已被跨平台框架解决。

**状态：** accepted
