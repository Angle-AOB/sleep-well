import { DiaryPanel } from '../components/DiaryPanel'
import type { LocalDate } from '../domain/diary'

type DiaryPageProps = {
  hidden: boolean
  storageUnavailable: boolean
  /** 导入备份后递增，让日记面板重新读取已存储的条目。 */
  reloadToken: number
  /** 今日卡请求选中的日期；token 递增保证只在点击时应用一次。 */
  request: { date: LocalDate; token: number } | null
  onSaved: () => void
}

export function DiaryPage({ hidden, storageUnavailable, reloadToken, request, onSaved }: DiaryPageProps) {
  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
      <DiaryPanel
        storageUnavailable={storageUnavailable}
        reloadToken={reloadToken}
        request={request}
        onSaved={onSaved}
      />
    </section>
  )
}
