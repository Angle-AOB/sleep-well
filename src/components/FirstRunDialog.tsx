import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

type FirstRunDialogProps = {
  /** 关闭并进入安全自查子页。 */
  onStartScreening: () => void
  /** 关闭并留在/进入今日页。 */
  onRecordDiary: () => void
  /** 关闭但留在原处（Esc、关闭按钮，或从关于页复看后返回）。 */
  onDismiss: () => void
}

/**
 * 首次说明：原生 `<dialog>` + `showModal()`。
 *
 * 用原生模态而不是自建遮罩，是因为浏览器已经提供了背景 inert（不可聚焦、不可交互）、
 * Tab 焦点陷阱与 Esc 关闭；我们只补上关闭后的焦点归位。
 */
export function FirstRunDialog({ onStartScreening, onRecordDiary, onDismiss }: FirstRunDialogProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  /**
   * 原生模态只把背景标成 inert，Tab 越过最后一个控件时焦点会暂时落到浏览器界面，
   * 在 `document.activeElement` 上表现为跑出弹窗。这里显式把 Tab 循环限制在弹窗内。
   */
  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (dialog === null) return

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute('disabled'))
    if (focusables.length === 0) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1

    if (index === -1) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
      return
    }
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null

    if (!dialog.open) dialog.showModal()
    headingRef.current?.focus({ preventScroll: true })

    return () => {
      if (dialog.open) dialog.close()
      // 弹窗从 DOM 卸载时，浏览器不会替我们保留焦点。
      // 有触发元素（复看）就还给触发按钮；自动弹出没有触发元素，交给页标题，
      // 否则焦点会留在 body，键盘用户失去位置。
      if (opener !== null) {
        opener.focus({ preventScroll: true })
      } else {
        document.getElementById('page-title')?.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="first-run-dialog"
      aria-labelledby="first-run-title"
      onKeyDown={trapTab}
      onCancel={(event) => {
        // Esc 由本组件关闭，保证与按钮走同一条关闭、焦点归位路径。
        event.preventDefault()
        onDismiss()
      }}
    >
      <div className="first-run-body">
        <h2 id="first-run-title" className="first-run-heading" ref={headingRef} tabIndex={-1}>{t('firstRunTitle')}</h2>

        <h3>{t('scopeTitle')}</h3>
        <p>{t('scopeBody')}</p>

        <h3>{t('privacyTitle')}</h3>
        <p>{t('privacyBody')}</p>
        <p className="local-only">{t('localOnly')}</p>

        <div className="first-run-actions">
          <button type="button" className="primary-button" onClick={onStartScreening}>
            {t('firstRunStartScreening')}
          </button>
          <button type="button" className="secondary-button" onClick={onRecordDiary}>
            {t('firstRunRecordDiary')}
          </button>
        </div>

        <button type="button" className="first-run-close" onClick={onDismiss} aria-label={t('firstRunClose')}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </dialog>
  )
}
