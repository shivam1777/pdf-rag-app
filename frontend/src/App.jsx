import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import {
  Plus, Sun, Moon, PanelLeft, PanelLeftClose,
  Upload, Send, Bot, User, CheckCircle2,
  RefreshCw, FileText, Layers, Trash2, Copy, 
  Check, X, MessageSquare, Mic, Volume2, StopCircle, 
  GraduationCap, ChevronDown, BookOpen, ZoomIn, ZoomOut, Maximize, Download,
  LogOut, LogIn, Share2, Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { pdfjs, Document, Page } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const MAX_FILE_MB = 25;

// --- SUPABASE CLIENT SETUP ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const blankSession = () => ({
  id: uid(),
  title: "New chat",
  fileName: null,
  isUploaded: false,
  pdfBase64: null,
  messages: [],
  shareToken: null,
  createdAt: Date.now(),
});

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("documind_theme");
    return saved ? saved === "dark" : true;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // --- AUTHENTICATION STATE ---
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // --- PUBLIC SHARE VIEW STATE ---
  const [sharedViewData, setSharedViewData] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');
    if (shareToken) {
      fetchSharedSession(shareToken);
    }

    return () => subscription.unsubscribe();
  }, []);

  const fetchSharedSession = async (token) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('share_token', token)
        .single();
      
      if (data && !error) {
        setSharedViewData(data);
      } else {
        alert("Shared session not found or link has expired.");
      }
    } catch (err) {
      console.error("Error fetching shared session", err);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        alert("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        setShowAuthModal(false);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- CURSOR MOUSE TRACKING STATE ---
  const [mousePosition, setMousePosition] = useState({ x: -500, y: -500 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const [sessions, setSessions] = useState(() => {
    try {
      const raw = localStorage.getItem("documind_sessions");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) && parsed.length ? parsed : [blankSession()];
    } catch {
      return [blankSession()];
    }
  });
  const [currentSessionId, setCurrentSessionId] = useState(() => sessions[0]?.id);

  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages ?? [];
  const isUploaded = !!currentSession?.isUploaded;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);

  // --- SEMANTIC CITATION HIGHLIGHT STATE ---
  const [activeHighlight, setActiveHighlight] = useState(null);

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideData, setGuideData] = useState(null);
  const [revealedAnswers, setRevealedAnswers] = useState({});

  const [numPages, setNumPages] = useState(null);
  const [showPdfViewer, setShowPdfViewer] = useState(true);
  const [pdfScale, setPdfScale] = useState(1.0); 

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("documind_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem("documind_sessions", JSON.stringify(sessions));
      if (user && currentSession) {
        syncSessionToCloud(currentSession);
      }
    } catch (e) {
      console.warn("Storage limit reached.", e);
    }
  }, [sessions, user]);

  const syncSessionToCloud = async (sessionData) => {
    try {
      await supabase.from('sessions').upsert({
        id: sessionData.id,
        user_id: user.id,
        title: sessionData.title,
        is_uploaded: sessionData.isUploaded,
        file_name: sessionData.fileName,
        messages: sessionData.messages,
        share_token: sessionData.shareToken,
        updated_at: new Date(),
      });
    } catch (e) {
      console.error("Cloud sync error", e);
    }
  };

  const generatePublicShareLink = async () => {
    const token = currentSession.shareToken || Math.random().toString(36).substring(2, 10);
    patchSession(currentSession.id, { shareToken: token });
    
    if (user) {
      await supabase.from('sessions').update({ share_token: token }).eq('id', currentSession.id);
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${token}`;
    navigator.clipboard.writeText(shareUrl);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [query]);

  useEffect(() => {
    if (isUploaded && textareaRef.current) {
      setTimeout(() => textareaRef.current.focus(), 100);
    }
  }, [isUploaded]);

  const patchSession = useCallback((id, patch) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s))
    );
  }, []);

  const handleNewChat = () => {
    const fresh = blankSession();
    setSessions((prev) => [fresh, ...prev]);
    setCurrentSessionId(fresh.id);
    setQuery("");
    setUploadError("");
    setGuideData(null);
    setShowPdfViewer(true);
    setPdfScale(1.0);
    window.speechSynthesis.cancel(); 
    setSpeakingIndex(null);
  };

  const handleSelectSession = (id) => {
    setCurrentSessionId(id);
    setQuery("");
    setUploadError("");
    setShowPdfViewer(true);
    window.speechSynthesis.cancel();
    setSpeakingIndex(null);
  };

  const handleDeleteSession = async (id, e) => {
    e.stopPropagation();
    if (user) {
      await supabase.from('sessions').delete().eq('id', id);
    }
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = blankSession();
        setCurrentSessionId(fresh.id);
        return [fresh];
      }
      if (id === currentSessionId) setCurrentSessionId(next[0].id);
      return next;
    });
  };

  const validateAndUpload = async (selectedFile) => {
    if (!selectedFile) return;
    setUploadError("");
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are supported.");
      return;
    }
    if (selectedFile.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`File is too large — please keep it under ${MAX_FILE_MB}MB.`);
      return;
    }

    const sessionId = currentSession.id;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const base64Pdf = reader.result;

      try {
        await axios.post(`${API_BASE}/upload`, formData);
        patchSession(sessionId, {
          fileName: selectedFile.name,
          isUploaded: true,
          title: selectedFile.name.replace(/\.pdf$/i, ""),
          pdfBase64: base64Pdf,
        });
        setGuideData(null); 
        setShowPdfViewer(true);
      } catch (err) {
        setUploadError(err.response?.data?.detail || err.message || "Upload failed. Is the backend running?");
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setUploading(false);
      setUploadError("Failed to read PDF file.");
    };
  };

  const handleFileInputChange = (e) => {
    validateAndUpload(e.target.files[0]);
    e.target.value = ""; 
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    validateAndUpload(e.dataTransfer.files?.[0]);
  };

  const handleSendQuery = async (customQuery) => {
    const textToSend = (customQuery ?? query).trim();
    if (!textToSend || !isUploaded || loading) return;

    const sessionId = currentSession.id;
    const userMsg = { role: "user", text: textToSend };
    
    const historyToSend = currentSession.messages.map(m => ({
      role: m.role,
      content: m.text
    }));

    patchSession(sessionId, (s) => ({
      messages: [...s.messages, userMsg],
      title: s.title === "New chat" || !s.title ? textToSend.slice(0, 48) : s.title,
    }));
    setQuery("");
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat`, { 
        question: textToSend,
        history: historyToSend
      });
      
      const botMsg = { role: "bot", text: res.data.answer, sources: res.data.sources };
      patchSession(sessionId, (s) => ({ messages: [...s.messages, botMsg] }));
    } catch (err) {
      const botMsg = { role: "bot", text: "⚠️ **Error:** Unable to fetch an answer." };
      patchSession(sessionId, (s) => ({ messages: [...s.messages, botMsg] }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendQuery();
    }
  };

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {}
  };

  const exportChatAsMarkdown = () => {
    if (!messages.length) return;
    const markdownContent = messages.map(m => `### ${m.role === 'user' ? 'User' : 'DocuMind AI'}\n\n${m.text}\n`).join("\n---\n\n");
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentSession.title || 'chat-export'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Your browser does not support Voice Recognition."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => setQuery((prev) => prev ? prev + " " + event.results[0][0].transcript : event.results[0][0].transcript);
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const toggleSpeech = (text, index) => {
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeakingIndex(index);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    window.speechSynthesis.speak(utterance);
  };

  const generateStudyGuide = async () => {
    setShowGuideModal(true);
    if (guideData) return; 
    setGuideLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/study-guide`);
      setGuideData(res.data);
    } catch (err) {
      alert("Error generating study guide. Make sure your Python backend is running.");
      setShowGuideModal(false);
    } finally {
      setGuideLoading(false);
    }
  };

  const toggleAnswer = (idx) => {
    setRevealedAnswers(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const scrollToPage = (pageNumber, bbox = null) => {
    if (bbox) {
      setActiveHighlight({ page: pageNumber, bbox });
      setTimeout(() => setActiveHighlight(null), 3500);
    }

    if (!showPdfViewer) {
      setShowPdfViewer(true);
      setTimeout(() => executeScroll(pageNumber), 300);
    } else {
      executeScroll(pageNumber);
    }
  };

  const executeScroll = (pageNumber) => {
    const pageElement = document.getElementById(`pdf-page-${pageNumber}`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pageElement.classList.add('ring-4', 'ring-emerald-500', 'transition-all', 'duration-500');
      setTimeout(() => {
        pageElement.classList.remove('ring-4', 'ring-emerald-500');
      }, 1500);
    }
  };

  const sortedSessions = [...sessions].sort((a, b) => b.createdAt - a.createdAt);

  if (sharedViewData) {
    return (
      <div className={`flex h-screen w-screen overflow-hidden ${darkMode ? 'bg-[#121214]' : 'bg-[#f8fafc]'} text-zinc-100 flex-col items-center justify-center p-6`}>
        <div className={`w-full max-w-3xl h-[85vh] flex flex-col rounded-3xl p-6 border shadow-2xl backdrop-blur-xl ${darkMode ? 'bg-[#18181b] border-zinc-700/50' : 'bg-white border-zinc-200 text-zinc-800'}`}>
          <div className="flex items-center justify-between pb-4 border-b border-zinc-500/20 mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              <h1 className="font-bold text-lg">{sharedViewData.title} (Public Shared Session)</h1>
            </div>
            <a href="/" className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-medium">Open DocuMind AI</a>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {sharedViewData.messages?.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-emerald-600 text-white px-4 py-3 rounded-2xl' : 'flex-1 p-3 rounded-2xl bg-zinc-800/50'}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex h-screen w-screen overflow-hidden ${darkMode ? 'bg-[#121214]' : 'bg-[#f8fafc]'} relative selection:bg-emerald-500 selection:text-white`}
    >

      {/* --- CURSOR-REACTIVE GLOW SPOTLIGHT --- */}
      <div 
        className={`absolute inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
      >
        <div 
          className={`absolute w-[450px] h-[450px] rounded-full blur-[100px] transition-all duration-150 ease-out pointer-events-none ${
            darkMode ? 'bg-gradient-to-r from-emerald-600/25 via-teal-500/20 to-indigo-600/25' : 'bg-gradient-to-r from-emerald-400/30 via-teal-300/20 to-blue-400/30'
          }`}
          style={{
            transform: `translate(${mousePosition.x - 225}px, ${mousePosition.y - 225}px)`,
          }}
        />
      </div>

      <div className={`relative z-10 flex h-full w-full ${darkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>

        {/* AUTH MODAL */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border ${darkMode ? 'bg-[#18181b] border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-800'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">{isSignUp ? 'Create Supabase Account' : 'Sign In to Cloud Sync'}</h2>
                  <button onClick={() => setShowAuthModal(false)}><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleAuth} className="space-y-4">
                  <input type="email" placeholder="Email address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className={`w-full p-3 rounded-xl border text-sm ${darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-50 border-zinc-300'}`} required />
                  <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className={`w-full p-3 rounded-xl border text-sm ${darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-50 border-zinc-300'}`} required />
                  <button type="submit" className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-500">{isSignUp ? 'Sign Up' : 'Sign In'}</button>
                </form>
                <button onClick={() => setIsSignUp(!isSignUp)} className="mt-4 text-xs text-emerald-400 hover:underline block text-center w-full">
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL (Study Guide) */}
        <AnimatePresence>
          {showGuideModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl ${
                  darkMode ? 'bg-[#18181b]/90 border border-zinc-700/50 text-zinc-200 backdrop-blur-xl' : 'bg-white/90 border border-zinc-200 text-zinc-800 backdrop-blur-xl'
                }`}
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-lg text-white">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Document Study Guide</h2>
                      <p className="text-xs opacity-70">AI-Generated Analysis & Quiz</p>
                    </div>
                  </div>
                  <button onClick={() => setShowGuideModal(false)} className="p-2 rounded-full hover:bg-zinc-500/20 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {guideLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-sm font-medium animate-pulse">Reading document & crafting your study guide...</p>
                  </div>
                ) : guideData ? (
                  <div className="space-y-8 pb-4">
                    <section>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 mb-2">Executive Summary</h3>
                      <p className="text-sm leading-relaxed opacity-90">{guideData.summary}</p>
                    </section>
                    <section>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 mb-3">Key Takeaways</h3>
                      <ul className="space-y-2">
                        {guideData.takeaways.map((point, idx) => (
                          <li key={idx} className="flex gap-3 text-sm">
                            <span className="text-emerald-500 mt-0.5">•</span>
                            <span className="opacity-90">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 mb-3">Test Your Knowledge</h3>
                      <div className="space-y-3">
                        {guideData.quiz.map((q, idx) => (
                          <div key={idx} className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#27272a]/60 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
                            <p className="text-sm font-semibold mb-3">Q: {q.question}</p>
                            <button 
                              onClick={() => toggleAnswer(idx)}
                              className="text-xs font-medium text-emerald-500 flex items-center gap-1 transition-colors"
                            >
                              {revealedAnswers[idx] ? 'Hide Answer' : 'Show Answer'} <ChevronDown className={`w-3 h-3 transition-transform ${revealedAnswers[idx] ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence>
                              {revealedAnswers[idx] && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className={`mt-3 pt-3 border-t text-sm ${darkMode ? 'border-zinc-700' : 'border-zinc-300'}`}>
                                    <span className="font-bold text-emerald-500">Answer:</span> {q.answer}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* --- MODERN SIDEBAR --- */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={`w-[280px] flex-shrink-0 flex flex-col p-4 border-r z-20 shadow-xl ${
                darkMode 
                  ? 'bg-[#151518]/90 border-zinc-800/80 backdrop-blur-xl text-zinc-100' 
                  : 'bg-white/90 border-zinc-200/80 backdrop-blur-xl text-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between mb-4 px-2 pt-1">
                <span className="text-base font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                  DocuMind AI
                </span>
                <button 
                  onClick={() => setSidebarOpen(false)} 
                  className={`p-2 rounded-xl transition-all duration-200 ${
                    darkMode ? 'hover:bg-zinc-800/80 text-zinc-300 hover:text-white' : 'hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                  }`}
                  title="Close Sidebar"
                >
                  <PanelLeftClose className="w-5 h-5" />
                </button>
              </div>

              <button 
                onClick={handleNewChat} 
                className={`w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-xl text-sm font-semibold border transition-all duration-200 group shadow-sm ${
                  darkMode 
                    ? 'border-zinc-700/60 bg-zinc-800/40 hover:bg-zinc-800 hover:border-emerald-500/50 text-zinc-100' 
                    : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-emerald-500/50 text-zinc-800'
                }`}
              >
                <div className="p-1 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Plus className="w-4 h-4" />
                </div>
                <span>New chat</span>
              </button>

              {isUploaded && (
                <>
                  <button 
                    onClick={generateStudyGuide} 
                    className="w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 transition-all duration-200 shadow-md shadow-emerald-900/20 hover:scale-[1.02]"
                  >
                    <GraduationCap className="w-4 h-4" /> 
                    <span>Study Guide</span>
                  </button>
                  <button 
                    onClick={exportChatAsMarkdown} 
                    className={`w-full flex items-center gap-3 px-4 py-2.5 mb-2 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                      darkMode ? 'border-zinc-700/60 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" /> 
                    <span>Export Chat (.md)</span>
                  </button>
                  <button 
                    onClick={generatePublicShareLink} 
                    className={`w-full flex items-center gap-3 px-4 py-2.5 mb-3 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                      darkMode ? 'border-zinc-700/60 hover:bg-zinc-800 text-emerald-400' : 'border-zinc-200 hover:bg-zinc-100 text-emerald-600'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5" /> 
                    <span>{shareLinkCopied ? 'Link Copied!' : 'Share Public Link'}</span>
                  </button>
                </>
              )}

              <div className="flex-1 overflow-y-auto space-y-1 my-2 pr-1 custom-scrollbar">
                <div className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Recent Chats
                </div>
                {sortedSessions.map((s) => {
                  const active = s.id === currentSessionId;
                  return (
                    <div 
                      key={s.id} 
                      onClick={() => handleSelectSession(s.id)} 
                      className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 ${
                        active 
                          ? darkMode 
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-sm' 
                            : 'bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-sm'
                          : darkMode 
                            ? 'hover:bg-zinc-800/60 text-zinc-300 hover:text-zinc-100 border border-transparent' 
                            : 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 border border-transparent'
                      }`}
                    >
                      {s.isUploaded ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                      ) : (
                        <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" />
                      )}
                      <span className="flex-1 truncate">{s.title}</span>
                      <button 
                        onClick={(e) => handleDeleteSession(s.id, e)} 
                        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all duration-150 ${
                          darkMode ? 'hover:bg-zinc-700 text-zinc-400 hover:text-red-400' : 'hover:bg-zinc-200 text-zinc-500 hover:text-red-600'
                        }`}
                        title="Delete Chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* AUTH & THEME CONTROLS */}
              <div className={`pt-3 mt-2 border-t space-y-2 ${darkMode ? 'border-zinc-800/80' : 'border-zinc-200/80'}`}>
                {user ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                    <span className="text-xs truncate max-w-[150px] opacity-80">{user.email}</span>
                    <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-zinc-700 text-red-400" title="Sign Out"><LogOut className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowAuthModal(true)} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 shadow-md">
                    <LogIn className="w-4 h-4" />
                    <span>Cloud Sync Sign In</span>
                  </button>
                )}

                <button 
                  onClick={() => setDarkMode(!darkMode)} 
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    darkMode 
                      ? 'hover:bg-zinc-800/80 text-zinc-200 hover:text-white' 
                      : 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900'
                  }`}
                >
                  {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-emerald-600" />}
                  <span>{darkMode ? "Light mode" : "Dark mode"}</span>
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* MAIN LAYOUT SPLIT */}
        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
          
          {/* Header */}
          <header className={`h-14 flex items-center px-4 flex-shrink-0 border-b justify-between ${darkMode ? 'border-zinc-800/80 bg-[#121214]/60 backdrop-blur-xl' : 'border-zinc-200/80 bg-white/60 backdrop-blur-xl'}`}>
            <div className="flex items-center">
              {!sidebarOpen && (
                <button 
                  onClick={() => setSidebarOpen(true)} 
                  className={`p-2 mr-2 rounded-xl transition-all duration-200 ${
                    darkMode ? 'hover:bg-zinc-800 text-zinc-300 hover:text-white' : 'hover:bg-zinc-200 text-zinc-700 hover:text-zinc-900'
                  }`}
                  title="Open Sidebar"
                >
                  <PanelLeft className="w-5 h-5" />
                </button>
              )}
              <div className={`font-semibold text-base flex items-center gap-2 ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {currentSession?.title !== "New chat" ? currentSession?.title : "DocuMind AI"}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-normal">PDF RAG</span>
              </div>
            </div>

            {isUploaded && (
              <button
                onClick={() => setShowPdfViewer(!showPdfViewer)}
                className={`flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-xl border transition-all duration-200 ${
                  showPdfViewer 
                    ? darkMode ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-sm' : 'border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm'
                    : darkMode ? 'border-zinc-700/60 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-300 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                {showPdfViewer ? 'Hide Document' : 'Show Document'}
              </button>
            )}
          </header>

          {/* Content Area */}
          <div className="flex-1 flex flex-row overflow-hidden relative">
            
            {/* --- LEFT PANE: PDF VIEWER --- */}
            {isUploaded && showPdfViewer && (
              <div className={`w-1/2 h-full border-r flex flex-col relative overflow-hidden ${darkMode ? 'border-zinc-800/80 bg-[#121214]/40 backdrop-blur-sm' : 'border-zinc-200/80 bg-zinc-100/30 backdrop-blur-sm'}`}>
                
                {/* Scrollable Document Container */}
                <div className="flex-1 overflow-y-auto p-6 pb-32 flex flex-col items-center">
                  {currentSession?.pdfBase64 ? (
                    <Document
                      file={currentSession.pdfBase64}
                      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                      loading={
                        <div className="flex items-center gap-2 mt-20 text-emerald-500">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span className="text-sm font-medium">Loading Document...</span>
                        </div>
                      }
                    >
                      {Array.from(new Array(numPages), (el, index) => {
                        const pageNum = index + 1;
                        const isHighlightedPage = activeHighlight?.page === pageNum;

                        return (
                          <div key={`page_${pageNum}`} id={`pdf-page-${pageNum}`} className={`mb-6 shadow-xl rounded overflow-hidden relative ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
                            <Page 
                              pageNumber={pageNum} 
                              width={450 * pdfScale} 
                              renderTextLayer={false} 
                              renderAnnotationLayer={false} 
                            />

                            {/* SEMANTIC CITATION GLOWING BOUNDING BOX OVERLAY */}
                            {isHighlightedPage && activeHighlight?.bbox && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute z-30 border-2 border-emerald-400 bg-emerald-500/20 rounded shadow-[0_0_15px_rgba(52,211,153,0.8)] pointer-events-none transition-all duration-300"
                                style={{
                                  top: `${activeHighlight.bbox.top}%`,
                                  left: `${activeHighlight.bbox.left}%`,
                                  width: `${activeHighlight.bbox.width}%`,
                                  height: `${activeHighlight.bbox.height}%`,
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </Document>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm p-6 text-center">
                      <FileText className="w-10 h-10 mb-2 opacity-50" />
                      <p>Document preview unavailable for this session.</p>
                      <p className="text-xs opacity-70">Please re-upload the PDF.</p>
                    </div>
                  )}
                </div>

                {/* PINNED FIXED VIEWPORT ZOOM CONTROLS */}
                {currentSession?.pdfBase64 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
                    <div className={`flex items-center gap-4 px-5 py-2.5 rounded-full shadow-2xl border backdrop-blur-xl ${
                      darkMode ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-200 shadow-black/50' : 'bg-white/95 border-zinc-200 text-zinc-800 shadow-zinc-300/50'
                    }`}>
                      <button onClick={() => setPdfScale(prev => Math.max(prev - 0.2, 0.5))} className="p-1 hover:text-emerald-500 transition-colors" title="Zoom Out">
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-bold w-12 text-center select-none">{Math.round(pdfScale * 100)}%</span>
                      <button onClick={() => setPdfScale(prev => Math.min(prev + 0.2, 2.5))} className="p-1 hover:text-emerald-500 transition-colors" title="Zoom In">
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <div className={`w-px h-4 mx-1 ${darkMode ? 'bg-zinc-700' : 'bg-zinc-300'}`}></div>
                      <button onClick={() => setPdfScale(1.0)} className="p-1 hover:text-emerald-500 transition-colors" title="Reset Zoom">
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- RIGHT PANE: CHAT --- */}
            <div className={`${isUploaded && showPdfViewer ? 'w-1/2' : 'w-full'} flex flex-col h-full relative transition-all duration-300`}>
              <div className="flex-1 overflow-y-auto flex flex-col items-center">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center max-w-2xl px-4 w-full -mt-8 text-center space-y-5">
                    {isUploaded ? (
                      <div className="flex flex-col items-center text-center gap-4 mt-8 animate-in fade-in duration-500">
                        <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10 border border-emerald-500/30">
                          <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <h2 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          Document Uploaded Successfully!
                        </h2>
                        <p className={`text-sm ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          <strong>{currentSession.fileName}</strong> is ready. <br/>
                          Ask your first question below to get started.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <h1 className={`text-3xl font-semibold tracking-tight ${darkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>Where should we begin?</h1>
                          <p className="text-xs text-zinc-400">Upload a PDF document below to analyze its content.</p>
                        </div>
                        <label
                          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                          onDragLeave={() => setDragActive(false)}
                          onDrop={handleDrop}
                          className={`w-full group relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 shadow-xl backdrop-blur-xl ${
                            dragActive
                              ? darkMode ? 'border-emerald-500 bg-emerald-950/20' : 'border-emerald-500 bg-emerald-50'
                              : darkMode
                                ? 'border-zinc-800/80 hover:border-emerald-500/50 bg-[#18181b]/60 hover:bg-[#18181b]/80'
                                : 'border-zinc-300 hover:border-emerald-500/50 bg-white/70 hover:bg-white/90'
                          }`}
                        >
                          {uploading ? (
                            <div className="flex flex-col items-center gap-2 py-2">
                              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                              <span className="text-xs font-medium text-emerald-300">Processing & vectorizing PDF…</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-2">
                              <div className={`p-3 rounded-full ${darkMode ? 'bg-zinc-800/80 text-emerald-400 border border-zinc-700/50' : 'bg-white text-emerald-600 shadow-sm border border-zinc-200'}`}>
                                <Upload className="w-6 h-6" />
                              </div>
                              <div>
                                <span className={`text-sm font-medium block ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>Click or drag a PDF here to upload</span>
                              </div>
                            </div>
                          )}
                          <input type="file" accept=".pdf,application/pdf" onChange={handleFileInputChange} className="hidden" />
                        </label>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-3xl px-4 py-6 space-y-6 mx-auto">
                    {messages.map((msg, i) => (
                      <div key={i} className={`group flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'bot' && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 ${darkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-white border-zinc-200 text-emerald-600 shadow-sm'}`}>
                            <Bot className="w-5 h-5" />
                          </div>
                        )}

                        <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-emerald-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-md' : 'flex-1'}`}>
                          <div className="text-sm leading-relaxed prose dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                          </div>

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-700/40 flex flex-wrap items-center gap-2 text-xs">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                <Layers className="w-3 h-3" />
                                <span>Sources:</span>
                              </div>
                              
                              {Array.from(new Set(msg.sources.map(src => src.page))).map(page => {
                                const sourceData = msg.sources.find(src => src.page === page);

                                if (page === "Web") {
                                  return (
                                    <a 
                                      key={page} 
                                      href={sourceData?.url || "#"} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 rounded font-medium border bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                                      title={sourceData?.url}
                                    >
                                      🌍 Live Web Search
                                    </a>
                                  );
                                }
                                
                                return (
                                  <button 
                                    key={page}
                                    onClick={() => scrollToPage(page, sourceData?.bbox)}
                                    className={`px-2 py-1 rounded cursor-pointer transition-colors font-medium border ${
                                      darkMode 
                                        ? 'bg-zinc-900 border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/20 text-zinc-200 hover:text-emerald-400' 
                                        : 'bg-white border-zinc-200 hover:border-emerald-500/50 hover:bg-emerald-50 text-zinc-700 hover:text-emerald-600 shadow-sm'
                                    }`}
                                  >
                                    Page {page} 🔍
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* SMART SUGGESTED FOLLOW-UP PROMPTS */}
                          {msg.role === 'bot' && (
                            <div className="mt-3.5 pt-3 border-t border-zinc-700/20 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] opacity-60 font-medium">Suggested:</span>
                              {[
                                "Summarize this in bullet points",
                                "What are the key takeaways?",
                                "Explain the main financial metrics"
                              ].map((prompt, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => handleSendQuery(prompt)}
                                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                                    darkMode 
                                      ? 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-emerald-500 hover:text-emerald-400' 
                                      : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:border-emerald-500 hover:text-emerald-600'
                                  }`}
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          )}

                          {msg.role === 'bot' && (
                            <div className="flex items-center gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleCopy(msg.text, i)} className={`flex items-center gap-1 text-[11px] ${darkMode ? 'text-zinc-300 hover:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900'}`}>
                                {copiedIndex === i ? (<><Check className="w-3 h-3" /> Copied</>) : (<><Copy className="w-3 h-3" /> Copy</>)}
                              </button>
                              <button onClick={() => toggleSpeech(msg.text, i)} className={`flex items-center gap-1 text-[11px] font-medium ${speakingIndex === i ? 'text-red-400 hover:text-red-300' : darkMode ? 'text-zinc-300 hover:text-emerald-400' : 'text-zinc-600 hover:text-emerald-600'}`}>
                                {speakingIndex === i ? (<><StopCircle className="w-3 h-3" /> Stop</>) : (<><Volume2 className="w-3 h-3" /> Read Aloud</>)}
                              </button>
                            </div>
                          )}
                        </div>

                        {msg.role === 'user' && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-zinc-800 text-zinc-200 border border-zinc-700/50' : 'bg-zinc-300 text-zinc-800 shadow-sm'}`}>
                            <User className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {loading && (
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 ${darkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-white border-zinc-200 text-emerald-600 shadow-sm'}`}>
                          <Bot className="w-5 h-5" />
                        </div>
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input Bar */}
              <div className="w-full px-4 pb-4 pt-1">
                <ChatInputBar
                  darkMode={darkMode}
                  query={query}
                  setQuery={setQuery}
                  onSend={() => handleSendQuery()}
                  onKeyDown={handleKeyDown}
                  disabled={!isUploaded}
                  loading={loading}
                  textareaRef={textareaRef}
                  isListening={isListening}
                  onMicClick={startListening}
                  placeholder={isUploaded ? "Ask anything about your uploaded PDF…" : "Upload a PDF above to enable questions…"}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function ChatInputBar({ darkMode, query, setQuery, onSend, onKeyDown, disabled, loading, textareaRef, placeholder, isListening, onMicClick }) {
  return (
    <div className={`w-full rounded-2xl p-2 border shadow-xl transition-all flex items-end gap-2 backdrop-blur-xl ${
      darkMode ? 'bg-[#18181b]/80 border-zinc-800/80 focus-within:border-emerald-500/60' : 'bg-white/80 border-zinc-200/80 focus-within:border-emerald-500/60'
    }`}>
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={isListening ? "Listening..." : placeholder}
        disabled={disabled}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none placeholder-zinc-500 disabled:cursor-not-allowed max-h-40"
      />
      <button onClick={isListening ? undefined : onMicClick} disabled={disabled || loading} className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : darkMode ? 'text-zinc-300 hover:bg-zinc-800 hover:text-emerald-400' : 'text-zinc-600 hover:bg-zinc-100 hover:text-emerald-600'}`}>
        <Mic className="w-4 h-4" />
      </button>
      <button onClick={onSend} disabled={disabled || !query.trim() || loading} className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${query.trim() && !disabled && !loading ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/20' : darkMode ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'}`}>
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}