import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import {
  apiResearchList,
  apiResearchAnalytics,
  apiResearchAdvisers,
  apiResearchAuthorSuggestions,
  apiResearchCreate,
  apiResearchPatch,
  apiResearchUploadPdf,
  apiResearchFacultyReview,
  apiResearchFinalApproval,
  apiResearchDownloadBlob,
  apiResearchDelete,
} from '../lib/api'
import { getCurrentRole, hasPermission, PERMISSIONS } from '../lib/security'

const STATUS_LABELS = {
  draft: 'Draft',
  under_faculty_review: 'Faculty review',
  pending_approval: 'Chair / Dean',
  published: 'Published',
  rejected: 'Rejected',
}

const RESEARCH_TYPES = [
  { value: 'thesis', label: 'Thesis' },
  { value: 'capstone', label: 'Capstone' },
  { value: 'faculty_research', label: 'Faculty research' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_HINTS = ['AI', 'Web Dev', 'Data Science', 'Networking', 'Security', 'Mobile', 'HCI', 'General']

function CrIconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function CrIconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function CrIconDetails({ expanded }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? (
        <polyline points="18 15 12 9 6 15" />
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </>
      )}
    </svg>
  )
}

function CrIconPdf() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="m9 15 3 3 3-3" />
    </svg>
  )
}

function CrIconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function roleLabel(role) {
  if (role === 'department_chair') return 'Chair'
  if (role === 'faculty_professor') return 'Professor'
  return role || ''
}

function getAdminLoginIdentifier() {
  try {
    const raw = localStorage.getItem('authUser')
    const u = raw ? JSON.parse(raw) : null
    return (u?.identifier || '').trim() || null
  } catch {
    return null
  }
}

const MIN_TITLE_LEN = 3
const MIN_ABSTRACT_LEN = 20

export default function CollegeResearch() {
  const token = localStorage.getItem('authToken')
  const role = getCurrentRole()

  const canCreate = hasPermission(PERMISSIONS.DOC_CREATE)
  const canReviewAsAdviser =
    hasPermission(PERMISSIONS.DOC_APPROVE) &&
    ['faculty', 'faculty_professor'].includes(role || '')
  const canFinalApprove = ['dean', 'department_chair', 'admin'].includes(role || '')
  const canSeeAllPipeline = role === 'admin' || role === 'secretary'
  const canDelete = role === 'admin'

  const [tab, setTab] = useState('repository')
  const [items, setItems] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [analyticsScope, setAnalyticsScope] = useState(null)
  const [advisers, setAdvisers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const [yearFilter, setYearFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [keywordFilter, setKeywordFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [appliedLibraryFilters, setAppliedLibraryFilters] = useState({
    year: '',
    course: '',
    keyword: '',
    author: '',
  })

  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [pendingSubmitMode, setPendingSubmitMode] = useState(null) // 'draft' | 'submit'
  const [form, setForm] = useState({
    title: '',
    abstract: '',
    year: new Date().getFullYear(),
    course: 'CS',
    category: '',
    researchType: 'capstone',
    keywords: '',
    adviserFacultyId: '',
    requireApproval: false,
    publishDirect: false,
    coAuthorIds: [],
    file: null,
  })

  const [authorQuery, setAuthorQuery] = useState('')
  const [authorHits, setAuthorHits] = useState([])
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false)
  const [authorSearching, setAuthorSearching] = useState(false)
  const [coAuthorLabels, setCoAuthorLabels] = useState({})
  const coAuthorComboboxRef = useRef(null)

  const [expandedId, setExpandedId] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [pdfDraftPick, setPdfDraftPick] = useState({})
  const [repoViewMode, setRepoViewMode] = useState('list')
  const [deleteTarget, setDeleteTarget] = useState(null)



  const loadList = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const scope =
        tab === 'library'
          ? 'repository'
          : tab === 'mine'
            ? 'mine'
            : tab === 'adviser'
              ? 'adviser_review'
              : tab === 'approval'
                ? 'pending_approval'
                : tab === 'all'
                  ? 'all'
                  : 'repository'

      const query = { scope }
      if (appliedLibraryFilters.year) query.year = appliedLibraryFilters.year
      if (appliedLibraryFilters.course) query.course = appliedLibraryFilters.course
      if (appliedLibraryFilters.keyword) query.keyword = appliedLibraryFilters.keyword
      if (appliedLibraryFilters.author) query.author = appliedLibraryFilters.author

      const res = await apiResearchList(token, query)
      setItems(res.items || [])
    } catch (e) {
      setError(e.message || 'Failed to load research')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [token, tab, appliedLibraryFilters])

  const loadAnalytics = useCallback(async () => {
    if (!token || tab !== 'analytics') return
    setLoading(true)
    setError(null)
    try {
      const res = await apiResearchAnalytics(token)
      setAnalytics(res.analytics || null)
      setAnalyticsScope(res.scope || null)
    } catch (e) {
      setError(e.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  useEffect(() => {
    if (tab === 'analytics') loadAnalytics()
    else loadList()
  }, [tab, loadList, loadAnalytics])

  useEffect(() => {
    if (!token || !showForm) return
    ;(async () => {
      try {
        const res = await apiResearchAdvisers(token)
        setAdvisers(res.advisers || [])
      } catch {
        setAdvisers([])
      }
    })()
  }, [token, showForm])

  useEffect(() => {
    if (!authorDropdownOpen || !token || !showForm) {
      return
    }
    let cancelled = false
    const delay = authorQuery.trim().length >= 2 ? 220 : 0
    setAuthorSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiResearchAuthorSuggestions(token, authorQuery.trim(), 55, form.course)
        if (cancelled) return
        const picked = new Set(form.coAuthorIds.map(Number))
        const users = (res.users || []).filter((u) => !picked.has(Number(u.id)))
        setAuthorHits(users)
      } catch {
        if (!cancelled) setAuthorHits([])
      } finally {
        if (!cancelled) setAuthorSearching(false)
      }
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [authorQuery, authorDropdownOpen, token, showForm, form.coAuthorIds, form.course])

  useEffect(() => {
    if (!authorDropdownOpen) return
    function handlePointerDown(e) {
      if (coAuthorComboboxRef.current && !coAuthorComboboxRef.current.contains(e.target)) {
        setAuthorDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [authorDropdownOpen])

  useEffect(() => {
    if (!showSubmitConfirm) return
    function onKey(e) {
      if (e.key === 'Escape') {
        setShowSubmitConfirm(false)
        setPendingSubmitMode(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSubmitConfirm])

  const yearValid = useMemo(() => {
    const y = Number(form.year)
    return Number.isFinite(y) && y >= 1990 && y <= 2100
  }, [form.year])

  const isDraftValid = useMemo(() => {
    if (!yearValid) return false
    if (form.title.trim().length < MIN_TITLE_LEN) return false
    if (form.abstract.trim().length < MIN_ABSTRACT_LEN) return false
    return true
  }, [form.title, form.abstract, yearValid])

  const isSubmitValid = useMemo(() => {
    if (!isDraftValid) return false
    if (role === 'student' && !String(form.adviserFacultyId).trim()) return false
    if (!form.file) return false
    const name = String(form.file.name || '').toLowerCase()
    const type = form.file.type || ''
    if (type !== 'application/pdf' && !name.endsWith('.pdf')) return false
    return true
  }, [isDraftValid, role, form.adviserFacultyId, form.file])

  const tabs = useMemo(() => {
    const t = [{ id: 'library', label: 'Library' }]
    t.push({ id: 'mine', label: 'My submissions' })
    if (canReviewAsAdviser) t.push({ id: 'adviser', label: 'Adviser review' })
    if (canFinalApprove) t.push({ id: 'approval', label: 'Final approval' })
    if (canSeeAllPipeline) t.push({ id: 'all', label: 'All records' })
    t.push({ id: 'analytics', label: 'Analytics' })
    return t
  }, [canReviewAsAdviser, canFinalApprove, canSeeAllPipeline])

  async function performCreate(isDraft) {
    if (!token) return
    setSubmitting(true)
    setError(null)
    setShowSubmitConfirm(false)
    setPendingSubmitMode(null)
    try {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('abstract', form.abstract.trim())
      fd.append('year', String(form.year))
      fd.append('course', form.course)
      fd.append('category', form.category.trim())
      fd.append('researchType', form.researchType)
      const kw = form.keywords
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      fd.append('keywords', JSON.stringify(kw))
      if (form.adviserFacultyId) fd.append('adviserFacultyId', String(form.adviserFacultyId))
      fd.append('coAuthorUserIds', JSON.stringify(form.coAuthorIds))
      fd.append('status', isDraft ? 'draft' : 'submitted')
      if (role === 'secretary') {
        fd.append('requireApproval', form.requireApproval ? 'true' : 'false')
      }
      if (role === 'admin') {
        fd.append('publishDirect', form.publishDirect ? 'true' : 'false')
      }
      if (form.file) fd.append('file', form.file)

      await apiResearchCreate(token, fd)
      setShowForm(false)
      setAuthorQuery('')
      setAuthorHits([])
      setCoAuthorLabels({})
      setForm({
        title: '',
        abstract: '',
        year: new Date().getFullYear(),
        course: 'CS',
        category: '',
        researchType: 'capstone',
        keywords: '',
        adviserFacultyId: '',
        requireApproval: false,
        publishDirect: false,
        coAuthorIds: [],
        file: null,
      })
      await loadList()
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setSubmitting(false)
    }
  }

  function requestSubmit(mode) {
    if (mode === 'draft' && !isDraftValid) return
    if (mode === 'submit' && !isSubmitValid) return
    setPendingSubmitMode(mode)
    setShowSubmitConfirm(true)
  }

  function confirmPendingSubmit() {
    if (pendingSubmitMode === 'draft') void performCreate(true)
    else if (pendingSubmitMode === 'submit') void performCreate(false)
  }

  function addCoAuthor(u) {
    const id = Number(u.id)
    if (!Number.isFinite(id)) return
    setForm((f) => ({
      ...f,
      coAuthorIds: f.coAuthorIds.includes(id) ? f.coAuthorIds : [...f.coAuthorIds, id],
    }))
    setCoAuthorLabels((prev) => ({ ...prev, [id]: u.displayName }))
    setAuthorQuery('')
    setAuthorHits((h) => h.filter((x) => Number(x.id) !== id))
  }

  function removeCoAuthor(id) {
    setForm((f) => ({ ...f, coAuthorIds: f.coAuthorIds.filter((x) => x !== id) }))
    setCoAuthorLabels((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function downloadPdf(id, name) {
    if (!token) return
    try {
      const blob = await apiResearchDownloadBlob(token, id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (name || 'research').replace(/[^\w.-]+/g, '_') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || 'Download failed')
    }
  }

  async function runFacultyReview(id, action) {
    if (!token) return
    try {
      await apiResearchFacultyReview(token, id, { action, comments: reviewNote })
      setReviewNote('')
      setExpandedId(null)
      await loadList()
    } catch (e) {
      setError(e.message || 'Action failed')
    }
  }

  async function runFinal(id, action) {
    if (!token) return
    try {
      await apiResearchFinalApproval(token, id, { action, comments: reviewNote })
      setReviewNote('')
      setExpandedId(null)
      setSuccessMsg(action === 'approve' ? 'Research published successfully!' : 'Research rejected.')
      await loadList()
    } catch (e) {
      setError(e.message || 'Action failed')
    }
  }

  async function resubmitRow(id) {
    if (!token) return
    try {
      await apiResearchPatch(token, id, { status: 'resubmit' })
      setExpandedId(null)
      await loadList()
    } catch (e) {
      setError(e.message || 'Resubmit failed')
    }
  }

  async function submitDraftRow(id) {
    if (!token) return
    try {
      await apiResearchPatch(token, id, { status: 'submitted' })
      setExpandedId(null)
      await loadList()
    } catch (e) {
      setError(e.message || 'Submit failed')
    }
  }

  async function uploadDraftPdf(rowId) {
    const file = pdfDraftPick[rowId]
    if (!token || !file) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      await apiResearchUploadPdf(token, rowId, fd)
      setPdfDraftPick((p) => ({ ...p, [rowId]: null }))
      await loadList()
    } catch (e) {
      setError(e.message || 'PDF upload failed')
    }
  }

  function canAttachPdfClient(row) {
    if (!['draft', 'rejected'].includes(row.status)) return false
    if (role === 'admin' || role === 'secretary') return true
    try {
      const n = Number(JSON.parse(localStorage.getItem('authUser') || 'null')?.id)
      return Number.isFinite(n) && n === row.created_by_user_id
    } catch {
      return false
    }
  }

  function openDeleteConfirm(row) {
    if (!token || !canDelete) return
    setDeleteTarget(row)
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
  }

  async function confirmDeleteResearch() {
    if (!token || !canDelete || !deleteTarget) return

    try {
      await apiResearchDelete(token, deleteTarget.id)
      closeDeleteModal()
      setExpandedId((cur) => (cur === deleteTarget.id ? null : cur))
      await loadList()
    } catch (e) {
      throw new Error(e.message || 'Delete failed')
    }
  }



  function researchDetailBlock(row) {
    return (
      <div className="college-research-detail">
        {row.repository_ref || row.submission_ref ? (
          <p>
            <strong>ID No.:</strong>{' '}
            <span className="college-research-repo-ref">{row.repository_ref || row.submission_ref}</span>
          </p>
        ) : null}
        <p>
          <strong>Abstract:</strong> {row.abstract || '—'}
        </p>
        <p>
          <strong>Adviser:</strong> {row.adviser_name || '—'}
        </p>
        <p>
          <strong>Keywords:</strong>{' '}
          {Array.isArray(row.keywords) && row.keywords.length ? row.keywords.join(', ') : '—'}
        </p>
        <p>
          <strong>Authors:</strong>{' '}
          {Array.isArray(row.authors)
            ? row.authors.map((a) => `${a.display_name}${a.user_id ? ` (#${a.user_id})` : ''}`).join('; ')
            : '—'}
        </p>
        {canAttachPdfClient(row) ? (
          <div className="college-research-draft-pdf">
            <strong>PDF:</strong>{' '}
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) =>
                setPdfDraftPick((p) => ({
                  ...p,
                  [row.id]: e.target.files?.[0] || null,
                }))
              }
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!pdfDraftPick[row.id]}
              onClick={() => uploadDraftPdf(row.id)}
            >
              Upload / replace PDF
            </button>
            {row.status === 'draft' ? (
              <button type="button" className="btn btn-primary" onClick={() => submitDraftRow(row.id)}>
                Submit for review
              </button>
            ) : null}
          </div>
        ) : null}
        {row.status === 'rejected' &&
        (() => {
          try {
            const n = Number(JSON.parse(localStorage.getItem('authUser') || 'null')?.id)
            return Number.isFinite(n) && n === row.created_by_user_id
          } catch {
            return false
          }
        })() ? (
          <div className="college-research-review-actions">
            <button type="button" className="btn btn-primary" onClick={() => resubmitRow(row.id)}>
              Resubmit for review
            </button>
          </div>
        ) : null}
        {(canReviewAsAdviser && row.status === 'under_faculty_review') ||
        (canFinalApprove && row.status === 'pending_approval') ? (
          <div className="college-research-review-box">
            <textarea
              className="search-input college-research-textarea"
              rows={2}
              placeholder="Optional comments"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            {canReviewAsAdviser && row.status === 'under_faculty_review' ? (
              <div className="college-research-review-actions">
                <button type="button" className="btn btn-primary" onClick={() => runFacultyReview(row.id, 'approve')}>
                  Forward to Chair/Dean
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => runFacultyReview(row.id, 'reject')}>
                  Reject
                </button>
              </div>
            ) : null}
            {canFinalApprove && row.status === 'pending_approval' ? (
              <div className="college-research-review-actions">
                <button type="button" className="btn btn-primary" onClick={() => runFinal(row.id, 'approve')}>
                  Publish
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => runFinal(row.id, 'reject')}>
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="module-page college-research-page">
      <div className="w-full space-y-6">
        <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center admin-student-list-header-enter">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">College Research</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Central library for CCS theses, capstones, and faculty research. Linked authors connect to student and
              faculty profiles in the system.
            </p>
          </div>
          <div className="header-actions college-research-header-actions">
            {canCreate ? (
              <button
                type="button"
                className={`mt-4 md:mt-0 font-medium transition-all duration-300 text-sm px-6 py-2.5 rounded-full hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] ${
                  showForm ? 'college-research-header-btn-secondary' : ''
                }`}
                style={
                  showForm
                    ? undefined
                    : { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent-soft)' }
                }
                onClick={() => {
                  setShowForm((s) => !s)
                  setShowSubmitConfirm(false)
                  setPendingSubmitMode(null)
                }}
              >
                {showForm ? 'Close form' : '+ New record'}
              </button>
            ) : null}
          </div>
        </header>

      <div className="college-research-tabs-bar">
        <div className="college-research-tabs" role="tablist" aria-label="Research views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`college-research-tab${tab === t.id ? ' college-research-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'analytics' ? (
          <div className="college-research-tabs-view-toggle" aria-label="Record layout">
            <button
              type="button"
              className={`btn btn-compact college-research-view-toggle-btn ${repoViewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              title="List view"
              aria-label="List view"
              aria-pressed={repoViewMode === 'list'}
              onClick={() => setRepoViewMode('list')}
            >
              <CrIconList />
            </button>
            <button
              type="button"
              className={`btn btn-compact college-research-view-toggle-btn ${repoViewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={repoViewMode === 'grid'}
              onClick={() => setRepoViewMode('grid')}
            >
              <CrIconGrid />
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="college-research-banner" role="alert">
          {error}
          <button type="button" className="btn btn-secondary college-research-banner-dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {successMsg ? (
        <div className="college-research-banner college-research-banner-success" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {successMsg}
          <button type="button" className="btn btn-secondary college-research-banner-dismiss" onClick={() => setSuccessMsg(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {showForm && canCreate ? (
        <section className="content-panel college-research-form-panel college-research-form-panel-relative">
          <h3 className="content-title">New research record</h3>
          <p className="college-research-form-hint">
            Draft: title ({MIN_TITLE_LEN}+ chars), abstract ({MIN_ABSTRACT_LEN}+ chars), and a valid year. Submit: also PDF, and an adviser if you are a student.
          </p>
          <form
            className="college-research-form"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            {submitting ? (
              <div className="college-research-form-loading" aria-busy="true" role="status">
                <div className="college-research-spinner" />
                <span>Saving your record…</span>
              </div>
            ) : null}

            <div className="college-research-form-grid">
              <div className="college-research-form-section college-research-span-2">
                <h4 className="college-research-section-label">Basic information</h4>
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-title">
                  Title <span className="college-research-req">*</span>
                </label>
                <input
                  id="cr-title"
                  className="search-input college-research-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={`At least ${MIN_TITLE_LEN} characters`}
                  autoComplete="off"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="cr-year">
                  Year <span className="college-research-req">*</span>
                </label>
                <input
                  id="cr-year"
                  type="number"
                  className="search-input college-research-input"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                  min={1990}
                  max={2100}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="cr-course">
                  Course <span className="college-research-req">*</span>
                </label>
                <select
                  id="cr-course"
                  className="search-input college-research-input"
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                >
                  <option value="CS">CS</option>
                  <option value="IT">IT</option>
                </select>
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-type">
                  Type <span className="college-research-req">*</span>
                </label>
                <select
                  id="cr-type"
                  className="search-input college-research-input"
                  value={form.researchType}
                  onChange={(e) => setForm({ ...form, researchType: e.target.value })}
                >
                  {RESEARCH_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="college-research-form-section college-research-span-2">
                <h4 className="college-research-section-label">Research details</h4>
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-category">
                  Category
                </label>
                <input
                  id="cr-category"
                  className="search-input college-research-input"
                  list="research-category-hints"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. AI, Web Dev"
                />
                <datalist id="research-category-hints">
                  {CATEGORY_HINTS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-abstract">
                  Abstract <span className="college-research-req">*</span>
                </label>
                <textarea
                  id="cr-abstract"
                  className="search-input college-research-textarea"
                  rows={5}
                  value={form.abstract}
                  onChange={(e) => setForm({ ...form, abstract: e.target.value })}
                  placeholder={`At least ${MIN_ABSTRACT_LEN} characters`}
                />
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-keywords">
                  Keywords (comma-separated)
                </label>
                <input
                  id="cr-keywords"
                  className="search-input college-research-input"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="machine learning, react, …"
                />
              </div>

              <div className="college-research-form-section college-research-span-2">
                <h4 className="college-research-section-label">Authors &amp; adviser</h4>
              </div>
              {role === 'student' ? (
                <div className="auth-field college-research-span-2">
                  <label className="auth-label" htmlFor="cr-adviser">
                    Adviser (faculty) <span className="college-research-req">*</span>
                  </label>
                  <select
                    id="cr-adviser"
                    className="search-input college-research-input"
                    value={form.adviserFacultyId}
                    onChange={(e) => setForm({ ...form, adviserFacultyId: e.target.value })}
                  >
                    <option value="">Select adviser…</option>
                    {advisers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} ({roleLabel(a.role)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="auth-field college-research-span-2">
                  <label className="auth-label" htmlFor="cr-adviser-opt">
                    Adviser (optional)
                  </label>
                  <select
                    id="cr-adviser-opt"
                    className="search-input college-research-input"
                    value={form.adviserFacultyId}
                    onChange={(e) => setForm({ ...form, adviserFacultyId: e.target.value })}
                  >
                    <option value="">None</option>
                    {advisers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-coauthor-input">
                  Co-authors
                </label>
                <div className="college-research-combobox" ref={coAuthorComboboxRef}>
                  <input
                    id="cr-coauthor-input"
                    type="text"
                    role="combobox"
                    aria-expanded={authorDropdownOpen}
                    aria-controls="cr-coauthor-listbox"
                    aria-autocomplete="list"
                    className="search-input college-research-input college-research-combobox-input"
                    value={authorQuery}
                    onChange={(e) => setAuthorQuery(e.target.value)}
                    onFocus={() => setAuthorDropdownOpen(true)}
                    placeholder="Click to see users, or type to filter…"
                    autoComplete="off"
                  />
                  {authorDropdownOpen ? (
                    <ul id="cr-coauthor-listbox" role="listbox" className="college-research-autocomplete-menu">
                      {authorSearching ? (
                        <li className="college-research-autocomplete-status" role="presentation">
                          Loading users…
                        </li>
                      ) : authorHits.length === 0 ? (
                        <li className="college-research-autocomplete-status" role="presentation">
                          No matches. Try another name or ID.
                        </li>
                      ) : (
                        authorHits.map((u) => (
                          <li key={u.id} role="option">
                            <button type="button" className="college-research-suggest-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => addCoAuthor(u)}>
                              {u.displayName}
                              <span className="college-research-suggest-meta">
                                {' '}
                                ({roleLabel(u.role)}
                                {u.studentId ? ` · ${u.studentId}` : ''})
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
                <div className="college-research-chips">
                  {form.coAuthorIds.map((id) => (
                    <span key={id} className="college-research-chip">
                      {coAuthorLabels[id] || `User ${id}`}
                      <button type="button" aria-label="Remove co-author" onClick={() => removeCoAuthor(id)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="college-research-form-section college-research-span-2">
                <h4 className="college-research-section-label">File upload</h4>
              </div>
              <div className="auth-field college-research-span-2">
                <label className="auth-label" htmlFor="cr-pdf">
                  PDF <span className="college-research-req">*</span> <span className="college-research-muted">(required for submit; optional for draft)</span>
                </label>
                <input
                  id="cr-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="college-research-file"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                />
              </div>
              {role === 'secretary' ? (
                <label className="college-research-check college-research-span-2">
                  <input
                    type="checkbox"
                    checked={form.requireApproval}
                    onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })}
                  />
                  Route through Chair/Dean approval instead of publishing immediately
                </label>
              ) : null}
              {role === 'admin' ? (
                <label className="college-research-check college-research-span-2">
                  <input
                    type="checkbox"
                    checked={form.publishDirect}
                    onChange={(e) => setForm({ ...form, publishDirect: e.target.checked })}
                  />
                  Publish immediately (skip approval pipeline)
                </label>
              ) : null}
            </div>
            <div className="college-research-form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submitting || !isDraftValid}
                onClick={() => requestSubmit('draft')}
                title={!isDraftValid ? 'Complete required fields first' : ''}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || !isSubmitValid}
                onClick={() => requestSubmit('submit')}
                title={!isSubmitValid ? 'Complete all required fields and attach a PDF' : ''}
              >
                Submit for review
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showSubmitConfirm && pendingSubmitMode ? (
        <div className="modal-overlay college-research-modal-overlay" role="presentation">
          <div className="modal-card college-research-confirm-card" role="dialog" aria-modal="true" aria-labelledby="cr-confirm-title">
            <h3 id="cr-confirm-title" className="modal-title">
              {pendingSubmitMode === 'draft' ? 'Save draft?' : 'Submit for review?'}
            </h3>
            <div className="college-research-confirm-body">
              <p>
                <strong>Title:</strong> {form.title.trim() || '—'}
              </p>
              <p>
                <strong>Year / course:</strong> {form.year} · {form.course}
              </p>
              <p>
                <strong>Type:</strong> {RESEARCH_TYPES.find((t) => t.value === form.researchType)?.label || form.researchType}
              </p>
              {form.adviserFacultyId ? (
                <p>
                  <strong>Adviser:</strong>{' '}
                  {advisers.find((a) => String(a.id) === String(form.adviserFacultyId))?.displayName || 'Selected'}
                </p>
              ) : null}
              <p>
                <strong>Co-authors:</strong>{' '}
                {form.coAuthorIds.length
                  ? form.coAuthorIds.map((id) => coAuthorLabels[id] || `#${id}`).join(', ')
                  : 'None'}
              </p>
              <p>
                <strong>PDF:</strong> {form.file ? form.file.name : pendingSubmitMode === 'draft' ? 'None (draft)' : '—'}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submitting}
                onClick={() => {
                  setShowSubmitConfirm(false)
                  setPendingSubmitMode(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={confirmPendingSubmit}>
                {submitting ? 'Working…' : pendingSubmitMode === 'draft' ? 'Yes, save draft' : 'Yes, submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Delete research record?"
          description={
            <p className="leading-relaxed">
              This permanently removes{' '}
              <span className="font-semibold text-[var(--text)]">
                {deleteTarget.title}
              </span>{' '}
              and its PDF from the library. This cannot be undone. Enter your administrator password to confirm.
            </p>
          }
          confirmLabel="Confirm Deletion"
          adminIdentifier={getAdminLoginIdentifier()}
          onConfirm={confirmDeleteResearch}
          onClose={closeDeleteModal}
        />
      )}

      {tab !== 'analytics' ? (
        <section className="content-panel">
          <div className="college-research-filters">
            <input
              className="search-input college-research-input"
              placeholder="Keyword (title, abstract, keywords)"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            />
            <input
              className="search-input college-research-input"
              placeholder="Author / adviser name"
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
            />
            <input
              type="number"
              className="search-input college-research-input"
              placeholder="Year"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
            <select
              className="search-input college-research-input"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="">All courses</option>
              <option value="CS">CS</option>
              <option value="IT">IT</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setAppliedLibraryFilters({
                  year: yearFilter,
                  course: courseFilter,
                  keyword: keywordFilter,
                  author: authorFilter,
                })
              }
            >
              Apply filters
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'analytics' ? (
        <section className="content-panel college-research-analytics">
          {loading ? (
            <div className="college-research-page-loading" role="status">
              <div className="college-research-spinner college-research-spinner-lg" />
              <span>Loading analytics…</span>
            </div>
          ) : analytics ? (
            <>
              <p className="college-research-analytics-note">
                {analyticsScope === 'full'
                  ? 'Full analytics (Dean / Chair / Admin).'
                  : 'Summary counts from published works. Request elevated access for productivity metrics.'}
              </p>
              <div className="college-research-stat-grid">
                <div className="college-research-stat-card">
                  <span className="college-research-stat-value">{analytics.totalPublished ?? '—'}</span>
                  <span className="college-research-stat-label">Published works</span>
                </div>
                {analytics.byStatus && (
                  <div className="college-research-stat-card college-research-stat-wide">
                    <span className="college-research-stat-label">By workflow status</span>
                    <ul className="college-research-mini-list">
                      {Object.entries(analytics.byStatus).map(([k, v]) => (
                        <li key={k}>
                          {STATUS_LABELS[k] || k}: <strong>{v}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {analytics.byYear && (
                <div className="college-research-block">
                  <h4 className="college-research-block-title">Published per year</h4>
                  <ul className="college-research-mini-list">
                    {Object.entries(analytics.byYear)
                      .sort((a, b) => Number(b[0]) - Number(a[0]))
                      .map(([y, c]) => (
                        <li key={y}>
                          {y}: <strong>{c}</strong>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {analytics.byCategory && (
                <div className="college-research-block">
                  <h4 className="college-research-block-title">Categories (published)</h4>
                  <ul className="college-research-mini-list">
                    {Object.entries(analytics.byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, c]) => (
                        <li key={cat}>
                          {cat}: <strong>{c}</strong>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {analytics.mostActiveFaculty?.length > 0 ? (
                <div className="college-research-block">
                  <h4 className="college-research-block-title">Most active faculty (adviser + author credits)</h4>
                  <ol className="college-research-ordered">
                    {analytics.mostActiveFaculty.map((row) => (
                      <li key={row.userId}>
                        {row.displayName} — {row.count} publication{row.count === 1 ? '' : 's'}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-state">No analytics yet.</p>
          )}
        </section>
      ) : loading ? (
        <div className="college-research-page-loading content-panel" role="status">
          <div className="college-research-spinner college-research-spinner-lg" />
          <span>Loading records…</span>
        </div>
      ) : (
        <section className="content-panel">
          {repoViewMode === 'list' ? (
            <div className="table-wrapper">
              <table className="data-table college-research-table">
                <thead>
                  <tr>
                    <th>ID No.</th>
                    <th>Title</th>
                    <th>Year</th>
                    <th>Course</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No records.
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <Fragment key={row.id}>
                        <tr>
                          <td className="college-research-ref-cell">
                            {row.repository_ref ? (
                              <span className="college-research-repo-ref" title="Published ID">{row.repository_ref}</span>
                            ) : row.submission_ref ? (
                              <span className="college-research-sub-ref" title="Submission ID">{row.submission_ref}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{row.title}</td>
                          <td>{row.year}</td>
                          <td>{row.course}</td>
                          <td>{row.research_type?.replace(/_/g, ' ')}</td>
                          <td>
                            <span className={`college-research-status college-research-status-${row.status}`}>
                              {STATUS_LABELS[row.status] || row.status}
                            </span>
                          </td>
                          <td className="college-research-row-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact college-research-icon-btn"
                              title={expandedId === row.id ? 'Hide details' : 'Show details'}
                              aria-expanded={expandedId === row.id}
                              aria-label={expandedId === row.id ? 'Hide details' : 'Show details'}
                              onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            >
                              <CrIconDetails expanded={expandedId === row.id} />
                            </button>
                            {row.has_pdf ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact college-research-icon-btn"
                                title="Download PDF"
                                aria-label="Download PDF"
                                onClick={() => downloadPdf(row.id, row.title)}
                              >
                                <CrIconPdf />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact college-research-icon-btn college-research-danger"
                                title="Delete record"
                                aria-label="Delete record"
                                onClick={() => openDeleteConfirm(row)}
                              >
                                <CrIconTrash />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {expandedId === row.id ? (
                          <tr className="college-research-detail-row">
                            <td colSpan={7}>{researchDetailBlock(row)}</td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="college-research-grid">
              {items.length === 0 ? (
                <div className="empty-state college-research-grid-empty">No records.</div>
              ) : (
                items.map((row) => (
                  <article key={row.id} className="college-research-card">
                    <div className="college-research-card-head">
                      <h3 className="college-research-card-title">{row.title}</h3>
                      <div className="college-research-card-actions college-research-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact college-research-icon-btn"
                          title={expandedId === row.id ? 'Hide details' : 'Show details'}
                          aria-expanded={expandedId === row.id}
                          aria-label={expandedId === row.id ? 'Hide details' : 'Show details'}
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        >
                          <CrIconDetails expanded={expandedId === row.id} />
                        </button>
                        {row.has_pdf ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact college-research-icon-btn"
                            title="Download PDF"
                            aria-label="Download PDF"
                            onClick={() => downloadPdf(row.id, row.title)}
                          >
                            <CrIconPdf />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact college-research-icon-btn college-research-danger"
                            title="Delete record"
                            aria-label="Delete record"
                            onClick={() => openDeleteConfirm(row)}
                          >
                            <CrIconTrash />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {row.repository_ref || row.submission_ref ? (
                      <div className="college-research-card-ref">
                        <span className="college-research-repo-ref">{row.repository_ref || row.submission_ref}</span>
                      </div>
                    ) : null}
                    <div className="college-research-card-meta">
                      <span>{row.year}</span>
                      <span className="college-research-card-meta-sep">·</span>
                      <span>{row.course}</span>
                      <span className="college-research-card-meta-sep">·</span>
                      <span>{row.research_type?.replace(/_/g, ' ')}</span>
                      <span className={`college-research-status college-research-status-${row.status}`}>
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </div>
                    {expandedId === row.id ? researchDetailBlock(row) : null}
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  )
}
