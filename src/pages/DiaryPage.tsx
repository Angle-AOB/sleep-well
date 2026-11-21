import { DiaryPanel } from '../components/DiaryPanel'

type DiaryPageProps = {
  hidden: boolean
  storageUnavailable: boolean
  /** 导入备份后递增，让日记面板重新读取已存储的条目。 */
  reloadToken: number
  onSaved: () => void
}

export function DiaryPage({ hidden, storageUnavailable, reloadToken, onSaved }: DiaryPageProps) {
  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
      <DiaryPanel storageUnavailable={storageUnavailable} reloadToken={reloadToken} onSaved={onSaved} />
    </section>
  )
}
