import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetInstruction, apiGetInstructionFileUrl } from '../lib/api'

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  )
}

function IconFilePlaceholder() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20 mx-auto mb-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  )
}

function LabelValue({ label, value, isStatus }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">{label}</span>
      {isStatus ? (
        <div className="flex items-center gap-1.5 mt-0.5">
           <span className={`w-2 h-2 rounded-full ${value === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
           <span className={`text-xs font-bold ${value === 'Active' ? 'text-emerald-500' : 'text-amber-500'}`}>{value}</span>
        </div>
      ) : (
        <span className="text-sm font-semibold text-[var(--text)]">{value || '-'}</span>
      )}
    </div>
  )
}

// Helper to sanitize external URLs and ensure they are absolute
const ensureAbsoluteUrl = (url) => {
  if (!url) return ''
  // 1. Clean up spacing and accidental quotes
  let trimmed = url.trim().replace(/^['"]+|['"]+$/g, '') 
  
  // 2. If it's a relative path (starts with /), a blob URL, or already has a protocol, return as is
  if (trimmed.startsWith('/') || trimmed.startsWith('blob:') || trimmed.startsWith('mailto:')) {
    return trimmed
  }

  // 3. Fix 'double protocol' accidents (e.g., https://https://google.com)
  trimmed = trimmed.replace(/^(https?:\/\/)+https?:\/\//i, 'https://')
  
  // 4. Return as is if it already has a protocol (matches something like http://, https://, gridfs://, etc.)
  if (/^([a-z0-9]+:)\/\//i.test(trimmed)) {
    return trimmed
  }
  
  // 5. Default to https://
  return `https://${trimmed.replace(/^\/+/, '')}`
}

function DocumentViewerShell({ 
  fileName, 
  url, 
  numPages, 
  currentPage, 
  scale, 
  onJumpToPage, 
  onZoomIn, 
  onZoomOut, 
  onResetZoom, 
  onPrint,
  children,
  isLoading,
  loadingPages = 0,
  containerRef // Added to allow children to observe scroll
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#323639] relative group/viewer overflow-hidden selection:bg-transparent">
      {/* Google Drive Header Toolbar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-black/20 flex items-center justify-between px-4 z-50 shadow-lg shrink-0">
         {/* Left: Info */}
         <div className="flex items-center gap-3 w-1/4">
            <div className="w-8 h-8 rounded bg-[var(--accent)] flex items-center justify-center text-white shrink-0 shadow-lg">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <div className="flex flex-col min-w-0">
               <span className="text-[#f1f3f4] text-xs font-bold truncate max-w-[180px]">{fileName || 'Document'}</span>
               <span className="text-[10px] text-[#f1f3f4]/40 font-bold uppercase tracking-tighter">Preview Mode</span>
            </div>
         </div>

         {/* Center: Navigation & Zoom */}
         <div className="flex items-center gap-2">
            {/* Page Nav (Only show if multiple pages) */}
            {numPages > 1 && (
              <div className="flex items-center bg-black/40 rounded h-8 px-1">
                 <button 
                   onClick={() => onJumpToPage(currentPage - 1)} 
                   disabled={currentPage <= 1} 
                   className="!bg-transparent !border-none !p-0 w-8 h-8 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded disabled:opacity-20 transition-colors cursor-pointer"
                 >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                 </button>
                 <div className="flex items-center px-2 text-[#f1f3f4] gap-2">
                    <input 
                      type="text" 
                      value={currentPage} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (val > 0 && val <= numPages) onJumpToPage(val)
                      }}
                      className="w-9 h-6 !bg-white/10 !border-none rounded text-center text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <span className="text-[10px] opacity-40">/</span>
                    <span className="text-xs font-bold opacity-60">{numPages || '...'}</span>
                 </div>
                 <button 
                   onClick={() => onJumpToPage(currentPage + 1)} 
                   disabled={currentPage >= numPages} 
                   className="!bg-transparent !border-none !p-0 w-8 h-8 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded disabled:opacity-20 transition-colors cursor-pointer"
                 >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                 </button>
              </div>
            )}

            {numPages > 1 && <div className="w-px h-5 bg-white/10 mx-1"></div>}

            {/* Zoom Controls */}
            <div className="flex items-center bg-black/40 rounded h-8 px-1">
               <button 
                 onClick={onZoomOut} 
                 className="!bg-transparent !border-none !p-0 w-8 h-8 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded transition-colors cursor-pointer"
               >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
               </button>
               <button 
                 onClick={onResetZoom} 
                 className="!bg-transparent !border-none !p-0 px-2 text-[11px] font-bold text-[#f1f3f4] hover:bg-white/10 rounded h-6 min-w-[55px] flex items-center justify-center transition-colors cursor-pointer"
               >
                  {Math.round(scale * 100)}%
               </button>
               <button 
                 onClick={onZoomIn} 
                 className="!bg-transparent !border-none !p-0 w-8 h-8 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded transition-colors cursor-pointer"
               >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
               </button>
            </div>
         </div>

         {/* Right: Actions */}
         <div className="flex items-center gap-1 w-1/4 justify-end">
            <button 
              onClick={onPrint} 
              className="!bg-transparent !border-none !p-0 w-9 h-9 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded-full transition-colors cursor-pointer" 
              title="Print"
            >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            </button>
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-9 h-9 flex items-center justify-center text-[#f1f3f4] hover:bg-white/10 rounded-full transition-colors" 
              title="Download"
            >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
         </div>
      </div>

      {/* Main Scroll Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex flex-col items-center py-6 scroll-smooth
                   scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}
      >
        {isLoading && loadingPages === 0 && (
          <div className="flex flex-col items-center gap-3 mt-20 text-[#f1f3f4]/40">
            <div className="w-8 h-8 rounded-full border-2 border-current border-t-white animate-spin"></div>
            <p className="text-[10px] font-bold uppercase tracking-widest">Initial Loading...</p>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function PdfPreview({ url, fileName }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [numPages, setNumPages] = useState(0)
  const [renderedPages, setRenderedPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const containerRef = useRef(null)
  const scrollRef = useRef(null)

  // Intersection Observer to track page visibility
  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer || renderedPages === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page'))
            if (pageNum) setCurrentPage(pageNum)
          }
        })
      },
      { root: scrollContainer, threshold: 0.4 }
    )

    const pages = scrollContainer.querySelectorAll('.pdf-page-wrapper')
    pages.forEach((p) => observer.observe(p))
    return () => observer.disconnect()
  }, [renderedPages])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        setRenderedPages(0)
        const pdfjsLib = window['pdfjs-dist/build/pdf']
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        
        const loadingTask = pdfjsLib.getDocument(url)
        const pdf = await loadingTask.promise
        if (active) setNumPages(pdf.numPages)

        const container = containerRef.current
        if (!container) return
        container.innerHTML = '' 

        for (let i = 1; i <= pdf.numPages; i++) {
          if (!active) break
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: scale })
          const wrapper = document.createElement('div')
          wrapper.className = "pdf-page-wrapper w-full flex justify-center mb-10 px-4"
          wrapper.setAttribute('data-page', i)
          wrapper.id = `pdf-page-${i}`
          
          const canvas = document.createElement('canvas')
          canvas.className = "shadow-[0_4px_30px_rgba(0,0,0,0.5)] bg-white"
          wrapper.appendChild(canvas)
          container.appendChild(wrapper)
          
          const context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width
          await page.render({ canvasContext: context, viewport: viewport }).promise
          if (active) setRenderedPages(i)
        }
        if (active) setLoading(false)
      } catch (err) {
        if (active) { setError('Unable to load PDF'); setLoading(false); }
      }
    }
    load()
    return () => { active = false }
  }, [url, scale])

  const jumpToPage = (n) => {
    const el = document.getElementById(`pdf-page-${n}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <DocumentViewerShell
      fileName={fileName}
      url={url}
      numPages={numPages}
      currentPage={currentPage}
      scale={scale}
      onJumpToPage={jumpToPage}
      onZoomIn={() => setScale(s => Math.min(s + 0.2, 3))}
      onZoomOut={() => setScale(s => Math.max(s - 0.2, 0.6))}
      onResetZoom={() => setScale(1.2)}
      onPrint={() => window.print()}
      isLoading={loading}
      loadingPages={renderedPages}
      containerRef={scrollRef}
    >
       {error ? (
         <div className="flex flex-col items-center justify-center p-20 text-rose-400 gap-4 mt-20">
           <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
           </div>
           <p className="text-sm font-bold tracking-tight">{error}</p>
         </div>
       ) : (
         <div ref={containerRef} className="w-full flex flex-col items-center"></div>
       )}
    </DocumentViewerShell>
  )
}

function FilePreview({ url, fileName }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contentType, setContentType] = useState('')
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch resource')
        const type = res.headers.get('Content-Type') || ''
        const blob = await res.blob()
        const bUrl = URL.createObjectURL(blob)
        if (active) { setContentType(type); setBlobUrl(bUrl); setLoading(false); }
      } catch (err) {
        if (active) { setError('Unable to load preview.'); setLoading(false); }
      }
    }
    load()
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); }
  }, [url])

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full p-20 gap-4">
      <div className="w-10 h-10 rounded-full border-4 border-[var(--accent)]/20 border-t-[var(--accent)] animate-spin"></div>
      <p className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest animate-pulse">Initializing</p>
    </div>
  )
  
  if (error) return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-rose-400 gap-3">
       <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
       </div>
       <p className="text-sm font-bold">{error}</p>
    </div>
  )

  const isImage = contentType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName || '')
  const isPdf = contentType.includes('pdf') || (fileName || '').toLowerCase().endsWith('.pdf')

  if (isImage) {
    return (
      <div className="flex items-center justify-center h-full p-4 sm:p-8 bg-[#323639] selection:bg-transparent">
        <img src={blobUrl} alt="Preview" className="max-w-full max-h-full rounded shadow-2xl object-contain" />
      </div>
    )
  }

  if (isPdf) {
    return <PdfPreview url={blobUrl} fileName={fileName} />
  }

  return (
    <iframe src={blobUrl} title="Document Preview" className="w-full h-full border-0 min-h-[700px]" allow="fullscreen" />
  )
}

function WordPreview({ url, fileName }) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1.0)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch document')
        const buffer = await res.arrayBuffer()
        if (window.mammoth) {
          const result = await window.mammoth.convertToHtml({ arrayBuffer: buffer })
          if (active) setHtml(result.value)
        }
      } catch (err) {
        if (active) setError('Unable to load document preview.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [url])

  return (
    <DocumentViewerShell
      fileName={fileName}
      url={url}
      numPages={1}
      currentPage={1}
      scale={scale}
      onJumpToPage={() => {}}
      onZoomIn={() => setScale(s => Math.min(s + 0.1, 2))}
      onZoomOut={() => setScale(s => Math.max(s - 0.1, 0.5))}
      onResetZoom={() => setScale(1.0)}
      onPrint={() => window.print()}
      isLoading={loading}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .docx-viewer-content { 
          font-family: 'Inter', sans-serif;
          color: #1a1a2e;
          line-height: 1.6;
        }
        .docx-viewer-content h1, .docx-viewer-content h2, .docx-viewer-content h3 {
          color: #111;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 800 !important;
        }
        .docx-viewer-content h1 { font-size: 2.25rem; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        .docx-viewer-content h2 { font-size: 1.8rem; }
        .docx-viewer-content h3 { font-size: 1.4rem; }
        
        .docx-viewer-content strong, .docx-viewer-content b {
          font-weight: 900 !important;
          color: #000 !important;
        }

        /* The 'Boxes' (Tables) */
        .docx-viewer-content table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 1.5rem 0 !important;
          border: 2px solid #333 !important;
        }
        .docx-viewer-content th, .docx-viewer-content td {
          border: 1px solid #666 !important;
          padding: 12px 15px !important;
          text-align: left !important;
        }
        .docx-viewer-content th {
          background-color: #f8f9fa !important;
          font-weight: 800 !important;
        }

        .docx-viewer-content p {
          margin-bottom: 1rem;
        }

        .docx-viewer-content ul, .docx-viewer-content ol {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }
        
        .docx-viewer-content img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1rem 0;
        }
      `}} />

      {error ? (
        <div className="p-20 text-rose-400 text-center font-bold">{error}</div>
      ) : (
        <div className="flex-1 w-full flex flex-col items-center py-12">
           <div 
             className="bg-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] rounded-sm ring-1 ring-black/10 origin-top transition-transform duration-200 overflow-hidden"
             style={{ 
               width: '850px', 
               minHeight: '1100px',
               transform: `scale(${scale})`,
               marginBottom: `${(scale - 1) * 1100}px` 
             }}
           >
             <div 
               className="docx-viewer-content p-20 sm:p-24 lg:p-32" 
               dangerouslySetInnerHTML={{ __html: html }} 
             />
           </div>
        </div>
      )}
    </DocumentViewerShell>
  )
}

export default function AdminViewMaterial() {
  const { id } = useParams()
  const [material, setMaterial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [apiBase, setApiBase] = useState('')

  useEffect(() => {
    apiGetInstructionFileUrl().then(setApiBase).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('authToken')
        const res = await apiGetInstruction(token, id)
        if (active) setMaterial(res.instruction)
      } catch (err) {
        if (active) setError(err.message || 'Failed to load material')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 module-page">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)]" />
      </div>
    )
  }

  if (error || !material) {
    return (
      <div className="module-page max-w-xl mx-auto mt-10">
         <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
            <h2 className="text-rose-400 font-bold mb-2">Error</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">{error || 'Material not found.'}</p>
            <Link to="/instructions" className="btn btn-secondary">← Back to Instructions</Link>
         </div>
      </div>
    )
  }

  const isCurriculum = material.type === 'curriculum'

  // Refined universal link opener
  const handleOpenResource = (e, targetUrl) => {
    e?.preventDefault()
    e?.stopPropagation()
    const finalUrl = ensureAbsoluteUrl(targetUrl)
    if (finalUrl) {
      // For window.open, we prefer not to pass a name or specs if they are just standard rels
      // as some browsers handle standard navigation gestures better without them.
      window.open(finalUrl, '_blank', 'noopener')
    }
  }

  return (
    <div className="module-page max-w-[1440px] mx-auto w-full px-4 sm:px-6">
      <div className="w-full space-y-8 py-6">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="main-title font-extrabold text-[var(--text)]">{material.title}</h1>
              <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider mt-1 ${
                 material.type === 'curriculum' 
                   ? 'bg-blue-100/10 text-blue-400 border border-blue-400/20'
                   : material.type === 'syllabus'
                   ? 'bg-emerald-100/10 text-emerald-400 border border-emerald-400/20'
                   : 'bg-purple-100/10 text-purple-400 border border-purple-400/20'
              }`}>
                {material.type}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/instructions" className="btn btn-secondary">
              ← Back
            </Link>
            <Link to={`/admin/instructions/${id}/edit`} className="btn btn-primary flex items-center justify-center gap-2">
              <IconEdit /> Edit
            </Link>
          </div>
        </header>

        {/* Content Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Document Viewer (Spans 2 columns on large screens) */}
          <div className="lg:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-0 w-full shadow-lg flex flex-col h-[850px] overflow-hidden ring-1 ring-white/5">
             {/* Dynamic Viewer Toolbar */}
             <div className="h-12 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.02)] flex items-center px-6 justify-between shrink-0">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/30"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/30"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30"></div>
                   </div>
                   <div className="h-4 w-px bg-[var(--border-color)] mx-1"></div>
                   <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mt-0.5">Focus Mode</span>
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                   {material.link && (
                     <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Live Preview</span>
                     </div>
                   )}
                </div>
             </div>

              <div className="flex-1 relative flex flex-col bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(0,0,0,0.1)] overflow-hidden">
                {(() => {
                  const link = material.link || ''

                  if (!link) {
                    return (
                      <div className="flex flex-col items-center justify-center h-full p-8 opacity-40">
                        <IconFilePlaceholder />
                        <p className="text-[var(--text-muted)] font-black uppercase tracking-widest text-[10px]">No resource attached</p>
                      </div>
                    )
                  }

                  // INTERNAL FILES (GridFS)
                  if (link.startsWith('gridfs://')) {
                    const fileId = link.replace('gridfs://', '')
                    const token = localStorage.getItem('authToken')
                    const fileUrl = `${apiBase}/api/instructions/file/${fileId}${token ? `?token=${token}` : ''}${token ? '&' : '?'}preview=1`
                    
                    const normalizedMime = (material.mimeType || '').toLowerCase()
                    const fileName = (material.fileName || '').toLowerCase()
                    
                    // Only show instant preview for PDF and Images
                    const isPreviewable = normalizedMime.includes('pdf') || normalizedMime.startsWith('image/') ||
                                     fileName.endsWith('.pdf') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName)
                    
                    if (isPreviewable) {
                      return <FilePreview url={fileUrl} fileName={material.fileName} />
                    }

                    // Fallback Card for DOCX, PPT, and others from GridFS
                    return (
                      <div className="flex flex-col items-center justify-center h-full p-12 text-center gap-6">
                        <div className="w-24 h-24 rounded-[2.5rem] bg-[var(--accent-soft)] flex items-center justify-center shadow-inner relative transition-transform duration-500">
                           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                             <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                             <polyline points="14 2 14 8 20 8"></polyline>
                           </svg>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[var(--text)] font-black text-lg">
                            {material.fileName || 'Document Ready'}
                          </p>
                          <p className="text-[var(--text-muted)] text-xs max-w-[320px] mx-auto leading-relaxed font-medium">
                            This file ({material.fileName?.split('.').pop()?.toUpperCase()}) requires internal viewing software. Click below to secure a local copy.
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleOpenResource(e, fileUrl)}
                          className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-[var(--accent)]/30 active:scale-95 cursor-pointer"
                        >
                          <IconDownload /> Download File
                        </button>
                      </div>
                    )
                  }

                  // EXTERNAL RESOURCES (Universal Link Card)
                  return (
                    <div className="flex flex-col items-center justify-center h-full p-12 bg-[#1e1e1e] text-center gap-6">
                      <div className="w-20 h-20 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                      </div>
                      <div className="space-y-2">
                        <p className="text-white font-bold text-lg">External Resource</p>
                        <div className="flex flex-col gap-1 items-center">
                          {material.fileName && (
                            <p className="text-[var(--accent)] font-black uppercase tracking-widest text-[10px] bg-[var(--accent)]/10 px-2 py-0.5 rounded">
                              {material.fileName}
                            </p>
                          )}
                          <p className="text-[#f1f3f4]/40 text-[10px] max-w-[400px] truncate break-all italic">
                            {link}
                          </p>
                        </div>
                        <p className="text-[#f1f3f4]/60 text-xs max-w-[320px] mx-auto leading-relaxed mt-2">
                          This link directs to an external resource. Click below to open it in a secure new browser tab.
                        </p>
                      </div>
                      <a
                        href={ensureAbsoluteUrl(link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-[var(--accent)]/20 active:scale-95 cursor-pointer no-underline"
                      >
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 2 2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        Open Resource
                      </a>
                    </div>
                  )
                })()}
              </div>
           </div>

           {/* Right Column: Details & Actions */}
           <div className="space-y-6">
              
              {/* Primary Action */}
              <div className="bg-[var(--card-bg)] border border-[var(--accent)]/30 rounded-[var(--radius-lg)] p-5 shadow-[0_8px_24px_-8px_rgba(229,118,47,0.15)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-10 blur-3xl -mr-10 -mt-10 rounded-full transition-transform group-hover:scale-150 duration-700"></div>
                {material.link ? (
                  (() => {
                    const link = material.link
                    if (link.startsWith('gridfs://')) {
                      const fileId = link.replace('gridfs://', '')
                      const token = localStorage.getItem('authToken')
                      const fileUrl = `${apiBase}/api/instructions/file/${fileId}${token ? `?token=${token}` : ''}`
                      return (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold transition-all shadow-md cursor-pointer no-underline"
                        >
                          <IconDownload /> Download File
                        </a>
                      )
                    }
                    return (
                      <a
                        href={ensureAbsoluteUrl(link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold transition-all shadow-md cursor-pointer no-underline"
                      >
                        <IconDownload /> Open Resource
                      </a>
                    )
                  })()
                ) : (
                  <button disabled className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent)] opacity-40 text-white font-bold cursor-not-allowed">
                    <IconDownload /> No Resource Attached
                  </button>
                )}
              </div>

              {/* Metadata */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--text)] mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-[var(--accent)] rounded-full"></span> Metadata
                </h3>
                
                <LabelValue label="Author / Owner" value={material.author} />
                <LabelValue label="Course" value={material.course} />
                {!isCurriculum && <LabelValue label="Subject" value={material.subject} />}
                <LabelValue label="Date Uploaded" value={material.updated_at ? new Date(material.updated_at).toLocaleDateString() : '-'} />
                <LabelValue label="Status" value={material.status} isStatus />
             </div>

             {/* Description */}
             <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm">
               <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--text)] mb-4 flex items-center gap-2">
                 <span className="w-1 h-3 bg-[var(--accent)] rounded-full"></span> Description
               </h3>
               <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                 {material.description || 'No description provided.'}
               </p>
             </div>
             
          </div>

        </div>

      </div>
    </div>
  )
}
