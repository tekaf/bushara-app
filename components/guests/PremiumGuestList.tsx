'use client'

import { formatDistanceToNow } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { ArrowDownUp, Search } from 'lucide-react'

export type PremiumGuestRow = {
  id: string
  name: string
  phoneLocal: string
  status: 'pending' | 'sent' | 'accepted' | 'declined'
  lastSendAt?: string | null
  sendAttemptCount?: number
  lastActivityAt?: string | null
}

const STATUS_STYLES: Record<PremiumGuestRow['status'], { label: string; className: string }> = {
  pending: { label: 'بانتظار الرد', className: 'bg-amber-50 text-amber-800 border-amber-100' },
  sent: { label: 'تم الإرسال', className: 'bg-sky-50 text-sky-800 border-sky-100' },
  accepted: { label: 'أكد الحضور', className: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
  declined: { label: 'اعتذر', className: 'bg-rose-50 text-rose-800 border-rose-100' },
}

function formatRelativeTime(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  return formatDistanceToNow(date, { addSuffix: true, locale: arSA })
}

export default function PremiumGuestList({
  rows,
  loading,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortChange,
  stats,
  editingId,
  editName,
  editPhone,
  onEditNameChange,
  onEditPhoneChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  rows: PremiumGuestRow[]
  loading?: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: 'all' | PremiumGuestRow['status']
  onStatusFilterChange: (value: 'all' | PremiumGuestRow['status']) => void
  sortBy: 'status' | 'name' | 'recent'
  onSortChange: (value: 'status' | 'name' | 'recent') => void
  stats: { total: number; accepted: number; declined: number; pending: number; sent: number }
  editingId: string
  editName: string
  editPhone: string
  onEditNameChange: (v: string) => void
  onEditPhoneChange: (v: string) => void
  onStartEdit: (row: PremiumGuestRow) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
}) {
  const filters: Array<{ key: 'all' | PremiumGuestRow['status']; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'pending', label: 'بانتظار' },
    { key: 'sent', label: 'مُرسل' },
    { key: 'accepted', label: 'حضور' },
    { key: 'declined', label: 'اعتذار' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="الإجمالي" value={stats.total} />
        <StatCard label="حضور" value={stats.accepted} tone="text-emerald-700" />
        <StatCard label="اعتذار" value={stats.declined} tone="text-rose-700" />
        <StatCard label="بانتظار" value={stats.pending} tone="text-amber-700" />
        <StatCard label="مُرسل" value={stats.sent} tone="text-sky-700" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[#EBEBF3] bg-[#FAFAFC] p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الجوال"
            className="w-full rounded-xl border border-[#E4E4EC] bg-white py-2.5 pe-10 ps-4 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onStatusFilterChange(f.key)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                statusFilter === f.key
                  ? 'bg-[#1A1A24] text-white'
                  : 'border border-[#E4E4EC] bg-white text-textDark hover:border-primary/20',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as 'status' | 'name' | 'recent')}
            className="rounded-lg border border-[#E4E4EC] bg-white px-2 py-1.5 text-xs text-textDark outline-none"
          >
            <option value="recent">الأحدث نشاطًا</option>
            <option value="status">حسب الحالة</option>
            <option value="name">حسب الاسم</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[#E4E4EC] py-16 text-center text-sm text-muted">
          جاري تحميل المدعوين...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E4E4EC] py-16 text-center text-sm text-muted">
          لا يوجد مدعوون مطابقون. ابدأ بإضافة قائمة الضيوف.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-[#EBEBF3] bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F6] bg-[#FAFAFC] text-xs text-muted">
                  <th className="px-4 py-3 text-right font-semibold">الضيف</th>
                  <th className="px-4 py-3 text-right font-semibold">الجوال</th>
                  <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold">تاريخ الإرسال</th>
                  <th className="px-4 py-3 text-right font-semibold">مرات الإرسال</th>
                  <th className="px-4 py-3 text-right font-semibold">آخر نشاط</th>
                  <th className="px-4 py-3 text-right font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <GuestTableRow
                    key={row.id}
                    row={row}
                    editingId={editingId}
                    editName={editName}
                    editPhone={editPhone}
                    onEditNameChange={onEditNameChange}
                    onEditPhoneChange={onEditPhoneChange}
                    onStartEdit={onStartEdit}
                    onSaveEdit={onSaveEdit}
                    onCancelEdit={onCancelEdit}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <GuestMobileCard
                key={row.id}
                row={row}
                editingId={editingId}
                editName={editName}
                editPhone={editPhone}
                onEditNameChange={onEditNameChange}
                onEditPhoneChange={onEditPhoneChange}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, tone = 'text-textDark' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#EBEBF3] bg-white px-3 py-2.5 text-center">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}

function GuestTableRow({
  row,
  editingId,
  editName,
  editPhone,
  onEditNameChange,
  onEditPhoneChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  row: PremiumGuestRow
  editingId: string
  editName: string
  editPhone: string
  onEditNameChange: (v: string) => void
  onEditPhoneChange: (v: string) => void
  onStartEdit: (row: PremiumGuestRow) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
}) {
  const status = STATUS_STYLES[row.status]
  const isEditing = editingId === row.id

  if (isEditing) {
    return (
      <tr className="border-b border-[#F5F5FA] bg-[#FAFAFC]">
        <td colSpan={7} className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="الاسم"
            />
            <input
              value={editPhone}
              onChange={(e) => onEditPhoneChange(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="الجوال"
            />
            <button type="button" onClick={onSaveEdit} className="rounded-lg bg-primary px-3 py-2 text-sm text-white">
              حفظ
            </button>
            <button type="button" onClick={onCancelEdit} className="rounded-lg border px-3 py-2 text-sm">
              إلغاء
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-[#F5F5FA] transition hover:bg-[#FAFAFC]/80">
      <td className="px-4 py-3.5 font-semibold text-textDark">{row.name || '—'}</td>
      <td className="px-4 py-3.5 text-muted" dir="ltr">
        {row.phoneLocal}
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3.5 text-muted">{formatRelativeTime(row.lastSendAt)}</td>
      <td className="px-4 py-3.5 text-muted">{row.sendAttemptCount ?? 0}</td>
      <td className="px-4 py-3.5 text-muted">{formatRelativeTime(row.lastActivityAt)}</td>
      <td className="px-4 py-3.5">
        <div className="flex gap-2">
          <button type="button" onClick={() => onStartEdit(row)} className="text-xs font-semibold text-primary">
            تعديل
          </button>
          {row.status === 'declined' ? (
            <button type="button" onClick={() => onDelete(row.id)} className="text-xs font-semibold text-rose-600">
              حذف
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

function GuestMobileCard({
  row,
  editingId,
  editName,
  editPhone,
  onEditNameChange,
  onEditPhoneChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  row: PremiumGuestRow
  editingId: string
  editName: string
  editPhone: string
  onEditNameChange: (v: string) => void
  onEditPhoneChange: (v: string) => void
  onStartEdit: (row: PremiumGuestRow) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
}) {
  const status = STATUS_STYLES[row.status]
  const isEditing = editingId === row.id

  return (
    <article className="rounded-2xl border border-[#EBEBF3] bg-white p-4 shadow-sm">
      {isEditing ? (
        <div className="space-y-2">
          <input value={editName} onChange={(e) => onEditNameChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input value={editPhone} onChange={(e) => onEditPhoneChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={onSaveEdit} className="rounded-lg bg-primary px-3 py-2 text-sm text-white">
              حفظ
            </button>
            <button type="button" onClick={onCancelEdit} className="rounded-lg border px-3 py-2 text-sm">
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-textDark">{row.name || 'بدون اسم'}</p>
              <p className="text-sm text-muted" dir="ltr">
                {row.phoneLocal}
              </p>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
              {status.label}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
            <div>
              <dt>آخر إرسال</dt>
              <dd className="font-medium text-textDark">{formatRelativeTime(row.lastSendAt)}</dd>
            </div>
            <div>
              <dt>آخر نشاط</dt>
              <dd className="font-medium text-textDark">{formatRelativeTime(row.lastActivityAt)}</dd>
            </div>
            <div>
              <dt>مرات الإرسال</dt>
              <dd className="font-medium text-textDark">{row.sendAttemptCount ?? 0}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => onStartEdit(row)} className="text-xs font-semibold text-primary">
              تعديل
            </button>
            {row.status === 'declined' ? (
              <button type="button" onClick={() => onDelete(row.id)} className="text-xs font-semibold text-rose-600">
                حذف
              </button>
            ) : null}
          </div>
        </>
      )}
    </article>
  )
}
