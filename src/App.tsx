/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
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
  savePendingEvidence,
} from './services/pendingEvidenceStore';
import { buildMaxAnexoByCriterion, nextAnexoForCriterion } from './services/anexoSequencer';
import { extractPdfText, ocrImageText, ocrPdfText } from './services/pdfText';
import { cn } from './lib/utils';
import unamisLogo from './img/logounamis.png';
import Login from './components/Login';

export default function App() {
  const [authedUser, setAuthedUser] = useState<string>('');
  const [authChecked, setAuthChecked] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<IndicatorAnalysis[]>([]);
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'input' | 'dashboard' | 'matrix' | 'catalog' | 'results' | 'search' | 'upload'>('input');
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisHint, setAnalysisHint] = useState(false);

  const [localAnalysisFiles, setLocalAnalysisFiles] = useState<File[]>([]);
  const [localAnalysisDocs, setLocalAnalysisDocs] = useState<{ file: File; text: string }[]>([]);
  const [localAnalysis, setLocalAnalysis] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; progress: number; error?: string }>(
    { status: 'idle', progress: 0 }
  );
  const localAnalysisInputRef = useRef<HTMLInputElement | null>(null);
  
  // Advanced Search Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterFocus, setFilterFocus] = useState<string>('all');
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');
  const [catalogDimensionFilter, setCatalogDimensionFilter] = useState('all');
  const [catalogCriterionFilter, setCatalogCriterionFilter] = useState('all');
  const [openCatalogCriteria, setOpenCatalogCriteria] = useState<Set<string>>(() => new Set(['1.1']));
  const [expandedCatalogIndicators, setExpandedCatalogIndicators] = useState<Set<string>>(() => new Set());

  // Simulated Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedIndicatorForUpload, setSelectedIndicatorForUpload] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadDriveLinks, setUploadDriveLinks] = useState('');
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

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.ok && typeof data.user === 'string') setAuthedUser(data.user);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // Gate the whole app behind a simple login.
  if (!authChecked) return null;
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

  const readLocalAnalysisFiles = async (files: File[]) => {
    setLocalAnalysisFiles(files);
    setLocalAnalysisDocs([]);
    if (files.length === 0) {
      setLocalAnalysis({ status: 'idle', progress: 0 });
      return;
    }

    setLocalAnalysis({ status: 'running', progress: 0 });
    try {
      const docs: { file: File; text: string }[] = [];
      const total = files.length;

      for (let idx = 0; idx < files.length; idx += 1) {
        const f = files[idx]!;
        const name = f.name;
        const isPdf = /\.pdf$/i.test(name);
        const isImage = /\.(png|jpe?g|webp)$/i.test(name);

        let extracted = '';
        if (isPdf) {
          extracted = await extractPdfText(f, 3);
          if ((extracted ?? '').trim().length < 200) {
            try {
              const ocr = await ocrPdfText(f, 2);
              extracted = `${extracted}\n\n${ocr}`.trim();
            } catch {
              // Keep the embedded PDF text if OCR fails.
            }
          }
        } else if (isImage) {
          extracted = await ocrImageText(f);
        }

        docs.push({ file: f, text: `${name}\n${extracted}`.trim() });
        setLocalAnalysisDocs([...docs]);
        setLocalAnalysis({ status: 'running', progress: (idx + 1) / total });
      }

      setLocalAnalysisDocs(docs);
      setLocalAnalysis({ status: 'done', progress: 1 });
    } catch (err: any) {
      setLocalAnalysis({ status: 'error', progress: 0, error: String(err?.message || err) });
    }
  };

  const runLocalFileAnalysis = async () => {
    if (localAnalysisFiles.length === 0) {
      setAnalysisHint(true);
      return;
    }

    if (localAnalysis.status !== 'done' || localAnalysisDocs.length === 0) {
      setAnalysisHint(true);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisHint(false);

    try {
      const docs = localAnalysisDocs;

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
    } catch (err: any) {
      setLocalAnalysis({ status: 'error', progress: 0, error: String(err?.message || err) });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pendingCatalogItems: CatalogItem[] = pendingEvidence.map((p) => ({
    name: p.generatedName,
    link: p.link || '',
    indicatorId: p.indicatorId,
    dimensionId: p.dimensionId,
    year: p.year,
    pending: p.pending ?? true,
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
    try {
      const nowYear = new Date().getFullYear().toString();
      const driveLinks = uploadDriveLinks
        .split(/\r?\n/g)
        .map((x) => x.trim())
        .filter(Boolean);
      const allKnownNames = [
        ...catalog.items.map((x) => x.name),
        ...pendingEvidence.map((p) => p.generatedName),
      ];
      const maxByCriterion = buildMaxAnexoByCriterion(allKnownNames);

      let next = pendingEvidence;
      for (let idx = 0; idx < uploadFiles.length; idx += 1) {
        const f = uploadFiles[idx]!;
        const base = f.name.replace(/\.[^.]+$/, '');
        const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
        const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

        // Consecutive ANEXO number is per criterio folder (e.g. 2.1, 3.2, ...).
        const anexoNum = nextAnexoForCriterion(maxByCriterion, opt.criterionId);
        const anexoStr = String(anexoNum).padStart(3, '0');
        const generatedName = `C${opt.dimensionId}_ANEXO_${anexoStr}_${opt.indicator}_01_${safe}${ext || ''}`;
        const objectUrl = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = generatedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);

        const link = driveLinks[idx] || (uploadFiles.length === 1 ? driveLinks[0] : '') || '';

        next = addPendingEvidence(next, {
          originalName: f.name,
          generatedName,
          indicatorId: opt.indicator.toLowerCase(),
          dimensionId: opt.dimensionId,
          year: nowYear,
          link,
          pending: !link,
        });
      }

      setPendingEvidence(next);
      setUploadFiles([]);
      setSelectedIndicatorForUpload('');
      setUploadDescription('');
      setUploadDriveLinks('');
      setPdfExtract({ status: 'idle', text: '' });
      setOcrState({ status: 'idle', progress: 0 });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setActiveTab('catalog');
    } catch (err: any) {
      alert(`No se pudo codificar el archivo: ${String(err?.message || err)}`);
    } finally {
      setIsUploading(false);
    }
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
    setLocalAnalysisFiles([]);
    setLocalAnalysisDocs([]);
    setLocalAnalysis({ status: 'idle', progress: 0 });
    if (localAnalysisInputRef.current) localAnalysisInputRef.current.value = '';
  };

  const calculateProgress = () => {
    if (results.length === 0) return 0;
    const completed = results.filter(r => r.state === 'Completo').length;
    return Math.round((completed / results.length) * 100);
  };

  const resultsById = new Map(results.map(r => [r.indicator.toLowerCase(), r] as const));
  const catalogCriterionOptions = OFFICIAL_MATRIX.flatMap((dim) =>
    dim.criteria.map((crit) => ({ id: crit.id, name: crit.name, dimensionId: dim.id }))
  );
  const normalizedCatalogSearch = catalogSearchTerm.trim().toLowerCase();
  const dashboardData = getDashboardData();
  const dashboardDocuments = results.flatMap((r) => r.documents.map((doc) => ({ ...doc, indicator: r.indicator, indicatorDesc: r.description })));
  const dashboardStats = {
    total: results.length,
    completed: results.filter((r) => r.state === 'Completo').length,
    partial: results.filter((r) => r.state === 'Parcial').length,
    weak: results.filter((r) => r.state === 'Débil').length,
    docs: dashboardDocuments.length,
  };
  const dashboardProgress = dashboardStats.total > 0 ? Math.round((dashboardStats.completed / dashboardStats.total) * 100) : 0;
  const criticalIndicators = results
    .filter((r) => r.state !== 'Completo')
    .sort((a, b) => (a.state === 'Débil' ? -1 : 1) - (b.state === 'Débil' ? -1 : 1) || a.documents.length - b.documents.length)
    .slice(0, 6);
  const recentDocuments = dashboardDocuments.slice(-6).reverse();
  const maxTypeDocs = Math.max(1, ...dashboardData.typeData.map((item) => item.value));
  const maxYearDocs = Math.max(1, ...dashboardData.trendData.map((item) => item.docs));
  const pendingOnlyEvidence = pendingEvidence.filter((p) => p.pending ?? true);
  const selectedUploadOption = allIndicatorOptions.find((o) => o.indicator === selectedIndicatorForUpload);
  const uploadPreviewNames = (() => {
    if (!selectedUploadOption || uploadFiles.length === 0) return [];
    const allKnownNames = [
      ...catalog.items.map((x) => x.name),
      ...pendingEvidence.map((p) => p.generatedName),
    ];
    const maxByCriterion = buildMaxAnexoByCriterion(allKnownNames);
    return uploadFiles.map((f) => {
      const base = f.name.replace(/\.[^.]+$/, '');
      const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
      const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const anexoNum = nextAnexoForCriterion(maxByCriterion, selectedUploadOption.criterionId);
      const anexoStr = String(anexoNum).padStart(3, '0');
      return `C${selectedUploadOption.dimensionId}_ANEXO_${anexoStr}_${selectedUploadOption.indicator}_01_${safe}${ext || ''}`;
    });
  })();

  return (
    <div className="flex flex-col h-screen w-full bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.08),transparent_34%),linear-gradient(135deg,#fff7f8_0%,#f8fafc_42%,#eef2f7_100%)] text-slate-900 font-sans select-none overflow-hidden">
      {/* Header Navigation */}
      <header className="h-20 bg-white/85 backdrop-blur-xl border-b border-white/70 shadow-[0_10px_40px_rgba(15,23,42,0.06)] flex items-center justify-between gap-4 px-7 shrink-0 z-20 max-md:h-auto max-md:flex-col max-md:items-start max-md:px-4 max-md:py-4">
        <div className="flex items-center gap-4">
          <div className="bg-white border border-rose-100 rounded-2xl p-2 shadow-sm">
            <img
              src={unamisLogo}
              alt="UNAMIS"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-slate-950 uppercase">UNAMIS Autoevaluación</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.24em] leading-none font-bold">Universidad Nacional de Misiones</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm max-md:w-full">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-900 ring-1 ring-rose-100">
            <Settings className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Sesión iniciada</p>
            <p className="truncate text-sm font-black text-slate-900">{authedUser.split('_').join(' ')}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-lg:flex-col">
        {/* Sidebar: Indicators List */}
        <aside className="w-80 bg-white/80 backdrop-blur-xl border-r border-white/80 shadow-[18px_0_50px_rgba(15,23,42,0.06)] flex flex-col shrink-0 max-lg:w-full max-lg:max-h-80 max-lg:border-r-0 max-lg:border-b max-lg:shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="p-4 bg-white/60 border-b border-slate-200/70 space-y-4">
            <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-5 max-sm:grid-cols-2">
              <button 
                onClick={() => setActiveTab('input')}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'input' ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20" : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
                title="Cargar evidencias y ejecutar análisis"
              >
                <FileText className="w-3.5 h-3.5" />
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
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'dashboard'
                    ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20"
                    : results.length === 0
                      ? "bg-white/70 text-slate-400 border-slate-200 opacity-60"
                      : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir panel'}
              >
                <BarChart3 className="w-3.5 h-3.5" />
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
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'search'
                    ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20"
                    : results.length === 0
                      ? "bg-white/70 text-slate-400 border-slate-200 opacity-60"
                      : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir buscador'}
              >
                <Search className="w-3.5 h-3.5" />
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
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'matrix'
                    ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20"
                    : results.length === 0
                      ? "bg-white/70 text-slate-400 border-slate-200 opacity-60"
                      : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
                title={results.length === 0 ? 'Pegá la lista de archivos y ejecutá análisis para habilitar.' : 'Abrir matriz'}
              >
                <ListTodo className="w-3.5 h-3.5" />
                Matriz
              </button>
              <button 
                onClick={() => setActiveTab('catalog')}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'catalog' ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20" : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Catálogo
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  activeTab === 'upload' ? "bg-rose-900 text-white border-rose-950 shadow-lg shadow-rose-900/20" : "bg-white/90 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200"
                )}
                title="Codificar archivo, descargarlo y registrar link de Drive"
              >
                <Upload className="w-3.5 h-3.5" />
                Codificar
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Filtrar por indicador..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs bg-white/95 border border-slate-200 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 placeholder:text-slate-400 shadow-sm" 
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 px-2 py-2">
            {results.length === 0 ? (
              <div className="m-2 rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-slate-400 flex flex-col items-center gap-3">
                <Clock className="w-9 h-9 opacity-25" />
                <p className="text-[10px] font-black uppercase tracking-widest">Esperando datos...</p>
                <p className="text-[11px] font-medium leading-relaxed text-slate-400">La lista de indicadores aparecerá después del análisis.</p>
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
                    "my-1 rounded-xl px-3 py-2.5 cursor-pointer border-l-4 transition-all group",
                    selectedIndicator?.indicator === indicator.indicator 
                      ? "bg-rose-50 border-rose-800 shadow-sm" 
                      : cn("hover:bg-white hover:shadow-sm", getIndicatorBorder(indicator.state))
                  )}
                >
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <span className={cn(
                      "text-[10px] font-black font-mono",
                      selectedIndicator?.indicator === indicator.indicator ? "text-rose-900" : "text-slate-500"
                    )}>
                      {indicator.indicator}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0",
                      getStatusColor(indicator.state)
                    )}>
                      {indicator.state}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[10px] font-semibold leading-tight line-clamp-2 transition-colors",
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

          <div className="p-4 border-t border-slate-100 bg-white/70 space-y-2">
            <button
              onClick={() => {
                fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
                  setAuthedUser('');
                });
              }}
              className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-rose-900 hover:bg-rose-50 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              title="Cerrar sesión"
            >
              <Settings className="w-3 h-3" />
              Cerrar Sesión
            </button>

            <button 
              onClick={clearSession}
              className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-red-600 hover:bg-red-50 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <Trash2 className="w-3 h-3" />
              Reiniciar Sistema
            </button>
          </div>
        </aside>

        {/* Main Content Panel */}
        <main className="flex-1 p-6 overflow-hidden flex flex-col gap-5 min-h-0 max-md:p-4">
          <AnimatePresence mode="wait">
            {activeTab === 'input' && (
              <motion.div 
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 min-h-0 overflow-y-auto pb-14 pr-2 flex flex-col max-w-6xl mx-auto w-full"
              >
                <div className="mb-6 flex justify-between items-end gap-6 rounded-3xl border border-white/80 bg-white/70 px-6 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl max-md:flex-col max-md:items-start max-md:px-5">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-rose-800">
                      <Database className="h-3 w-3" /> Flujo principal
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-950 max-md:text-2xl">Central de Carga de Evidencias</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 font-medium leading-relaxed">Pegá nomenclaturas del repositorio institucional o seleccioná archivos locales. El asistente lee el contenido antes de habilitar el análisis.</p>
                    {analysisHint && results.length === 0 && (
                      <div className="mt-4 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 inline-flex items-center gap-2 shadow-sm">
                        <AlertTriangle className="h-3.5 w-3.5" />
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

                <div className="bg-white/95 border border-white rounded-3xl shadow-[0_24px_80px_rgba(15,23,42,0.10)] flex-none flex flex-col overflow-hidden ring-1 ring-slate-200/70">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-white to-rose-50/40">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Entrada de Registro de Auditoría
                    </span>
                    <span className="text-[9px] font-black text-rose-900 bg-white border border-rose-100 px-3 py-1 rounded-full shadow-sm">ESTRICTO: NOMENCLATURA DRIVE</span>
                  </div>
                  <textarea 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="[CRI]_[ANX]_[IND]_[NUM]_[DESC] ..."
                    className="h-28 w-full p-7 text-xs font-mono bg-white resize-none outline-none focus:bg-rose-50/10 transition-colors leading-relaxed placeholder:text-slate-300"
                  />

                  <div className="px-5 pb-5">
                    <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-slate-50 p-4 shadow-inner">
                      <div className="flex items-start gap-3">
                        <motion.div
                          className="relative flex h-14 w-14 shrink-0 items-center justify-center"
                          animate={{ y: [0, -3, 0] }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <motion.div
                            aria-hidden
                            className="absolute inset-0 rounded-3xl bg-rose-500/20 blur-md"
                            animate={{ scale: [0.9, 1.18, 0.9], opacity: [0.45, 0.85, 0.45] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-rose-700 bg-gradient-to-br from-rose-950 via-rose-800 to-rose-600 shadow-xl shadow-rose-900/25">
                            <motion.div
                              aria-hidden
                              className="absolute inset-x-2 top-2 h-5 rounded-xl bg-white/95 shadow-inner"
                              animate={{ opacity: [0.95, 1, 0.95] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <motion.span
                                className="absolute left-2 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-900"
                                animate={{ scaleY: [1, 0.18, 1] }}
                                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <motion.span
                                className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-900"
                                animate={{ scaleY: [1, 0.18, 1] }}
                                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                              />
                            </motion.div>
                            <div className="absolute bottom-2 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-white/70" />
                            <motion.div
                              aria-hidden
                              className="absolute -right-5 -top-5 h-10 w-10 rounded-full bg-white/20 blur-sm"
                              animate={{ x: [-8, 4, -8], y: [4, -4, 4] }}
                              transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          </div>
                          <motion.span
                            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </motion.div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-black text-rose-800 uppercase tracking-[0.24em]">Asistente de análisis local</div>
                              <div className="mt-1 text-xs font-semibold text-slate-700">Lectura automática, OCR y preparación previa al análisis</div>
                            </div>
                            <div className={cn(
                              'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest',
                              localAnalysis.status === 'running'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : localAnalysis.status === 'done'
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : localAnalysis.status === 'error'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-slate-200 bg-white text-slate-400'
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

                          <div className="mt-4 text-[12px] text-slate-700 bg-white/85 border border-white rounded-2xl px-4 py-3 shadow-sm">
                            {localAnalysisFiles.length > 0
                              ? localAnalysis.status === 'done'
                                ? `${localAnalysisFiles.length} archivo(s) leído(s). Ya podés ejecutar el análisis.`
                                : localAnalysis.status === 'running'
                                  ? 'Estoy leyendo el archivo y aplicando OCR si hace falta. Esperá el OK para ejecutar análisis.'
                                  : 'Archivo seleccionado. Voy a leerlo antes de habilitar el análisis.'
                              : 'Elegí PDF o imágenes aquí. Voy a leer el contenido antes de habilitar Ejecutar Análisis.'}
                          </div>

                          <div className="mt-4 flex items-center gap-3">
                            <input
                              ref={localAnalysisInputRef}
                              type="file"
                              multiple
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                void readLocalAnalysisFiles(files);
                              }}
                              className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm file:mr-3 file:rounded-xl file:border-0 file:bg-rose-900 file:px-4 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:text-white hover:file:bg-rose-800"
                              accept=".pdf,.png,.jpg,.jpeg,.webp"
                            />
                            {(localAnalysisFiles.length > 0 || localAnalysisDocs.length > 0 || localAnalysis.status !== 'idle') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLocalAnalysisFiles([]);
                                  setLocalAnalysisDocs([]);
                                  setLocalAnalysis({ status: 'idle', progress: 0 });
                                  if (localAnalysisInputRef.current) localAnalysisInputRef.current.value = '';
                                }}
                                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                          {localAnalysis.status === 'error' && (
                            <div className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                              Fallo el analisis local: {localAnalysis.error}
                            </div>
                          )}
                          {localAnalysisDocs.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Texto rescatado</div>
                                <div className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-black text-green-700 uppercase tracking-widest">Listo para analizar</div>
                              </div>
                              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
                                {localAnalysisDocs.map((d) => d.text).join('\n\n---\n\n').slice(0, 1800)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Muestreo Aleatorio</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-700"></div>
                        <span className="text-[10px] font-bold text-rose-800 uppercase tracking-widest">Integridad de Matriz</span>
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
                      disabled={isAnalyzing || (!inputText.trim() && (localAnalysisFiles.length === 0 || localAnalysis.status !== 'done'))}
                      className="bg-gradient-to-r from-rose-950 to-rose-800 hover:from-rose-900 hover:to-rose-700 text-white px-9 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-rose-900/20 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95"
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
                className="flex-1 overflow-y-auto pb-10 space-y-6 pr-1"
              >
                <div className="rounded-3xl border border-white bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4 max-lg:flex-col">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-rose-800">
                        <BarChart3 className="h-3 w-3" /> Resumen del análisis
                      </div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-950 max-md:text-2xl">Panel de Autoevaluación</h2>
                      <p className="mt-2 text-sm font-semibold text-slate-500">Lectura ejecutiva de cobertura, brechas y documentos detectados.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avance general</div>
                      <div className="text-2xl font-black text-rose-900">{dashboardProgress}%</div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: 'Indicadores analizados', value: dashboardStats.total, icon: ListTodo, tone: 'slate' },
                      { label: 'Completos', value: dashboardStats.completed, icon: CheckCircle2, tone: 'green' },
                      { label: 'Parciales', value: dashboardStats.partial, icon: Clock, tone: 'amber' },
                      { label: 'Débiles', value: dashboardStats.weak, icon: AlertTriangle, tone: 'rose' },
                      { label: 'Documentos detectados', value: dashboardStats.docs, icon: FileText, tone: 'slate' },
                    ].map((card, index) => {
                      const Icon = card.icon;
                      return (
                        <motion.div
                          key={card.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: index * 0.04 }}
                          className="rounded-2xl border border-white bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className={cn(
                              'flex h-10 w-10 items-center justify-center rounded-2xl ring-1',
                              card.tone === 'green' ? 'bg-green-50 text-green-700 ring-green-100' : card.tone === 'amber' ? 'bg-amber-50 text-amber-700 ring-amber-100' : card.tone === 'rose' ? 'bg-rose-50 text-rose-800 ring-rose-100' : 'bg-slate-50 text-slate-700 ring-slate-100'
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="text-2xl font-black text-slate-950">{card.value}</div>
                          </div>
                          <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-5">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 lg:col-span-4 rounded-3xl border border-white bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                    <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <PieIcon className="h-3 w-3 text-rose-700" /> Distribución de cumplimiento
                    </h4>
                    <div className="relative h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={dashboardData.statusData} cx="50%" cy="50%" innerRadius={66} outerRadius={86} paddingAngle={5} dataKey="value">
                            {dashboardData.statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <ReLegend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
                        <div className="text-center">
                          <div className="text-3xl font-black text-slate-950">{dashboardProgress}%</div>
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Completo</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="col-span-12 lg:col-span-8 rounded-3xl border border-white bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                    <h4 className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <BarChart3 className="h-3 w-3 text-rose-700" /> Evidencias por categoría
                    </h4>
                    {dashboardData.typeData.length > 0 ? (
                      <div className="space-y-4">
                        {dashboardData.typeData.map((item) => (
                          <div key={item.name} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-black text-slate-800">{item.name}</div>
                              <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-800 ring-1 ring-rose-100">{item.value} docs</div>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (item.value / maxTypeDocs) * 100)}%` }} transition={{ duration: 0.7 }} className="h-full rounded-full bg-gradient-to-r from-rose-950 to-rose-600" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                        <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
                        <div className="mt-3 text-sm font-black text-slate-500">Sin documentos detectados todavía</div>
                        <p className="mt-1 text-xs font-semibold text-slate-400">Ejecutá un análisis con evidencias para visualizar categorías.</p>
                      </div>
                    )}
                  </motion.div>
                </div>

                <div className="grid grid-cols-12 gap-5">
                  <div className="col-span-12 lg:col-span-6 rounded-3xl border border-white bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                    <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <AlertTriangle className="h-3 w-3 text-rose-700" /> Indicadores críticos
                    </h4>
                    {criticalIndicators.length > 0 ? (
                      <div className="space-y-2">
                        {criticalIndicators.map((indicator) => (
                          <button
                            key={indicator.indicator}
                            onClick={() => {
                              setSelectedIndicator(indicator);
                              setActiveTab('results');
                            }}
                            className="group flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50/30 hover:shadow-md"
                          >
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-black text-rose-900">{indicator.indicator}</div>
                              <div className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-slate-600">{indicator.description}</div>
                            </div>
                            <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest', getStatusColor(indicator.state))}>{indicator.state}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-center text-sm font-bold text-green-700">No hay indicadores críticos en este análisis.</div>
                    )}
                  </div>

                  <div className="col-span-12 lg:col-span-6 rounded-3xl border border-white bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                    <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <FileText className="h-3 w-3 text-rose-700" /> Últimos documentos detectados
                    </h4>
                    {recentDocuments.length > 0 ? (
                      <div className="space-y-2">
                        {recentDocuments.map((doc, idx) => (
                          <div key={`${doc.indicator}-${doc.name}-${idx}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 ring-1 ring-rose-100">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-black text-slate-900">{doc.name}</div>
                              <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{doc.indicator} · {doc.year}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">Sin documentos recientes.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                  <h4 className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <LineIcon className="h-3 w-3 text-rose-700" /> Resumen anual
                  </h4>
                  {dashboardData.trendData.length > 1 ? (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dashboardData.trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="year" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <YAxis fontSize={10} fontWeight={700} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="docs" name="Documentos" stroke="#9f1239" strokeWidth={3} dot={{ r: 4, fill: '#9f1239' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : dashboardData.trendData.length === 1 ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
                      <div className="text-sm font-black text-amber-900">Sin suficiente información temporal</div>
                      <p className="mt-1 text-xs font-semibold text-amber-800">El análisis solo contiene evidencias del año {dashboardData.trendData[0].year}. Se muestra una lectura anual simple.</p>
                      <div className="mt-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-slate-700">
                          <span>{dashboardData.trendData[0].year}</span>
                          <span>{dashboardData.trendData[0].docs} docs</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (dashboardData.trendData[0].docs / maxYearDocs) * 100)}%` }} className="h-full rounded-full bg-gradient-to-r from-rose-950 to-rose-600" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400">Sin información temporal disponible.</div>
                  )}
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
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Motor de Búsqueda Avanzada</h2>
                  <div className="flex gap-2">
                    <select 
                      value={filterType} 
                      onChange={(e) => setFilterType(e.target.value)}
                      className="text-[10px] font-black bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 shadow-sm"
                    >
                      <option value="all">TODOS LOS TIPOS</option>
                      <option value="Normativo">NORMATIVO</option>
                      <option value="Académico">ACADÉMICO</option>
                      <option value="Evidencial">EVIDENCIAL</option>
                    </select>
                    <select 
                      value={filterFocus} 
                      onChange={(e) => setFilterFocus(e.target.value)}
                      className="text-[10px] font-black bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 shadow-sm"
                    >
                      <option value="all">TODOS LOS ENFOQUES</option>
                      <option value="alto">ALTO</option>
                      <option value="medio">MEDIO</option>
                      <option value="bajo">BAJO</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white/90 border border-white rounded-3xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-white to-rose-50/30 flex items-center justify-between">
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
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Matriz Oficial con Evidencias</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total indicadores: {results.length}</p>
                </div>

                <div className="space-y-5">
                  {OFFICIAL_MATRIX.map((dim) => (
                    <section key={dim.id} className="bg-white/90 border border-white rounded-3xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 overflow-hidden">
                      <div className="p-5 bg-gradient-to-r from-white to-rose-50/30 border-b border-slate-200 flex items-center justify-between">
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
                className="flex-1 overflow-y-auto pb-10 space-y-6 pr-1"
              >
                <div className="sticky top-0 z-10 rounded-3xl border border-white bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4 max-lg:flex-col">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-rose-800">
                        <BookOpen className="h-3 w-3" /> Catálogo institucional
                      </div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-950 max-md:text-2xl">Catálogo de Anexos Drive</h2>
                      <p className="mt-2 text-sm font-semibold text-slate-500">Explorá evidencias por dimensión, criterio e indicador con acceso directo a Drive.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total anexos</div>
                      <div className="text-2xl font-black text-rose-900">{catalog.items.length}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_260px]">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={catalogSearchTerm}
                        onChange={(e) => setCatalogSearchTerm(e.target.value)}
                        placeholder="Buscar por indicador, criterio o nombre de anexo..."
                        className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-rose-200 focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                    <select
                      value={catalogDimensionFilter}
                      onChange={(e) => setCatalogDimensionFilter(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-200"
                    >
                      <option value="all">Todas las dimensiones</option>
                      {OFFICIAL_MATRIX.map((dim) => (
                        <option key={dim.id} value={dim.id}>Dimensión {dim.id}</option>
                      ))}
                    </select>
                    <select
                      value={catalogCriterionFilter}
                      onChange={(e) => setCatalogCriterionFilter(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-200"
                    >
                      <option value="all">Todos los criterios</option>
                      {catalogCriterionOptions
                        .filter((crit) => catalogDimensionFilter === 'all' || crit.dimensionId === catalogDimensionFilter)
                        .map((crit) => (
                          <option key={crit.id} value={crit.id}>Criterio {crit.id}</option>
                        ))}
                    </select>
                  </div>
                </div>

                {['1', '2', '3'].map((dimId) => {
                  const dim = OFFICIAL_MATRIX.find((d) => d.id === dimId);
                  if (!dim || (catalogDimensionFilter !== 'all' && catalogDimensionFilter !== dimId)) return null;
                  const dimensionDocCount = dim.criteria.reduce(
                    (sum, crit) => sum + crit.indicators.reduce((indicatorSum, ind) => (
                      indicatorSum + (catalog.byIndicator.get(ind.id.toLowerCase()) ?? []).length
                    ), 0),
                    0
                  );

                  const visibleCriteria = dim.criteria
                    .map((crit) => {
                      const visibleIndicators = crit.indicators
                        .map((ind) => {
                          const items = catalog.byIndicator.get(ind.id.toLowerCase()) ?? [];
                          const searchMatchesIndicator = !normalizedCatalogSearch
                            || ind.id.toLowerCase().includes(normalizedCatalogSearch)
                            || ind.description.toLowerCase().includes(normalizedCatalogSearch)
                            || crit.name.toLowerCase().includes(normalizedCatalogSearch)
                            || items.some((it) => it.name.toLowerCase().includes(normalizedCatalogSearch));
                          return searchMatchesIndicator ? { ...ind, items } : null;
                        })
                        .filter(Boolean) as Array<(typeof crit.indicators)[number] & { items: CatalogItem[] }>;

                      if (catalogCriterionFilter !== 'all' && catalogCriterionFilter !== crit.id) return null;
                      if (visibleIndicators.length === 0) return null;
                      return { ...crit, visibleIndicators };
                    })
                    .filter(Boolean) as Array<(typeof dim.criteria)[number] & { visibleIndicators: Array<(typeof dim.criteria)[number]['indicators'][number] & { items: CatalogItem[] }> }>;

                  if (visibleCriteria.length === 0) return null;

                  return (
                    <section key={dimId} className="overflow-hidden rounded-3xl border border-white bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                      <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-rose-950 via-rose-900 to-slate-950 p-6 text-white">
                        <div aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
                        <div className="relative flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-200">Dimensión {dimId}</div>
                            <div className="mt-1 text-xl font-black tracking-tight">{dim.name}</div>
                          </div>
                          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-right backdrop-blur">
                            <div className="text-[10px] font-black uppercase tracking-widest text-rose-100">Anexos</div>
                            <div className="text-lg font-black">{dimensionDocCount}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-4">
                        {visibleCriteria.map((crit) => {
                          const isOpen = openCatalogCriteria.has(crit.id) || normalizedCatalogSearch.length > 0 || catalogCriterionFilter !== 'all';
                          const criterionDocs = crit.visibleIndicators.reduce((sum, ind) => sum + ind.items.length, 0);
                          return (
                            <div key={crit.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenCatalogCriteria((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(crit.id)) next.delete(crit.id);
                                    else next.add(crit.id);
                                    return next;
                                  });
                                }}
                                className="flex w-full items-center justify-between gap-4 bg-gradient-to-r from-white to-slate-50 px-5 py-4 text-left transition-colors hover:from-rose-50/60 hover:to-white"
                              >
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-800">Criterio {crit.id}</div>
                                  <div className="mt-1 truncate text-sm font-black text-slate-900">{crit.name}</div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{criterionDocs} docs</span>
                                  <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.18 }}>
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                  </motion.span>
                                </div>
                              </button>

                              <AnimatePresence initial={false}>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22, ease: 'easeOut' }}
                                    className="overflow-hidden"
                                  >
                                    <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4">
                                      {crit.visibleIndicators.map((ind) => {
                                        const isExpanded = expandedCatalogIndicators.has(ind.id);
                                        const visibleItems = isExpanded ? ind.items : ind.items.slice(0, 8);
                                        return (
                                          <div key={ind.id} className="rounded-3xl border border-white bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                                            <div className="flex items-start justify-between gap-4 max-md:flex-col">
                                              <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="rounded-2xl bg-rose-950 px-3 py-1.5 font-mono text-sm font-black text-white shadow-lg shadow-rose-900/20">{ind.id}</span>
                                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{ind.items.length} docs</span>
                                                  {ind.items.some((it) => it.pending) && (
                                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">Pendientes</span>
                                                  )}
                                                </div>
                                                <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{ind.description}</p>
                                              </div>
                                            </div>

                                            {ind.items.length > 0 ? (
                                              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                {visibleItems.map((it) => {
                                                  const fileName = it.name.replace(/_/g, ' ');
                                                  const content = (
                                                    <>
                                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 ring-1 ring-rose-100 transition-colors group-hover:bg-rose-900 group-hover:text-white">
                                                        <FileText className="h-4 w-4" />
                                                      </div>
                                                      <div className="min-w-0 flex-1">
                                                        <div className="truncate text-[12px] font-black text-slate-900 group-hover:text-rose-950" title={it.name}>{fileName}</div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                          <span>{it.year ?? 's/a'}</span>
                                                          {it.pending && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200">Pendiente</span>}
                                                        </div>
                                                      </div>
                                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-rose-800 transition-colors group-hover:border-rose-200 group-hover:bg-rose-50" title={it.pending ? 'Pendiente de subir a Drive' : 'Abrir en Drive'}>
                                                        {it.pending ? <Clock className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                                      </div>
                                                    </>
                                                  );

                                                  return it.pending ? (
                                                    <div key={it.name} className="group flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-3 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                                                      {content}
                                                    </div>
                                                  ) : (
                                                    <a
                                                      key={it.name}
                                                      href={it.link}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50/30 hover:shadow-md"
                                                    >
                                                      {content}
                                                    </a>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-[11px] font-semibold text-slate-400">Sin anexos cargados en el catálogo para este indicador.</div>
                                            )}

                                            {ind.items.length > 8 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setExpandedCatalogIndicators((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(ind.id)) next.delete(ind.id);
                                                    else next.add(ind.id);
                                                    return next;
                                                  });
                                                }}
                                                className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-800 transition-colors hover:bg-rose-100"
                                              >
                                                {isExpanded ? 'Ver menos' : `Ver ${ind.items.length - 8} más`}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {['1', '2', '3'].every((dimId) => {
                  const dim = OFFICIAL_MATRIX.find((d) => d.id === dimId);
                  if (!dim || (catalogDimensionFilter !== 'all' && catalogDimensionFilter !== dimId)) return true;
                  return dim.criteria.every((crit) => {
                    if (catalogCriterionFilter !== 'all' && catalogCriterionFilter !== crit.id) return true;
                    return crit.indicators.every((ind) => {
                      const items = catalog.byIndicator.get(ind.id.toLowerCase()) ?? [];
                      return normalizedCatalogSearch
                        && !ind.id.toLowerCase().includes(normalizedCatalogSearch)
                        && !ind.description.toLowerCase().includes(normalizedCatalogSearch)
                        && !crit.name.toLowerCase().includes(normalizedCatalogSearch)
                        && !items.some((it) => it.name.toLowerCase().includes(normalizedCatalogSearch));
                    });
                  });
                }) && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-12 text-center shadow-sm">
                    <Search className="mx-auto h-10 w-10 text-slate-300" />
                    <div className="mt-3 text-sm font-black uppercase tracking-widest text-slate-500">Sin resultados</div>
                    <p className="mt-2 text-sm font-semibold text-slate-400">Probá limpiar el buscador o cambiar los filtros del catálogo.</p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 min-h-0 w-full overflow-y-auto pb-10 pr-1"
              >
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
                <div className="rounded-3xl border border-white bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur-xl sm:p-6">
                  <div className="flex items-start justify-between gap-4 max-md:flex-col">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-rose-800">
                        <Download className="h-3 w-3" /> Flujo manual Drive
                      </div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-950 max-sm:text-2xl">Codificador de Evidencias</h2>
                      <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                        Seleccioná el archivo, el asistente lo lee, elegís el indicador, la app genera el nombre oficial y descarga una copia lista para subir a Drive.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm max-md:w-full max-md:text-left">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</div>
                      <div className="mt-1 text-sm font-black text-rose-900">{uploadFiles.length > 0 ? `${uploadFiles.length} archivo(s)` : 'Esperando archivo'}</div>
                    </div>
                  </div>
                  {analysisHint && results.length === 0 && (
                    <div className="mt-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-block">
                      Primero sube archivos y vincula evidencias para habilitar Panel, Buscador y Matriz.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                  {/* Upload Dropzone */}
                  <div className="space-y-4 rounded-3xl border border-white bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 ring-1 ring-rose-100">
                        <span className="text-xs font-black">1</span>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar archivo</label>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Acepta PDF, imagen, DOCX u otros archivos. El nombre final se generará después de elegir indicador.</p>
                      </div>
                    </div>
                    <div 
                      className={cn(
                        "min-h-56 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-6 transition-all relative overflow-hidden text-center sm:min-h-64",
                        uploadFiles.length > 0 ? "border-rose-300 bg-rose-50/50" : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300"
                      )}
                    >
                      <input 
                        type="file" 
                        multiple 
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                      />
                      {uploadFiles.length > 0 ? (
                        <div>
                          <CheckCircle2 className="w-12 h-12 text-rose-700 mx-auto mb-4" />
                          <p className="text-sm font-black text-rose-950">{uploadFiles.length} archivo(s) seleccionado(s)</p>
                          <div className="mt-3 max-h-24 space-y-1 overflow-y-auto rounded-2xl bg-white/80 p-3 text-left">
                            {uploadFiles.map((file) => (
                              <div key={`${file.name}-${file.size}`} className="truncate text-[11px] font-bold text-slate-600">{file.name}</div>
                            ))}
                          </div>
                          <p className="text-[10px] text-rose-800 mt-3 font-black uppercase tracking-wider">Tocá para cambiar selección</p>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <p className="text-sm font-black text-slate-700">Arrastrá archivos aquí</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">o haz clic para explorar</p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cómo funciona</div>
                      <ol className="mt-2 space-y-2 text-xs font-semibold leading-relaxed text-slate-600">
                        <li>1. Subís o elegís el archivo local.</li>
                        <li>2. El asistente lee contenido y sugiere indicador.</li>
                        <li>3. Confirmás indicador y se calcula el siguiente anexo.</li>
                        <li>4. Descargás el archivo renombrado y luego pegás el link de Drive.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Association Details */}
                  <div className="space-y-4 rounded-3xl border border-white bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 sm:p-5">
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 ring-1 ring-rose-100">
                          <span className="text-xs font-black">2</span>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Asociar a indicador académico</label>
                          <p className="mt-1 text-xs font-semibold text-slate-500">Podés usar las sugerencias del asistente o seleccionar manualmente el indicador destino.</p>
                        </div>
                      </div>

                      <div className="mb-3 mt-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1 mb-2">Descripción breve (para sugerencia)</label>
                        <textarea
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          placeholder="Ej: Informe de carga horaria, asistencia docente, horarios, plan de estudios..."
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none ring-offset-2 focus:ring-2 focus:ring-rose-700 transition-all shadow-sm min-h-20"
                        />
                      </div>

                      <div className="mb-3">
                        <div className="bg-gradient-to-br from-rose-50/80 via-white to-slate-50 border border-rose-100 rounded-2xl p-3 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-rose-800" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                  <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest">Asistente</div>
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
                                    'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
                                    pdfExtract.status === 'reading'
                                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                                      : pdfExtract.status === 'done'
                                        ? 'border-green-200 bg-green-50 text-green-700'
                                        : pdfExtract.status === 'error'
                                          ? 'border-red-200 bg-red-50 text-red-700'
                                          : 'border-slate-200 bg-white text-slate-400'
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
                        <div className="mb-3 bg-rose-50/60 border border-rose-100 rounded-2xl p-3">
                          <div className="text-[10px] font-black text-rose-900 uppercase tracking-widest mb-2">Sugerencias</div>
                          <div className="grid grid-cols-1 gap-2">
                            {suggestions.map((s) => (
                              <button
                                key={s.indicator}
                                type="button"
                                onClick={() => setSelectedIndicatorForUpload(s.indicator)}
                                  className="text-left rounded-xl border border-rose-100 bg-white px-3 py-2 hover:border-rose-300 hover:bg-rose-50/30 transition-colors"
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

                      {selectedUploadOption && (
                        <div className="mt-3 rounded-2xl border border-green-100 bg-green-50/70 p-4">
                          <div className="text-[10px] font-black uppercase tracking-widest text-green-700">Indicador seleccionado</div>
                          <div className="mt-2 font-mono text-sm font-black text-green-900">{selectedUploadOption.indicator}</div>
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-green-800">{selectedUploadOption.description}</p>
                          <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-green-700">Criterio {selectedUploadOption.criterionId}</div>
                        </div>
                      )}

                      {uploadPreviewNames.length > 0 && (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vista previa del nombre oficial</div>
                          <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                            {uploadPreviewNames.map((name) => (
                              <div key={name} className="rounded-xl bg-white px-3 py-2 font-mono text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 break-all">{name}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1 mb-2">Link de Drive si ya lo subiste (opcional)</label>
                        <textarea
                          value={uploadDriveLinks}
                          onChange={(e) => setUploadDriveLinks(e.target.value)}
                          placeholder="Si ya subiste el archivo codificado a Drive, pegá aquí el link. Si son varios archivos, un link por línea."
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none ring-offset-2 focus:ring-2 focus:ring-rose-700 transition-all shadow-sm min-h-20"
                        />
                        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500 leading-relaxed">
                          {uploadDriveLinks.trim()
                            ? 'Al presionar el botón, se descarga el archivo codificado y también se agrega al catálogo con este link.'
                            : 'Al presionar el botón, se descarga el archivo codificado y se agrega al catálogo como PENDIENTE. Luego podés pegar el link desde Pendientes.'}
                        </div>
                      </div>

                      <div className={cn(
                        'mt-3 rounded-2xl border px-4 py-3',
                        uploadDriveLinks.trim() ? 'border-green-100 bg-green-50/80' : 'border-amber-100 bg-amber-50/80'
                      )}>
                        <div className={cn(
                          'text-[10px] font-black uppercase tracking-widest',
                          uploadDriveLinks.trim() ? 'text-green-700' : 'text-amber-700'
                        )}>Resultado al registrar</div>
                        <div className={cn(
                          'mt-1 text-xs font-bold leading-relaxed',
                          uploadDriveLinks.trim() ? 'text-green-800' : 'text-amber-800'
                        )}>
                          {uploadDriveLinks.trim()
                            ? 'Se verá en el Catálogo como anexo cargado con botón para abrir Drive.'
                            : 'Se verá en el Catálogo como pendiente hasta que agregues el link.'}
                        </div>
                      </div>
                    </div>

                    {pendingOnlyEvidence.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendientes de Subir</div>
                          <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest">{pendingOnlyEvidence.length}</div>
                        </div>
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                          {pendingOnlyEvidence.slice(0, 20).map((p) => (
                            <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-mono text-[11px] font-bold text-slate-800">{p.generatedName}</div>
                                <div className="text-[10px] text-slate-400 font-semibold">Indicador {p.indicatorId}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  onClick={() => {
                                    const link = window.prompt('Pegá el hipervínculo de Drive para este anexo:')?.trim();
                                    if (!link) return;
                                    setPendingEvidence((prev) => {
                                      const updated = prev.map((item) => item.id === p.id ? { ...item, link, pending: false } : item);
                                      savePendingEvidence(updated);
                                      return updated;
                                    });
                                  }}
                                  className="text-[10px] font-black uppercase tracking-widest text-rose-800 hover:text-rose-950"
                                  title="Agregar link de Drive"
                                >
                                  Link
                                </button>
                                <button
                                  onClick={() => setPendingEvidence((prev) => removePendingEvidence(prev, p.id))}
                                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-900"
                                  title="Quitar de pendientes"
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {pendingOnlyEvidence.length > 20 && (
                          <div className="mt-2 text-[10px] text-slate-400 font-semibold italic">Mostrando 20 (ver todos en Catálogo)</div>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-xl shadow-slate-200 relative overflow-hidden sm:p-6">
                      <div className="absolute top-0 right-0 p-2 opacity-10"><Database className="w-12 h-12 text-rose-300" /></div>
                      <h4 className="text-[10px] font-black text-rose-300 uppercase tracking-[0.2em] mb-4">Información de Sistema</h4>
                      <div className="space-y-3 text-[11px] font-medium leading-relaxed opacity-90">
                        <p>• La app calcula el siguiente número de anexo del criterio seleccionado.</p>
                        <p>• El botón descarga el archivo renombrado y registra el anexo en el catálogo.</p>
                        <p>• Si pegaste link, entra con vínculo. Si no, queda pendiente para cargarlo después.</p>
                      </div>
                      <button 
                        onClick={executeUpload}
                        disabled={uploadFiles.length === 0 || !selectedIndicatorForUpload || isUploading}
                        className="w-full mt-6 bg-rose-800 hover:bg-rose-700 disabled:bg-slate-700 text-white font-black uppercase text-[10px] tracking-widest py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        {isUploading ? (
                          <> <Loader2 className="w-4 h-4 animate-spin" /> Codificando... </>
                        ) : (
                          <> <Download className="w-4 h-4" /> {uploadDriveLinks.trim() ? 'Descargar y Agregar al Catálogo' : 'Descargar y Dejar Pendiente'} </>
                        )}
                      </button>
                    </div>
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
                <section className="bg-white/90 p-5 border border-white rounded-3xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 shrink-0 flex justify-between items-start relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-rose-900 to-rose-500"></div>
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
                  <button className="px-5 py-2.5 bg-rose-950 hover:bg-rose-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-rose-900/20">Exportar Reporte</button>
                </section>

                <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
                  {/* Left Column: Documents & Gaps */}
                  <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 overflow-hidden">
                    <div className="bg-white/90 border border-white rounded-3xl flex flex-col flex-1 overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
                      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-white to-rose-50/30 flex justify-between items-center">
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
                    <div className="bg-rose-50/90 border border-rose-200 p-5 rounded-3xl shadow-sm">
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
                      <div className="bg-white/90 p-5 border border-white rounded-3xl shadow-sm ring-1 ring-slate-200/70">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nivel de Cumplimiento</label>
                        <p className="text-2xl font-black text-slate-800 tracking-tight leading-none">{selectedIndicator.technicalAnalysis.complianceLevel}</p>
                      </div>
                      <div className="bg-white/90 p-5 border border-white rounded-3xl shadow-sm ring-1 ring-slate-200/70">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Coherencia Disciplinar</label>
                        <p className="text-2xl font-black text-rose-800 tracking-tight leading-none uppercase">{selectedIndicator.technicalAnalysis.mathCoherence}</p>
                      </div>
                    </div>

                    <div className="bg-white/90 border border-white rounded-3xl p-5 flex-1 overflow-y-auto shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
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

                    <div className="bg-gradient-to-br from-rose-950 to-slate-950 text-white p-5 rounded-3xl shadow-xl shadow-rose-950/20 relative overflow-hidden shrink-0 border border-rose-900">
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
      <footer className="h-9 bg-slate-950 text-white flex items-center px-7 justify-between shrink-0 z-20 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] max-md:hidden">
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
