"use client";

import React, { useState, useEffect, useRef } from "react";
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
  ChevronDown
} from "lucide-react";
import { marked } from "marked";

// Relative imports for services/data

import { parsePdfFile, detectTitleFromFontData, detectAuthorsFromFontData } from "../lib/pdf-handler";
import { chunkPageText, retrieveChunks } from "../lib/rag-engine";
import { generateLocalSummary, extractLocalMetadata, synthesizeAnswer } from "../lib/local-summarizer";

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
      return `${mdpiAuthors}. ${title}. ScholarSynth ${year}.`;
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
  const [theme, setTheme] = useState("light"); // 'light' or 'dark'
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  
  // Config State (fully local — no API keys needed)
  const apiKeySaved = true; // always "connected" in local mode
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
    const savedTheme = localStorage.getItem("scholarsynth_theme") || "light";
    setChunkSize(parseInt(savedSize, 10));
    setChunkOverlap(parseInt(savedOverlap, 10));
    setTheme(savedTheme);
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Load persisted uploaded papers from localStorage
    let savedUploaded = [];
    try {
      const raw = localStorage.getItem("scholarsynth_uploaded_papers");
      if (raw) savedUploaded = JSON.parse(raw);
    } catch (_) { savedUploaded = []; }

    // Load persisted chat histories
    let savedChats = {};
    try {
      const rawChats = localStorage.getItem("scholarsynth_chat_histories");
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
      localStorage.setItem("scholarsynth_uploaded_papers", payload);
    } catch (_) {}
  }, [papers]);

  // Auto-save chat histories whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("scholarsynth_chat_histories", JSON.stringify(chatHistories));
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
  
  // Save Settings
  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem("rag_chunk_size", chunkSize.toString());
    localStorage.setItem("rag_chunk_overlap", chunkOverlap.toString());
    alert("Settings saved successfully!");
  };

  // Toggle Dark/Light Mode Theme
  const handleToggleTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("scholarsynth_theme", newTheme);
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

        // Step 4: Local extractive analysis (no API needed)
        setUploadStatus("analyzing");
        setUploadProgress(Math.floor((i * 100 + 65) / files.length));

        const metadata = extractLocalMetadata(allChunks, autoDetectedTitle);
        const resolvedTitle = autoDetectedTitle;
        const resolvedYear = metadata.year || new Date().getFullYear().toString();
        const resolvedAuthors = autoDetectedAuthors;
        const summaryContent = generateLocalSummary(allChunks, resolvedTitle, resolvedAuthors);

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

      const retrieved = retrieveChunks(cleanQuery, targetChunks, 5); // 5 chunks keeps context tight
      const retrievedChunks = retrieved.map(r => r.chunk);

      const formattedHistory = paperChats.map(h => ({
        role: h.role,
        content: h.content
      }));
      
      // Synthesize a coherent answer from the retrieved chunks
      const replyContent = synthesizeAnswer(
        cleanQuery,
        retrievedChunks,
        chatScopeId !== "all" ? scopeLabel : ""
      );

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
      return <div className="font-body-md text-on-surface">{message.content}</div>;
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
    link.setAttribute("download", "scholarsynth_catalog.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Tabular data to Markdown Table
  const handleExportMarkdown = () => {
    let md = `# ScholarSynth Formulation Ledger\n\n`;
    md += `| Paper Title | Authors | Year | Research Problem Statement | Methodology Details | Key Results & Findings | Core Contributions | Datasets Used |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    
    papers.forEach(p => {
      md += `| **${p.title}** | ${p.tabularData.authors} | ${p.tabularData.year} | ${p.tabularData.problem} | ${p.tabularData.methodology} | ${p.tabularData.keyFindings} | ${p.tabularData.contributions} | ${p.tabularData.dataset} |\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "scholarsynth_ledger.md");
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
          <title>ScholarSynth Research Ledger</title>
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
          <h1>ScholarSynth Formulation Ledger</h1>
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
    <div className="min-h-screen bg-surface flex flex-col selection:bg-primary-container selection:text-on-primary-container">
      {/* --- TOP NAVBAR --- */}
      <header className="w-full top-0 sticky bg-surface border-b-2 border-outline-variant z-50">
        <nav className="flex justify-between items-center w-full px-6 md:px-margin-desktop py-4 max-w-full mx-auto">
          {/* Logo */}
          <div 
            className="font-display-md text-3xl md:text-display-md text-primary tracking-tighter cursor-pointer hover:opacity-85 select-none transition-all"
            onClick={() => setActiveView("overview")}
          >
            ScholarSynth
          </div>

          {/* Links */}
          <div className="hidden lg:flex gap-6 items-center">
            <button 
              className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                activeView === "overview" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
              }`}
              onClick={() => setActiveView("overview")}
            >
              Overview
            </button>
            
            <button 
              className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                activeView === "dashboard" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
              }`}
              onClick={() => setActiveView("dashboard")}
            >
              Library Terminal
            </button>

            {activePaper && (
              <>
                <button 
                  className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                    activeView === "summarizer" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
                  }`}
                  onClick={() => setActiveView("summarizer")}
                >
                  Summarizer
                </button>
                <button 
                  className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                    activeView === "chat" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
                  }`}
                  onClick={() => setActiveView("chat")}
                >
                  Interactive Q&A
                </button>
              </>
            )}

            <button 
              className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                activeView === "tabular" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
              }`}
              onClick={() => setActiveView("tabular")}
            >
              Structured Ledger
            </button>

            <button 
              className={`font-label-lg text-label-lg uppercase tracking-widest pb-1 transition-all border-b-2 cursor-pointer ${
                activeView === "settings" ? "text-primary border-primary" : "text-on-surface-variant hover:text-primary border-transparent"
              }`}
              onClick={() => setActiveView("settings")}
            >
              Settings
            </button>
          </div>

          {/* Action CTA Button */}
          <div className="flex items-center gap-3">
            <button 
              className="bg-primary text-on-primary font-label-lg text-label-lg px-6 py-3 border-heavy border-on-surface uppercase tracking-widest hover:bg-primary-container transition-all cursor-pointer"
              onClick={() => {
                setActiveView("dashboard");
                setTimeout(() => triggerFileSelect(), 100);
              }}
            >
              Upload PDF
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile view alert helper */}
      <div className="lg:hidden w-full bg-surface-container-high border-b border-outline-variant px-6 py-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-on-surface-variant">
        <span>Active: {activeView}</span>
        <div className="flex gap-4">
          <button onClick={() => setActiveView("overview")}>Overview</button>
          <button onClick={() => setActiveView("dashboard")}>Library</button>
          <button onClick={() => setActiveView("tabular")}>Ledger</button>
          <button onClick={() => setActiveView("settings")}>Settings</button>
        </div>
      </div>

      {/* --- MAIN PAGE CONTENT --- */}
      <main className="w-full max-w-[1440px] mx-auto px-6 md:px-margin-desktop py-stack-lg flex-grow">
            {/* VIEW 0: LANDING PAGE / OVERVIEW */}
            {activeView === "overview" && (
              <div className="animate-fade-in">
                {/* Hero Section: Swiss Editorial Style */}
                <section className="swiss-grid mb-24 md:mb-32">
                  <div className="col-span-12 md:col-span-8 flex flex-col justify-end">
                    <h1 className="font-display-lg text-display-lg mb-6 leading-none text-on-surface">
                      Synthesizing <span className="text-primary">Humanity's</span> Scientific Output.
                    </h1>
                    <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl border-active pl-6">
                      The platform designed for extreme academic rigor. Experience a modern approach to cross-disciplinary data extraction and peer-reviewed analysis.
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-4 flex items-start justify-end pt-12">
                    <div className="w-full aspect-square bg-surface-container-highest border-heavy border-outline-variant relative overflow-hidden group">
                      <img 
                        className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" 
                        alt="A clean, minimalist high-key photograph of an architectural model representing complex data structures." 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAYfJ7iThDU9vXaf3xTFb1PzDRWVyiDp2RitKWCettIw2ENFA0LaLGsSEAhaykBwMoUO-nQgHS-E_VF6jkB7K-Oz0-CNdXV8qugAhyjEeKGfEIAj722UmtXvcBNmch_2k7SA-yOD54X5WQ4srcOHwf_AJlcMIL6hgT-xJYmP_2N6EtkBLCXGpu1zUi5aNUdaX2oxD6qywDvWIVTU0FO2n_A7_KG_4MHyNfLIUmu1alNre-VVwZlbDQFSsH9C4b8ybfEcEio2h3hndkr"
                      />
                      <div className="absolute bottom-0 left-0 p-4 bg-surface border-t-2 border-r-2 border-outline-variant">
                        <span className="font-label-sm text-label-sm uppercase tracking-tighter">Volume 24.1</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Bento Features Grid */}
                <section className="swiss-grid mb-24 md:mb-32">
                  <div className="col-span-12 mb-8">
                    <h2 className="font-headline-lg text-headline-lg uppercase border-b-2 border-on-surface pb-2 inline-block">Key Modules</h2>
                  </div>
                  
                  {/* Feature 1 */}
                  <div 
                    className="col-span-12 md:col-span-4 bg-surface-container border-heavy border-outline p-6 hover:border-primary transition-all flex flex-col justify-between h-[400px] cursor-pointer"
                    onClick={() => setActiveView("dashboard")}
                  >
                    <div>
                      <span className="material-symbols-outlined text-primary mb-4" style={{ fontSize: "48px" }}>hub</span>
                      <h3 className="font-headline-md text-headline-md mb-2">Cognitive Mapping</h3>
                      <p className="font-body-md text-body-md text-on-surface-variant">Visualize intellectual lineages and citation webs across multi-decade research cycles with our neural-graphing engine.</p>
                    </div>
                    <div className="text-primary font-label-lg text-label-lg flex items-center gap-2">
                      EXPLORE MODULE <span className="material-symbols-outlined">arrow_forward</span>
                    </div>
                  </div>

                  {/* Feature 2 */}
                  <div className="col-span-12 md:col-span-8 bg-surface-container-lowest border-heavy border-outline p-6 flex flex-col md:flex-row gap-6 h-auto md:h-[400px]">
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <span className="material-symbols-outlined text-primary mb-4" style={{ fontSize: "48px" }}>analytics</span>
                        <h3 className="font-headline-md text-headline-md mb-2">Rigorous Meta-Analysis</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant">Automated bias detection and statistical re-calibration for thousands of datasets simultaneously. ScholarSynth ensures every insight is built on statistically significant foundations.</p>
                      </div>
                      <button 
                        className="w-fit border-heavy border-on-surface px-8 py-3 font-label-lg text-label-lg hover:bg-on-surface hover:text-surface transition-all cursor-pointer"
                        onClick={() => setActiveView("dashboard")}
                      >
                        VIEW DOCUMENTATION
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden border border-outline-variant bg-surface-dim">
                      <img 
                        className="w-full h-full object-cover" 
                        alt="A macro photograph of an ink-on-paper scientific chart, styled like a mid-century modernist textbook illustration." 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuD9-pC0r0y9QJRMhD8lrITdsklnNXK9uE10WBFxOX48dGF0tOWgiOIUaOcryL4oTvwhhCW0OcfSTrQWPn6pTXZisp6vialhmZ9YHmraqktZZBfVkaW6bAhfsJ6oodmbau8lQQWGU4rwD72K_CAeMWMg2VbvnYSZ_WQWxlM82IBJ7YbwdNVDvAjB-gAzMzA6gtJ-1fng-se_CUUcdwKTchz-QTNO-JvjbENRI0kPQU4PQJPKeegIVFE6UNDP0GIfqBSHLPqHmL4vl3NL"
                      />
                    </div>
                  </div>

                  {/* Feature 3 */}
                  <div className="col-span-12 md:col-span-7 bg-primary text-on-primary p-6 flex flex-col justify-between min-h-[300px]">
                    <h3 className="font-display-md text-display-md leading-tight">Decentralized Archive Access</h3>
                    <p className="font-body-lg text-body-lg opacity-90 max-w-xl">Direct integration with institutional repositories and peer-reviewed journals globally. Access the world's most credible sources from a single terminal.</p>
                  </div>

                  {/* Feature 4 */}
                  <div className="col-span-12 md:col-span-5 bg-surface-container border-heavy border-outline p-6 flex flex-col justify-center items-center text-center">
                    <span className="material-symbols-outlined text-on-surface mb-4" style={{ fontSize: "64px" }}>verified_user</span>
                    <h3 className="font-headline-md text-headline-md uppercase mb-2">Integrity First</h3>
                    <div className="h-1 w-24 bg-primary mb-4"></div>
                    <p className="font-body-md text-body-md px-2">Every synthesis is logged on a private blockchain for permanent auditability and citation provenance.</p>
                  </div>
                </section>

                {/* For Developers Section */}
                <section className="swiss-grid mb-24 md:mb-32">
                  <div className="col-span-12 md:col-span-5">
                    <h2 className="font-display-md text-display-md mb-6">For Developers</h2>
                    <p className="font-body-lg text-body-lg text-on-surface-variant mb-6">Build custom research pipelines with our GraphQL API. ScholarSynth is designed to be extensible, allowing academic institutions to integrate their proprietary algorithms.</p>
                    <ul className="space-y-3 font-label-lg text-label-lg text-on-surface">
                      <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary">check_circle</span> REST & GraphQL Endpoints</li>
                      <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary">check_circle</span> Python SDK for Data Scientists</li>
                      <li className="flex items-center gap-2"><span className="material-symbols-outlined text-primary">check_circle</span> Open Source UI Components</li>
                    </ul>
                  </div>
                  <div className="col-span-12 md:col-span-7 bg-inverse-surface text-on-primary-container p-6 border-heavy border-on-surface-variant font-mono text-sm overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6 border-b border-on-surface-variant pb-2">
                      <span className="font-label-sm text-label-sm uppercase text-surface-variant tracking-widest">scholarsynth-api.v1.js</span>
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-error"></div>
                        <div className="w-3 h-3 rounded-full bg-secondary"></div>
                        <div className="w-3 h-3 rounded-full bg-primary"></div>
                      </div>
                    </div>
                    <pre className="text-primary-fixed overflow-x-auto text-[13px] leading-relaxed"><code>{`const synth = new ScholarSynth({
  apiKey: 'SCHOLAR_42_ALPHA',
  rigorLevel: 'MAXIMUM'
});

// Synthesize meta-analysis across 12,000 papers
const result = await synth.analyze({
  topic: 'Neural Plasticity in Post-Quantum Computing',
  depth: 'longitudinal',
  biasCheck: true,
  output: 'markdown'
});

console.log(result.citationWeb.root);`}</code></pre>
                    <div className="mt-6 border-t border-on-surface-variant pt-6">
                      <p className="font-label-sm text-label-sm uppercase text-surface-variant mb-2">Live Preview</p>
                      <div className="bg-surface p-4 flex items-center justify-between border-heavy border-primary">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-container flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-primary">science</span>
                          </div>
                          <div>
                            <p className="font-label-lg text-label-lg text-on-surface">Neural Growth Model</p>
                            <p className="text-[10px] text-on-surface-variant uppercase">Updated 2m ago</p>
                          </div>
                        </div>
                        <div className="text-primary font-bold">98.4% Confidence</div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Quote Section */}
                <section className="swiss-grid mb-24 border-t-2 border-b-2 border-on-surface py-12">
                  <div className="col-span-12 md:col-span-10 md:col-start-2 text-center">
                    <blockquote className="font-display-md text-display-md italic leading-tight mb-6 text-on-surface">
                      "ScholarSynth has fundamentally changed how we evaluate interdisciplinary risk at our institute. It provides a level of clarity that was previously impossible."
                    </blockquote>
                    <cite className="font-label-lg text-label-lg uppercase tracking-widest not-italic text-on-surface">
                      — Dr. Helena Vane, <span className="text-primary">Institute of Advanced Methodology</span>
                    </cite>
                  </div>
                </section>
              </div>
            )}

            {/* VIEW 1: DASHBOARD / LIBRARY */}
            {activeView === "dashboard" && (
              <div className="animate-fade-in">
                <div className="mb-8 border-b-2 border-outline-variant pb-6">
                  <h1 className="font-headline-lg text-headline-lg uppercase text-on-surface mb-2">Research Library</h1>
                  <p className="font-body-lg text-on-surface-variant">Upload and catalog academic research papers, index text chunks, and perform RAG operations.</p>
                </div>

                <div className="swiss-grid">
                  {/* Left Column: Upload Block & Active params */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-surface-container border-heavy border-outline p-6">
                      <h2 className="font-headline-md text-lg font-semibold mb-4 text-on-surface">Import Document</h2>
                      
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
                        className={`border-2 border-dashed border-outline rounded-none p-8 text-center cursor-pointer transition-all flex flex-col items-center gap-4 ${
                          dragging ? "bg-primary-container/20 border-primary" : "bg-surface-container-low hover:bg-surface-container-high"
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
                        <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary flex items-center justify-center border border-outline">
                          <Upload size={20} />
                        </div>
                        <div>
                          <h3 className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface mb-1">Drag & Drop Research PDF</h3>
                          <p className="font-label-sm text-[11px] text-on-surface-variant lowercase">max 5 files (daily limit 20)</p>
                        </div>
                      </div>

                      {/* Upload state progress */}
                      {uploadStatus && uploadStatus !== "done" && (
                        <div className="mt-4 p-4 border border-outline-variant bg-surface">
                          <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-2">
                            <span>
                              {uploadStatus === "parsing" && "Extracting text pages..."}
                              {uploadStatus === "analyzing" && "Extracting summary..."}
                              {uploadStatus === "error" && "Process failed"}
                            </span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-surface-container-high h-2 border border-outline-variant">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                          </div>
                          {uploadError && (
                            <div className="flex gap-2 items-center text-error font-mono text-[11px] uppercase tracking-wider mt-3">
                              <AlertCircle size={14} />
                              <span>{uploadError}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {uploadStatus === "done" && (
                        <div className="flex gap-2 items-center text-primary font-mono text-[11px] uppercase tracking-wider mt-4">
                          <Check size={14} />
                          <span>Success: Paper cataloged!</span>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Right Column: Library List */}
                  <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                    {/* Search & filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative flex-grow">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder="Search database (title, author, metadata)..."
                          className="w-full bg-surface-container border-2 border-outline-variant focus:border-primary p-3 pl-10 outline-none font-body-md text-sm text-on-surface"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      {allTags.length > 0 && (
                        <select 
                          className="bg-surface-container border-2 border-outline-variant focus:border-primary p-3 outline-none font-label-lg text-on-surface cursor-pointer"
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
                      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                        <span>Database matches: {filteredPapers.length} items</span>
                        <button 
                          className="text-primary underline cursor-pointer font-bold"
                          onClick={() => { setSearchQuery(""); setSelectedTag(""); }}
                        >
                          Clear Filters
                        </button>
                      </div>
                    )}

                    {/* Selection Controls Header Bar */}
                    {papers.length > 0 && (
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-surface-container border-2 border-outline gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className={`w-5 h-5 border-2 border-on-surface flex items-center justify-center transition-all cursor-pointer ${
                              filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.includes(p.id))
                                ? "bg-primary text-on-primary"
                                : "bg-surface text-transparent hover:border-primary"
                            }`}
                            onClick={toggleSelectAll}
                            title="Select / Deselect All visible papers"
                          >
                            {filteredPapers.length > 0 && filteredPapers.every(p => selectedPaperIds.includes(p.id)) && (
                              <Check size={12} className="stroke-[3]" />
                            )}
                          </button>
                          <span className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface select-none">
                            {selectedPaperIds.length > 0 
                              ? `${selectedPaperIds.length} of ${papers.length} selected`
                              : `Select All Visible`
                            }
                          </span>
                          {selectedPaperIds.length > 0 && (
                            <button
                              type="button"
                              className="text-[11px] font-mono text-primary hover:underline uppercase tracking-wider font-bold ml-2"
                              onClick={() => setSelectedPaperIds([])}
                            >
                              Clear Selection
                            </button>
                          )}
                        </div>
                        
                        {selectedPaperIds.length > 0 && (
                          <button
                            type="button"
                            className="bg-error text-white font-label-lg text-xs px-4 py-2 border border-on-surface uppercase tracking-widest hover:bg-red-700 transition-all cursor-pointer flex items-center gap-2"
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredPapers.map(paper => (
                          <div 
                            key={paper.id} 
                            className={`border-heavy p-6 flex flex-col justify-between h-[260px] transition-all duration-300 cursor-pointer ${
                              activePaperId === paper.id 
                                ? "bg-surface-container border-primary shadow-sm" 
                                : "bg-surface-container-lowest border-outline hover:border-primary hover:-translate-y-1"
                            }`}
                            onClick={() => {
                              setActivePaperId(paper.id);
                              setActiveView("summarizer");
                            }}
                          >
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-current ${
                                  paper.type === "uploaded" ? "text-primary border-primary" : "text-secondary border-secondary"
                                }`}>
                                  {paper.type === "uploaded" ? "Uploaded" : "Preloaded"}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-on-surface-variant font-bold">
                                    {paper.year}
                                  </span>
                                  {/* Custom Selection Checkbox */}
                                  <button
                                    type="button"
                                    className={`w-5 h-5 border-2 border-on-surface flex items-center justify-center transition-all cursor-pointer ${
                                      selectedPaperIds.includes(paper.id)
                                        ? "bg-primary text-on-primary"
                                        : "bg-surface text-transparent hover:border-primary"
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

                              <h3 className="font-headline-md text-lg leading-snug text-on-surface mb-2 line-clamp-2">{paper.title}</h3>
                              <p className="font-body-md text-sm text-on-surface-variant line-clamp-1">By {paper.authors}</p>
                            </div>

                            <div>
                              <div className="flex gap-2 flex-wrap mb-4">
                                {paper.tags.slice(0, 3).map(tag => (
                                  <span key={tag} className="font-mono text-[10px] uppercase tracking-wider bg-surface-container px-2 py-0.5 border border-outline-variant">{tag}</span>
                                ))}
                                {paper.tags.length > 3 && (
                                  <span className="font-mono text-[10px] bg-surface-container px-2 py-0.5 border border-outline-variant text-primary font-bold">+{paper.tags.length - 3}</span>
                                )}
                              </div>

                              <div className="flex justify-between items-center border-t border-outline-variant pt-3 text-[11px] font-mono uppercase tracking-wider text-on-surface-variant">
                                <span>{paper.pageCount} pages</span>
                                <div className="flex gap-4 items-center">
                                  <button 
                                    className="text-on-surface-variant hover:text-error cursor-pointer"
                                    onClick={(e) => handleDeletePaper(paper.id, e)}
                                    title="Delete Paper"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <div className="flex items-center gap-1 text-primary font-bold hover:underline">
                                    <span>Analyze</span>
                                    <ChevronRight size={12} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-heavy border-outline border-dashed bg-surface-container p-12 text-center text-on-surface-variant flex flex-col items-center gap-4">
                        <Search size={32} className="text-outline" />
                        <div>
                          <h3 className="font-headline-md text-lg text-on-surface mb-1">No Academic Catalog Matches</h3>
                          <p className="font-body-md text-sm">Please modify your keyword filters or upload a PDF document.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: SUMMARIZER */}
            {activeView === "summarizer" && activePaper && (
              <div className="animate-fade-in">


                <div className="mb-8 border-b-2 border-outline-variant pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <h1 className="font-headline-lg text-2xl md:text-headline-lg text-on-surface mb-1 uppercase tracking-wide">
                      {activePaper.title}
                    </h1>
                    <p className="font-body-md text-on-surface-variant">
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
                        className="w-fit border-heavy border-on-surface bg-surface-container px-6 py-2.5 font-label-lg text-label-lg hover:bg-on-surface hover:text-surface transition-all cursor-pointer flex items-center gap-2"
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
                      className="w-fit border-heavy border-on-surface bg-surface-container px-6 py-2.5 font-label-lg text-label-lg hover:bg-on-surface hover:text-surface transition-all cursor-pointer" 
                      onClick={() => setActiveView("dashboard")}
                    >
                      Back to Library
                    </button>
                  </div>
                </div>

                <div className="swiss-grid">
                  {/* Left Panel: Document Metadata details */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-surface-container border-heavy border-outline p-6 flex flex-col gap-6">
                      <h2 className="font-headline-md text-lg border-b border-outline-variant pb-2 text-on-surface">Metadata details</h2>
                      
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Category Tags</span>
                        <div className="flex gap-2 flex-wrap mt-2">
                          {activePaper.tags.map(tag => (
                            <span key={tag} className="font-mono text-[10px] uppercase tracking-wider bg-surface-container-low px-2 py-0.5 border border-outline">{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Index Segmentation</span>
                        <div className="grid grid-cols-2 gap-4 mt-2 font-mono">
                          <div className="bg-surface border border-outline p-3 text-center">
                            <div className="text-xl font-bold text-on-surface">{activePaper.pageCount}</div>
                            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Total Pages</div>
                          </div>
                          <div className="bg-surface border border-outline p-3 text-center">
                            <div className="text-xl font-bold text-on-surface">{activePaper.chunks.length}</div>
                            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Vector Chunks</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button 
                          className="flex-grow bg-primary text-on-primary font-label-lg text-label-lg px-4 py-3 border border-outline uppercase tracking-wider hover:bg-primary-container transition-all cursor-pointer flex items-center justify-center gap-2"
                          onClick={() => setActiveView("chat")}
                        >
                          <MessageSquare size={14} />
                          <span>Semantic Chat</span>
                        </button>
                        <button 
                          className="border border-outline bg-surface px-4 py-3 font-label-lg text-label-lg hover:bg-on-surface hover:text-surface transition-all cursor-pointer flex items-center justify-center gap-2"
                          onClick={() => setActiveView("tabular")}
                        >
                          <Table size={14} />
                          <span>Ledger row</span>
                        </button>
                      </div>
                    </div>

                    {/* CITATION GENERATOR BLOCK WITH DROPDOWN MENU */}
                    <div className="bg-surface-container border-heavy border-outline p-6 flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-outline-variant pb-2">
                        <span className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface">Citation Engine</span>
                        
                        {/* Citation format select dropdown */}
                        <div className="relative">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 border border-outline bg-surface hover:bg-on-surface hover:text-surface transition-all flex items-center gap-1.5 cursor-pointer select-none"
                            >
                              <span>{citationFormat === "google_scholar" ? "Google Scholar" : citationFormat.toUpperCase()}</span>
                              <ChevronDown size={10} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-surface border-2 border-on-surface p-1 shadow-md rounded-none z-50 animate-fade-in w-[180px]">
                              {[
                                { id: "google_scholar", label: "Google Scholar" },
                                { id: "mdpi", label: "MDPI Style" },
                                { id: "ieee", label: "IEEE Format" },
                                { id: "researchgate", label: "ResearchGate" },
                                { id: "bibtex", label: "BibTeX markup" }
                              ].map(item => (
                                <DropdownMenuItem
                                  key={item.id}
                                  className={`p-2 font-display text-[11px] cursor-pointer flex items-center justify-between rounded-none transition-all ${
                                    citationFormat === item.id ? "bg-primary text-on-primary font-bold" : "text-on-surface hover:bg-surface-container"
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

                      <div className="bg-surface-container-low border border-outline-variant p-4 font-body-md text-sm text-on-surface-variant leading-relaxed select-text min-h-[100px]">
                        {citationFormat === "bibtex" ? (
                          <pre className="font-mono text-[11px] overflow-x-auto whitespace-pre">{formatCitation(activePaper, "bibtex")}</pre>
                        ) : (
                          <p>{formatCitation(activePaper, citationFormat)}</p>
                        )}
                      </div>

                      <button 
                        className="w-full border border-outline bg-surface p-2.5 font-label-lg text-label-lg uppercase tracking-wider hover:bg-on-surface hover:text-surface transition-all cursor-pointer flex items-center justify-center gap-2"
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
                  <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border-heavy border-outline p-6 md:p-8 flex flex-col gap-6">
                    {activePaper.summary === null ? (
                      /* No summary yet — offer local extraction */
                      <div className="flex flex-col items-center justify-center flex-grow gap-4 py-20 text-center">
                        <FileText size={32} className="text-outline" />
                        <div>
                          <h3 className="font-headline-md text-base text-on-surface mb-1">Summary Not Yet Extracted</h3>
                          <p className="font-body-md text-sm text-on-surface-variant max-w-xs">
                            Click below to generate a local extractive summary from the PDF text.
                          </p>
                        </div>
                        <button
                          className="bg-primary text-on-primary font-label-lg px-6 py-2.5 border border-outline uppercase tracking-wider hover:bg-primary-container transition-all cursor-pointer flex items-center gap-2"
                          onClick={() => handleGenerateSummary(activePaper)}
                        >
                          <span>⚡</span>
                          <span>Extract Summary</span>
                        </button>
                      </div>
                    ) : (
                      /* Summary exists — render it */
                      <>
                        <div className="flex justify-between items-center border-b border-outline-variant pb-4">
                          <h2 className="font-headline-lg text-lg uppercase text-on-surface">Structured AI Extraction</h2>
                          <button
                            className="border border-outline bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider hover:bg-on-surface hover:text-surface transition-all cursor-pointer flex items-center gap-2"
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
              <div className="animate-fade-in">
                <div className="mb-8 border-b-2 border-outline-variant pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-primary font-bold mb-2 block">
                      AI Semantic RAG Document Q&A
                    </span>
                    <h1 className="font-headline-lg text-2xl md:text-headline-lg text-on-surface mb-2">Q&A Chat</h1>
                    <p className="font-body-md text-on-surface-variant">The research assistant scans vectors, returns accurate contextual snippets, and resolves questions in real-time.</p>
                  </div>
                  <button 
                    className="w-fit border-heavy border-on-surface bg-surface-container px-6 py-2.5 font-label-lg text-label-lg hover:bg-on-surface hover:text-surface transition-all cursor-pointer" 
                    onClick={() => setActiveView("dashboard")}
                  >
                    Back to Library
                  </button>
                </div>

                <div className="swiss-grid h-auto lg:h-[680px]">
                  {/* Left Panel: Retrievable Pages & Index Metadata */}
                  <div className="col-span-12 lg:col-span-4 bg-surface-container border-heavy border-outline p-6 flex flex-col gap-4 h-full overflow-hidden">
                    <h2 className="font-headline-md text-lg border-b border-outline-variant pb-2 text-on-surface">Document Vectors Context</h2>
                    <p className="font-body-md text-xs text-on-surface-variant leading-relaxed mb-2">
                      ScholarSynth parses matching segments using client-side indexing. Below are the indexed text passages that support factual verification.
                    </p>

                    <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-4">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-on-surface font-bold flex items-center gap-2">
                        <Database size={12} className="text-primary" />
                        <span>Indexed Scope segments</span>
                      </div>

                      {/* Render segments depending on chatScopeId */}
                      {(chatScopeId === "all" ? papers.flatMap(p => p.chunks) : (papers.find(p => p.id === chatScopeId)?.chunks || activePaper.chunks)).slice(0, 5).map((chunk, idx) => (
                        <div 
                          key={chunk.id || idx} 
                          className="bg-surface border border-outline hover:border-primary p-4 cursor-pointer transition-all duration-200"
                          onClick={() => handleCitationClick(chunk.content, chunk.page)}
                        >
                          <div className="flex justify-between items-center mb-2 font-mono text-[10px] uppercase tracking-wider">
                            <span className="bg-primary-container text-on-primary-container px-2 py-0.5 border border-outline font-bold">Page {chunk.page}</span>
                            <span className="text-on-surface-variant">
                              {chatScopeId === "all" ? papers.find(p => p.id === chunk.paperId || chunk.id?.includes(p.id))?.title.substring(0, 15) + "..." : `Segment #${idx + 1}`}
                            </span>
                          </div>
                          <p className="font-body-md text-[12px] text-on-surface-variant italic line-clamp-3 leading-relaxed">
                            "{chunk.content}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Conversation Stream */}
                  <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border-heavy border-outline p-6 flex flex-col justify-between h-[550px] lg:h-full overflow-hidden">
                    
                    {/* Chat History */}
                    <div className="flex-grow overflow-y-auto pr-2 flex flex-col gap-6 mb-6">
                      
                      {/* Welcome bubble */}
                      <div className="border border-outline bg-surface-container p-5 animate-fade-in border-l-4 border-l-primary">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1.5 mb-2">
                          <BookOpen size={12} />
                          <span>Terminal Assistant</span>
                        </span>
                        <div className="font-body-md text-sm text-on-surface-variant leading-relaxed">
                          {chatScopeId === "all" ? (
                            <span>Welcome to the Global ScholarSynth Q&A. I will analyze questions across <strong>all {papers.length} papers</strong> indexed in your library.</span>
                          ) : (
                            <span>Welcome to ScholarSynth. Q&A workspace successfully created for <strong>"{papers.find(p => p.id === chatScopeId)?.title || activePaper?.title}"</strong>. Ask any target question.</span>
                          )}
                        </div>
                        
                        <div className="mt-4 pt-3 border-t border-outline-variant">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant font-bold block mb-2">Quick queries:</span>
                          <div className="flex gap-2 flex-wrap">
                            <button 
                              className="font-mono text-[10px] uppercase tracking-wider border border-outline bg-surface hover:bg-on-surface hover:text-surface px-3 py-1 cursor-pointer transition-all"
                              onClick={() => setCurrentMessage("Summarize the key contribution of this research.")}
                            >
                              Core Contribution?
                            </button>
                            <button 
                              className="font-mono text-[10px] uppercase tracking-wider border border-outline bg-surface hover:bg-on-surface hover:text-surface px-3 py-1 cursor-pointer transition-all"
                              onClick={() => setCurrentMessage("What methodology did the authors use?")}
                            >
                              Methodology?
                            </button>
                            <button 
                              className="font-mono text-[10px] uppercase tracking-wider border border-outline bg-surface hover:bg-on-surface hover:text-surface px-3 py-1 cursor-pointer transition-all"
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
                          className={`border p-5 animate-fade-in ${
                            msg.role === "user" 
                              ? "bg-surface-container-low border-outline-variant border-r-4 border-r-primary ml-12" 
                              : "bg-surface-container border-outline border-l-4 border-l-primary mr-12"
                          }`}
                        >
                          <span className="font-mono text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 mb-2">
                            {msg.role === "user" ? (
                              <span className="text-on-surface">User / Analyst</span>
                            ) : (
                              <span className="text-primary flex items-center gap-1.5">
                                <BookOpen size={12} />
                                <span>ScholarSynth Terminal</span>
                              </span>
                            )}
                          </span>
                          
                          <div className="text-sm">
                            {renderMessageTextWithCitations(msg)}
                          </div>
                          
                          {/* Chat sources citations footer */}
                          {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-dashed border-outline-variant">
                              <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant font-bold block mb-1.5">Context Proof:</span>
                              <div className="flex gap-2 flex-wrap">
                                {Array.from(new Set(msg.sources.map(s => s.page))).sort((a,b)=>a-b).map(pageNum => {
                                  const src = msg.sources.find(s => s.page === pageNum);
                                  return (
                                    <button 
                                      key={pageNum}
                                      className="font-mono text-[9px] uppercase tracking-wider bg-surface border border-outline hover:border-primary px-2.5 py-1 cursor-pointer transition-all text-primary font-bold flex items-center gap-1"
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
                        <div className="border border-outline bg-surface-container p-5 mr-12 animate-pulse border-l-4 border-l-primary">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1.5 mb-2">
                            <BookOpen size={12} />
                            <span>ScholarSynth is searching local vectors...</span>
                          </span>
                          <div className="flex gap-1.5 mt-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }}></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }}></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }}></div>
                          </div>
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat input and scope configuration */}
                    <div className="flex flex-col gap-2 w-full pt-4 border-t border-outline-variant">
                      {/* Active Scope Indicator Badge */}
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary font-bold">
                        <span>Query Scope:</span>
                        <span className="bg-primary-container text-on-primary-container px-2 py-0.5 border border-outline text-[9px] truncate max-w-[400px]">
                          {chatScopeId === "all" ? "All Papers (@all)" : `@ ${papers.find(p => p.id === chatScopeId)?.title || "Active Paper"}`}
                        </span>
                      </div>
                      
                      {/* Floating Mentions Dropdown (WhatsApp style) */}
                      {showMentionDropdown && (
                        <div className="relative w-full">
                          <div className="absolute bottom-full mb-2 left-0 w-full max-h-[240px] overflow-y-auto bg-surface border-2 border-on-surface shadow-lg z-50 flex flex-col p-1 gap-1 animate-fade-in">
                            <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant p-2 pb-1">
                              Mention Research Paper Scope
                            </div>
                            
                            {/* @all Option */}
                            {("all".includes(mentionSearch.toLowerCase()) || mentionSearch === "") && (
                              <button
                                type="button"
                                className="w-full text-left p-2.5 font-display text-xs hover:bg-primary hover:text-on-primary transition-all flex items-center justify-between cursor-pointer"
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
                                  className="w-full text-left p-2.5 font-display text-xs hover:bg-primary hover:text-on-primary transition-all flex flex-col gap-0.5 border-b border-outline-variant last:border-0 cursor-pointer text-on-surface"
                                  onClick={() => selectMention(paper)}
                                >
                                  <span className="font-bold truncate">@ {paper.title}</span>
                                  <span className="text-[10px] opacity-80 truncate">By {paper.authors}</span>
                                </button>
                              ))}

                            {/* No matches */}
                            {papers.filter(p => p.title.toLowerCase().includes(mentionSearch.toLowerCase())).length === 0 &&
                             ! "all".includes(mentionSearch.toLowerCase()) && (
                              <div className="p-3 text-center text-xs text-on-surface-variant font-mono">
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
                            className="flex-grow bg-surface-container border-2 border-outline-variant focus:border-primary p-3 outline-none font-body-md text-sm text-on-surface resize-none overflow-y-auto leading-relaxed"
                            style={{ minHeight: "52px", maxHeight: "400px" }}
                            value={currentMessage}
                            onChange={handleChatInputChange}
                            onInput={(e) => {
                              // Auto-resize: shrink to fit, then grow to scrollHeight
                              e.target.style.height = "auto";
                              e.target.style.height = Math.min(e.target.scrollHeight, 400) + "px";
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (currentMessage.trim() && !chatLoading) {
                                  handleSendMessage(e);
                                  // Reset height after send
                                  if (chatInputRef.current) {
                                    chatInputRef.current.style.height = "52px";
                                  }
                                }
                              }
                              // Shift+Enter = new line (default textarea behaviour)
                            }}
                            disabled={chatLoading}
                          />
                        <button 
                          type="submit" 
                          className="bg-primary text-on-primary border border-outline px-6 h-12 hover:bg-primary-container transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 flex-shrink-0"
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
              <div className="animate-fade-in">
                <div className="mb-8 border-b-2 border-outline-variant pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="max-w-4xl">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-primary font-bold mb-2 block">
                      Scientific Ledger & comparative analysis
                    </span>
                    <h1 className="font-headline-lg text-2xl md:text-headline-lg text-on-surface mb-2">Structured Catalog</h1>
                    <p className="font-body-md text-on-surface-variant">A horizontal ledger tracking methodology, extracted results, contributions, and datasets for cross-paper evaluation.</p>
                  </div>

                  {/* Multiple Export Selection Dropdown */}
                  <div className="flex gap-3 items-center">
                    {selectedPaperIds.length > 0 && (
                      <button
                        type="button"
                        className="bg-error text-white font-label-lg text-xs px-4 py-2.5 border border-on-surface uppercase tracking-widest hover:bg-red-700 transition-all cursor-pointer flex items-center gap-2"
                        onClick={handleDeleteSelected}
                      >
                        <Trash2 size={12} />
                        <span>Delete Selected ({selectedPaperIds.length})</span>
                      </button>
                    )}

                    <div className="relative">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="border-heavy border-outline bg-surface px-6 py-2.5 font-label-lg text-label-lg uppercase tracking-wider hover:bg-on-surface hover:text-surface transition-all cursor-pointer flex items-center gap-2 select-none"
                        >
                          <Download size={14} />
                          <span>Export Ledger</span>
                          <ChevronDown size={12} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-surface border-2 border-on-surface p-1 shadow-md rounded-none z-50 animate-fade-in w-[180px]">
                          <DropdownMenuItem className="p-2 font-display text-xs cursor-pointer hover:bg-surface-container rounded-none" onClick={handleExportCSV}>
                            Export as CSV (.csv)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-2 font-display text-xs cursor-pointer hover:bg-surface-container rounded-none" onClick={handleExportMarkdown}>
                            Export as Markdown (.md)
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-2 font-display text-xs cursor-pointer hover:bg-surface-container rounded-none" onClick={handleExportPDF}>
                            Export as PDF (.pdf)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <button 
                      className="bg-primary text-on-primary font-label-lg text-label-lg px-6 py-2.5 border-heavy border-on-surface uppercase tracking-wider hover:bg-primary-container transition-all cursor-pointer flex items-center gap-2"
                      onClick={() => setActiveView("dashboard")}
                    >
                      <Plus size={14} />
                      <span>Upload Paper</span>
                    </button>
                  </div>
                </div>

                {/* VISUAL PREVIEW OF ATTRIBUTES TO BE EXTRACTED */}
                <div className="bg-surface-container border-heavy border-outline p-5 mb-6 flex flex-col gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
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
                      <span key={attr} className="font-mono text-[10px] uppercase tracking-wider bg-primary-container text-on-primary-container px-3 py-1 border border-outline font-bold flex items-center gap-1.5">
                        <Check size={11} className="text-primary" />
                        <span>{attr}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {papers.length > 0 ? (
                  <div className="overflow-x-auto border-heavy border-outline bg-surface-container-lowest">
                    <table className="w-full text-left font-body-md text-sm border-collapse select-text">
                      <thead>
                        <tr className="bg-surface-container border-b-2 border-outline font-mono text-[11px] uppercase tracking-wider text-on-surface">
                          <th className="p-4 border-r border-outline-variant w-[60px] text-center">
                            <button
                              type="button"
                              className={`w-4 h-4 border border-on-surface mx-auto flex items-center justify-center transition-all cursor-pointer ${
                                papers.length > 0 && papers.every(p => selectedPaperIds.includes(p.id))
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface text-transparent hover:border-primary"
                              }`}
                              onClick={toggleSelectAll}
                              title="Select / Deselect All Papers"
                            >
                              {papers.length > 0 && papers.every(p => selectedPaperIds.includes(p.id)) && (
                                <Check size={10} className="stroke-[3]" />
                              )}
                            </button>
                          </th>
                          <th className="p-4 border-r border-outline-variant min-w-[220px]">Paper Title</th>
                          <th className="p-4 border-r border-outline-variant min-w-[150px]">Authors</th>
                          <th className="p-4 border-r border-outline-variant min-w-[80px]">Year</th>
                          <th className="p-4 border-r border-outline-variant min-w-[250px]">Problem Statement</th>
                          <th className="p-4 border-r border-outline-variant min-w-[250px]">Methodology Details</th>
                          <th className="p-4 border-r border-outline-variant min-w-[250px]">Key Results & Findings</th>
                          <th className="p-4 border-r border-outline-variant min-w-[220px]">Contributions</th>
                          <th className="p-4 border-r border-outline-variant min-w-[120px]">Dataset</th>
                          <th className="p-4 border-r border-outline-variant min-w-[140px]">Tags</th>
                          <th className="p-4 min-w-[200px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {papers.map(paper => (
                          <tr key={paper.id} className="border-b border-outline-variant hover:bg-surface-container/30 transition-colors">
                            <td className="p-4 border-r border-outline-variant text-center">
                              <button
                                type="button"
                                className={`w-4 h-4 border border-on-surface mx-auto flex items-center justify-center transition-all cursor-pointer ${
                                  selectedPaperIds.includes(paper.id)
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface text-transparent hover:border-primary"
                                }`}
                                onClick={(e) => toggleSelectPaper(paper.id, e)}
                                title={selectedPaperIds.includes(paper.id) ? "Deselect paper" : "Select paper"}
                              >
                                {selectedPaperIds.includes(paper.id) && (
                                  <Check size={10} className="stroke-[3]" />
                                )}
                              </button>
                            </td>
                            <td className="p-4 border-r border-outline-variant font-bold text-on-surface">
                              <div className="flex flex-col gap-2">
                                <span>{paper.title}</span>
                                <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border border-current w-fit ${
                                  paper.type === "uploaded" ? "text-primary border-primary" : "text-secondary border-secondary"
                                }`}>
                                  {paper.type === "uploaded" ? "Uploaded" : "Preloaded"}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 border-r border-outline-variant text-on-surface-variant font-medium">{paper.tabularData.authors}</td>
                            <td className="p-4 border-r border-outline-variant font-mono">{paper.tabularData.year}</td>
                            <td className="p-4 border-r border-outline-variant text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.problem}</td>
                            <td className="p-4 border-r border-outline-variant text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.methodology}</td>
                            <td className="p-4 border-r border-outline-variant text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.keyFindings}</td>
                            <td className="p-4 border-r border-outline-variant text-on-surface-variant text-[13px] leading-relaxed">{paper.tabularData.contributions}</td>
                            <td className="p-4 border-r border-outline-variant font-mono text-[13px]">{paper.tabularData.dataset}</td>
                            <td className="p-4 border-r border-outline-variant">
                              <div className="flex flex-col gap-1">
                                {paper.tags.map(t => (
                                  <span key={t} className="font-mono text-[9px] uppercase tracking-wider bg-surface border border-outline-variant px-2 py-0.5 block text-center">{t}</span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                <button 
                                  className="border border-outline bg-surface hover:bg-on-surface hover:text-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                  onClick={() => {
                                    setActivePaperId(paper.id);
                                    setActiveView("summarizer");
                                  }}
                                >
                                  Summary
                                </button>
                                <button 
                                  className="border border-outline bg-surface hover:bg-on-surface hover:text-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                  onClick={() => {
                                    setActivePaperId(paper.id);
                                    setActiveView("chat");
                                  }}
                                >
                                  Chat
                                </button>
                                <button 
                                  className="border border-outline bg-surface text-error hover:bg-error hover:text-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider cursor-pointer transition-all"
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
                  <div className="border-heavy border-outline border-dashed bg-surface-container p-12 text-center text-on-surface-variant flex flex-col items-center gap-4">
                    <Table size={32} className="text-outline" />
                    <div>
                      <h3 className="font-headline-md text-lg text-on-surface mb-1">Comparative Ledger Empty</h3>
                      <p className="font-body-md text-sm">Please import papers in the Library tab to compile horizontal results comparison.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 5: SETTINGS */}
            {activeView === "settings" && (
              <div className="animate-fade-in">
                <div className="mb-8 border-b-2 border-outline-variant pb-6">
                  <h1 className="font-headline-lg text-headline-lg uppercase text-on-surface mb-2">System Settings</h1>
                  <p className="font-body-lg text-on-surface-variant">Configure RAG window sizing and vector chunk properties. Fully local — no API keys required.</p>
                </div>

                <div className="max-w-[700px] bg-surface-container border-heavy border-outline p-6 md:p-8">
                  <form onSubmit={handleSaveSettings} className="flex flex-col gap-6">

                    <div className="border-t border-outline-variant pt-6 mt-2">
                      <h3 className="font-headline-md text-base mb-4 text-on-surface">Client-Side RAG Slicing Config</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        <div className="flex flex-col gap-2">
                          <label htmlFor="chunkSizeInput" className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface-variant">Chunk Size (chars)</label>
                          <input 
                            id="chunkSizeInput"
                            type="number" 
                            min="200" 
                            max="3000"
                            className="bg-surface border-2 border-outline-variant focus:border-primary p-3 outline-none font-mono text-sm"
                            value={chunkSize}
                            onChange={(e) => setChunkSize(parseInt(e.target.value, 10))}
                          />
                          <span className="font-mono text-[10px] text-on-surface-variant uppercase">Characters segmented for similarity.</span>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label htmlFor="overlapInput" className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface-variant">Chunk Overlap (chars)</label>
                          <input 
                            id="overlapInput"
                            type="number" 
                            min="0" 
                            max="1000"
                            className="bg-surface border-2 border-outline-variant focus:border-primary p-3 outline-none font-mono text-sm"
                            value={chunkOverlap}
                            onChange={(e) => setChunkOverlap(parseInt(e.target.value, 10))}
                          />
                          <span className="font-mono text-[10px] text-on-surface-variant uppercase">Overlapped window between segments.</span>
                        </div>

                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-outline-variant mt-4">
                      <button 
                        type="submit" 
                        className="bg-primary text-on-primary font-label-lg text-label-lg px-6 py-3 border-heavy border-on-surface uppercase tracking-widest hover:bg-primary-container transition-all cursor-pointer"
                      >
                        Save Configuration
                      </button>
                      <button 
                        type="button" 
                        className="border border-outline bg-surface px-6 py-3 font-label-lg text-label-lg uppercase tracking-widest hover:bg-on-surface hover:text-surface transition-all cursor-pointer"
                        onClick={() => setActiveView("dashboard")}
                      >
                        Cancel
                      </button>
                    </div>

                    {/* LOCAL MODE BADGE */}
                    <div className="border-2 border-green-400/40 bg-green-50/30 dark:bg-green-950/30 p-5 mt-2 flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0 animate-pulse" />
                      <div>
                        <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Fully Local Mode Active</div>
                        <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                          All processing runs locally in your browser. No data is sent to any server. No API keys required.
                        </div>
                      </div>
                    </div>

                  </form>
                </div>
              </div>
            )}
      </main>

      {/* --- GLOBAL FOOTER --- */}
      <footer className="w-full bg-inverse-surface text-inverse-on-surface font-body-md text-sm border-t-2 border-outline mt-16 select-text">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter px-6 md:px-margin-desktop py-stack-lg w-full max-w-[1440px] mx-auto">
          <div className="col-span-1">
            <div className="font-display-md text-2xl text-primary tracking-tighter mb-4">ScholarSynth</div>
            <p className="text-inverse-on-surface/85 text-sm leading-relaxed max-w-xs">
              Built for Academic Rigor. Ensuring the absolute integrity and factual auditability of global scientific research papers.
            </p>
          </div>
          <div className="flex flex-col gap-2 font-mono uppercase text-[11px] tracking-wider">
            <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-primary mb-2">Systems</h4>
            <a className="hover:text-primary transition-colors cursor-pointer">Privacy Policy</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Terms of Service</a>
            <a className="hover:text-primary transition-colors cursor-pointer">API Documentation</a>
          </div>
          <div className="flex flex-col gap-2 font-mono uppercase text-[11px] tracking-wider">
            <h4 className="font-label-lg text-label-lg uppercase tracking-widest text-primary mb-2">Academic Core</h4>
            <a className="hover:text-primary transition-colors cursor-pointer">Institutional Access</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Open Research Initiative</a>
            <a className="hover:text-primary transition-colors cursor-pointer">RAG Engine V1</a>
          </div>
          <div className="flex flex-col justify-end items-start md:items-end font-mono text-[10px] text-inverse-on-surface/70 uppercase tracking-widest">
            <span>© 2026 ScholarSynth. All rights reserved.</span>
            <div className="flex gap-3 mt-3 text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>terminal</span>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>database</span>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>history_edu</span>
            </div>
          </div>
        </div>
      </footer>

      {/* --- CITATION EXPLORER MODAL --- */}
      {showCitationModal && (
        <div 
          className="modal-overlay fixed inset-0 flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm z-[100]"
          onClick={() => setShowCitationModal(false)}
        >
          <div 
            className="bg-surface-container border-heavy border-outline max-w-[650px] w-full shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b-2 border-outline-variant bg-surface-container-high">
              <h3 className="font-label-lg text-label-lg uppercase tracking-wider text-on-surface">RAG Page Context Extractor</h3>
              <button 
                className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                onClick={() => setShowCitationModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-3">
                Source passage extracted from target PDF chunk parameters:
              </p>
              <div className="bg-surface-container-low border border-outline p-5 italic font-body-md text-sm text-on-surface leading-relaxed mb-4">
                "{citationModalText}"
              </div>
              <div className="flex justify-between items-center text-[11px] font-mono uppercase tracking-wider text-on-surface-variant">
                <span>Document: <strong className="text-on-surface">{activePaper?.title}</strong></span>
                <span className="bg-primary-container text-on-primary-container px-2 py-0.5 border border-outline font-bold">Page {citationModalPage}</span>
              </div>
            </div>
            
            <div className="flex justify-end p-5 border-t border-outline-variant bg-surface-container-low">
              <button 
                className="border-heavy border-outline bg-surface px-6 py-2 font-label-lg text-label-lg uppercase tracking-wider hover:bg-on-surface hover:text-surface transition-all cursor-pointer"
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
