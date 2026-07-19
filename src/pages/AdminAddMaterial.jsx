import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiCreateInstruction, apiUploadInstructionFile } from '../lib/api'

function getAuthUser() {
  try {
    const raw = localStorage.getItem('authUser')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/* ─── Reusable field components matching the design system ─── */

const Label = ({ children, required }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-1">*</span>}
  </label>
)

const inputCls = 'search-input w-full disabled:opacity-60 disabled:cursor-not-allowed'

const FInput = ({ className = '', ...props }) => (
  <input className={`${inputCls} ${className}`} {...props} />
)

const FSelect = ({ children, className = '', ...props }) => (
  <div className="relative">
    <select className={`${inputCls} appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L5 5L9 1" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </div>
)

const FTextarea = ({ className = '', ...props }) => (
  <textarea className={`${inputCls} !rounded-xl !p-3.5 resize-none ${className}`} {...props} />
)

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap">
      {children}
    </span>
    <div className="flex-1 h-px bg-[var(--border-color)]" />
  </div>
)

const Card = ({ children, className = '' }) => (
  <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm ${className}`}>
    {children}
  </div>
)

function IconUpload() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)] mx-auto mb-3">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-[11px] text-[var(--text-muted)]">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  )
}

export default function AdminAddMaterial() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [uploadMode, setUploadMode] = useState('file') // 'file' | 'link'
  
  const authUser = getAuthUser()
  const authorName = authUser?.full_name || 'Administrator'

  const [formData, setFormData] = useState({
    title: '',
    type: 'curriculum',
    course: '',
    subject: '',
    description: '',
    status: 'Draft',
    link: ''
  })

  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null) // { name, size }
  const fileInputRef = useRef(null)

  const handleFileSelect = async (file) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const token = localStorage.getItem('authToken')
      const result = await apiUploadInstructionFile(token, file)
      pf({ link: `gridfs://${result.fileId}` })
      setUploadedFile({ name: result.filename, size: result.size })
    } catch (err) {
      setError(err.message || 'File upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const fd = formData
  const pf = (patch) => setFormData(prev => ({ ...prev, ...patch }))

  const handleCreate = async (e) => {
    e.preventDefault()
    
    // UI Validation
    if (!fd.title || !fd.course || ((fd.type === 'syllabus' || fd.type === 'lesson') && !fd.subject)) {
      setError('Required fields (*) are missing.')
      return
    }

    setCreating(true)
    setError('')
    
    try {
      const token = localStorage.getItem('authToken')
      await apiCreateInstruction(token, {
        title: fd.title,
        type: fd.type,
        course: fd.course,
        subject: fd.subject,
        description: fd.description,
        status: fd.status,
        author: authorName,
        link: fd.link
      })
      
      navigate('/instructions')
    } catch (err) {
      setError(err.message || 'Failed to add material.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="module-page max-w-4xl mx-auto w-full">
      <div className="w-full space-y-5">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Add Material</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Upload documents or provide links to curriculums, courses, and lessons.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/instructions" className="btn btn-secondary">← Cancel</Link>
            <button 
              onClick={handleCreate} 
              disabled={creating} 
              className="btn btn-primary"
            >
              {creating ? 'Saving...' : 'Save Material'}
            </button>
          </div>
        </header>

        {error && (
          <div className="p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          
          <div className="space-y-5">
            {/* Basic Info Card */}
            <Card>
              <SectionTitle>Basic Information</SectionTitle>
              <div className="space-y-4">
                <div>
                  <Label required>Title</Label>
                  <FInput value={fd.title} onChange={e => pf({ title: e.target.value })} placeholder="e.g. BSCS Curriculum 2026" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label required>Type</Label>
                    <FSelect value={fd.type} onChange={e => {
                      pf({ type: e.target.value })
                      if (e.target.value === 'curriculum') pf({ subject: '' })
                    }}>
                      <option value="curriculum">Curriculum</option>
                      <option value="syllabus">Syllabus</option>
                      <option value="lesson">Lesson Module</option>
                    </FSelect>
                  </div>
                  <div>
                    <Label required>Author / Owner</Label>
                    <div className="search-input w-full bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)] cursor-not-allowed flex items-center h-[38px] px-3 border border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]">
                      <span className="truncate text-sm">{authorName}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={fd.type === 'curriculum' ? 'col-span-2' : ''}>
                    <Label required>Course</Label>
                    <FSelect value={fd.course} onChange={e => pf({ course: e.target.value })}>
                      <option value="">Select course</option>
                      <option value="BSCS">BS Computer Science</option>
                      <option value="BSIT">BS Information Technology</option>
                    </FSelect>
                  </div>
                  {(fd.type === 'syllabus' || fd.type === 'lesson') && (
                    <div>
                      <Label required>Subject</Label>
                      <FInput value={fd.subject} onChange={e => pf({ subject: e.target.value })} placeholder="e.g. CS311" />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Details Card */}
            <Card>
              <SectionTitle>Details & Status</SectionTitle>
              <div className="space-y-4">
                <div>
                  <Label>Initial Status</Label>
                  <FSelect value={fd.status} onChange={e => pf({ status: e.target.value })}>
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                  </FSelect>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5 italic">
                    Draft materials are invisible to regular users until marked Active.
                  </p>
                </div>
                <div>
                  <Label>Description / Summary</Label>
                  <FTextarea 
                    rows={4} 
                    value={fd.description} 
                    onChange={e => pf({ description: e.target.value })} 
                    placeholder="Briefly describe what this material covers." 
                  />
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            {/* Attachment Card */}
            <Card className="h-full border-dashed border-[var(--accent)] border-opacity-40 hover:border-opacity-100 transition-colors bg-[rgba(229,118,47,0.02)]">
              
              <div className="flex items-center justify-between gap-3 mb-5 pb-3 border-b border-[rgba(255,255,255,0.06)]">
                 <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--accent)]">
                   Resource Attachment
                 </span>
                 <div className="flex bg-[rgba(0,0,0,0.2)] rounded-md border border-[var(--border-color)] overflow-hidden">
                    <button 
                      onClick={() => setUploadMode('file')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${uploadMode === 'file' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-white'}`}
                    >File</button>
                    <button 
                      onClick={() => setUploadMode('link')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${uploadMode === 'link' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-white'}`}
                    >Link</button>
                 </div>
              </div>

              {uploadMode === 'file' ? (
                <div
                  className={`flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-xl transition-colors cursor-pointer group ${
                    uploadedFile
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-[var(--border-color)] bg-[rgba(0,0,0,0.1)] hover:border-[var(--accent)] hover:bg-[rgba(255,255,255,0.02)]'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]) }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,.docx,.pptx,.doc,.ppt,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)] mb-3" />
                      <p className="text-sm font-bold text-[var(--accent)]">Uploading to MongoDB...</p>
                    </>
                  ) : uploadedFile ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <p className="text-sm font-bold text-emerald-400">{uploadedFile.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">{(uploadedFile.size / 1024).toFixed(1)} KB — click to replace</p>
                    </>
                  ) : (
                    <>
                      <IconUpload />
                      <p className="text-sm font-bold text-[var(--text)] group-hover:text-[var(--accent)]">Browse files or drag and drop</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">PDF, DOCX, or PPTX up to 50MB</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col justify-center h-48 space-y-4">
                   <div>
                     <Label>External Drive Link</Label>
                     <div className="relative">
                       <IconLink />
                       <FInput 
                         value={fd.link} 
                         onChange={e => pf({ link: e.target.value })} 
                         className="pl-9" 
                         placeholder="https://docs.google.com/..." 
                       />
                     </div>
                   </div>
                   <div className="p-3 bg-[rgba(0,0,0,0.2)] border border-[var(--border-color)] rounded-lg">
                     <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                       You can link directly to <span className="text-[var(--accent)] font-semibold">Google Drive</span>, <span className="text-[var(--accent)] font-semibold">OneDrive</span>, or <span className="text-blue-400 font-semibold">Dropbox</span> if the document exceeds the maximum upload limits or needs to update independently of the system.
                     </p>
                   </div>
                </div>
              )}

            </Card>
          </div>

        </div>

      </div>
    </div>
  )
}
