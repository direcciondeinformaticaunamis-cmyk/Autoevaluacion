/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  FileSearch, 
  BarChart3, 
  Plus, 
  ListTodo, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  BookOpen,
  Settings,
  ChevronRight,
  Loader2,
  Trash2,
  Upload,
  Search,
  Filter,
  Download,
  Database,
  Bot,
  PieChart as PieIcon,
  LineChart as LineIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend as ReLegend
} from 'recharts';
import { analyzeDocuments, IndicatorAnalysis } from './services/geminiService';
import { OFFICIAL_MATRIX } from './constants/matrix';
import { buildCatalogIndex } from './services/catalogIndex';
import type { CatalogItem } from './services/catalogIndex';
import {
  addPendingEvidence,
  loadPendingEvidence,
  removePendingEvidence,
} from './services/pendingEvidenceStore';
import { buildMaxAnexoByCriterion, nextAnexoForCriterion } from './services/anexoSequencer';
import { extractPdfText, ocrImageText, ocrPdfText } from './services/pdfText';
import { cn } from './lib/utils';
import unamisLogo from './img/LOGO UNAMIS WEB 2 (3).png';
import Login, { isAuthenticated, logout } from './components/Login';

export default function App() {
  const [authedUser, setAuthedUser] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    if (!isAuthenticated()) return '';
    try {
      return JSON.parse(localStorage.getItem('unamis_auth') || '{}')?.user ?? '';
    } catch {
      return '';
    }
  });
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<IndicatorAnalysis[]>([]);
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'input' | 'dashboard' | 'matrix' | 'catalog' | 'results' | 'search' | 'upload'>('input');
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisHint, setAnalysisHint] = useState(false);

  const [localAnalysisFiles, setLocalAnalysisFiles] = useState<File[]>([]);
  const [localAnalysis, setLocalAnalysis] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; progress: number; error?: string }>(
    { status: 'idle', progress: 0 }
  );
  
  // Advanced Search Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterFocus, setFilterFocus] = useState<string>('all');

  // Simulated Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedIndicatorForUpload, setSelectedIndicatorForUpload] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [pdfExtract, setPdfExtract] = useState<{
    status: 'idle' | 'reading' | 'done' | 'error';
    text: string;
    error?: string;
  }>({ status: 'idle', text: '' });
  const [ocrState, setOcrState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; progress: number; error?: string }>({
    status: 'idle',
    progress: 0,
  });

  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const [pendingEvidence, setPendingEvidence] = useState(() => loadPendingEvidence());

  // Gate the whole app behind a simple login.
  // Note: this is UI gating only (not a security boundary).
  if (!authedUser) {
    return <Login logoSrc={unamisLogo} onAuthed={(u) => setAuthedUser(u)} />;
  }

  const allIndicatorOptions = OFFICIAL_MATRIX.flatMap((d) =>
    d.criteria.flatMap((c) =>
      c.indicators.map((i) => ({
        dimensionId: d.id,
        criterionId: c.id,
        criterionName: c.name,
        indicator: i.id,
        description: i.description,
        requiredDocs: i.requiredDocs,
      }))
    )
  );

  const suggestionText = `${uploadFiles.map((f) => f.name).join(' ')} ${uploadDescription} ${pdfExtract.text}`.toLowerCase();
  const suggestions = allIndicatorOptions
    .map((o) => {
      let score = 0;
      const hay = suggestionText;
      const matched: string[] = [];
      // Required docs are the strongest signals.
      for (const req of o.requiredDocs) {
        const key = String(req).toLowerCase();
        if (key && hay.includes(key)) {
          score += 6;
          matched.push(req);
        }
        else {
          // Partial token hits.
          for (const tok of key.split(/[^a-z0-9]+/g).filter(Boolean)) {
            if (tok.length >= 4 && hay.includes(tok)) score += 1;
          }
        }
      }
      // Some weight for indicator + criterion description.
      for (const tok of `${o.description} ${o.criterionName}`.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)) {
        if (tok.length >= 5 && hay.includes(tok)) score += 1;
      }
      return { ...o, score, matched };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const inferYearFromName = (name: string): string => {
    const m = name.match(/\b(19|20)\d{2}\b/);
    return m?.[0] ?? new Date().getFullYear().toString();
  };

  const scoreIndicatorForText = (o: (typeof allIndicatorOptions)[number], textLower: string) => {
    let score = 0;
    const matched: string[] = [];
    for (const req of o.requiredDocs) {
      const key = String(req).toLowerCase();
      if (key && textLower.includes(key)) {
        score += 6;
        matched.push(req);
      } else {
        for (const tok of key.split(/[^a-z0-9]+/g).filter(Boolean)) {
          if (tok.length >= 4 && textLower.includes(tok)) score += 1;
        }
      }
    }
    for (const tok of `${o.description} ${o.criterionName}`.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)) {
      if (tok.length >= 5 && textLower.includes(tok)) score += 1;
    }
    return { score, matched };
  };

  const runLocalFileAnalysis = async () => {
    if (localAnalysisFiles.length === 0) {
      setAnalysisHint(true);
      return;
    }

    setLocalAnalysis({ status: 'running', progress: 0 });
    setIsAnalyzing(true);
    setAnalysisHint(false);

    try {
      const docs: { file: File; text: string }[] = [];
      const total = localAnalysisFiles.length;

      for (let idx = 0; idx < localAnalysisFiles.length; idx += 1) {
        const f = localAnalysisFiles[idx]!;
        const name = f.name;
        const isPdf = /\.pdf$/i.test(name);
        const isImage = /\.(png|jpe?g|webp)$/i.test(name);

        let extracted = '';
        if (isPdf) {
          extracted = await extractPdfText(f, 3);
          if ((extracted ?? '').trim().length < 200) {
            // Best effort OCR for scanned docs.
            try {
              const ocr = await ocrPdfText(f, 2);
              extracted = `${extracted}\n\n${ocr}`.trim();
            } catch {
              // Ignore OCR errors; keep base extract.
            }
          }
        } else if (isImage) {
          extracted = await ocrImageText(f);
        } else {
          extracted = '';
        }

        const combined = `${name}\n${extracted}`.trim();
        docs.push({ file: f, text: combined });
        setLocalAnalysis({ status: 'running', progress: (idx + 1) / total });
      }

      // Assign each doc to best indicator by content.
      const byIndicator = new Map<string, { name: string; year: string; score: number }[]>();
      for (const d of docs) {
        const textLower = d.text.toLowerCase();
        let best: { id: string; score: number } | null = null;

        for (const opt of allIndicatorOptions) {
          const s = scoreIndicatorForText(opt, textLower).score;
          if (s <= 0) continue;
          if (!best || s > best.score) best = { id: opt.indicator.toLowerCase(), score: s };
        }

        if (!best) continue;
        const arr = byIndicator.get(best.id) ?? [];
        arr.push({ name: d.file.name, year: inferYearFromName(d.file.name), score: best.score });
        byIndicator.set(best.id, arr);
      }

      // Build results for the whole matrix.
      const nextResults: IndicatorAnalysis[] = allIndicatorOptions.map((o) => {
        const indicatorId = o.indicator.toLowerCase();
        const docsFor = byIndicator.get(indicatorId) ?? [];
        const found = docsFor.length;
        const required = o.requiredDocs.length;
        const state: 'Completo' | 'Parcial' | 'Débil' =
          found <= 0 ? 'Débil' : required > 0 && found >= required ? 'Completo' : 'Parcial';

        const complianceLevel = state === 'Completo' ? 'Alto' : state === 'Parcial' ? 'Medio' : 'Bajo';

        return {
          indicator: o.indicator,
          description: o.description,
          documents: docsFor.map((d) => ({
            name: d.name,
            type: 'Evidencial',
            year: d.year,
            focus: 'medio',
            status: 'vigente',
            link: '',
          })),
          technicalAnalysis: {
            complianceLevel,
            mathCoherence: 'N/A (modo local)',
            resourceUsage: 'N/A (modo local)',
            observations:
              'Modo local: se asignaron archivos por coincidencias de contenido (requiredDocs + descripciones).',
          },
          history: 'N/A (modo local)',
          gaps:
            state === 'Débil'
              ? ['No se detectaron archivos que correspondan a este indicador.']
              : [],
          recommendations:
            state === 'Débil'
              ? ['Subir/registrar evidencias para este indicador.']
              : ['Revisar consistencia y pertinencia de las evidencias asignadas.'],
          finalSummary:
            state === 'Completo'
              ? 'Cobertura suficiente según los archivos analizados.'
              : state === 'Parcial'
                ? 'Cobertura parcial según los archivos analizados.'
                : 'Cobertura débil según los archivos analizados.',
          state,
        };
      });

      setResults(nextResults);
      setSelectedIndicator(nextResults[0] || null);
      setActiveTab('dashboard');
      setLocalAnalysis({ status: 'done', progress: 1 });
    } catch (err: any) {
      setLocalAnalysis({ status: 'error', progress: 0, error: String(err?.message || err) });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pendingCatalogItems: CatalogItem[] = pendingEvidence.map((p) => ({
    name: p.generatedName,
    link: '',
    indicatorId: p.indicatorId,
    dimensionId: p.dimensionId,
    year: p.year,
    pending: true,
  }));

  const catalog = buildCatalogIndex(pendingCatalogItems);

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setIsAnalyzing(true);
    setAnalysisHint(false);
    try {
      const analysis = await analyzeDocuments(inputText);
      setResults(analysis);
      setSelectedIndicator(analysis[0] || null);
      setActiveTab('dashboard');
    } catch (error) {
      alert("Hubo un error al analizar los documentos. Por favor revisa la consola.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'Completo': return 'text-green-700 bg-green-100 border-green-200';
      case 'Parcial': return 'text-amber-700 bg-amber-100 border-amber-200';
      case 'Débil': return 'text-red-700 bg-red-100 border-red-200';
      default: return 'text-slate-500 bg-slate-100 border-slate-200';
    }
  };

  const getIndicatorBorder = (state: string) => {
    switch (state) {
      case 'Completo': return 'border-green-600';
      case 'Parcial': return 'border-amber-500';
      case 'Débil': return 'border-red-500';
      default: return 'border-transparent';
    }
  };

  const filteredResults = results.filter(r => 
    r.indicator.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const advancedFilteredDocuments = results.flatMap(r => 
    r.documents.map(doc => ({ ...doc, indicator: r.indicator, indicatorDesc: r.description }))
  ).filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         doc.indicator.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || doc.type === filterType;
    const matchesYear = filterYear === 'all' || doc.year === filterYear;
    const matchesFocus = filterFocus === 'all' || doc.focus === filterFocus;
    
    return matchesSearch && matchesType && matchesYear && matchesFocus;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadFiles(files);
      setSelectedIndicatorForUpload('');

      const first = files[0];
      if (!first) return;

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(first);
      });

      setOcrState({ status: 'idle', progress: 0 });

      const name = first.name;
      const isPdf = /\.pdf$/i.test(name);
      const isImage = /\.(png|jpe?g|webp)$/i.test(name);

      if (!isPdf && !isImage) {
        setPdfExtract({ status: 'idle', text: '' });
        return;
      }

      setPdfExtract({ status: 'reading', text: '' });

      if (isPdf) {
        extractPdfText(first, 3)
          .then(async (t) => {
            const base = (t ?? '').trim();
            setPdfExtract({ status: 'done', text: base });

            // Auto-OCR for likely scanned PDFs (no real embedded text).
            if (base.length < 200) {
              setOcrState({ status: 'running', progress: 0 });
              try {
                const ocr = await ocrPdfText(first, 2, (p) => setOcrState((prev) => ({ ...prev, progress: p })));
                const merged = `${base}\n\n${ocr}`.trim();
                setPdfExtract({ status: 'done', text: merged });
                setOcrState({ status: 'done', progress: 1 });
              } catch (err: any) {
                setOcrState({ status: 'error', progress: 0, error: String(err?.message || err) });
              }
            }
          })
          .catch((err) => setPdfExtract({ status: 'error', text: '', error: String(err?.message || err) }));
        return;
      }

      // Image OCR (first image only).
      setOcrState({ status: 'running', progress: 0 });
      ocrImageText(first, (p) => setOcrState((prev) => ({ ...prev, progress: p })))
        .then((t) => {
          setPdfExtract({ status: 'done', text: t });
          setOcrState({ status: 'done', progress: 1 });
        })
        .catch((err) => {
          setOcrState({ status: 'error', progress: 0, error: String(err?.message || err) });
          setPdfExtract({ status: 'error', text: '', error: String(err?.message || err) });
        });
    }
  };

  const executeUpload = async () => {
    if (uploadFiles.length === 0 || !selectedIndicatorForUpload) return;
    const opt = allIndicatorOptions.find((o) => o.indicator === selectedIndicatorForUpload);
    if (!opt) return;

    setIsUploading(true);
    await new Promise(resolve => setTimeout(resolve, 400));

    const nowYear = new Date().getFullYear().toString();
    const allKnownNames = [
      ...catalog.items.map((x) => x.name),
      ...pendingEvidence.map((p) => p.generatedName),
    ];
    const maxByCriterion = buildMaxAnexoByCriterion(allKnownNames);

    let next = pendingEvidence;
    for (const f of uploadFiles) {
      const base = f.name.replace(/\.[^.]+$/, '');
      const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
      const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      // Consecutive ANEXO number is per criterio folder (e.g. 2.1, 3.2, ...).
      const anexoNum = nextAnexoForCriterion(maxByCriterion, opt.criterionId);
      const anexoStr = String(anexoNum).padStart(3, '0');
      const generatedName = `C${opt.dimensionId}_ANEXO_${anexoStr}_${opt.indicator}_01_${safe}${ext || ''}`;

      next = addPendingEvidence(next, {
        originalName: f.name,
        generatedName,
        indicatorId: opt.indicator.toLowerCase(),
        dimensionId: opt.dimensionId,
        year: nowYear,
      });
    }

    setPendingEvidence(next);
    setUploadFiles([]);
    setSelectedIndicatorForUpload('');
    setUploadDescription('');
    setPdfExtract({ status: 'idle', text: '' });
    setOcrState({ status: 'idle', progress: 0 });
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setIsUploading(false);
    setActiveTab('catalog');
  };

  const getDashboardData = () => {
    const statusData = [
      { name: 'Completo', value: results.filter(r => r.state === 'Completo').length, color: '#10b981' },
      { name: 'Parcial', value: results.filter(r => r.state === 'Parcial').length, color: '#f59e0b' },
      { name: 'Débil', value: results.filter(r => r.state === 'Débil').length, color: '#ef4444' },
    ];

    const typeDataMap: Record<string, number> = {};
    results.forEach(r => {
      r.documents.forEach(doc => {
        typeDataMap[doc.type] = (typeDataMap[doc.type] || 0) + 1;
      });
    });
    const typeData = Object.entries(typeDataMap).map(([name, value]) => ({ name, value }));

    const yearTrendMap: Record<string, { total: number, highFocus: number }> = {};
    results.forEach(r => {
      r.documents.forEach(doc => {
        if (!yearTrendMap[doc.year]) yearTrendMap[doc.year] = { total: 0, highFocus: 0 };
        yearTrendMap[doc.year].total += 1;
        if (doc.focus === 'alto') yearTrendMap[doc.year].highFocus += 1;
      });
    });
    const trendData = Object.entries(yearTrendMap)
      .map(([year, stats]) => ({ 
        year, 
        docs: stats.total, 
        highFocus: stats.highFocus,
        ratio: Math.round((stats.highFocus / stats.total) * 100)
      }))
      .sort((a, b) => a.year.localeCompare(b.year));

    return { statusData, typeData, trendData };
  };

  const clearSession = () => {
    setResults([]);
    setInputText('');
    setSelectedIndicator(null);
    setActiveTab('input');
    setAnalysisHint(false);
  };

  const calculateProgress = () => {
    if (results.length === 0) return 0;
    const completed = results.filter(r => r.state === 'Completo').length;
    return Math.round((completed / results.length) * 100);
  };

  const resultsById = new Map(results.map(r => [r.indicator.toLowerCase(), r] as const));

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 font-sans select-none overflow-hidden">
      {/* Header Navigation */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="bg-white border border-slate-200 rounded p-1">
            <img
              src={unamisLogo}
              alt="UNAMIS"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 uppercase">UNAMIS</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none font-semibold">Universidad Nacional de Misiones</p>
          </div>
        </div>
        
        {results.length > 0 && (
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase">AVANCE DE ACREDITACIÓN</span>
              <div className="w-48 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden border border-slate-200">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${calculateProgress()}%` }}
                  className="h-full bg-rose-700"
                ></motion.div>
              </div>
            </div>
            <div className="text-right border-l border-slate-100 pl-8">
              <p className="text-xs font-bold uppercase text-slate-800">Acreditación 2024</p>
              <p className="text-[9px] text-green-600 font-extrabold leading-none uppercase flex items-center justify-end gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> En Auditoría
              </p>
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Indicators List */}
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-3">
            <div className="grid grid-cols-3 gap-1">
              <button 
                onClick={() => setActiveTab('input')}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border",
                  activeTab === 'input' ? "bg-rose-800 text-white border-rose-900 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Carga
              </button>
              <button 
                onClick={() => {
                  if (results.length === 0) {
                    setAnalysisHint(true);
                    setActiveTab('input');
                    return;
                  }
                  setActiveTab('dashboard');
                }}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border",
                  activeTab === 'dashboard'
                    ? "bg-rose-800 text-white border-rose-900 shadow-sm"
                    : results.length === 0
                      ? "bg-white text-slate-600 border-slate-200 opacity-50"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir panel'}
              >
                Panel
              </button>
              <button 
                onClick={() => {
                  if (results.length === 0) {
                    setAnalysisHint(true);
                    setActiveTab('input');
                    return;
                  }
                  setActiveTab('search');
                }}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border",
                  activeTab === 'search'
                    ? "bg-rose-800 text-white border-rose-900 shadow-sm"
                    : results.length === 0
                      ? "bg-white text-slate-600 border-slate-200 opacity-50"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir buscador'}
              >
                Buscador
              </button>
              <button 
                onClick={() => {
                  if (results.length === 0) {
                    setAnalysisHint(true);
                    setActiveTab('input');
                    return;
                  }
                  setActiveTab('matrix');
                }}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border",
                  activeTab === 'matrix'
                    ? "bg-rose-800 text-white border-rose-900 shadow-sm"
                    : results.length === 0
                      ? "bg-white text-slate-600 border-slate-200 opacity-50"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir matriz'}
              >
                Matriz
              </button>
              <button 
                onClick={() => setActiveTab('catalog')}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all border",
                  activeTab === 'catalog' ? "bg-rose-800 text-white border-rose-900 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                Catálogo
              </button>
            </div>
           <div className="relative">
              <input 
                type="text" 
                placeholder="Filtrar por indicador..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-rose-700 placeholder:text-slate-400" 
              />
            </div>

            <button
              onClick={() => setActiveTab('upload')}
              className={cn(
                'w-full px-3 py-2 rounded-md text-[10px] font-bold uppercase transition-all border flex items-center justify-center gap-2',
                activeTab === 'upload'
                  ? 'bg-rose-800 text-white border-rose-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <Upload className="w-3 h-3" /> Asociar Evidencias
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <Clock className="w-8 h-8 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-wider">Esperando datos...</p>
              </div>
            ) : filteredResults.length > 0 ? (
              filteredResults.map((indicator, idx) => (
                <div 
                  key={idx}
                  onClick={() => {
                    setSelectedIndicator(indicator);
                    setActiveTab('results');
                  }}
                  className={cn(
                    "p-3 cursor-pointer border-l-4 transition-all group",
                    selectedIndicator?.indicator === indicator.indicator 
                      ? "bg-rose-50/50 border-rose-800" 
                      : cn("hover:bg-slate-50", getIndicatorBorder(indicator.state))
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-[10px] font-black font-mono",
                      selectedIndicator?.indicator === indicator.indicator ? "text-rose-900" : "text-slate-500"
                    )}>
                      {indicator.indicator}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                      getStatusColor(indicator.state)
                    )}>
                      {indicator.state}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[11px] font-medium leading-tight line-clamp-2 transition-colors",
                    selectedIndicator?.indicator === indicator.indicator ? "text-rose-950" : "text-slate-600 group-hover:text-slate-900"
                  )}>
                    {indicator.description}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 italic">No se encontraron indicadores</div>
            )}
          </div>

          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => {
                logout();
                setAuthedUser('');
              }}
              className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-rose-900 hover:bg-rose-50 py-2 rounded-md text-[10px] font-bold uppercase transition-all"
              title="Cerrar sesión"
            >
              <Settings className="w-3 h-3" />
              Cerrar Sesión
            </button>

            <button 
              onClick={clearSession}
              className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-500 hover:bg-red-50 py-2 rounded-md text-[10px] font-bold uppercase transition-all"
            >
              <Trash2 className="w-3 h-3" />
              Reiniciar Sistema
            </button>
          </div>
        </aside>

        {/* Main Content Panel */}
        <main className="flex-1 p-5 overflow-hidden flex flex-col gap-5 min-h-0">
          <AnimatePresence mode="wait">
            {activeTab === 'input' && (
              <motion.div 
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 flex flex-col max-w-5xl mx-auto w-full"
              >
                <div className="mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-800">CENTRAL DE CARGA DE EVIDENCIAS</h2>
                    <p className="text-xs text-slate-500 font-medium">Ingrese la nomenclatura estandarizada de los archivos del repositorio institucional.</p>
                    {analysisHint && results.length === 0 && (
                      <div className="mt-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-block">
                        Para habilitar Panel, Buscador y Matriz: pegá la lista o subí archivos locales y presioná "Ejecutar Análisis".
                      </div>
                    )}
                  </div>
                  {import.meta.env.DEV && (
                    <button 
                      onClick={() => setInputText(`C1_ANEXO_001_1.1.a_01_actas.pdf
C1_ANEXO_002_1.1.a_02_manual_ed_or.pdf
C1_ANEXO_005_1.1.a_05_inclusion_equidad.pdf
C1_ANEXO_008_1.1.a_08_creacion_lcm.pdf
C1_ANEXO_060_1.1.b_01_organigrama.pdf
C1_ANEXO_062_1.1.b_03_ficha_func_dir_sede_1.pdf
C1_ANEXO_106_1.1.c_01_1_1_a_01_actas.pdf
C1_ANEXO_141_1.2.a_01_comites_autoeval.pdf
C2_ANEXO_001_2.1.a_2023_01_inf_horaria.pdf
C2_ANEXO_005_2.1.a_2023_03_horario_1er_curs.pdf
C2_ANEXO_050_2.1.b_2023_05_algebra.pdf
C2_ANEXO_052_2.1.b_2023_06_geom_trigonometr.pdf
C2_ANEXO_110_2.1.b_2024_15_calculo_1_variab.pdf
C2_ANEXO_225_2.1.b_dictamen_proyecto_geogebra_tic_educacion_matematica_2024.pdf
C3_ANEXO_001_3.1.a_Resolucion_111_2023_Nombramiento_Amalia_Verdun.pdf`)}
                      className="text-[10px] font-bold text-rose-800 hover:text-rose-950 uppercase tracking-wider flex items-center gap-1.5"
                      title="Solo visible en desarrollo"
                    >
                      <Plus className="w-3 h-3" /> Cargar Plantilla de Prueba
                    </button>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Entrada de Registro de Auditoría
                    </span>
                    <span className="text-[9px] font-bold text-rose-800 bg-white border border-rose-100 px-2 py-0.5 rounded shadow-sm">ESTRICTO: NOMENCLATURA DRIVE</span>
                  </div>
                  <textarea 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="[CRI]_[ANX]_[IND]_[NUM]_[DESC] ..."
                    className="flex-1 w-full p-6 text-xs font-mono bg-white resize-none outline-none focus:bg-slate-50/30 transition-colors leading-relaxed"
                  />

                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opción: Analizar Archivos Locales</div>
                        <div className={cn(
                          'text-[10px] font-black uppercase tracking-widest',
                          localAnalysis.status === 'running'
                            ? 'text-amber-700'
                            : localAnalysis.status === 'done'
                              ? 'text-green-700'
                              : localAnalysis.status === 'error'
                                ? 'text-red-700'
                                : 'text-slate-400'
                        )}>
                          {localAnalysis.status === 'running'
                            ? `Leyendo (${Math.round(localAnalysis.progress * 100)}%)`
                            : localAnalysis.status === 'done'
                              ? 'OK'
                              : localAnalysis.status === 'error'
                                ? 'Error'
                                : 'Idle'}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            setLocalAnalysisFiles(files);
                            setLocalAnalysis({ status: 'idle', progress: 0 });
                          }}
                          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:text-slate-700 hover:file:bg-slate-100"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                        />
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                        PDF e imagenes: se extrae texto (OCR si hace falta) y se genera Panel/Matriz.
                      </div>
                      {localAnalysis.status === 'error' && (
                        <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          Fallo el analisis local: {localAnalysis.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                        <span className="text-[10px] font-semibold text-slate-500">Muestreo Aleatorio</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-700"></div>
                        <span className="text-[10px] font-semibold text-rose-800">Integridad de Matriz</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        if (inputText.trim()) {
                          handleAnalyze();
                          return;
                        }
                        runLocalFileAnalysis();
                      }}
                      disabled={isAnalyzing || (!inputText.trim() && localAnalysisFiles.length === 0)}
                      className="bg-slate-900 hover:bg-black text-white px-8 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-slate-200 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
                        </>
                      ) : (
                        <>
                          <BarChart3 className="w-4 h-4" /> Ejecutar Análisis
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 overflow-y-auto pb-8 space-y-6"
              >
                {/* Real Data Visualizations */}
                <div className="grid grid-cols-12 gap-5">
                  {/* Status Pie Chart */}
                  <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <PieIcon className="w-3 h-3 text-rose-700" /> Distribución de Cumplimiento
                    </h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getDashboardData().statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {getDashboardData().statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <ReLegend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Documents by Type Bar Chart */}
                  <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <BarChart3 className="w-3 h-3 text-rose-700" /> Evidencias por Categoría
                    </h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getDashboardData().typeData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <YAxis fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f8fafc'}} />
                          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Trend Line Chart */}
                  <div className="col-span-12 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <LineIcon className="w-3 h-3 text-rose-700" /> Evolución del Enfoque Matemático (Ratio %)
                    </h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getDashboardData().trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="year" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <YAxis fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="ratio" name="% Enfoque Alto" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="docs" name="Volumen Docs" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {results.map((indicator, idx) => (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedIndicator(indicator);
                        setActiveTab('results');
                      }}
                      className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md hover:border-rose-300 transition-all cursor-pointer group flex flex-col gap-3 relative shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black font-mono text-rose-800">{indicator.indicator}</span>
                        <div className={cn("w-2 h-2 rounded-full", indicator.state === 'Completo' ? 'bg-green-500' : indicator.state === 'Parcial' ? 'bg-amber-500' : 'bg-red-500')}></div>
                      </div>
                      <h3 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug h-8">{indicator.description}</h3>
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">DOCS: {indicator.documents.length}</span>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-tighter",
                          indicator.state === 'Completo' ? 'text-green-600' : indicator.state === 'Parcial' ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {indicator.state}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'search' && (
              <motion.div 
                key="search"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 flex flex-col gap-5 overflow-hidden"
              >
                <div className="flex items-center justify-between shrink-0">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Motor de Búsqueda Avanzada</h2>
                  <div className="flex gap-2">
                    <select 
                      value={filterType} 
                      onChange={(e) => setFilterType(e.target.value)}
                      className="text-[10px] font-bold bg-white border border-slate-200 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-rose-700"
                    >
                      <option value="all">TODOS LOS TIPOS</option>
                      <option value="Normativo">NORMATIVO</option>
                      <option value="Académico">ACADÉMICO</option>
                      <option value="Evidencial">EVIDENCIAL</option>
                    </select>
                    <select 
                      value={filterFocus} 
                      onChange={(e) => setFilterFocus(e.target.value)}
                      className="text-[10px] font-bold bg-white border border-slate-200 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-rose-700"
                    >
                      <option value="all">TODOS LOS ENFOQUES</option>
                      <option value="alto">ALTO</option>
                      <option value="medio">MEDIO</option>
                      <option value="bajo">BAJO</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Search className="w-3.5 h-3.5" /> Resultados de Evidencia ({advancedFilteredDocuments.length})
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-100 text-slate-500 uppercase font-black text-[10px] tracking-widest border-b border-slate-200">
                        <tr>
                          <th className="p-3 text-left">Indicador</th>
                          <th className="p-3 text-left">Nomenclatura</th>
                          <th className="p-3 text-left">Tipo</th>
                          <th className="p-3 text-center">Año</th>
                          <th className="p-3 text-center">Enfoque Math</th>
                          <th className="p-3 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {advancedFilteredDocuments.map((doc, idx) => (
                          <tr key={idx} className="hover:bg-rose-50/30 transition-colors group">
                            <td className="p-3 border-r border-slate-50">
                              <span className="font-mono font-bold text-rose-800 block">{doc.indicator}</span>
                              <span className="text-[9px] text-slate-400 font-medium line-clamp-1 truncate max-w-[150px]">{doc.indicatorDesc}</span>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-700 uppercase tracking-tighter truncate max-w-[300px]">{doc.name}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-[4px] text-[9px] font-extrabold uppercase">{doc.type}</span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-500">{doc.year}</td>
                            <td className="p-3 text-center">
                              <span className={cn(
                                "font-black uppercase tracking-tighter text-[10px]",
                                doc.focus === 'alto' ? 'text-green-600' : doc.focus === 'medio' ? 'text-amber-600' : 'text-red-500'
                              )}>
                                {doc.focus}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {doc.link ? (
                                <a
                                  href={doc.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex p-1.5 text-rose-800 hover:bg-rose-800 hover:text-white rounded transition-colors"
                                  title="Abrir en Google Drive"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <button
                                  className="p-1.5 text-slate-300 cursor-not-allowed rounded"
                                  title="Sin link en catálogo"
                                  disabled
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {advancedFilteredDocuments.length === 0 && (
                      <div className="p-20 text-center flex flex-col items-center gap-4 text-slate-300">
                        <Search className="w-12 h-12 opacity-20" />
                        <p className="font-black uppercase tracking-widest text-[10px]">Sin resultados para los filtros aplicados</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'matrix' && (
              <motion.div
                key="matrix"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 overflow-y-auto pb-8 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Matriz Oficial (con evidencias)</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total indicadores: {results.length}</p>
                </div>

                <div className="space-y-5">
                  {OFFICIAL_MATRIX.map((dim) => (
                    <section key={dim.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dimensión {dim.id}</div>
                          <div className="text-sm font-black text-slate-800">{dim.name}</div>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {dim.criteria.map((crit) => (
                          <div key={crit.id} className="p-4">
                            <div className="text-[11px] font-black text-slate-700 uppercase tracking-tight">Criterio {crit.id}: {crit.name}</div>

                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full text-xs border-collapse high-density-table">
                                <thead>
                                  <tr>
                                    <th className="text-left">Indicador</th>
                                    <th className="text-left">Descripción</th>
                                    <th className="text-center">Estado</th>
                                    <th className="text-center">Docs</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {crit.indicators.map((ind) => {
                                    const r = resultsById.get(ind.id.toLowerCase());
                                    const state = r?.state ?? 'Débil';
                                    const docs = r?.documents ?? [];
                                    return (
                                      <tr
                                        key={ind.id}
                                        className="hover:bg-rose-50/30 transition-colors cursor-pointer"
                                        onClick={() => {
                                          if (r) {
                                            setSelectedIndicator(r);
                                            setActiveTab('results');
                                          }
                                        }}
                                      >
                                        <td className="font-mono font-extrabold text-rose-900">{ind.id}</td>
                                        <td className="text-slate-700">{ind.description}</td>
                                        <td className="text-center">
                                          <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                                            getStatusColor(state)
                                          )}>{state}</span>
                                        </td>
                                        <td className="text-center font-black text-slate-600">{docs.length}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'catalog' && (
              <motion.div
                key="catalog"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 overflow-y-auto pb-8 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Catálogo de Anexos (Drive)</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total anexos: {catalog.items.length}</p>
                </div>

                {['1', '2', '3'].map((dimId) => {
                  const dim = OFFICIAL_MATRIX.find((d) => d.id === dimId);
                  const dimItems = catalog.byDimension.get(dimId) ?? [];

                  return (
                    <section key={dimId} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="p-4 bg-slate-50/50 border-b border-slate-200">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dimensión {dimId}</div>
                        <div className="text-sm font-black text-slate-800">{dim?.name ?? 'Sin nombre'}</div>
                      </div>

                      <div className="p-4">
                        {dim ? (
                          <div className="space-y-4">
                            {dim.criteria.map((crit) => (
                              <div key={crit.id} className="border border-slate-100 rounded-lg overflow-hidden">
                                <div className="px-3 py-2 bg-white border-b border-slate-100">
                                  <div className="text-xs font-black text-slate-700 uppercase tracking-tight">Criterio {crit.id}: {crit.name}</div>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {crit.indicators.map((ind) => {
                                    const items = catalog.byIndicator.get(ind.id.toLowerCase()) ?? [];
                                    return (
                                      <div key={ind.id} className="px-3 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="font-mono font-extrabold text-rose-900 text-[15px] leading-none">{ind.id}</div>
                                            <div className="text-[12px] text-slate-700 font-medium leading-snug mt-1">{ind.description}</div>
                                          </div>
                                          <div className="shrink-0 text-[11px] font-black uppercase tracking-widest text-slate-400">{items.length} docs</div>
                                        </div>

                                        {items.length > 0 ? (
                                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {items.map((it) => (
                                              it.pending ? (
                                                <div
                                                  key={it.name}
                                                  className="flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50/30 px-3 py-2"
                                                  title="Pendiente de subir a Drive"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="truncate font-mono text-[11px] font-bold text-slate-800">{it.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-semibold">{it.year ?? 's/a'} · Pendiente</div>
                                                  </div>
                                                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-800 border border-rose-200 bg-white px-2 py-0.5 rounded">Pendiente</span>
                                                </div>
                                              ) : (
                                                <a
                                                  key={it.name}
                                                  href={it.link}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="group flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-rose-300 hover:bg-rose-50/30 transition-colors"
                                                  title="Abrir en Drive"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="truncate font-mono text-[11px] font-bold text-slate-800 group-hover:text-rose-950">{it.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-semibold">{it.year ?? 's/a'}</div>
                                                  </div>
                                                  <ExternalLink className="w-4 h-4 text-rose-800 shrink-0" />
                                                </a>
                                              )
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="mt-3 text-[11px] text-slate-400 italic">Sin anexos cargados en el catálogo para este indicador.</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No se encontró la dimensión en la matriz.</div>
                        )}

                        <div className="mt-6 pt-4 border-t border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Anexos en esta dimensión: {dimItems.length}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col max-w-4xl mx-auto w-full gap-8 py-8 overflow-y-auto min-h-0 pr-1"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Asociación de Nuevas Evidencias</h2>
                  <p className="text-sm text-slate-500 font-medium italic">Sube archivos locales para generar automáticamente sus nomenclaturas académicas.</p>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  {/* Upload Dropzone */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">1. Seleccionar Archivos (PDF/DOCX/JPG)</label>
                    <div 
                      className={cn(
                        "h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all relative overflow-hidden",
                        uploadFiles.length > 0 ? "border-rose-400 bg-rose-50/30" : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300"
                      )}
                    >
                      <input 
                        type="file" 
                        multiple 
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                      />
                      {uploadFiles.length > 0 ? (
                        <div className="text-center">
                          <CheckCircle2 className="w-12 h-12 text-rose-700 mx-auto mb-4" />
                          <p className="text-sm font-bold text-rose-950">{uploadFiles.length} archivos seleccionados</p>
                          <p className="text-[10px] text-rose-800 mt-1 font-semibold uppercase tracking-wider">Haga clic para cambiar selección</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <p className="text-sm font-bold text-slate-600">Arrastra archivos aquí</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">o haz clic para explorar</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Association Details */}
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1 mb-2">2. Asociar a Indicador Académico</label>

                      <div className="mb-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1 mb-2">Descripción breve (para sugerencia)</label>
                        <textarea
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          placeholder="Ej: Informe de carga horaria, asistencia docente, horarios, plan de estudios..."
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none ring-offset-2 focus:ring-2 focus:ring-rose-700 transition-all shadow-sm min-h-20"
                        />
                      </div>

                      <div className="mb-3">
                        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-rose-800" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asistente</div>
                                <div className="flex items-center gap-2">
                                  {previewUrl && uploadFiles[0] && (
                                    <a
                                      href={previewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] font-black uppercase tracking-widest text-rose-800 hover:text-rose-950"
                                      title="Abrir vista previa en nueva pestaña"
                                    >
                                      Abrir
                                    </a>
                                  )}
                                  <div className={cn(
                                    'text-[10px] font-black uppercase tracking-widest',
                                    pdfExtract.status === 'reading'
                                      ? 'text-amber-700'
                                      : pdfExtract.status === 'done'
                                        ? 'text-green-700'
                                        : pdfExtract.status === 'error'
                                          ? 'text-red-700'
                                          : 'text-slate-400'
                                  )}>
                                    {pdfExtract.status === 'reading'
                                      ? 'Leyendo'
                                      : pdfExtract.status === 'done'
                                        ? 'Listo'
                                        : pdfExtract.status === 'error'
                                          ? 'Error'
                                          : 'Idle'}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                                {pdfExtract.status === 'idle' && (
                                  <div className="text-[11px] text-slate-600 font-medium">
                                    Subí un PDF o imagen. Voy a leerlo (OCR si hace falta) y te voy a sugerir el indicador.
                                  </div>
                                )}
                                {pdfExtract.status === 'reading' && (
                                  <div className="text-[11px] text-amber-800 font-semibold">
                                    Leyendo contenido...
                                  </div>
                                )}
                                {pdfExtract.status === 'error' && (
                                  <div className="text-[11px] text-red-700 font-semibold">
                                    No pude leer el archivo. Si es escaneado, el OCR puede fallar sin Internet.
                                  </div>
                                )}
                                {pdfExtract.status === 'done' && (
                                  <div className={cn(
                                    'text-[11px] font-semibold',
                                    pdfExtract.text.trim().length >= 120 ? 'text-green-700' : 'text-amber-800'
                                  )}>
                                    {pdfExtract.text.trim().length >= 120
                                      ? 'Lectura OK. Ya puedo sugerir indicador.'
                                      : 'Lectura débil (poco texto). Si es escaneado, esperá el OCR.'}
                                  </div>
                                )}
                              </div>

                              {pdfExtract.status !== 'idle' && (
                                <div className="mt-2 text-[11px] text-slate-700 bg-white border border-slate-200 rounded-xl p-3 max-h-28 overflow-y-auto">
                                  {pdfExtract.text ? pdfExtract.text.slice(0, 1200) : '...'}
                                </div>
                              )}

                              {ocrState.status !== 'idle' && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OCR</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{Math.round(ocrState.progress * 100)}%</div>
                                  </div>
                                  {ocrState.status === 'error' && (
                                    <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                                      Falló OCR: {ocrState.error}
                                    </div>
                                  )}
                                  {ocrState.status === 'running' && (
                                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                      <div className="h-full bg-rose-700" style={{ width: `${Math.round(ocrState.progress * 100)}%` }} />
                                    </div>
                                  )}
                                  {(ocrState.status === 'running' || ocrState.status === 'done') && (
                                    <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                                      Nota: OCR necesita Internet (descarga motor/idioma) y puede tardar.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {suggestions.length > 0 && !selectedIndicatorForUpload && (
                        <div className="mb-3 bg-rose-50/40 border border-rose-100 rounded-xl p-3">
                          <div className="text-[10px] font-black text-rose-900 uppercase tracking-widest mb-2">Sugerencias</div>
                          <div className="grid grid-cols-1 gap-2">
                            {suggestions.map((s) => (
                              <button
                                key={s.indicator}
                                type="button"
                                onClick={() => setSelectedIndicatorForUpload(s.indicator)}
                                className="text-left rounded-md border border-rose-100 bg-white px-3 py-2 hover:border-rose-300 hover:bg-rose-50/30 transition-colors"
                              >
                                 <div className="text-xs font-black text-rose-900 font-mono">[{s.indicator}] <span className="font-sans font-bold text-slate-700">{s.description}</span></div>
                                 <div className="text-[10px] text-slate-500 font-semibold">
                                   Score: {s.score} · Criterio {s.criterionId}
                                   {s.matched.length > 0 ? ` · Coincidencias: ${s.matched.slice(0, 2).join(' / ')}` : ''}
                                 </div>
                               </button>
                             ))}
                          </div>
                        </div>
                      )}

                      <select 
                        value={selectedIndicatorForUpload}
                        onChange={(e) => setSelectedIndicatorForUpload(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none ring-offset-2 focus:ring-2 focus:ring-rose-700 transition-all shadow-sm"
                      >
                        <option value="">Seleccione indicador destino...</option>
                        {allIndicatorOptions.map(o => (
                          <option key={o.indicator} value={o.indicator}>[{o.indicator}] {o.description.substring(0, 48)}...</option>
                        ))}
                      </select>
                    </div>

                    {pendingEvidence.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendientes de Subir</div>
                          <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest">{pendingEvidence.length}</div>
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                          {pendingEvidence.slice(0, 20).map((p) => (
                            <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-mono text-[11px] font-bold text-slate-800">{p.generatedName}</div>
                                <div className="text-[10px] text-slate-400 font-semibold">Indicador {p.indicatorId}</div>
                              </div>
                              <button
                                onClick={() => setPendingEvidence((prev) => removePendingEvidence(prev, p.id))}
                                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-900"
                                title="Quitar de pendientes"
                              >
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                        {pendingEvidence.length > 20 && (
                          <div className="mt-2 text-[10px] text-slate-400 font-semibold italic">Mostrando 20 (ver todos en Catálogo)</div>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-200 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10"><Database className="w-12 h-12 text-rose-300" /></div>
                      <h4 className="text-[10px] font-black text-rose-300 uppercase tracking-[0.2em] mb-4">Información de Sistema</h4>
                      <div className="space-y-3 text-[11px] font-medium leading-relaxed opacity-90">
                        <p>• Los archivos se renombrarán automáticamente según la norma institutional UNAMIS (Criterio_Anexo_Indicador_Desc).</p>
                        <p>• El análisis disciplinar en matemática se ejecutará en la próxima actualización de matriz.</p>
                      </div>
                      <button 
                        onClick={executeUpload}
                        disabled={uploadFiles.length === 0 || !selectedIndicatorForUpload || isUploading}
                        className="w-full mt-8 bg-rose-800 hover:bg-rose-700 disabled:bg-slate-700 text-white font-black uppercase text-[10px] tracking-widest py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        {isUploading ? (
                          <> <Loader2 className="w-4 h-4 animate-spin" /> Procesando Vinculación... </>
                        ) : (
                          <> <Plus className="w-4 h-4" /> Vincular Evidencias a Matriz </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'results' && selectedIndicator && (
              <motion.div 
                key="results"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex-1 flex flex-col gap-4 overflow-hidden"
              >
                {/* Active Indicator Header */}
                <section className="bg-white p-4 border border-slate-200 rounded-lg shadow-sm shrink-0 flex justify-between items-start relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-rose-800"></div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Análisis del Indicador {selectedIndicator.indicator}</h2>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                        getStatusColor(selectedIndicator.state)
                      )}>
                        {selectedIndicator.state}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-4xl leading-relaxed font-medium">{selectedIndicator.description}</p>
                  </div>
                  <button className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded transition-all shadow-sm">Exportar Reporte</button>
                </section>

                <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
                  {/* Left Column: Documents & Gaps */}
                  <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 overflow-hidden">
                    <div className="bg-white border border-slate-200 rounded-lg flex flex-col flex-1 overflow-hidden shadow-sm">
                      <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Documentos Detectados</h3>
                        <span className="text-[10px] font-bold text-slate-400 bg-white border px-2 py-0.5 rounded uppercase">{selectedIndicator.documents.length} Archivos</span>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-sm text-slate-600 uppercase font-black tracking-tighter border-b border-slate-200">
                            <tr>
                              <th className="p-2 text-left w-2/3">Nomenclatura / Descripción</th>
                              <th className="p-2 text-left">Tipo</th>
                              <th className="p-2 text-center">Foco</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedIndicator.documents.map((doc, idx) => (
                              <tr key={idx} className="hover:bg-rose-50/30 transition-colors group cursor-default">
                                <td className="p-2">
                                  <div className="font-mono text-rose-800 font-bold tracking-tighter truncate max-w-[240px] uppercase">{doc.name}</div>
                                  <div className="text-slate-400 font-sans font-medium flex items-center gap-1.5 mt-0.5 italic">
                                    <Clock className="w-2.5 h-2.5" /> Año {doc.year} • {doc.status}
                                  </div>
                                </td>
                                <td className="p-2">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded-sm font-bold uppercase text-[9px]",
                                    doc.type === 'Normativo' ? 'bg-blue-50 text-blue-700' : doc.type === 'Académico' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'
                                  )}>
                                    {doc.type}
                                  </span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className={cn(
                                    "font-black tracking-tighter uppercase",
                                    doc.focus === 'alto' ? 'text-green-600' : doc.focus === 'medio' ? 'text-amber-600' : 'text-red-500'
                                  )}>
                                    {doc.focus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Brechas Section */}
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg shadow-sm">
                      <h3 className="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Brechas Críticas Detectadas
                      </h3>
                      <ul className="text-[11px] text-rose-700 space-y-2 font-medium">
                        {selectedIndicator.gaps.map((gap, i) => (
                          <li key={i} className="flex gap-2 leading-snug">
                            <span className="shrink-0">•</span>
                            <p>{gap}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Analysis & Summary */}
                  <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 overflow-hidden">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-sm">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nivel de Cumplimiento</label>
                        <p className="text-2xl font-black text-slate-800 tracking-tight leading-none">{selectedIndicator.technicalAnalysis.complianceLevel}</p>
                      </div>
                      <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-sm">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Coherencia Disciplinar</label>
                        <p className="text-2xl font-black text-rose-800 tracking-tight leading-none uppercase">{selectedIndicator.technicalAnalysis.mathCoherence}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-5 flex-1 overflow-y-auto shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-100 pb-2">Evaluación Técnica Exhaustiva</h3>
                      <div className="space-y-5 text-[11px] leading-relaxed text-slate-700 font-medium font-sans">
                        <div className="prose prose-slate prose-sm text-xs max-w-none">
                          <p>{selectedIndicator.technicalAnalysis.observations}</p>
                        </div>
                        
                        <div className="bg-slate-50 border-l-2 border-rose-700 p-3 italic rounded-r shadow-sm">
                          <p className="text-[10px] text-rose-950 font-semibold tracking-tight">Recursos TIC: {selectedIndicator.technicalAnalysis.resourceUsage}</p>
                        </div>
                        
                        <div className="bg-rose-50/50 p-4 rounded-lg border border-rose-100">
                          <h4 className="text-[10px] font-black text-rose-900 uppercase mb-2">Recomendaciones de Mejora</h4>
                          <ul className="space-y-2">
                            {selectedIndicator.recommendations.map((rec, i) => (
                              <li key={i} className="flex gap-2 text-rose-900">
                                <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-rose-950 text-white p-4 rounded-lg shadow-xl relative overflow-hidden shrink-0 border border-rose-900">
                      <div className="absolute top-0 right-0 p-1 opacity-20"><BookOpen className="w-12 h-12" /></div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200 mb-2">Resumen de Evidencia para Informe Final</h3>
                      <div className="text-[11px] leading-relaxed italic text-rose-50 font-serif border-l border-rose-400/30 pl-4 py-1">
                        <ReactMarkdown>{selectedIndicator.finalSummary}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-slate-900 text-white flex items-center px-6 justify-between shrink-0 z-20">
        <div className="flex items-center gap-6 text-[9px] font-black tracking-widest uppercase">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
            Base de Datos Sincronizada
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Último análisis: {results.length > 0 ? "Realizado ahora" : "Ninguno"}</span>
        </div>
        <div className="text-[9px] font-black tracking-[0.3em] text-rose-300 uppercase">
          SEAC MATH • MATRIZ DE TRAZABILIDAD ACADÉMICA V2.5.0
        </div>
      </footer>
    </div>
  );
}
