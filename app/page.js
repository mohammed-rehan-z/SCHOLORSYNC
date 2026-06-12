"use client";

import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { Navbar, ViewTransition } from "../components/navbar";
import { 
  BookOpen, 
  MessageSquare, 
  Table, 
  Settings, 
  Upload, 
  Search, 
  Check, 
  AlertCircle, 
  Copy, 
  ExternalLink, 
  Trash2, 
  X, 
  Plus, 
  FileText,
  Key,
  Database,
  ArrowRight,
  ChevronRight,
  Download,
  Sun,
  Moon,
  ChevronDown,
  PenTool
} from "lucide-react";
import { marked } from "marked";

// Relative imports for services/data

import { parsePdfFile, detectTitleFromFontData, detectAuthorsFromFontData } from "../lib/pdf-handler";
import { chunkPageText, retrieveChunks } from "../lib/rag-engine";
import { generateLocalSummary, extractLocalMetadata, synthesizeAnswer, extractNumericalResults } from "../lib/local-summarizer";
import { analyzePaper, performRagChat } from "../lib/ai-service";

// shadcn UI imports
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuPortal, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";

// (title detection now handled by detectTitleFromFontData imported from pdf-handler)


// Custom Citation Formatter supporting multiple formats
function formatCitation(paper, format) {
  if (!paper) return "";
  const authors = paper.authors || "Unknown Authors";
  const title = paper.title || "Untitled Paper";
  const year = paper.year || new Date().getFullYear().toString();
  
  switch (format) {
    case "ieee":
      // IEEE Style: [1] A. Author and B. Author, "Title," Year.
      return `[1] ${authors}, "${title}," ${year}.`;
    case "mdpi": {
      // MDPI Style: Author, A.A.; Author, B.B. Title. Year.
      const mdpiAuthors = authors.split(/, | and /).map(name => {
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
          const last = parts[parts.length - 1];
          const first = parts[0][0];
          return `${last}, ${first}.`;
        }
        return name;
      }).join("; ");
      return `${mdpiAuthors}. ${title}. ScholarSync ${year}.`;
    }
    case "researchgate":
      // ResearchGate Style: Author (Year). "Title." ResearchGate Publication.
      return `${authors} (${year}). "${title}." Available on ResearchGate.`;
    case "bibtex":
      return paper.citation?.bibtex || `@article{key,\n  title={${title}},\n  author={${authors}},\n  year={${year}}\n}`;
    case "google_scholar":
    default:
      // Google Scholar (standard APA format)
      return `${authors}. (${year}). ${title}. Google Scholar Index.`;
  }
}

export default function Home() {
  // --- STATE ---
  const [papers, setPapers] = useState([]);
  const [activePaperId, setActivePaperId] = useState("");
  const [activeView, setActiveView] = useState("overview"); // 'overview', 'dashboard', 'summarizer', 'chat', 'tabular', 'settings'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  
  // Config State
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("groq");
  const [modelOverride, setModelOverride] = useState("");
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(150);

  // Upload progress states
  const [uploadStatus, setUploadStatus] = useState(""); // '', 'parsing', 'analyzing', 'done', 'error'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [summarizingPaperId, setSummarizingPaperId] = useState(""); // paperId currently being summarized on-demand

  // Chat Scope & History States
  const [chatScopeId, setChatScopeId] = useState("all"); // 'all' or specific paperId
  const [chatHistories, setChatHistories] = useState({}); // { [scopeId]: [messages] }
  const [currentMessage, setCurrentMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Citation & Modal States
  const [citationFormat, setCitationFormat] = useState("google_scholar"); // 'google_scholar', 'mdpi', 'ieee', 'researchgate', 'bibtex'
  const [citationModalText, setCitationModalText] = useState("");
  const [citationModalPage, setCitationModalPage] = useState(0);
  const [showCitationModal, setShowCitationModal] = useState(false);

  // Scraper States
  const [scraperQuery, setScraperQuery] = useState("");
  const [scraperSource, setScraperSource] = useState("all");
  const [scraperLimit, setScraperLimit] = useState(50);
  const [scraperResults, setScraperResults] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scraperMessage, setScraperMessage] = useState("");

  // Refs
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatInputRef = useRef(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load settings
    const savedSize = localStorage.getItem("rag_chunk_size") || "800";
    const savedOverlap = localStorage.getItem("rag_chunk_overlap") || "150";
    const savedTheme = localStorage.getItem("ScholarSync_theme") || "light";
    setChunkSize(parseInt(savedSize, 10));
    setChunkOverlap(parseInt(savedOverlap, 10));
    setTheme(savedTheme);

    // NEW — load API config
    const savedKey = localStorage.getItem("rag_api_key") || "";
    const savedProvider = localStorage.getItem("rag_provider") || "groq";
    const savedModel = localStorage.getItem("rag_model") || "";
    setApiKey(savedKey);
    setProvider(savedProvider);
    setModelOverride(savedModel);
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Load persisted uploaded papers from localStorage
    let savedUploaded = [];
    try {
      const raw = localStorage.getItem("ScholarSync_uploaded_papers");
      if (raw) savedUploaded = JSON.parse(raw);
    } catch (_) { savedUploaded = []; }

    // Load persisted chat histories
    let savedChats = {};
    try {
      const rawChats = localStorage.getItem("ScholarSync_chat_histories");
      if (rawChats) savedChats = JSON.parse(rawChats);
    } catch (_) { savedChats = {}; }

    // Load only user-uploaded papers (no pre-defined demo papers)
    const allPapers = [...savedUploaded];
    setPapers(allPapers);
    setChatHistories(savedChats);

    const firstId = allPapers.length > 0 ? allPapers[0].id : "";
    if (firstId) {
      setActivePaperId(firstId);
      setChatScopeId(firstId);
    }
  }, []);

  // Auto-save uploaded papers whenever papers state changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const uploaded = papers.filter(p => p.type === "uploaded");
    try {
      // Guard against localStorage quota: trim chunks if payload > 4MB
      let payload = JSON.stringify(uploaded);
      if (payload.length > 4 * 1024 * 1024) {
        // Store without chunks as fallback (chat & summary still saved)
        const trimmed = uploaded.map(p => ({ ...p, chunks: p.chunks.slice(0, 200) }));
        payload = JSON.stringify(trimmed);
      }
      localStorage.setItem("ScholarSync_uploaded_papers", payload);
    } catch (_) {}
  }, [papers]);

  // Auto-save chat histories whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("ScholarSync_chat_histories", JSON.stringify(chatHistories));
    } catch (_) {}
  }, [chatHistories]);

  // Sync chat scope when active paper changes
  useEffect(() => {
    if (activePaperId) {
      setChatScopeId(activePaperId);
    }
  }, [activePaperId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistories, chatScopeId, activeView]);

  const activePaper = papers.find(p => p.id === activePaperId);

  // Get all unique tags for filtering
  const allTags = Array.from(
    new Set(papers.flatMap(p => p.tags || []))
  );

  // --- ACTIONS ---
  
  // Scraper Search Logic
  const handleScraperSearch = async (e) => {
    e.preventDefault();
    if (!scraperQuery.trim() || isScraping) return;
    
    setIsScraping(true);
    setScraperResults([]);
    setScraperMessage("Initializing search...");
    
    try {
      const response = await fetch(`/api/search/stream?keywords=${encodeURIComponent(scraperQuery)}&source=${scraperSource}&limit=${scraperLimit}`);
      if (!response.body) throw new Error("ReadableStream not supported.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'start') {
                  setScraperMessage(data.message);
                } else if (data.type === 'results') {
                  setScraperResults(prev => [...prev, ...data.data]);
                } else if (data.type === 'done') {
                  setScraperMessage(`Found ${data.total} papers in ${data.elapsed}.`);
                } else if (data.type === 'error') {
                  setScraperMessage(`Error: ${data.message}`);
                }
              } catch (err) {}
            }
          }
        }
      }
    } catch (err) {
      setScraperMessage(`Error: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleAddScrapedToLibrary = (paper) => {
    const newPaper = {
      id: `scraped-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: paper.title,
      authors: paper.authors,
      year: paper.date ? paper.date.split('-')[0] : new Date().getFullYear().toString(),
      pageCount: 1,
      tags: ["Scraped", paper.source],
      citation: {
        apa: `${paper.authors}. (${paper.date}). ${paper.title}. Retrieved from ${paper.source}.`,
        mla: `"${paper.title}." ${paper.authors}, ${paper.date}.`,
        bibtex: `@article{scraped_${Date.now()},\n  title={${paper.title}},\n  author={${paper.authors}},\n  year={${paper.date}}\n}`
      },
      tabularData: {
        authors: paper.authors,
        year: paper.date ? paper.date.split('-')[0] : "Unknown",
        problem: "See abstract.",
        methodology: "See abstract.",
        keyFindings: "See abstract.",
        contributions: "See abstract.",
        dataset: "Unknown"
      },
      summary: paper.abstract,
      chunks: [], // No text chunks for scraped metadata
      type: "scraped",
      externalLink: paper.link
    };

    setPapers(prev => [newPaper, ...prev]);
    alert(`"${paper.title}" added to your library!`);
  };

  // Save Settings
  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem("rag_chunk_size", chunkSize.toString());
    localStorage.setItem("rag_chunk_overlap", chunkOverlap.toString());
    localStorage.setItem("rag_api_key", apiKey);
    localStorage.setItem("rag_provider", provider);
    localStorage.setItem("rag_model", modelOverride);
    alert("Settings saved successfully!");
  };

  // Toggle Dark/Light Mode Theme
  const handleToggleTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("ScholarSync_theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Copy text helper
  const handleCopyText = (text, message = "Copied to clipboard!") => {
    navigator.clipboard.writeText(text);
    alert(message);
  };

  // PDF File Upload Handler (supports multiple uploads up to 5, daily limit 20)
  const handleFileUpload = async (e, droppedFiles = null) => {
    const files = droppedFiles ? droppedFiles : Array.from(e?.target?.files || []);
    if (files.length === 0) return;

    // Limit 1: Max 5 files per selection
    if (files.length > 5) {
      setUploadError("You can only upload a maximum of 5 PDFs at a time.");
      setUploadStatus("error");
      return;
    }

    // PDF type checking
    const invalidFile = files.find(f => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"));
    if (invalidFile) {
      setUploadError(`File "${invalidFile.name}" is not a PDF. Only PDF files are supported.`);
      setUploadStatus("error");
      return;
    }

    setUploadError("");
    setUploadProgress(0);
    setUploadStatus("parsing");

    let successCount = 0;
    const newPapersList = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        setUploadStatus("parsing");
        
        // Step 1: Parse PDF client-side
        const pdfData = await parsePdfFile(file, (currentPage, totalPages) => {
          const fileProgress = Math.floor((currentPage / totalPages) * 50);
          const totalProgress = Math.floor((i * 100 + fileProgress) / files.length);
          setUploadProgress(totalProgress);
        });

        // Step 2: Auto-detect title using font-size data (works for MDPI, IEEE, arXiv, Google Scholar, ResearchGate, etc.)
        const autoDetectedTitle = detectTitleFromFontData(
          pdfData.firstPageFontItems,
          pdfData.title // filename as fallback
        );

        // Step 2b: Auto-detect authors from font data (below title, intermediate font size)
        const autoDetectedAuthors = detectAuthorsFromFontData(
          pdfData.firstPageFontItems,
          autoDetectedTitle
        );

        // Step 3: Create sliding-window text chunks
        const paperId = `uploaded-${Date.now()}-${i}`;
        let allChunks = [];
        pdfData.pages.forEach(p => {
          const pageChunks = chunkPageText(p.text, p.page, paperId, chunkSize, chunkOverlap);
          allChunks = [...allChunks, ...pageChunks];
        });

        if (allChunks.length === 0) {
          throw new Error(`No readable text could be extracted from "${file.name}".`);
        }

        // Step 4: Analysis — AI-powered if API key configured, local fallback otherwise
        setUploadStatus("analyzing");
        setUploadProgress(Math.floor((i * 100 + 65) / files.length));

        const resolvedTitle = autoDetectedTitle;
        const resolvedAuthors = autoDetectedAuthors;

        let metadata, summaryContent;

        if (apiKey) {
          try {
            const result = await analyzePaper(
              apiKey,
              modelOverride || null,
              allChunks,
              provider
            );
            summaryContent = result.summary;
            metadata = result.metadata;
          } catch (aiErr) {
            console.warn("AI analysis failed, falling back to local:", aiErr.message);
            metadata = extractLocalMetadata(allChunks, resolvedTitle);
            summaryContent = generateLocalSummary(allChunks, resolvedTitle, resolvedAuthors);
          }
        } else {
          metadata = extractLocalMetadata(allChunks, resolvedTitle);
          summaryContent = generateLocalSummary(allChunks, resolvedTitle, resolvedAuthors);
        }

        const resolvedYear = metadata.year || new Date().getFullYear().toString();

        // Step 5: Build paper object
        const newPaper = {
          id: paperId,
          title: resolvedTitle,
          authors: resolvedAuthors,
          year: resolvedYear,
          pageCount: pdfData.pageCount,
          tags: metadata.tags || ["Uploaded", "PDF"],
          citation: {
            apa: `${resolvedAuthors}. (${resolvedYear}). ${resolvedTitle}. Retrieved from PDF Upload.`,
            mla: `"${resolvedTitle}." ${resolvedAuthors}, ${resolvedYear}.`,
            bibtex: `@article{uploaded_${paperId},\n  title={${resolvedTitle}},\n  author={${resolvedAuthors}},\n  year={${resolvedYear}}\n}`
          },
          tabularData: {
            authors: resolvedAuthors,
            year: resolvedYear,
            problem: metadata.problem || "See paper for details.",
            methodology: metadata.methodology || "See paper for details.",
            keyFindings: metadata.keyFindings || "See paper for details.",
            contributions: metadata.contributions || "See paper for details.",
            dataset: metadata.dataset || "Unknown"
          },
          summary: summaryContent,
          chunks: allChunks,
          numericalResults: extractNumericalResults(allChunks),
          type: "uploaded"
        };

        newPapersList.push(newPaper);
        successCount++;
        setUploadProgress(Math.floor(((i + 1) * 100) / files.length));
      }

      if (successCount > 0) {
        setPapers(prev => [...newPapersList, ...prev]);
        setActivePaperId(newPapersList[0].id);
        
        setUploadStatus("done");
        setUploadProgress(100);
        
        setTimeout(() => {
          setUploadStatus("");
          setActiveView("summarizer");
        }, 1500);
      } else {
        throw new Error("No PDFs were successfully processed.");
      }

    } catch (error) {
      console.error(error);
      setUploadError(error.message || "An error occurred during file upload.");
      setUploadStatus("error");
    }
  };

  // On-demand: regenerate local extractive summary for a paper
  const handleGenerateSummary = (paper) => {
    if (!paper) return;
    setSummarizingPaperId(paper.id);
    try {
      const meta = extractLocalMetadata(paper.chunks, paper.title);
      const summary = generateLocalSummary(paper.chunks, paper.title, paper.authors);
      setPapers(prev => prev.map(p => {
        if (p.id !== paper.id) return p;
        return {
          ...p,
          tags: meta.tags || p.tags,
          tabularData: {
            ...p.tabularData,
            problem: meta.problem || p.tabularData?.problem,
            methodology: meta.methodology || p.tabularData?.methodology,
            keyFindings: meta.keyFindings || p.tabularData?.keyFindings,
            contributions: meta.contributions || p.tabularData?.contributions,
          },
          summary
        };
      }));
    } finally {
      setSummarizingPaperId("");
    }
  };

  const createFallbackMetadata = (pdfData, file, fallbackTitle) => {
    return {
      title: fallbackTitle,
      authors: "Unknown (PDF)",
      year: new Date().getFullYear().toString(),
      tags: ["Uploaded", "Local Index"],
      problem: "API Key not configured. Could not extract research problems.",
      methodology: "API Key not configured. Could not extract methodology.",
      keyFindings: "API Key not configured. Could not extract quantitative findings.",
      contributions: "Indexed locally with " + pdfData.pageCount + " pages.",
      dataset: "Unknown",
      citation: {
        apa: `Unknown. (${new Date().getFullYear()}). ${fallbackTitle}. Custom Upload.`,
        mla: `"${fallbackTitle}." Custom PDF Upload, ${new Date().getFullYear()}.`,
        bibtex: `@misc{upload_${Date.now()},
  title={${fallbackTitle}},
  year={${new Date().getFullYear()}}
}`
      }
    };
  };

  // Delete a paper from the library (either preload or uploaded)
  const handleDeletePaper = (paperId, e) => {
    if (e) e.stopPropagation();
    if (confirm("Are you sure you want to delete this paper from your library?")) {
      const updatedPapers = papers.filter(p => p.id !== paperId);
      setPapers(updatedPapers);
      setSelectedPaperIds(prev => prev.filter(id => id !== paperId));
      
      const updatedChats = { ...chatHistories };
      delete updatedChats[paperId];
      setChatHistories(updatedChats);

      if (activePaperId === paperId) {
        if (updatedPapers.length > 0) {
          setActivePaperId(updatedPapers[0].id);
        } else {
          setActivePaperId("");
        }
      }
    }
  };

  // Toggle selection for a single paper card
  const toggleSelectPaper = (paperId, e) => {
    if (e) e.stopPropagation();
    setSelectedPaperIds(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId) 
        : [...prev, paperId]
    );
  };

  // Toggle selection for all filtered papers currently in view
  const toggleSelectAll = () => {
    const allFilteredIds = filteredPapers.map(p => p.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedPaperIds.includes(id));
    
    if (allSelected) {
      // Deselect all filtered papers
      setSelectedPaperIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      // Select all filtered papers
      setSelectedPaperIds(prev => {
        const union = new Set([...prev, ...allFilteredIds]);
        return Array.from(union);
      });
    }
  };

  // Delete all selected papers in batch
  const handleDeleteSelected = () => {
    if (selectedPaperIds.length === 0) return;
    if (confirm(`Are you sure you want to delete the ${selectedPaperIds.length} selected paper(s) from your library?`)) {
      const updatedPapers = papers.filter(p => !selectedPaperIds.includes(p.id));
      setPapers(updatedPapers);
      
      const updatedChats = { ...chatHistories };
      selectedPaperIds.forEach(id => {
        delete updatedChats[id];
      });
      setChatHistories(updatedChats);

      if (selectedPaperIds.includes(activePaperId)) {
        if (updatedPapers.length > 0) {
          setActivePaperId(updatedPapers[0].id);
        } else {
          setActivePaperId("");
        }
      }

      setSelectedPaperIds([]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Chat input change handler supporting '@' paper mentions autocomplete
  const handleChatInputChange = (e) => {
    const val = e.target.value;
    setCurrentMessage(val);

    const lastAtIndex = val.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const charBefore = lastAtIndex > 0 ? val[lastAtIndex - 1] : "";
      if (charBefore === "" || charBefore === " ") {
        const textAfterAt = val.substring(lastAtIndex + 1);
        if (!textAfterAt.includes(" ")) {
          setShowMentionDropdown(true);
          setMentionSearch(textAfterAt);
          return;
        }
      }
    }
    setShowMentionDropdown(false);
  };

  // Select a paper reference from autocomplete popup
  const selectMention = (paper) => {
    const lastAtIndex = currentMessage.lastIndexOf("@");
    const baseText = currentMessage.substring(0, lastAtIndex);

    if (paper === "all") {
      setChatScopeId("all");
      setCurrentMessage(baseText + "@all ");
    } else {
      setChatScopeId(paper.id);
      setCurrentMessage(baseText + `@ "${paper.title}" `);
    }
    setShowMentionDropdown(false);
  };

  // Send Chat Message (RAG Engine + Gemini SDK)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim() || chatLoading) return;

    const userMsg = currentMessage.trim();
    setCurrentMessage("");

    const paperChats = chatHistories[chatScopeId] || [];
    
    const newHistory = [...paperChats, { role: "user", content: userMsg }];
    setChatHistories(prev => ({
      ...prev,
      [chatScopeId]: newHistory
    }));
    
    setChatLoading(true);

    try {
      // Strip @mention prefix from the query so retrieval isn't polluted
      let cleanQuery = userMsg
        .replace(/@all\s*/gi, "")
        .replace(/@\s*"[^"]*"\s*/g, "")
        .replace(/@\s*\S+\s*/g, "")
        .trim();
      if (!cleanQuery) cleanQuery = userMsg; // fallback if stripping removed everything

      let targetChunks = [];
      let scopeLabel = "all papers";
      if (chatScopeId === "all") {
        targetChunks = papers.flatMap(p => p.chunks);
      } else {
        const targetPaper = papers.find(p => p.id === chatScopeId) || activePaper;
        targetChunks = targetPaper ? targetPaper.chunks : [];
        scopeLabel = targetPaper ? `"${targetPaper.title}"` : "selected paper";
      }

      const topK = chatScopeId === "all" ? Math.min(papers.length * 3, 15) : 5;
      const retrieved = retrieveChunks(cleanQuery, targetChunks, topK);
      const retrievedChunks = retrieved.map(r => r.chunk);

      const formattedHistory = paperChats.map(h => ({
        role: h.role,
        content: h.content
      }));

      let replyContent;

      if (apiKey) {
        try {
          replyContent = await performRagChat(
            apiKey,
            modelOverride || null,
            cleanQuery,
            retrievedChunks,
            formattedHistory,
            provider
          );
        } catch (aiErr) {
          console.warn("AI chat failed, falling back to local:", aiErr.message);
          replyContent = synthesizeAnswer(
            cleanQuery,
            retrievedChunks,
            chatScopeId !== "all" ? scopeLabel : ""
          );
        }
      } else {
        replyContent = synthesizeAnswer(
          cleanQuery,
          retrievedChunks,
          chatScopeId !== "all" ? scopeLabel : ""
        );
      }

      setChatHistories(prev => ({
        ...prev,
        [chatScopeId]: [
          ...newHistory,
          { 
            role: "ai", 
            content: replyContent, 
            sources: retrievedChunks
          }
        ]
      }));

    } catch (err) {
      console.error(err);
      setChatHistories(prev => ({
        ...prev,
        [chatScopeId]: [
          ...newHistory,
          { 
            role: "ai", 
            content: `Error: ${err.message || "Could not retrieve answer. Please verify your internet connection and API Key."}` 
          }
        ]
      }));
    } finally {
      setChatLoading(false);
    }
  };

  // Citation click overlay handler
  const handleCitationClick = (text, page) => {
    setCitationModalText(text);
    setCitationModalPage(page);
    setShowCitationModal(true);
  };

  // Parse assistant response to render citation anchors dynamically
  const renderMessageTextWithCitations = (message) => {
    if (message.role === "user") {
      return <div className="font-body-md text-foreground">{message.content}</div>;
    }

    const text = message.content;
    const rawHtml = marked.parse(text);
    
    const formattedHtml = rawHtml.replace(
      /\[[Pp]age\s+(\d+)\]/g, 
      (match, pageNum) => {
        return `<span class="citation-link" data-page="${pageNum}">Page ${pageNum}</span>`;
      }
    );

    const handleContainerClick = (e) => {
      const target = e.target;
      if (target.classList.contains("citation-link")) {
        const pageNum = parseInt(target.getAttribute("data-page"), 10);
        let source = null;
        if (chatScopeId === "all") {
          source = papers.flatMap(p => p.chunks).find(s => s.page === pageNum);
        } else {
          const targetPaper = papers.find(p => p.id === chatScopeId) || activePaper;
          source = targetPaper?.chunks?.find(s => s.page === pageNum);
        }
        
        const quote = source ? source.content : "No full chunk text cached for this page. Reference page: " + pageNum;
        handleCitationClick(quote, pageNum);
      }
    };

    return (
      <div 
        className="markdown-body" 
        dangerouslySetInnerHTML={{ __html: formattedHtml }}
        onClick={handleContainerClick}
      />
    );
  };

  // Export Tabular data to CSV
  const handleExportCSV = () => {
    const headers = ["Title", "Authors", "Year", "Research Problem", "Methodology", "Key Findings", "Contributions", "Dataset"];
    const rows = papers.map(p => [
      p.title.replace(/"/g, '""'),
      p.tabularData.authors.replace(/"/g, '""'),
      p.tabularData.year.replace(/"/g, '""'),
      p.tabularData.problem.replace(/"/g, '""'),
      p.tabularData.methodology.replace(/"/g, '""'),
      p.tabularData.keyFindings.replace(/"/g, '""'),
      p.tabularData.contributions.replace(/"/g, '""'),
      p.tabularData.dataset.replace(/"/g, '""'),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ScholarSync_catalog.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Tabular data to Markdown Table
  const handleExportMarkdown = () => {
    let md = `# ScholarSync Formulation Ledger\n\n`;
    md += `| Paper Title | Authors | Year | Research Problem Statement | Methodology Details | Key Results & Findings | Core Contributions | Datasets Used |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    
    papers.forEach(p => {
      md += `| **${p.title}** | ${p.tabularData.authors} | ${p.tabularData.year} | ${p.tabularData.problem} | ${p.tabularData.methodology} | ${p.tabularData.keyFindings} | ${p.tabularData.contributions} | ${p.tabularData.dataset} |\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ScholarSync_ledger.md");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Tabular data as printable view / PDF trigger
  const handleExportPDF = () => {
    const printWindow = window.open("", "_blank");
    let html = `
      <html>
        <head>
          <title>ScholarSync Research Ledger</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #171d1c; background-color: #ffffff; }
            h1 { font-family: sans-serif; font-size: 24px; border-bottom: 2px solid #171d1c; padding-bottom: 8px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #eaefed; border: 2px solid #171d1c; padding: 10px; font-size: 11px; text-transform: uppercase; font-family: sans-serif; text-align: left; }
            td { border: 1px solid #bcc9c6; padding: 10px; font-size: 12px; line-height: 1.5; vertical-align: top; }
            tr:nth-child(even) td { background-color: #f5faf8; }
          </style>
        </head>
        <body>
          <h1>ScholarSync Formulation Ledger</h1>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Authors</th>
                <th>Year</th>
                <th>Problem Statement</th>
                <th>Methodology</th>
                <th>Key Findings</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    papers.forEach(p => {
      html += `
        <tr>
          <td><strong>${p.title}</strong></td>
          <td>${p.tabularData.authors}</td>
          <td>${p.tabularData.year}</td>
          <td>${p.tabularData.problem}</td>
          <td>${p.tabularData.methodology}</td>
          <td>${p.tabularData.keyFindings}</td>
        </tr>
      `;
    });
    
    html += `
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Filter papers by search query and selected tag
  const filteredPapers = papers.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.authors.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? p.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const renderSummarySections = (summaryText) => {
    if (!summaryText) return <p>No summary available.</p>;
    return (
      <div 
        className="markdown-body" 
        dangerouslySetInnerHTML={{ __html: marked.parse(summaryText) }} 
      />
    );
  };


  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col">
      {/* --- NAVBAR --- */}
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        activePaper={activePaper}
        onUploadClick={() => {
          setActiveView("dashboard");
          setTimeout(() => triggerFileSelect(), 100);
        }}
      />

      {/* --- MAIN PAGE CONTENT --- */}
      <main className="w-full max-w-[1400px] mx-auto px-margin-mobile md:px-margin-desktop pt-32 pb-16 flex-grow">
            {/* VIEW 0: LANDING PAGE / OVERVIEW */}
            {activeView === "overview" && (
              <ViewTransition viewKey="overview">
                {/* Hero — full viewport, content in upper portion */}
                <div className="relative" style={{ minHeight: "calc(100vh - 5rem)" }}>
                  <div className="pt-16 pb-24 grid grid-cols-1 md:grid-cols-12 gap-gutter items-start">

                    {/* Left: headline + copy + CTAs — staggered fade-up */}
                    <motion.div
                      className="md:col-span-7 flex flex-col gap-8 pr-0 md:pr-16"
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } }
                      }}
                    >
                      <motion.h1
                        className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-primary max-w-[14ch] leading-[1.05]"
                        variants={{ hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } } }}
                      >
                        Scientific output, systematically indexed.
                      </motion.h1>

                      <motion.p
                        className="font-body-lg text-body-lg text-on-surface-variant max-w-[48ch]"
                        variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } } }}
                      >
                        A decentralized academic intelligence platform designed for deep literature synthesis,{" "}
                        <span className="text-accent">exact provenance tracking</span>, and unbounded{" "}
                        <span className="text-accent">archival access</span>.
                      </motion.p>

                      <motion.div
                        className="flex flex-wrap gap-4"
                        variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }}
                      >
                        <motion.button
                          className="bg-accent text-on-secondary-fixed font-label-md text-label-md uppercase tracking-wider px-6 py-3 rounded-full flex items-center gap-2"
                          onClick={() => setActiveView("scraper")}
                          whileHover={{ scale: 1.04, opacity: 0.92 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        >
                          <span>Search Papers</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </motion.button>
                        <motion.button
                          className="border border-outline text-primary font-label-md text-label-md uppercase tracking-wider px-6 py-3 rounded-full"
                          onClick={() => setActiveView("dashboard")}
                          whileHover={{ scale: 1.04, backgroundColor: "var(--color-surface-container-low)" }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        >
                          Open Library
                        </motion.button>
                      </motion.div>
                    </motion.div>

                    {/* Right: terminal code panel — slide in from right */}
                    <motion.div
                      className="md:col-span-5 w-full mt-10 md:mt-0"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="bg-surface-container-low border border-outline rounded-lg overflow-hidden flex flex-col">
                        <div className="border-b border-outline bg-surface px-3 py-2.5 flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-outline"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-outline"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-outline"></div>
                          <span className="ml-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">scholarsync</span>
                        </div>
                        <div className="p-5 font-label-sm text-on-surface-variant overflow-x-auto" style={{ fontSize: "10.5px", lineHeight: "1.85", fontFamily: "var(--font-geist-mono)" }}>
                          <div><span className="text-accent">const</span> scholarsync = <span className="text-accent">require</span>(<span className="text-secondary">&apos;@scholarsync/sdk&apos;</span>);</div>
                          <div className="mt-3"><span className="text-outline-variant">// Initialize client with neural context</span></div>
                          <div><span className="text-accent">const</span> client = <span className="text-accent">new</span> scholarsync.Client({'{'}</div>
                          <div className="pl-4">node: <span className="text-secondary">&apos;wss://mainnet.scholarsync.network&apos;</span>,</div>
                          <div className="pl-4">synthesisMode: <span className="text-secondary">&apos;deep&apos;</span></div>
                          <div>{'}'});</div>
                          <div className="mt-3"><span className="text-outline-variant">// Execute semantic literature review</span></div>
                          <div><span className="text-accent">async function</span> runAnalysis() {'{'}</div>
                          <div className="pl-4"><span className="text-accent">const</span> results = <span className="text-accent">await</span> client.search({'{'}</div>
                          <div className="pl-8">query: <span className="text-secondary">&quot;quantum coherence in biological systems&quot;</span>,</div>
                          <div className="pl-8">temporalRange: [2018, 2024],</div>
                          <div className="pl-8">requireProvenance: <span className="text-accent">true</span></div>
                          <div className="pl-4">{'}'});</div>
                          <div className="mt-2 pl-4">console.log(<span className="text-secondary">{"\`Indexed ${results.nodes} primary sources.\`"}</span>);</div>
                          <div className="pl-4">console.log(<span className="text-secondary">{"\`Generated synthesis matrix: ${results.matrixId}\`"}</span>);</div>
                          <div>{'}'}</div>
                        </div>
                        <div className="px-5 pb-3">
                          <div className="h-px bg-outline w-full rounded-full"></div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Core Modules divider — fade in last */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 flex items-center gap-4 pb-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.9 }}
                  >
                    <div className="h-px bg-outline flex-grow"></div>
                    <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest px-4">Core Modules</h2>
                    <div className="h-px bg-outline flex-grow"></div>
                  </motion.div>
                </div>

                {/* Bento Grid — scroll-triggered staggered fade-up */}
                <div className="pb-24 pt-8">
                  <motion.div
                    className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[280px]"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
                  >
                    {[
                      { span: 7, tag: "Module 01", title: "Literature Search", body: "Semantic vector search across 120M+ academic nodes. Bypasses keyword limitations to find conceptual overlaps across disciplines.", icon: "manage_search" },
                      { span: 5, tag: "Module 02", title: "Research Library", body: "Personalized local indexing of annotated PDFs, completely synced to the decentralized protocol.", icon: "library_books" },
                      { span: 5, tag: "Module 03", title: "AI Synthesis", body: "Automated literature reviews with mathematically grounded confidence scores.", icon: "memory" },
                      { span: 7, tag: "Module 04", title: "Citation Provenance", body: "Visual graph exploration of citation networks. Instantly identify foundational papers and theoretical lineages across decades of research.", icon: "account_tree" },
                    ].map((card) => (
                      <motion.div
                        key={card.title}
                        className={`md:col-span-${card.span} bg-surface-container-low border border-outline rounded-lg p-8 flex flex-col justify-between group cursor-default`}
                        variants={{ hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } }}
                        whileHover={{ borderColor: "var(--color-outline-variant)", y: -3, transition: { duration: 0.2 } }}
                      >
                        <div>
                          <span className="font-label-sm text-label-sm text-accent uppercase tracking-wider border border-accent/30 rounded px-2 py-1 bg-accent/5">{card.tag}</span>
                          <h3 className="font-headline-md text-headline-md text-primary mt-6">{card.title}</h3>
                          <p className="font-body-md text-body-md text-on-surface-variant mt-3">{card.body}</p>
                        </div>
                        <div className="flex justify-end mt-4">
                          <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-[32px]">{card.icon}</span>
                        </div>
                      </motion.div>
                    ))}

                    {/* Wide infrastructure card */}
                    <motion.div
                      className="md:col-span-12 bg-surface-container-low border border-outline rounded-lg p-8 flex flex-col md:flex-row justify-between items-start md:items-center group relative overflow-hidden h-full cursor-default"
                      variants={{ hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } }}
                      whileHover={{ borderColor: "var(--color-outline-variant)", y: -3, transition: { duration: 0.2 } }}
                    >
                      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-surface-container-highest/10 to-transparent"></div>
                      <div className="max-w-xl z-10">
                        <span className="font-label-sm text-label-sm text-accent uppercase tracking-wider border border-accent/30 rounded px-2 py-1 bg-accent/5">Infrastructure</span>
                        <h3 className="font-headline-lg text-headline-lg text-primary mt-6 mb-2">Decentralized Archive Access</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-3">Immutable storage protocols guarantee permanent access to published knowledge. No paywalls, no link rot, cryptographically verifiable history.</p>
                      </div>
                      <div className="mt-8 md:mt-0 flex gap-4 z-10 items-center">
                        <div className="flex -space-x-2">
                          <div className="w-10 h-10 rounded-full border border-outline bg-surface flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-[18px]">dns</span></div>
                          <div className="w-10 h-10 rounded-full border border-outline bg-surface flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-[18px]">hub</span></div>
                          <div className="w-10 h-10 rounded-full border border-outline bg-surface flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-[18px]">lock</span></div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </ViewTransition>
            )}

            {/* VIEW SCRAPER: LITERATURE SEARCH */}
            {activeView === "scraper" && (
              <ViewTransition viewKey="scraper">
              <div className="flex flex-col gap-8 pb-24 pt-8 max-w-6xl mx-auto">
                <div className="border-b border-outline pb-6">
                  <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Literature Search</h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">Search multiple academic databases simultaneously and ingest metadata directly into your library.</p>
                </div>

                <div className="bg-surface-container-low border border-outline rounded-lg p-6 md:p-8">
                  <form onSubmit={handleScraperSearch} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-grow w-full">
                      <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-widest">Keywords</label>
                      <input 
                        type="text" 
                        value={scraperQuery}
                        onChange={(e) => setScraperQuery(e.target.value)}
                        placeholder="e.g. quantum entanglement"
                        className="w-full bg-surface-container border border-outline rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface focus:border-on-surface-variant outline-none btn-press"
                      />
                    </div>
                    <div className="w-full md:w-48">
                      <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-widest">Database</label>
                      <select 
                        value={scraperSource}
                        onChange={(e) => setScraperSource(e.target.value)}
                        className="w-full bg-surface-container border border-outline rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface focus:border-on-surface-variant outline-none btn-press appearance-none cursor-pointer"
                      >
                        <option value="all">All Sources</option>
                        <option value="arxiv">arXiv</option>
                        <option value="pubmed">PubMed</option>
                        <option value="semantic_scholar">Semantic Scholar</option>
                        <option value="crossref">CrossRef</option>
                        <option value="mdpi">MDPI</option>
                        <option value="springer">Springer</option>
                        <option value="ieee">IEEE</option>
                      </select>
                    </div>
                    <div className="w-full md:w-32">
                      <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-widest">Count</label>
                      <select 
                        value={scraperLimit}
                        onChange={(e) => setScraperLimit(Number(e.target.value))}
                        className="w-full bg-surface-container border border-outline rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface outline-none btn-press appearance-none cursor-pointer"
                      >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                      </select>
                    </div>
                    <div className="w-full md:w-auto">
                      <button 
                        type="submit"
                        disabled={isScraping}
                        className="w-full md:w-auto bg-accent text-on-secondary-fixed border border-accent rounded-lg px-8 py-3 font-label-md text-label-md uppercase tracking-wider hover:opacity-90 disabled:opacity-50 btn-press flex items-center justify-center gap-2"
                      >
                        {isScraping ? <div className="w-4 h-4 border-2 border-on-secondary-fixed border-t-transparent rounded-full animate-spin"></div> : <Search size={18} />}
                        Search
                      </button>
                    </div>
                  </form>
                  {scraperMessage && (
                    <div className="mt-6 font-label-sm text-label-sm text-on-surface-variant flex items-center gap-3 bg-surface-container p-3 rounded-lg border border-outline">
                      <div className={`w-2 h-2 rounded-full ${isScraping ? 'bg-accent animate-pulse' : 'bg-outline-variant'}`}></div>
                      <span className="font-mono text-xs">{scraperMessage}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {scraperResults.map((result, idx) => (
                    <div key={idx} className="bg-surface-container-low border border-outline rounded-lg flex flex-col card-hover overflow-hidden group">
                      <div className="p-6 flex-grow">
                        <div className="flex justify-between items-start mb-4">
                          <span className="font-label-sm text-label-sm text-accent bg-surface-container border border-outline px-2 py-1 rounded uppercase">{result.source}</span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{result.date}</span>
                        </div>
                        <h3 className="font-headline-sm text-headline-sm text-primary leading-snug mb-3 line-clamp-3" title={result.title}>{result.title}</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1 mb-4 italic">{result.authors}</p>
                        <p className="font-body-md text-body-md text-on-surface-variant line-clamp-4 leading-relaxed">{result.abstract}</p>
                      </div>
                      <div className="flex border-t border-outline bg-surface-container">
                        <a 
                          href={result.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-1 text-center font-label-sm text-label-sm uppercase text-on-surface-variant hover:bg-surface-container-high py-4 hover:text-primary btn-press flex justify-center items-center gap-2 border-r border-outline"
                        >
                          <ExternalLink size={14} /> View
                        </a>
                        <button 
                          onClick={() => handleAddScrapedToLibrary(result)}
                          className="flex-1 font-label-sm text-label-sm uppercase text-accent py-4 hover:bg-accent hover:text-on-secondary-fixed btn-press flex justify-center items-center gap-2"
                        >
                          <Plus size={14} /> Import
                        </button>
                      </div>
                    </div>
                  ))}
                  {!isScraping && scraperResults.length === 0 && scraperMessage.includes("Found 0") && (
                    <div className="col-span-full py-32 flex flex-col items-center justify-center text-center text-on-surface-variant border border-dashed border-outline rounded-lg bg-surface-container">
                      <Search size={32} className="mb-4 opacity-20" />
                      <p className="font-body-md text-body-md">No results found for this query.</p>
                    </div>
                  )}
                </div>
              </div>
              </ViewTransition>
            )}

            {/* VIEW 1: DASHBOARD / LIBRARY */}
            {activeView === "dashboard" && (
              <ViewTransition viewKey="dashboard">
              <div className="flex flex-col gap-8 pb-24 pt-8 max-w-7xl mx-auto">
                {/* API key notice banner */}
                {!apiKey && (
                  <div className="mb-6 p-4 border border-outline-variant bg-surface-container flex flex-col md:flex-row items-start md:items-center justify-between gap-3 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-accent font-bold text-lg">⚡</span>
                      <div>
                        <p className="font-label-md text-label-md uppercase tracking-wider font-bold text-accent">Running in Local Mode</p>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                          Summaries and chat use heuristic extraction only. Add a free API key for full AI-powered analysis.
                        </p>
                      </div>
                    </div>
                    <button
                      className="flex-shrink-0 bg-accent text-on-secondary-fixed font-label-md text-label-md px-4 py-2 uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer rounded-lg"
                      onClick={() => setActiveView("settings")}
                    >
                      Add Free API Key →
                    </button>
                  </div>
                )}
                <div className="border-b border-outline pb-6">
                  <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Research Library</h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">Upload and catalog academic research papers, index text chunks, and perform RAG operations.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Upload Block */}
                  <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-surface-container-low border border-outline rounded-lg p-6">
                      <h2 className="font-headline-sm text-headline-sm text-primary mb-4">Import Document</h2>
                      
                      {/* Hidden File Input */}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        style={{ display: "none" }} 
                        accept="application/pdf"
                        multiple
                      />
                      
                      {/* Drag & Drop Area */}
                      <div 
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer btn-press flex flex-col items-center gap-4 ${
                          dragging ? "bg-surface-container border-accent" : "bg-surface-container border-outline hover:border-outline-variant"
                        }`}
                        onClick={triggerFileSelect}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          const files = Array.from(e.dataTransfer.files || []);
                          if (files.length > 0) {
                            handleFileUpload(null, files);
                          }
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center border border-outline">
                          <Upload size={20} />
                        </div>
                        <div>
                          <h3 className="font-body-md text-body-md text-primary mb-1">Drag & Drop Research PDF</h3>
                          <p className="font-label-sm text-label-sm text-on-surface-variant">max 5 files (daily limit 20)</p>
                        </div>
                      </div>

                      {/* Upload state progress */}
                      {uploadStatus && uploadStatus !== "done" && (
                        <div className="mt-4 p-4 rounded-lg border border-outline bg-surface-container">
                          <div className="flex justify-between font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant mb-2">
                            <span>
                              {uploadStatus === "parsing" && "Extracting text pages..."}
                              {uploadStatus === "analyzing" && "Extracting summary..."}
                              {uploadStatus === "error" && "Process failed"}
                            </span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden border border-outline">
                            <div className="bg-accent h-full btn-press duration-300" style={{ width: `${uploadProgress}%` }}></div>
                          </div>
                          {uploadError && (
                            <div className="flex gap-2 items-center text-error font-label-sm text-label-sm uppercase tracking-wider mt-3">
                              <AlertCircle size={14} />
                              <span>{uploadError}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {uploadStatus === "done" && (
                        <div className="flex gap-2 items-center text-accent font-label-sm text-label-sm uppercase tracking-wider mt-4">
                          <Check size={14} />
                          <span>Success: Paper cataloged!</span>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Right Column: Library List */}
                  <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Search & filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative flex-grow">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder="Search database (title, author, metadata)..."
                          className="w-full bg-surface-container-low border border-outline rounded-lg focus:border-outline-variant p-3 pl-10 outline-none font-body-md text-body-md text-on-surface btn-press"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {allTags.length > 0 && (
                        <select 
                          className="bg-surface-container-low border border-outline rounded-lg focus:border-outline-variant p-3 outline-none font-body-md text-body-md text-on-surface cursor-pointer btn-press appearance-none md:min-w-[200px]"
                          value={selectedTag}
                          onChange={(e) => setSelectedTag(e.target.value)}
                        >
                          <option value="">All Category Tags</option>
                          {allTags.map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Filter counters */}
                    {(searchQuery || selectedTag) && (
                      <div className="flex items-center gap-3 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                        <span>Database matches: {filteredPapers.length} items</span>
                        <button 
                          className="text-accent underline cursor-pointer font-bold"
                          onClick={() => { setSearchQuery(""); setSelectedTag(""); }}
                        >
                          Clear Filters
                        </button>
                      </div>
                    )}

                    {/* Selection Controls Header Bar */}
                    {papers.length > 0 && (
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-surface-container rounded-lg border border-outline gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className={`w-5 h-5 rounded border flex items-center justify-center btn-press cursor-pointer ${
                              filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.includes(p.id))
                                ? "bg-accent text-on-secondary-fixed border-accent"
                                : "bg-surface-container-low border-outline text-transparent hover:border-outline-variant"
                            }`}
                            onClick={toggleSelectAll}
                            title="Select / Deselect All visible papers"
                          >
                            {filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.includes(p.id)) && (
                              <Check size={12} className="stroke-[3]" />
                            )}
                          </button>
                          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface select-none">
                            {selectedPaperIds.length > 0 
                              ? `${selectedPaperIds.length} of ${papers.length} selected`
                              : `Select All Visible`
                            }
                          </span>
                          {selectedPaperIds.length > 0 && (
                            <button
                              type="button"
                              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary hover:underline uppercase tracking-wider font-bold ml-2 btn-press"
                              onClick={() => setSelectedPaperIds([])}
                            >
                              Clear Selection
                            </button>
                          )}
                        </div>
                        
                        {selectedPaperIds.length > 0 && (
                          <button
                            type="button"
                            className="bg-error/10 text-error border border-error/30 font-label-sm text-label-sm px-4 py-2 rounded-lg uppercase tracking-wider hover:bg-error/20 btn-press cursor-pointer flex items-center gap-2"
                            onClick={handleDeleteSelected}
                          >
                            <Trash2 size={12} />
                            <span>Delete Selected ({selectedPaperIds.length})</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Papers List */}
                    {filteredPapers.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredPapers.map(paper => (
                          <div 
                            key={paper.id} 
                            className={`rounded-lg p-6 flex flex-col justify-between h-[280px] cursor-pointer border card-hover ${
                              activePaperId === paper.id 
                                ? "bg-surface-container border-accent" 
                                : "bg-surface-container-low border-outline"
                            }`}
                            onClick={() => {
                              setActivePaperId(paper.id);
                              setActiveView("summarizer");
                            }}
                          >
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <span className={`font-label-sm text-label-sm uppercase tracking-wider px-2 py-1 rounded border ${
                                  paper.type === "uploaded" ? "bg-surface-container text-accent border-accent/30" : "bg-surface-container border-outline text-on-surface-variant"
                                }`}>
                                  {paper.type === "uploaded" ? "Uploaded" : "Preloaded"}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                                    {paper.year}
                                  </span>
                                  {/* Custom Selection Checkbox */}
                                  <button
                                    type="button"
                                    className={`w-5 h-5 rounded border flex items-center justify-center btn-press cursor-pointer ${
                                      selectedPaperIds.includes(paper.id)
                                        ? "bg-accent text-on-secondary-fixed border-accent"
                                        : "bg-surface-container border-outline text-transparent hover:border-outline-variant"
                                    }`}
                                    onClick={(e) => toggleSelectPaper(paper.id, e)}
                                    title={selectedPaperIds.includes(paper.id) ? "Deselect paper" : "Select paper"}
                                  >
                                    {selectedPaperIds.includes(paper.id) && (
                                      <Check size={12} className="stroke-[3]" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              <h3 className="font-headline-sm text-headline-sm text-primary mb-2 line-clamp-2">{paper.title}</h3>
                              <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1 mb-4 italic">By {paper.authors}</p>
                            </div>

                            <div>
                              <div className="flex gap-2 flex-wrap mb-4">
                                {paper.tags.slice(0, 3).map(tag => (
                                  <span key={tag} className="font-label-sm text-label-sm uppercase tracking-wider bg-surface-container px-2 py-1 rounded border border-outline text-on-surface-variant">{tag}</span>
                                ))}
                                {paper.tags.length > 3 && (
                                  <span className="font-label-sm text-label-sm uppercase tracking-wider bg-surface-container px-2 py-1 rounded border border-outline text-accent">+{paper.tags.length - 3}</span>
                                )}
                              </div>

                              <div className="flex justify-between items-center border-t border-outline pt-4 mt-auto">
                                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">{paper.pageCount} pages</span>
                                <div className="flex gap-4 items-center">
                                  <button 
                                    className="text-on-surface-variant hover:text-error cursor-pointer transition-colors"
                                    onClick={(e) => handleDeletePaper(paper.id, e)}
                                    title="Delete Paper"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <div className="flex items-center gap-1 text-accent font-semibold hover:opacity-70 transition-opacity">
                                    <span className="font-label-sm text-label-sm">Analyze</span>
                                    <ChevronRight size={14} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-outline border-dashed rounded-lg bg-surface-container-low p-16 text-center flex flex-col items-center gap-4">
                        <Search size={32} className="text-outline-variant" />
                        <div>
                          <h3 className="font-headline-sm text-headline-sm text-primary mb-2">No Academic Catalog Matches</h3>
                          <p className="font-body-md text-body-md text-on-surface-variant">Please modify your keyword filters or upload a PDF document.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </ViewTransition>
            )}

            {/* VIEW 2: SUMMARIZER */}
            {activeView === "summarizer" && activePaper && (
              <div className="">
                <div className="mb-8 border-b border-outline pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <h1 className="font-headline-lg text-headline-lg text-primary mb-1">
                      {activePaper.title}
                    </h1>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {(() => {
                        const authorList = activePaper.authors
                          ? activePaper.authors.split(/,|;|&| and /i).map(a => a.trim()).filter(Boolean)
                          : [];
                        const first = authorList[0] || activePaper.authors || 'Unknown';
                        const remaining = authorList.length - 1;
                        return remaining > 0
                          ? `by ${first} +${remaining}`
                          : `by ${first}`;
                      })()}
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    {/* Cycle/Next Paper Button */}
                    {papers.length > 1 && (
                      <button 
                        className="w-fit border border-outline rounded-lg bg-surface-container px-6 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-high btn-press cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          const currentIndex = papers.findIndex(p => p.id === activePaperId);
                          const nextIndex = (currentIndex + 1) % papers.length;
                          setActivePaperId(papers[nextIndex].id);
                        }}
                      >
                        <span>Next Paper</span>
                        <ArrowRight size={14} />
                      </button>
                    )}
                    
                    <button 
                      className="w-fit border border-outline rounded-lg bg-surface-container px-6 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-high btn-press cursor-pointer" 
                      onClick={() => setActiveView("dashboard")}
                    >
                      Back to Library
                    </button>
                  </div>
                </div>

                <div className="swiss-grid">
                  {/* Left Panel: Document Metadata details */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-surface-container-low border border-outline rounded-lg p-6 flex flex-col gap-6">
                      <h2 className="font-headline-sm text-headline-sm text-primary border-b border-outline pb-2">Metadata details</h2>
                      
                      <div>
                        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Category Tags</span>
                        <div className="flex gap-2 flex-wrap mt-2">
                          {activePaper.tags.map(tag => (
                            <span key={tag} className="font-label-sm text-label-sm uppercase tracking-wider bg-surface-container px-2 py-0.5 border border-outline text-on-surface-variant">{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Index Segmentation</span>
                        <div className="grid grid-cols-2 gap-4 mt-2 font-mono">
                          <div className="bg-surface border border-outline p-3 text-center">
                            <div className="text-xl font-bold text-primary">{activePaper.pageCount}</div>
                            <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-1">Total Pages</div>
                          </div>
                          <div className="bg-surface border border-outline p-3 text-center">
                            <div className="text-xl font-bold text-primary">{activePaper.chunks.length}</div>
                            <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-1">Vector Chunks</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button 
                          className="flex-grow bg-accent text-on-secondary-fixed font-label-md text-label-md px-4 py-3 border border-accent/30 uppercase tracking-wider hover:opacity-90 btn-press cursor-pointer flex items-center justify-center gap-2"
                          onClick={() => setActiveView("chat")}
                        >
                          <MessageSquare size={14} />
                          <span>Semantic Chat</span>
                        </button>
                        <button 
                          className="border border-outline bg-surface-container px-4 py-3 font-label-md text-label-md text-on-surface uppercase tracking-wider hover:bg-surface-container-high btn-press cursor-pointer flex items-center justify-center gap-2"
                          onClick={() => setActiveView("tabular")}
                        >
                          <Table size={14} />
                          <span>Ledger row</span>
                        </button>
                      </div>
                    </div>

                    {/* CITATION GENERATOR BLOCK WITH DROPDOWN MENU */}
                    <div className="bg-surface-container-low border border-outline rounded-lg p-6 flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-outline pb-2">
                        <span className="font-body-md text-body-md font-medium uppercase tracking-wider text-primary">Citation Engine</span>
                        
                        {/* Citation format select dropdown */}
                        <div className="relative">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="font-label-sm text-label-sm uppercase tracking-wider px-3 py-1.5 border border-outline bg-surface-container hover:bg-surface-container-high btn-press flex items-center gap-1.5 cursor-pointer select-none rounded"
                            >
                              <span>{citationFormat === "google_scholar" ? "Google Scholar" : citationFormat.toUpperCase()}</span>
                              <ChevronDown size={10} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-surface-container border border-outline p-1 shadow-md z-50 animate-fade-in w-[180px] rounded-lg">
                              {[
                                { id: "google_scholar", label: "Google Scholar" },
                                { id: "mdpi", label: "MDPI Style" },
                                { id: "ieee", label: "IEEE Format" },
                                { id: "researchgate", label: "ResearchGate" },
                                { id: "bibtex", label: "BibTeX markup" }
                              ].map(item => (
                                <DropdownMenuItem
                                  key={item.id}
                                  className={`p-2 font-label-sm text-label-sm cursor-pointer flex items-center justify-between rounded ${
                                    citationFormat === item.id ? "bg-accent text-on-secondary-fixed font-bold" : "text-on-surface hover:bg-surface-container-high"
                                  }`}
                                  onClick={() => setCitationFormat(item.id)}
                                >
                                  <span>{item.label}</span>
                                  {citationFormat === item.id && <Check size={10} />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="bg-surface-container border border-outline p-4 font-body-md text-body-md text-on-surface-variant leading-relaxed select-text min-h-[100px]">
                        {citationFormat === "bibtex" ? (
                          <pre className="font-mono text-[11px] overflow-x-auto whitespace-pre">{formatCitation(activePaper, "bibtex")}</pre>
                        ) : (
                          <p>{formatCitation(activePaper, citationFormat)}</p>
                        )}
                      </div>

                      <button 
                        className="w-full border border-outline bg-surface-container p-2.5 font-label-md text-label-md uppercase tracking-wider hover:bg-surface-container-high btn-press cursor-pointer flex items-center justify-center gap-2 text-on-surface rounded"
                        onClick={() => {
                          const text = formatCitation(activePaper, citationFormat);
                          handleCopyText(text, "Citation copied!");
                        }}
                      >
                        <Copy size={12} />
                        <span>Copy Citation</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Panel: Summary */}
                  <div className="col-span-12 lg:col-span-8 bg-surface-container-low border border-outline rounded-lg p-6 md:p-8 flex flex-col gap-6">
                    {activePaper.summary === null ? (
                      /* No summary yet — offer local extraction */
                      <div className="flex flex-col items-center justify-center flex-grow gap-4 py-20 text-center">
                        <FileText size={32} className="text-outline-variant" />
                        <div>
                          <h3 className="font-headline-sm text-headline-sm text-primary mb-1">Summary Not Yet Extracted</h3>
                          <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                            Click below to generate a local extractive summary from the PDF text.
                          </p>
                        </div>
                        <button
                          className="bg-accent text-on-secondary-fixed font-label-md text-label-md px-6 py-2.5 border border-accent/30 uppercase tracking-wider hover:opacity-90 btn-press cursor-pointer flex items-center gap-2 rounded-lg"
                          onClick={() => handleGenerateSummary(activePaper)}
                        >
                          <span>⚡</span>
                          <span>Extract Summary</span>
                        </button>
                      </div>
                    ) : (
                      /* Summary exists — render it */
                      <>
                        <div className="flex justify-between items-center border-b border-outline pb-4">
                          <h2 className="font-headline-sm text-headline-sm text-primary uppercase">Structured AI Extraction</h2>
                          <button
                            className="border border-outline bg-surface-container px-4 py-2 font-label-sm text-label-sm uppercase tracking-wider hover:bg-surface-container-high btn-press cursor-pointer flex items-center gap-2 rounded"
                            onClick={() => handleCopyText(activePaper.summary, "Summary markdown copied!")}
                          >
                            <Copy size={12} />
                            <span>Copy Markdown</span>
                          </button>
                        </div>
                        <div className="max-h-[650px] overflow-y-auto pr-2">
                          {renderSummarySections(activePaper.summary)}
                        </div>
                      </>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* VIEW 3: INTERACTIVE CHAT */}
            {activeView === "chat" && activePaper && (
              <div className="">
                <div className="mb-8 border-b border-outline pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <span className="font-label-md text-label-md uppercase tracking-wider text-accent font-bold mb-2 block">
                      AI Semantic RAG Document Q&A
                    </span>
                    <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Q&A Chat</h1>
                    <p className="font-body-md text-body-md text-on-surface-variant">The research assistant scans vectors, returns accurate contextual snippets, and resolves questions in real-time.</p>
                  </div>
                  <button 
                    className="w-fit border border-outline rounded-lg bg-surface-container px-6 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-high btn-press cursor-pointer" 
                    onClick={() => setActiveView("dashboard")}
                  >
                    Back to Library
                  </button>
                </div>

                <div className="swiss-grid h-auto lg:h-[680px]">
                  {/* Left Panel: Retrievable Pages & Index Metadata */}
                  <div className="col-span-12 lg:col-span-4 bg-surface-container-low border border-outline rounded-lg p-6 flex flex-col gap-4 h-full overflow-hidden">
                    <h2 className="font-headline-sm text-headline-sm text-primary border-b border-outline pb-2">Document Vectors Context</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-2">
                      ScholarSync parses matching segments using client-side indexing. Below are the indexed text passages that support factual verification.
                    </p>

                    <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-4">
                      <div className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface font-bold flex items-center gap-2">
                        <Database size={12} className="text-accent" />
                        <span>Indexed Scope segments</span>
                      </div>

                      {/* Render segments depending on chatScopeId */}
                      {(chatScopeId === "all" ? papers.flatMap(p => p.chunks) : (papers.find(p => p.id === chatScopeId)?.chunks || activePaper.chunks)).slice(0, 5).map((chunk, idx) => (
                        <div 
                          key={chunk.id || idx} 
                          className="bg-surface-container border border-outline hover:border-outline-variant p-4 cursor-pointer btn-press duration-200 rounded"
                          onClick={() => handleCitationClick(chunk.content, chunk.page)}
                        >
                          <div className="flex justify-between items-center mb-2 font-label-sm text-label-sm uppercase tracking-wider">
                            <span className="bg-surface-container-high text-on-surface px-2 py-0.5 border border-outline font-bold rounded">Page {chunk.page}</span>
                            <span className="text-on-surface-variant">
                              {chatScopeId === "all" ? papers.find(p => p.id === chunk.paperId || chunk.id?.includes(p.id))?.title.substring(0, 15) + "..." : `Segment #${idx + 1}`}
                            </span>
                          </div>
                          <p className="font-body-md text-body-md text-on-surface-variant italic line-clamp-3 leading-relaxed">
                            &ldquo;{chunk.content}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Conversation Stream */}
                  <div className="col-span-12 lg:col-span-8 bg-surface-container-low border border-outline rounded-lg p-6 flex flex-col justify-between h-[550px] lg:h-full overflow-hidden">
                    
                    {/* Chat History */}
                    <div className="flex-grow overflow-y-auto pr-2 flex flex-col gap-6 mb-6">
                      
                      {/* Welcome bubble */}
                      <div className="border border-outline bg-surface-container p-5 animate-fade-in border-l-4 border-l-accent rounded">
                        <span className="font-label-sm text-label-sm uppercase tracking-wider text-accent font-bold flex items-center gap-1.5 mb-2">
                          <BookOpen size={12} />
                          <span>Terminal Assistant</span>
                        </span>
                        <div className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                          {chatScopeId === "all" ? (
                            <span>Welcome to the Global ScholarSync Q&A. I will analyze questions across <strong className="text-primary">all {papers.length} papers</strong> indexed in your library.</span>
                          ) : (
                            <span>Welcome to ScholarSync. Q&A workspace successfully created for <strong className="text-primary">&ldquo;{papers.find(p => p.id === chatScopeId)?.title || activePaper?.title}&rdquo;</strong>. Ask any target question.</span>
                          )}
                        </div>
                        
                        <div className="mt-4 pt-3 border-t border-outline">
                          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold block mb-2">Quick queries:</span>
                          <div className="flex gap-2 flex-wrap">
                            <button 
                              className="font-label-sm text-label-sm uppercase tracking-wider border border-outline bg-surface-container hover:bg-surface-container-high px-3 py-1 cursor-pointer btn-press rounded text-on-surface"
                              onClick={() => setCurrentMessage("Summarize the key contribution of this research.")}
                            >
                              Core Contribution?
                            </button>
                            <button 
                              className="font-label-sm text-label-sm uppercase tracking-wider border border-outline bg-surface-container hover:bg-surface-container-high px-3 py-1 cursor-pointer btn-press rounded text-on-surface"
                              onClick={() => setCurrentMessage("What methodology did the authors use?")}
                            >
                              Methodology?
                            </button>
                            <button 
                              className="font-label-sm text-label-sm uppercase tracking-wider border border-outline bg-surface-container hover:bg-surface-container-high px-3 py-1 cursor-pointer btn-press rounded text-on-surface"
                              onClick={() => setCurrentMessage("What are the main results and findings?")}
                            >
                              Key Findings?
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Conversation bubbles */}
                      {(chatHistories[chatScopeId] || []).map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`border p-5 animate-fade-in rounded ${
                            msg.role === "user" 
                              ? "bg-surface-container border-outline border-r-4 border-r-accent ml-12" 
                              : "bg-surface-container border-outline border-l-4 border-l-accent mr-12"
                          }`}
                        >
                          <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold flex items-center gap-1.5 mb-2">
                            {msg.role === "user" ? (
                              <span className="text-on-surface-variant">User / Analyst</span>
                            ) : (
                              <span className="text-accent flex items-center gap-1.5">
                                <BookOpen size={12} />
                                <span>ScholarSync Terminal</span>
                              </span>
                            )}
                          </span>
                          
                          <div className="font-body-md text-body-md text-on-surface">
                            {renderMessageTextWithCitations(msg)}
                          </div>
                          
                          {/* Chat sources citations footer */}
                          {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-dashed border-outline">
                              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold block mb-1.5">Context Proof:</span>
                              <div className="flex gap-2 flex-wrap">
                                {Array.from(new Set(msg.sources.map(s => s.page))).sort((a,b)=>a-b).map(pageNum => {
                                  const src = msg.sources.find(s => s.page === pageNum);
                                  return (
                                    <button 
                                      key={pageNum}
                                      className="font-label-sm text-label-sm uppercase tracking-wider bg-surface-container border border-outline hover:border-outline-variant px-2.5 py-1 cursor-pointer btn-press text-on-surface font-bold flex items-center gap-1 rounded"
                                      onClick={() => handleCitationClick(src ? src.content : "Context snippet", pageNum)}
                                    >
                                      <span>Page {pageNum}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {chatLoading && (
                        <div className="border border-outline bg-surface-container p-5 mr-12 animate-pulse border-l-4 border-l-accent rounded">
                          <span className="font-label-sm text-label-sm uppercase tracking-wider text-accent font-bold flex items-center gap-1.5 mb-2">
                            <BookOpen size={12} />
                            <span>ScholarSync is searching local vectors...</span>
                          </span>
                          <div className="flex gap-1.5 mt-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }}></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }}></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }}></div>
                          </div>
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat input and scope configuration */}
                    <div className="flex flex-col gap-2 w-full pt-4 border-t border-outline">
                      {/* Active Scope Indicator Badge */}
                      <div className="flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-bold">
                        <span>Query Scope:</span>
                        <span className="bg-surface-container-high text-on-surface px-2 py-0.5 border border-outline font-label-sm text-label-sm truncate max-w-[400px] rounded">
                          {chatScopeId === "all" ? "All Papers (@all)" : `@ ${papers.find(p => p.id === chatScopeId)?.title || "Active Paper"}`}
                        </span>
                      </div>
                      
                      {/* Floating Mentions Dropdown (WhatsApp style) */}
                      {showMentionDropdown && (
                        <div className="relative w-full">
                          <div className="absolute bottom-full mb-2 left-0 w-full max-h-[240px] overflow-y-auto bg-surface-container border border-outline-variant shadow-lg z-50 flex flex-col p-1 gap-1 animate-fade-in rounded-lg">
                            <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant border-b border-outline p-2 pb-1">
                              Mention Research Paper Scope
                            </div>
                            
                            {/* @all Option */}
                            {("all".includes(mentionSearch.toLowerCase()) || mentionSearch === "") && (
                              <button
                                type="button"
                                className="w-full text-left p-2.5 font-body-md text-body-md hover:bg-surface-container-high btn-press flex items-center justify-between cursor-pointer text-on-surface rounded"
                                onClick={() => selectMention("all")}
                              >
                                <span>@all (Query all papers)</span>
                              </button>
                            )}

                            {/* Papers matching search */}
                            {papers
                              .filter(p => p.title.toLowerCase().includes(mentionSearch.toLowerCase()))
                              .map(paper => (
                                <button
                                  key={paper.id}
                                  type="button"
                                  className="w-full text-left p-2.5 font-body-md text-body-md hover:bg-surface-container-high btn-press flex flex-col gap-0.5 border-b border-outline last:border-0 cursor-pointer text-on-surface rounded"
                                  onClick={() => selectMention(paper)}
                                >
                                  <span className="font-bold truncate">@ {paper.title}</span>
                                  <span className="font-label-sm text-label-sm opacity-80 truncate text-on-surface-variant">By {paper.authors}</span>
                                </button>
                              ))}

                            {/* No matches */}
                            {papers.filter(p => p.title.toLowerCase().includes(mentionSearch.toLowerCase())).length === 0 &&
                             ! "all".includes(mentionSearch.toLowerCase()) && (
                              <div className="p-3 text-center font-label-sm text-label-sm text-on-surface-variant">
                                No matching research papers found
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                        <form onSubmit={handleSendMessage} className="flex gap-3 w-full items-end">
                          {/* Auto-expanding Textarea */}
                          <textarea
                            ref={chatInputRef}
                            placeholder="Type questions (e.g. key findings, methodology)... (Type '@' to change scope)"
                            rows={1}
                            className="flex-grow bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-body-md text-body-md text-on-surface resize-none overflow-y-auto leading-relaxed rounded-lg"
                            style={{ minHeight: "52px", maxHeight: "400px" }}
                            value={currentMessage}
                            onChange={handleChatInputChange}
                            onInput={(e) => {
                              e.target.style.height = "auto";
                              e.target.style.height = Math.min(e.target.scrollHeight, 400) + "px";
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (currentMessage.trim() && !chatLoading) {
                                  handleSendMessage(e);
                                  if (chatInputRef.current) {
                                    chatInputRef.current.style.height = "52px";
                                  }
                                }
                              }
                            }}
                            disabled={chatLoading}
                          />
                        <button 
                          type="submit" 
                          className="bg-accent text-on-secondary-fixed border border-accent/30 px-6 h-12 hover:opacity-90 btn-press cursor-pointer flex items-center justify-center disabled:opacity-50 flex-shrink-0 rounded-lg"
                          disabled={!currentMessage.trim() || chatLoading}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 4: Structured Catalog Tabular View */}
            {activeView === "tabular" && (
              <ViewTransition viewKey="tabular">
              <div>
                <div className="mb-8 border-b border-outline pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <span className="font-label-md text-label-md uppercase tracking-wider text-accent font-bold mb-2 block">
                      Scientific Ledger & comparative analysis
                    </span>
                    <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Structured Catalog</h1>
                    <p className="font-body-lg text-body-lg text-on-surface-variant">A horizontal ledger tracking methodology, extracted results, contributions, and datasets for cross-paper evaluation.</p>
                  </div>

                  {/* Multiple Export Selection Dropdown */}
                  <div className="flex gap-3 items-center">
                    {selectedPaperIds.length > 0 && (
                      <button
                        type="button"
                        className="bg-error/10 text-error font-label-sm text-label-sm px-4 py-2.5 border border-error/30 uppercase tracking-widest hover:bg-error/20 btn-press cursor-pointer flex items-center gap-2 rounded-lg"
                        onClick={handleDeleteSelected}
                      >
                        <Trash2 size={12} />
                        <span>Delete Selected ({selectedPaperIds.length})</span>
                      </button>
                    )}

                    <div className="relative">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="border border-outline rounded-lg bg-surface-container px-6 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-container-high btn-press cursor-pointer flex items-center gap-2 select-none"
                        >
                          <Download size={14} />
                          <span>Export Ledger</span>
                          <ChevronDown size={12} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-surface-container border border-outline p-1 shadow-md z-50 animate-fade-in w-[180px] rounded-lg">
                          <DropdownMenuItem className="p-2 font-body-md text-body-md cursor-pointer hover:bg-surface-container-high rounded text-on-surface" onClick={handleExportCSV}>
                            Export as CSV (.csv)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-2 font-body-md text-body-md cursor-pointer hover:bg-surface-container-high rounded text-on-surface" onClick={handleExportMarkdown}>
                            Export as Markdown (.md)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-2 font-body-md text-body-md cursor-pointer hover:bg-surface-container-high rounded text-on-surface" onClick={handleExportPDF}>
                            Export as PDF (.pdf)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <button 
                      className="bg-accent text-on-secondary-fixed font-label-md text-label-md px-6 py-2.5 border border-accent/30 uppercase tracking-wider hover:opacity-90 btn-press cursor-pointer flex items-center gap-2 rounded-lg"
                      onClick={() => setActiveView("dashboard")}
                    >
                      <Plus size={14} />
                      <span>Upload Paper</span>
                    </button>
                  </div>
                </div>

                {/* VISUAL PREVIEW OF ATTRIBUTES TO BE EXTRACTED */}
                <div className="bg-surface-container-low border border-outline rounded-lg p-5 mb-6 flex flex-col gap-3">
                  <div className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-bold">
                    Target Extraction Attributes Scheme
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Paper Title", 
                      "Authors", 
                      "Publication Year", 
                      "Problem Statement", 
                      "Methodology Details", 
                      "Key Results & Findings", 
                      "Core Contributions", 
                      "Datasets Used"
                    ].map(attr => (
                      <span key={attr} className="font-label-sm text-label-sm uppercase tracking-wider bg-surface-container px-3 py-1 border border-outline font-bold flex items-center gap-1.5 text-on-surface rounded">
                        <Check size={11} className="text-accent" />
                        <span>{attr}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {papers.length > 0 ? (
                  <div className="overflow-x-auto border border-outline rounded-lg bg-surface-container-low">
                    <table className="w-full text-left font-body-md text-body-md border-collapse select-text">
                      <thead>
                        <tr className="bg-surface-container border-b border-outline font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
                          <th className="p-4 border-r border-outline w-[60px] text-center">
                            <button
                              type="button"
                              className={`w-4 h-4 border mx-auto flex items-center justify-center btn-press cursor-pointer rounded ${
                                papers.length > 0 && papers.every(p => selectedPaperIds.includes(p.id))
                                  ? "bg-accent text-on-secondary-fixed border-accent"
                                  : "bg-surface-container border-outline text-transparent hover:border-outline-variant"
                              }`}
                              onClick={toggleSelectAll}
                              title="Select / Deselect All Papers"
                            >
                              {papers.length > 0 && papers.every(p => selectedPaperIds.includes(p.id)) && (
                                <Check size={10} className="stroke-[3]" />
                              )}
                            </button>
                          </th>
                          <th className="p-4 border-r border-outline min-w-[220px]">Paper Title</th>
                          <th className="p-4 border-r border-outline min-w-[150px]">Authors</th>
                          <th className="p-4 border-r border-outline min-w-[80px]">Year</th>
                          <th className="p-4 border-r border-outline min-w-[250px]">Problem Statement</th>
                          <th className="p-4 border-r border-outline min-w-[250px]">Methodology Details</th>
                          <th className="p-4 border-r border-outline min-w-[250px]">Key Results & Findings</th>
                          <th className="p-4 border-r border-outline min-w-[220px]">Contributions</th>
                          <th className="p-4 border-r border-outline min-w-[120px]">Dataset</th>
                          <th className="p-4 border-r border-outline min-w-[140px]">Tags</th>
                          <th className="p-4 min-w-[200px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {papers.map(paper => (
                          <tr key={paper.id} className="border-b border-outline hover:bg-surface-container transition-colors">
                            <td className="p-4 border-r border-outline text-center">
                              <button
                                type="button"
                                className={`w-4 h-4 border mx-auto flex items-center justify-center btn-press cursor-pointer rounded ${
                                  selectedPaperIds.includes(paper.id)
                                    ? "bg-accent text-on-secondary-fixed border-accent"
                                    : "bg-surface-container border-outline text-transparent hover:border-outline-variant"
                                }`}
                                onClick={(e) => toggleSelectPaper(paper.id, e)}
                                title={selectedPaperIds.includes(paper.id) ? "Deselect paper" : "Select paper"}
                              >
                                {selectedPaperIds.includes(paper.id) && (
                                  <Check size={10} className="stroke-[3]" />
                                )}
                              </button>
                            </td>
                            <td className="p-4 border-r border-outline font-bold text-primary">
                              <div className="flex flex-col gap-2">
                                <span>{paper.title}</span>
                                <span className="tag-pastel w-fit">
                                  {paper.type === "uploaded" ? "Uploaded" : "Preloaded"}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 border-r border-outline text-on-surface-variant">{paper.tabularData.authors}</td>
                            <td className="p-4 border-r border-outline font-mono text-on-surface">{paper.tabularData.year}</td>
                            <td className="p-4 border-r border-outline text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.problem}</td>
                            <td className="p-4 border-r border-outline text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.methodology}</td>
                            <td className="p-4 border-r border-outline text-on-surface-variant text-[13px] leading-relaxed">
                              <div>{paper.tabularData.keyFindings}</div>
                              {paper.numericalResults && paper.numericalResults.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed border-outline">
                                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-accent font-bold block mb-1">Extracted Metrics:</span>
                                  {paper.numericalResults.slice(0, 4).map((r, i) => (
                                    <div key={i} className="font-mono text-[10px] text-on-surface flex gap-2 items-baseline">
                                      <span className="text-accent font-bold">{r.value}</span>
                                      <span className="text-on-surface-variant truncate max-w-[160px]">{r.metric}</span>
                                      <span className="text-on-surface-variant/50">p.{r.page}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-4 border-r border-outline text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.contributions}</td>
                            <td className="p-4 border-r border-outline font-mono text-on-surface text-[13px]">{paper.tabularData.dataset}</td>
                            <td className="p-4 border-r border-outline">
                              <div className="flex flex-col gap-1">
                                {paper.tags.map(t => (
                                  <span key={t} className="tag-pastel block w-full text-center">{t}</span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                <button 
                                  className="border border-outline bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 font-label-sm text-label-sm uppercase tracking-wider cursor-pointer btn-press rounded text-on-surface"
                                  onClick={() => {
                                    setActivePaperId(paper.id);
                                    setActiveView("summarizer");
                                  }}
                                >
                                  Summary
                                </button>
                                <button 
                                  className="border border-outline bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 font-label-sm text-label-sm uppercase tracking-wider cursor-pointer btn-press rounded text-on-surface"
                                  onClick={() => {
                                    setActivePaperId(paper.id);
                                    setActiveView("chat");
                                  }}
                                >
                                  Chat
                                </button>
                                <button 
                                  className="border border-outline/30 bg-error/5 text-error hover:bg-error hover:text-on-error px-2.5 py-1.5 font-label-sm text-label-sm uppercase tracking-wider cursor-pointer btn-press rounded"
                                  onClick={(e) => handleDeletePaper(paper.id, e)}
                                  title="Delete Paper"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-outline rounded-lg border-dashed bg-surface-container-low p-12 text-center text-on-surface-variant flex flex-col items-center gap-4">
                    <Table size={32} className="text-outline-variant" />
                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-primary mb-1">Comparative Ledger Empty</h3>
                      <p className="font-body-md text-body-md text-on-surface-variant">Please import papers in the Library tab to compile horizontal results comparison.</p>
                    </div>
                  </div>
                )}
              </div>
              </ViewTransition>
            )}

            {/* VIEW 5: SETTINGS */}
            {activeView === "settings" && (
              <ViewTransition viewKey="settings">
              <div>
                <div className="mb-8 border-b border-outline pb-6">
                  <h1 className="font-headline-lg text-headline-lg text-primary mb-2">System Settings</h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">Configure RAG window sizing and vector chunk properties. Fully local — no API keys required.</p>
                </div>

                <div className="max-w-[700px] bg-surface-container-low border border-outline rounded-lg p-6 md:p-8">
                  <form onSubmit={handleSaveSettings} className="flex flex-col gap-6">

                    {/* === UI PREFERENCES === */}
                    <div className="flex flex-col gap-5 pb-6 border-b border-outline">
                      <h3 className="font-headline-sm text-headline-sm text-primary">UI Preferences</h3>
                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                          Theme
                        </label>
                        {mounted ? (
                          <div className="flex gap-4">
                            <button
                              type="button"
                              className={`flex-1 py-3 rounded-lg border font-label-md text-label-md transition-colors ${theme === 'light' ? 'bg-accent text-on-secondary-fixed border-accent' : 'bg-surface border-outline text-on-surface-variant hover:text-primary'}`}
                              onClick={() => setTheme('light')}
                            >
                              Light Mode
                            </button>
                            <button
                              type="button"
                              className={`flex-1 py-3 rounded-lg border font-label-md text-label-md transition-colors ${theme === 'dark' ? 'bg-accent text-on-secondary-fixed border-accent' : 'bg-surface border-outline text-on-surface-variant hover:text-primary'}`}
                              onClick={() => setTheme('dark')}
                            >
                              Dark Mode
                            </button>
                          </div>
                        ) : (
                          <div className="h-[48px] bg-surface-container rounded-lg animate-pulse"></div>
                        )}
                      </div>
                    </div>

                    {/* === API CONFIGURATION === */}
                    <div className="flex flex-col gap-5 pb-6 border-b border-outline">
                      <h3 className="font-headline-sm text-headline-sm text-primary">AI Provider Configuration</h3>

                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                          Provider
                        </label>
                        <select
                          className="bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-body-md text-body-md text-on-surface cursor-pointer rounded-lg"
                          value={provider}
                          onChange={e => {
                            setProvider(e.target.value);
                          }}
                        >
                          <option value="groq">Groq — Free, no credit card (Recommended)</option>
                          <option value="gemini">Google Gemini — Free, no credit card</option>
                          <option value="mistral">Mistral — Free trial credits</option>
                          <option value="openai">OpenAI — Paid only</option>
                          <option value="anthropic">Anthropic Claude — Paid only</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                          API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder={
                              provider === "groq" ? "gsk_..." :
                              provider === "gemini" ? "AIza..." :
                              provider === "mistral" ? "your-mistral-key" :
                              "your-api-key"
                            }
                            className="flex-grow bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-body-md text-body-md text-on-surface rounded-lg"
                            value={apiKey}
                            onChange={e => {
                              setApiKey(e.target.value);
                            }}
                          />
                          {apiKey && (
                            <button
                              type="button"
                              className="border border-outline bg-surface-container px-4 font-label-md text-label-md uppercase text-error hover:bg-error hover:text-on-error transition-all cursor-pointer rounded-lg"
                              onClick={() => {
                                setApiKey("");
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <a
                          href={
                            provider === "groq" ? "https://console.groq.com/keys" :
                            provider === "gemini" ? "https://aistudio.google.com/apikey" :
                            provider === "mistral" ? "https://console.mistral.ai/api-keys" :
                            "#"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="font-label-sm text-label-sm text-accent underline hover:opacity-75 transition-all w-fit"
                        >
                          → Get your free {provider === "groq" ? "Groq" : provider === "gemini" ? "Gemini" : provider.charAt(0).toUpperCase() + provider.slice(1)} API key (no credit card)
                        </a>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                          Model Override <span className="normal-case font-normal text-on-surface-variant/60">(optional — leave blank for default)</span>
                        </label>
                        <input
                          type="text"
                          placeholder={
                            provider === "groq" ? "llama-3.3-70b-versatile" :
                            provider === "gemini" ? "gemini-2.5-flash" :
                            provider === "mistral" ? "mistral-small-latest" :
                            "Leave blank for default"
                          }
                          className="bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-body-md text-body-md text-on-surface rounded-lg"
                          value={modelOverride}
                          onChange={e => {
                            setModelOverride(e.target.value);
                          }}
                        />
                      </div>

                      {/* Status badge */}
                      <div className={`p-4 border flex items-center gap-3 rounded-lg ${
                        apiKey
                          ? "border-accent/30 bg-accent/5"
                          : "border-outline bg-surface-container"
                      }`}>
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${apiKey ? "bg-accent animate-pulse" : "bg-outline-variant"}`} />
                        <div>
                          <div className={`font-label-md text-label-md font-bold uppercase tracking-wider ${apiKey ? "text-accent" : "text-on-surface-variant"}`}>
                            {apiKey ? `AI Mode Active — ${provider.charAt(0).toUpperCase() + provider.slice(1)}` : "Local Mode — No API Key"}
                          </div>
                          <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                            {apiKey
                              ? "Summaries, table extraction, and chat are powered by AI."
                              : "Add a free API key above to enable AI-powered analysis."
                            }
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* === RAG CHUNKING CONFIG === */}
                    <div className="border-t border-outline pt-6 mt-2">
                      <h3 className="font-headline-sm text-headline-sm text-primary mb-4">Client-Side RAG Slicing Config</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        <div className="flex flex-col gap-2">
                          <label htmlFor="chunkSizeInput" className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Chunk Size (chars)</label>
                          <input 
                            id="chunkSizeInput"
                            type="number" 
                            min="200" 
                            max="3000"
                            className="bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-mono font-body-md text-body-md text-on-surface rounded-lg"
                            value={chunkSize}
                            onChange={(e) => setChunkSize(parseInt(e.target.value, 10))}
                          />
                          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Characters segmented for similarity.</span>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label htmlFor="overlapInput" className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Chunk Overlap (chars)</label>
                          <input 
                            id="overlapInput"
                            type="number" 
                            min="0" 
                            max="1000"
                            className="bg-surface-container border border-outline focus:border-outline-variant p-3 outline-none font-mono font-body-md text-body-md text-on-surface rounded-lg"
                            value={chunkOverlap}
                            onChange={(e) => setChunkOverlap(parseInt(e.target.value, 10))}
                          />
                          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Overlapped window between segments.</span>
                        </div>

                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-outline mt-4">
                      <button 
                        type="submit" 
                        className="bg-accent text-on-secondary-fixed font-label-md text-label-md px-6 py-3 border border-accent/30 uppercase tracking-widest hover:opacity-90 btn-press cursor-pointer rounded-lg"
                      >
                        Save Configuration
                      </button>
                      <button 
                        type="button" 
                        className="border border-outline bg-surface-container px-6 py-3 font-label-md text-label-md uppercase tracking-widest hover:bg-surface-container-high btn-press cursor-pointer rounded-lg text-on-surface"
                        onClick={() => setActiveView("dashboard")}
                      >
                        Cancel
                      </button>
                    </div>

                  </form>
                </div>
              </div>
              </ViewTransition>
            )}
      </main>

      {/* --- GLOBAL FOOTER --- */}
      <footer className="bg-surface-container-lowest border-t border-outline w-full py-12 px-margin-mobile md:px-margin-desktop mt-auto">
        <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-start gap-8 transition-opacity duration-200">
          <div>
            <span className="font-label-md text-label-md font-bold text-primary">ScholarSync</span>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-2">© 2026 ScholarSync Intelligence Systems. Terminal Access v4.0.2</p>
          </div>
          <div className="flex gap-12">
            <div className="flex flex-col gap-3">
              <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary underline underline-offset-4 uppercase tracking-wider" href="#">Documentation</a>
              <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary underline underline-offset-4 uppercase tracking-wider" href="#">Privacy Protocol</a>
            </div>
            <div className="flex flex-col gap-3">
              <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary underline underline-offset-4 uppercase tracking-wider" href="#">Neural Ethics</a>
              <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary underline underline-offset-4 uppercase tracking-wider" href="#">System Status</a>
            </div>
          </div>
        </div>
      </footer>

      {/* --- CITATION EXPLORER MODAL --- */}
      {showCitationModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm z-[100]"
          onClick={() => setShowCitationModal(false)}
        >
          <div 
            className="bg-surface-container border border-outline rounded-lg max-w-[650px] w-full shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b border-outline">
              <h3 className="font-headline-sm text-headline-sm text-primary">RAG Page Context Extractor</h3>
              <button 
                className="text-on-surface-variant hover:text-primary cursor-pointer"
                onClick={() => setShowCitationModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant mb-3">
                Source passage extracted from target PDF chunk parameters:
              </p>
              <div className="bg-surface-container-high border border-outline p-5 italic font-body-md text-body-md text-on-surface leading-relaxed mb-4 rounded">
                &ldquo;{citationModalText}&rdquo;
              </div>
              <div className="flex justify-between items-center font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                <span>Document: <strong className="text-primary">{activePaper?.title}</strong></span>
                <span className="bg-surface-container-high text-on-surface px-2 py-0.5 border border-outline font-bold rounded">Page {citationModalPage}</span>
              </div>
            </div>
            
            <div className="flex justify-end p-5 border-t border-outline">
              <button 
                className="border border-outline rounded-lg bg-surface-container px-6 py-2 font-body-md text-body-md text-on-surface uppercase tracking-wider hover:bg-surface-container-high btn-press cursor-pointer"
                onClick={() => setShowCitationModal(false)}
              >
                Close Context Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
