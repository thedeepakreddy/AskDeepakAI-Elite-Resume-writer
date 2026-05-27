/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, 
  Briefcase, 
  Building, 
  Sparkles, 
  Download, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  FileCode, 
  AlertCircle, 
  RefreshCw, 
  UploadCloud, 
  FileUp,
  X
} from "lucide-react";

export default function App() {
  // Gating & Authentication state
  const [password, setPassword] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [isPasswordRequired, setIsPasswordRequired] = useState<boolean>(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>("");

  // Input States
  const [jobDescription, setJobDescription] = useState<string>("");
  const [baseResume, setBaseResume] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Parsing & AI Operations
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string>("");

  // Results
  const [tailoredResume, setTailoredResume] = useState<string>("");
  const [tailoredCoverLetter, setTailoredCoverLetter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"resume" | "cover">("resume");

  // Notifications
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize and check if server has password protection configured
  useEffect(() => {
    async function checkSecurity() {
      try {
        const res = await fetch("/api/check-password");
        const data = await res.json();
        setIsPasswordRequired(data.isPasswordRequired);
        if (data.isPasswordRequired) {
          setIsAuthorized(false);
        } else {
          setIsAuthorized(true);
        }
      } catch (err) {
        console.error("Auth pre-check failed:", err);
      }
    }
    checkSecurity();
  }, []);

  // Handle password attempts
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`/api/check-password?password=${encodeURIComponent(passwordInput)}`);
      const data = await res.json();
      if (data.isCorrect) {
        setIsAuthorized(true);
        setPassword(passwordInput);
      } else {
        setAuthError("Invalid master passcode. Access restricted.");
      }
    } catch (err) {
      setAuthError("Failed to communicate with authentication gatekeeper.");
    }
  };

  // Extract from resume upload file (PDF, DOCX, TXT)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError("");
    setUploadedFileName("");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawResult = reader.result as string;
          const base64Content = rawResult.split(",")[1];
          if (!base64Content) {
            throw new Error("Could not decode file contents.");
          }

          const response = await fetch("/api/parse-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              base64Content,
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to process document on server.");
          }

          setBaseResume(data.text);
          setUploadedFileName(file.name);
        } catch (innerErr: any) {
          setParseError(innerErr.message || "An error occurred while uploading file.");
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setParseError(err.message || "Unsupported file reader exception.");
      setIsParsing(false);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName("");
    setBaseResume("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Submit tailoring to Gemini server
  const handleGenerate = async () => {
    if (!baseResume.trim()) {
      setGenerationError("Please provide your Base Resume text first.");
      return;
    }
    if (!jobDescription.trim()) {
      setGenerationError("Please enter the target Job Description.");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setTailoredResume("");
    setTailoredCoverLetter("");

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-password": password,
        },
        body: JSON.stringify({
          baseResumeText: baseResume,
          jobDescriptionText: jobDescription,
          companyName: companyName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Generation endpoint returned non-OK status.");
      }

      setTailoredResume(data.resumeMarkdown);
      setTailoredCoverLetter(data.coverLetterMarkdown);
      setActiveTab("resume");
    } catch (err: any) {
      setGenerationError(err.message || "Tailoring engine failure. Check API keys and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Download Resume PDF
  const downloadResume = async () => {
    try {
      const res = await fetch("/api/download/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-password": password,
        },
        body: JSON.stringify({
          resumeText: tailoredResume,
          companyName: companyName,
        }),
      });

      if (!res.ok) throw new Error("Could not build PDF stream.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${companyName ? companyName.replace(/\s+/g, "_") : "Tailored"}_Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert("Failed to compile and download pdf. Please try again.");
    }
  };

  // Download Cover Letter PDF
  const downloadCoverLetter = async () => {
    try {
      const res = await fetch("/api/download/cover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-password": password,
        },
        body: JSON.stringify({
          coverText: tailoredCoverLetter,
          companyName: companyName,
        }),
      });

      if (!res.ok) throw new Error("Could not build PDF stream.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${companyName ? companyName.replace(/\s+/g, "_") : "Tailored"}_Cover_Letter.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert("Failed to compile and download pdf. Please try again.");
    }
  };

  // Copy Active content to clipboard
  const handleClipboardCopy = () => {
    const activeText = activeTab === "resume" ? tailoredResume : tailoredCoverLetter;
    navigator.clipboard.writeText(activeText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Trigger click on file input
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Security password blocker screen
  if (isPasswordRequired && !isAuthorized) {
    return (
      <div className="min-h-screen bg-[#f7f6f3] flex flex-col justify-center items-center p-6" id="auth-gate-screen">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border border-neutral-200/80 rounded-2xl shadow-xl shadow-neutral-100 overflow-hidden"
        >
          <div className="bg-[#121212] px-6 py-8 text-white text-center border-b border-neutral-800">
            {/* Custom 3-pill logo symbol matching the attachment */}
            <div className="flex flex-col gap-[4px] w-12 mx-auto mb-4 select-none">
              <div className="h-[13px] flex rounded-full overflow-hidden">
                <div className="w-[12px] bg-[#2b59c3]" />
                <div className="flex-1 bg-[#4ec5c1]" />
              </div>
              <div className="h-[13px] flex rounded-full overflow-hidden">
                <div className="w-[12px] bg-[#4ec5c1]" />
                <div className="flex-1 bg-[#f06e2e]" />
              </div>
              <div className="h-[13px] w-8 flex rounded-full overflow-hidden">
                <div className="w-[12px] bg-[#eaa52e]" />
                <div className="flex-1 bg-[#b21c2c]" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AskDeepak<span className="text-[#f06e2e]">AI</span> Gateway</h1>
            <p className="text-neutral-400 text-xs mt-1">Passcoded access system for application generation</p>
          </div>
          
          <form onSubmit={handleAuthSubmit} className="p-8 space-y-6">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block mb-2">Master Code</label>
              <input 
                type="password"
                required
                className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#003366] focus:bg-white text-neutral-800 rounded-xl px-4 py-3 placeholder:text-neutral-400 focus:outline-none transition-all font-mono"
                placeholder="••••••••••••"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
            </div>

            {authError && (
              <div className="bg-red-50 text-red-600 border border-red-100 text-sm p-3.5 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-100">
              <span className="text-xs text-neutral-500">💡 Hint: Password is <b>password</b></span>
            </div>

            <button 
              type="submit" 
              className="w-full bg-[#003366] hover:bg-[#00264d] text-white font-semibold py-3.5 rounded-xl transition-all shadow-md shadow-neutral-100 flex justify-center items-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" /> Uncover application
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-neutral-900 pb-20" id="main-app">
      {/* Universal Header Area */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-100/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Custom 3-pill logo symbol matching the attachment */}
            <div className="flex flex-col gap-[3px] w-9 select-none shrink-0" aria-hidden="true">
              {/* Row 1 */}
              <div className="h-[10px] flex rounded-full overflow-hidden">
                <div className="w-[9px] bg-[#2b59c3]" />
                <div className="flex-1 bg-[#4ec5c1]" />
              </div>
              {/* Row 2 */}
              <div className="h-[10px] flex rounded-full overflow-hidden">
                <div className="w-[9px] bg-[#4ec5c1]" />
                <div className="flex-1 bg-[#f06e2e]" />
              </div>
              {/* Row 3 */}
              <div className="h-[10px] w-6 flex rounded-full overflow-hidden">
                <div className="w-[9px] bg-[#eaa52e]" />
                <div className="flex-1 bg-[#b21c2c]" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900 flex items-center gap-1.5">
                <span>AskDeepak<span className="text-[#f06e2e]">AI</span></span>
                <span className="bg-blue-50 text-[#003366] border border-blue-100 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  Pro
                </span>
              </h1>
              <p className="text-xs text-neutral-500 hidden sm:block font-sans">AI-Powered Application Generator</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isPasswordRequired && (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                <Unlock className="w-3.5 h-3.5" /> Authenticated
              </span>
            )}
            <span className="text-[11px] font-mono text-neutral-400 bg-neutral-50 px-2 py-1 rounded border border-neutral-100 hidden md:block">
              Engine: Gemini-3.5-Flash
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Intro */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-neutral-900">AskDeepakAI : An Elite ATS Approved Resume and Cover Letter Writter</h2>
          <p className="text-neutral-500 text-sm mt-1.5 max-w-2xl font-sans">
            Align your CV key phrases mathematically with specific recruitment criteria. 
            Generate custom-typeset ATS-compliant PDF Resumes and premium business Cover Letters in seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: Input panel (5 cols) */}
          <section className="lg:col-span-5 space-y-6" id="cv-input-column">
            
            {/* Box 1: Company Profile */}
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building className="w-5 h-5 text-[#003366]" />
                <h3 className="font-semibold text-neutral-900 text-base">Application targeting</h3>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block mb-1.5">Company Name (Optional)</label>
                <input 
                  type="text"
                  className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#003366] focus:bg-white text-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all placeholder:text-neutral-300"
                  placeholder="e.g. Google, McKinsey, Stripe"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
            </div>

            {/* Box 2: Job Description */}
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#003366]" />
                  <h3 className="font-semibold text-neutral-900 text-base font-sans">Target Job Description</h3>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {jobDescription ? `${jobDescription.split(/\s+/).filter(Boolean).length} words` : "0 words"}
                </span>
              </div>

              <textarea 
                className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#003366] focus:bg-white text-neutral-800 rounded-xl p-4 text-sm focus:outline-none transition-all min-h-[160px] max-h-[300px] placeholder:text-neutral-400 font-sans"
                placeholder="Paste the target job details, skills keywords, and prerequisites here..."
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
              />
            </div>

            {/* Box 3: Resume Input */}
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#003366]" />
                  <h3 className="font-semibold text-neutral-900 text-base font-sans">Your CV or Base Resume</h3>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {baseResume ? `${baseResume.length} characters` : "Empty"}
                </span>
              </div>

              {/* Upload area */}
              {!uploadedFileName ? (
                <div 
                  onClick={triggerFileInput}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isParsing 
                      ? "border-amber-300 bg-amber-50/20" 
                      : "border-neutral-200 hover:border-[#003366] bg-neutral-50/50 hover:bg-neutral-50"
                  }`}
                  id="drag-drop-zone"
                >
                  <input 
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {isParsing ? (
                    <div className="flex flex-col items-center py-2">
                      <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-2" />
                      <p className="text-sm font-semibold text-neutral-700">Dissecting document...</p>
                      <p className="text-xs text-neutral-400 mt-1">Reading headers and structural blocks</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <UploadCloud className="w-9 h-9 text-[#003366]/80 mb-2" />
                      <p className="text-sm font-semibold text-neutral-700">Upload Base Resume</p>
                      <p className="text-xs text-neutral-400 mt-1">Accepts PDF, DOCX, or Plain TXT</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileUp className="w-4 h-4 text-[#003366] shrink-0" />
                    <span className="truncate font-medium text-neutral-800 font-mono text-xs">{uploadedFileName}</span>
                  </div>
                  <button 
                    onClick={clearUploadedFile}
                    className="p-1 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {parseError && (
                <div className="bg-red-50 text-red-600 border border-red-100 text-xs p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="text-center text-xs text-neutral-400">--- OR PASTE RAW TEXT ---</div>

              <textarea 
                className="w-full bg-neutral-50 border border-neutral-200 focus:border-[#003366] focus:bg-white text-neutral-800 rounded-xl p-4 text-xs focus:outline-none transition-all min-h-[160px] max-h-[300px] placeholder:text-neutral-400 font-mono"
                placeholder="Pasting raw resume text works flawlessly too..."
                value={baseResume}
                onChange={e => {
                  setBaseResume(e.target.value);
                  if (uploadedFileName) setUploadedFileName("");
                }}
              />
            </div>

            {/* Error banner */}
            {generationError && (
              <div className="bg-red-50 text-red-600 border border-red-100 text-sm p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-semibold">Generation Error</h4>
                  <p className="text-xs text-red-500/90 mt-0.5">{generationError}</p>
                </div>
              </div>
            )}

            {/* Submit core CTA */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isParsing}
              className={`w-full font-bold py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isGenerating || isParsing
                  ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                  : "bg-[#003366] hover:bg-[#00264d] text-white shadow-neutral-100 hover:-translate-y-0.5"
              }`}
              id="generate-button"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  AI is Tailoring application material...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Create tailored products
                </>
              )}
            </button>
            <p className="text-[10px] text-neutral-400 text-center leading-normal">
              Note: AskDeepakAI leverages temperature optimization for accuracy. If files ever look mismatched, feel free to generate again.
            </p>
          </section>

          {/* RIGHT: Results comparers (7 cols, side-by-side on lg viewports) */}
          <section className="lg:col-span-7" id="results-panel-column">
            
            {!tailoredResume && !tailoredCoverLetter ? (
              // Empty State
              <div className="h-full min-h-[320px] sm:min-h-[480px] bg-white border border-neutral-200/60 rounded-3xl flex flex-col justify-center items-center p-6 sm:p-8 text-center shadow-sm">
                <div className="w-16 h-16 bg-[#003366]/5 flex items-center justify-center rounded-2xl mb-4 text-[#003366]">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">Tailored outputs will emerge here</h3>
                <p className="text-neutral-500 text-sm max-w-sm mt-1.5 leading-relaxed font-sans">
                  Provide your base credentials and specify the target role on the left. The AI will formulate mathematically optimized records.
                </p>
              </div>
            ) : (
              // Active outputs tabs
              <div className="bg-white border border-neutral-200/80 rounded-3xl overflow-hidden shadow-sm flex flex-col h-full min-h-[400px] sm:min-h-[600px] lg:min-h-[640px]" id="tailored-outputs-display">
                {/* Control Header Navigation */}
                <div className="bg-neutral-50 border-b border-neutral-100 p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex border border-neutral-200 p-1 w-full sm:w-auto rounded-xl bg-white shrink-0">
                    <button
                      onClick={() => setActiveTab("resume")}
                      className={`flex-grow sm:flex-initial text-center text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-all cursor-pointer ${
                        activeTab === "resume"
                          ? "bg-[#003366] text-white"
                          : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                      }`}
                    >
                      Tailored Resume
                    </button>
                    <button
                      onClick={() => setActiveTab("cover")}
                      className={`flex-grow sm:flex-initial text-center text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-all cursor-pointer ${
                        activeTab === "cover"
                          ? "bg-[#003366] text-white"
                          : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                      }`}
                    >
                      Matching Cover Letter
                    </button>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClipboardCopy}
                      className="p-2.5 sm:px-4 sm:py-2.5 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all"
                      title="Copy plain-text to clipboard"
                    >
                      {copiedText ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-500" />
                          <span className="hidden sm:inline">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span className="hidden sm:inline">Copy Plain</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={activeTab === "resume" ? downloadResume : downloadCoverLetter}
                      className="px-4 py-2.5 bg-[#003366] hover:bg-[#00264d] text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>

                {/* Display Block */}
                <div className="p-6 sm:p-8 flex-1 overflow-y-auto max-h-[640px] font-mono select-text selection:bg-[#003366]/10 text-xs leading-relaxed text-neutral-800 bg-[#fafafd]">
                  <AnimatePresence mode="wait">
                    {activeTab === "resume" ? (
                      <motion.div
                        key="resume-content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <pre className="whitespace-pre-wrap font-mono text-[11px] sm:text-xs leading-relaxed text-neutral-800">
                          {tailoredResume}
                        </pre>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="cover-content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <pre className="whitespace-pre-wrap font-mono text-[11px] sm:text-xs leading-relaxed text-neutral-800">
                          {tailoredCoverLetter}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Status indicator bottom footer */}
                <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Created: {new Date().toLocaleDateString()}</span>
                  <span className="flex items-center gap-1 font-mono">
                    <span className="inline-block w-1.5 h-1.5 bg-[#003366] rounded-full animate-pulse"></span>
                    ATS High Match Format
                  </span>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>

      {/* Styled Footer */}
      <footer className="mt-16 border-t border-neutral-100 py-8 px-6 text-center text-xs text-neutral-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>This app is designed, developed, and maintained by <span className="font-semibold text-neutral-600">Deepak Reddy</span>.</p>
          <p className="font-mono text-[10px]">© {new Date().getFullYear()} AskDeepakAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
