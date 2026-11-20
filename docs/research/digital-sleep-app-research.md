# 数字睡眠 App 开发前置研究：疗效证据、监管定位与技术边界

**一句话结论（TL;DR）：** 数字 CBT-I 的疗效有 RCT 与非劣效试验支持（**有指导的**网络 CBT-I ≈ 面对面团体治疗，全自动版效应量中等且略低）；监管上有两条清晰车道——宣称"治疗慢性失眠"就是医疗器械（Somryst 走 FDA 510(k)，Class II），宣称"养成健康睡眠习惯"则落在 FDA General Wellness 政策之外；消费级手环测"睡眠分期"不可靠（特异性 0.18–0.54，系统性高估睡眠），核心干预环应以**主观睡眠日记**为准。

本文件是 `sleep-quality-improvement-factors.md` 的产品开发补充，证据分级标签沿用该文档的 定义（强/中/弱/未证实）。凡未能从一手来源核实的信息，均明确标注。

---

## 1. 数字 CBT-I（dCBT-I）疗效：可行，但"指导"很关键

**全自动 dCBT-I。** Espie 等 2019 年 *JAMA Psychiatry* 的 RCT（DIALS 试验，n≈1711，Sleepio 程序）：全自动 dCBT 对比睡眠卫生对照，除夜间失眠症状外，**显著改善日间功能、心理幸福感、抑郁与焦虑症状**及睡眠相关生活质量，效应量为中等 [1]。后续 SleepioRx 试验（Prather 2025）显示疗效维持至 6 个月 [2]。

**有指导的网络 CBT-I 与面对面等效。** Blom 等 2015 年 *JAMA Psychiatry* 的随机非劣效试验（8 周）：**有指导的网络 CBT-I 不劣于面对面团体 CBT-I**，各结局无显著差异，支持其作为可扩展的替代方案 [3]。Zachariae 等 2016 年对网络 CBT-I 的系统综述/meta 分析（约 15 项 RCT）结论方向一致：效应量与面对面治疗相当，但**含治疗师指导的版本优于纯自助**（此点与主文档 [4] van Straten 2018 的结论一致）[4]。更新的 Benz 2024 亦重复了非劣效结论 [5]。

**对产品的意义：**
- **证据强度：中强**——dCBT-I 不是"电子安慰剂"，但效应量取决于实施质量；
- 设计上应尽量靠近"有指导"形态：哪怕是自动化教练、规则化反馈、疗程结构（每周解锁），都优于纯内容堆放；
- 纯"睡眠卫生教育 App"无效（主文档 §15），本节证据与之一致——有效成分是行为程序，不是知识。

---

## 2. 监管定位：两条车道，先选一条

**治疗车道（医疗器械）。** Somryst（Pear Therapeutics）是首个获 FDA 清除的处方数字疗法：
- 510(k) 编号 **K191716**，"Computerized Behavioral Therapy Device for Insomnia"，Class II，决定日期 **2020-03-23** [6][7]；
- 适应症：**22 岁以上成人慢性失眠**，9 周处方 CBT-I 程序，经 510(k) + Pre-Cert 试点双路径审查 [6]；
- 其临床基础为 SHUTi 平台的一系列 RCT（本轮未逐篇核对原始效应数字）；
- 商业警示：Pear Therapeutics 于 2023 年破产（媒体报道，本轮未核查一手文件）——**疗效证据充分 ≠ 商业模式成立**。

**健康车道（General Wellness）。** FDA《General Wellness: Policy for Low Risk Devices》指南（2016 定稿，2026 年更新版进一步放宽低风险追踪类产品）：宣称"**帮助维持健康睡眠习惯**、放松、健康生活方式"属低风险健康产品，**在医疗器械监管之外**；一旦宣称"**诊断/治疗**特定疾病或状态（如治疗失眠、诊断睡眠呼吸暂停）"，即落入器械监管 [8][9]。

**中国 NMPA 对失眠数字疗法的态度：本轮未找到可引用的一手来源**（批准清单/指导原则原文），不下结论。若产品面向中国大陆并考虑"治疗"宣称，需另行专项核查。

**对产品的意义：** 首发版本走健康车道（习惯养成、睡眠效率自我管理、就医分诊提示），宣称纪律是合规生命线——不写"治疗失眠"，写"基于 CBT-I 行为科学的睡眠习惯改善"。就医分诊提示（打鼾+嗜睡+高血压 → 建议就医）本身就是健康车道产品的责任边界。

---

## 3. 消费级手环/手机的睡眠分期：不可作为干预依据

Chinoy 等 2021 年对 7 款消费级睡眠追踪设备的验证：**睡眠检出敏感性全部 ≥0.93，但清醒检出特异性仅 0.18–0.54**——系统性**高估睡眠、漏检清醒**，分期一致性参差 [10]。后续研究重复了该模式（Robbins 2024：睡眠/清醒敏感性 ≥95%，分期敏感性约 50%+；Schyvens 2025：6 款腕戴设备特异性 29–52%）[11][12]。

**对产品的意义：**
- CBT-I 的标准工具本就是**主观睡眠日记**（计算 TIB/TST/SE 用于睡眠限制），这恰好绕开了硬件误差——核心数据闭环不依赖任何穿戴设备；
- 若未来接入穿戴数据，只能作参考性展示，**不得**用于驱动睡眠限制算法或生成"深睡得分"（与主文档"被高估的做法"第 9 条一致）。

**证据强度：强**（多设备、多团队的独立验证，方向一致）。

---

## 4. Orthosomnia：追踪本身可以致病

Baron 等 2017 年在 *J Clin Sleep Med* 提出 **orthosomnia**：对完美睡眠数据的 perfectionistic 追求本身恶化睡眠，病例系列显示患者以设备数据为准怀疑主观感受与临床评估 [13]。该术语已被后续文献广泛引用（327+ 引用）。

**对产品的意义：** 评分体系要刻意"反 orthosomnia"——不设每日分数/评级，不设"完美睡眠"叙事，趋势图默认周/月粒度，弱化单夜波动。**这是产品价值观层面的设计约束，不是功能细节。**

---

## 5. 综合结论（与竞品调研合并）

| 决策点 | 结论 | 依据 |
|---|---|---|
| dCBT-I 有效吗 | 有效（中等效应），有指导 > 纯自助 | [1][3][4] |
| 首发 App 怎么定位 | 健康车道："睡眠习惯改善"，不做治疗宣称 | [8][9] |
| 治疗宣称的代价 | 医疗器械审批（先例：Somryst K191716，Class II） | [6][7] |
| 核心数据源 | 主观睡眠日记（TIB/TST/SE），不用穿戴分期 | CBT-I 标准 + [10][11][12] |
| 评分系统 | 不做每日睡眠评分，反 orthosomnia 设计 | [13] |
| NMPA 路径 | 未查明，需要专项核查 | — |

开源/竞品格局见会话调研记录：开源界只有"日记"没有"干预引擎"（睡眠限制动态调整无任何开源实现）；中文市场无纯 CBT-I 主打产品，头部（蜗牛睡眠、小睡眠）押注的恰是证据最弱的监测/白噪音方向。

---

## 参考来源

1. Espie CA, Emsley R, Kyle SD, et al. Effect of Digital Cognitive Behavioral Therapy for Insomnia on Daytime Functioning: A Randomized Clinical Trial. *JAMA Psychiatry*. 2019;76(1):91–98. https://pmc.ncbi.nlm.nih.gov/articles/PMC6583463/
2. Prather AA, et al. SleepioRx RCT（6 个月维持）. *JMIR Mental Health*. 2025.（经搜索摘要确认，未核全文）
3. Blom K, Jernelöv S, Kraepelien M, et al. Internet- vs. group-delivered cognitive behavior therapy for insomnia: A randomized controlled non-inferiority trial. *JAMA Psychiatry*. 2015;72(7):683–691. https://pubmed.ncbi.nlm.nih.gov/25881329/
4. Zachariae R, Lyby MS, Ritterband LM, O'Toole MS. Efficacy of internet-delivered cognitive-behavioral therapy for insomnia – A systematic review and meta-analysis of randomized controlled trials. *Sleep Medicine Reviews*. 2016;30:1–10.（后台调研定位；效应量数字未逐条核对原文）
5. Benz F, et al. Internet-delivered vs. face-to-face CBT-I non-inferiority. 2024. https://pubmed.ncbi.nlm.nih.gov/?term=Benz+internet+CBT-I+non-inferiority
6. FDA 510(k) Premarket Notification K191716 (Somryst, Pear Therapeutics), 2020-03-23. https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K191716
7. FDA 510(k) Summary, K191716. https://www.accessdata.fda.gov/cdrh_docs/pdf19/K191716.pdf
8. FDA. General Wellness: Policy for Low Risk Devices（2016 定稿）. https://www.fda.gov/media/90652/download
9. FDA 2026 年 General Wellness 指南更新（经 Troutman Pepper 2026-03 分析确认，原文未逐条核对）. https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices
10. Chinoy ED, Cuellar JA, Huwa KE, et al. Performance of Seven Consumer Sleep-Tracking Devices Compared with Polysomnography Using Sleep-Stage Classification Likelihood Ratios. *Sleep*. 2021;44(5):zsaa291.（经搜索摘要确认：敏感性 ≥0.93、特异性 0.18–0.54）
11. Robbins R, et al. Three commercial wearables validation. 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11511193/
12. Schyvens C, et al. Six wrist-worn devices validation. 2025.（经搜索摘要确认）
13. Baron KG, Abbott S, Jaffe A, Malkani R, Zee P. Orthosomnia: Are Some Patients Taking the Quantified Self Too Far? *J Clin Sleep Med*. 2017;13(2):353–354. https://pmc.ncbi.nlm.nih.gov/articles/PMC5263088/
