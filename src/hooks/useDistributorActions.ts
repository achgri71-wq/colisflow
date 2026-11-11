import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useStore, useActiveSession } from '../store/useStore'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import { exportDistributorExcel } from '../lib/export'
import type { Distributor } from '../types'

export function useDistributorActions() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const dialog = useDialog()
  const toast = useToast()
  const activeSession = useActiveSession()

  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const settings = useStore((state) => state.settings)
  const startSession = useStore((state) => state.startSession)
  const renameDistributor = useStore((state) => state.renameDistributor)
  const archiveDistributor = useStore((state) => state.archiveDistributor)
  const restoreDistributor = useStore((state) => state.restoreDistributor)
  const deleteDistributor = useStore((state) => state.deleteDistributor)
  const restoreDistributorSnapshot = useStore((state) => state.restoreDistributorSnapshot)
  const logExport = useStore((state) => state.logExport)

  const resume = async (distributor: Distributor) => {
    if (activeSession) {
      if (activeSession.distributorId === distributor.id) {
        navigate('/scan')
        return true
      }
      const confirmed = await dialog.confirm({
        title: t('dashboard.activeTitle'),
        message: t('scan.willEndActive'),
        confirmLabel: t('dist.resume'),
        tone: 'warning',
      })
      if (!confirmed) return false
    }
    startSession(distributor.name, 'manual')
    navigate('/scan')
    return true
  }

  const exportExcel = async (distributor: Distributor) => {
    const list = codes.filter((code) => code.distributorId === distributor.id)
    if (!list.length) return false
    try {
      await exportDistributorExcel(distributor, list, sessions, {
        lang,
        prefixes: settings.senditPrefixes,
      })
      logExport(distributor.name)
      toast.push({ message: t('dist.exported'), tone: 'success' })
      return true
    } catch (error) {
      console.error('Export failed', error)
      toast.push({ title: t('dist.exportError'), tone: 'error' })
      return false
    }
  }

  const rename = async (distributor: Distributor) => {
    const next = await dialog.prompt({
      title: t('dist.renameTitle'),
      label: t('dist.renameLabel'),
      initialValue: distributor.name,
      placeholder: t('dist.namePlaceholder'),
      confirmLabel: t('common.save'),
      validate: (value) => {
        if (!value) return t('dialog.required')
        const duplicate = distributors.some(
          (item) =>
            item.id !== distributor.id &&
            !item.archived &&
            item.name.toLowerCase() === value.toLowerCase(),
        )
        return duplicate ? t('dist.nameExists') : null
      },
    })
    if (!next) return false
    const ok = renameDistributor(distributor.id, next)
    if (!ok) {
      toast.push({ title: t('dist.nameExists'), tone: 'error' })
      return false
    }
    toast.push({ message: t('dist.renamed'), tone: 'success' })
    return true
  }

  const archive = async (distributor: Distributor) => {
    const confirmed = await dialog.confirm({
      title: t('dist.archiveTitle'),
      message: t('dist.archiveMsg', { name: distributor.name }),
      confirmLabel: t('common.archive'),
      tone: 'warning',
    })
    if (!confirmed) return false
    await archiveDistributor(distributor.id)
    toast.push({ message: t('dist.archivedToast'), tone: 'success' })
    return true
  }

  const restore = async (distributor: Distributor) => {
    await restoreDistributor(distributor.id)
    toast.push({ message: t('dist.restored'), tone: 'success' })
    return true
  }

  const remove = async (distributor: Distributor) => {
    const count = codes.filter((code) => code.distributorId === distributor.id).length
    const confirmed = await dialog.confirm({
      title: t('dist.deleteTitle'),
      message: t('dist.deleteMsg', { name: distributor.name, count }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!confirmed) return false
    const snapshot = await deleteDistributor(distributor.id)
    if (!snapshot) return false
    toast.push({
      message: t('dist.deleted'),
      tone: 'warning',
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () => {
          void restoreDistributorSnapshot(snapshot).then(() => {
            toast.push({ message: t('dist.restored'), tone: 'success' })
          })
        },
      },
    })
    return true
  }

  return { resume, exportExcel, rename, archive, restore, remove }
}
