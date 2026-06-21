import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  FileText, 
  Search, 
  Settings, 
  MapPin, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw, 
  Layers, 
  User, 
  GraduationCap, 
  ShieldAlert,
  Sliders,
  Send,
  Plus,
  Trash2,
  Lock,
  Upload,
  Sun,
  Moon,
  Database
} from 'lucide-react';
import './App.css';

interface CandidateProfile {
  skills: {
    expert: string[];
    proficient: string[];
    familiar: string[];
  };
  experience: {
    totalYears: number;
    domains: { [key: string]: number };
  };
  education: Array<{
    degree: string;
    field: string;
    graduationYear: number | string;
    isCurrentlyStudying: boolean;
  }>;
  notableProjects: Array<{
    title: string;
    description: string;
  }>;
  impliedRoleTargets: string[];
  locationPreference: string;
  workAuthorization: string;
}

interface ScrapedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  type: string;
  url: string;
  description: string;
  source: string;
  postedAt: string;
}

interface EvaluatedJob extends ScrapedJob {
  matchLevel: 'Best Fit' | 'Strong Fit' | 'Worth a Look';
  matchScore: number;
  oneLineReason: string;
  gaps: string[];
  flags: string[];
  evaluatedAt: string;
}

interface CompanyOption {
  name: string;
  boardId: string;
  source: 'greenhouse' | 'lever' | 'workable';
  category: string;
}

export default function App() {
  // Navigation & Settings State
  const [activeTab, setActiveTab] = useState<'cv' | 'search' | 'results' | 'settings'>('cv');
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');

  // Account Connections (Credentials)
  const [llmProvider, setLlmProvider] = useState<string>(() => localStorage.getItem('llm_provider') || 'gemini');
  const [llmApiKey, setLlmApiKey] = useState<string>(() => localStorage.getItem('llm_api_key') || '');
  const [llmModel, setLlmModel] = useState<string>(() => localStorage.getItem('llm_model') || 'gemini-1.5-flash');
  
  const [searchProvider, setSearchProvider] = useState<string>(() => localStorage.getItem('search_provider') || 'serper');
  const [searchApiKey, setSearchApiKey] = useState<string>(() => localStorage.getItem('search_api_key') || '');

  // Test status
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Candidate Profile State
  const [cvText, setCvText] = useState<string>(() => localStorage.getItem('raw_cv_text') || '');
  const [isParsingCv, setIsParsingCv] = useState<boolean>(false);
  const [profile, setProfile] = useState<CandidateProfile | null>(() => {
    const saved = localStorage.getItem('candidate_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // Constraints State
  const [constraints, setConstraints] = useState({
    targetLocations: '',
    remoteOnly: false,
    jobType: 'all', 
    visaRequired: false,
    minSalary: '',
    targetCompaniesText: '',
    exclusions: ''
  });

  // Scraper Settings
  const [availableCompanies, setAvailableCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyOption[]>([]);
  const [customBoardInput, setCustomBoardInput] = useState({ boardId: '', source: 'greenhouse' });
  const [customBoards, setCustomBoards] = useState<CompanyOption[]>([]);
  const [includeRemoteOk, setIncludeRemoteOk] = useState<boolean>(true);

  // Scrape & Match Status
  const [scrapedCount, setScrapedCount] = useState<number>(0);
  const [evaluatedJobs, setEvaluatedJobs] = useState<EvaluatedJob[]>([]);
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [filterScore, setFilterScore] = useState<number>(0);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Handle dark mode toggle
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Load companies on mount
  useEffect(() => {
    fetch('/api/companies')
      .then(res => res.json())
      .then(data => {
        setAvailableCompanies(data);
        // Default select first few popular companies
        if (data.length > 0) {
          setSelectedCompanies(data.slice(0, 5));
        }
      })
      .catch(err => {
        console.error("Failed to load companies:", err);
        addLog("Error connecting to scraper server. Make sure the backend is running.");
      });
  }, []);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    setProgressMsg(msg);
  };

  const saveProfile = (newProfile: CandidateProfile) => {
    setProfile(newProfile);
    localStorage.setItem('candidate_profile', JSON.stringify(newProfile));
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCvText(text);
      localStorage.setItem('raw_cv_text', text);
      addLog(`Loaded CV file: ${file.name} (${text.length} characters)`);
    };
    reader.readAsText(file);
  };

  // Test LLM Connection
  const handleTestKey = async () => {
    if (!llmApiKey.trim()) {
      setTestStatus('error');
      alert("Please provide an LLM API key to test.");
      return;
    }
    setTestStatus('testing');
    try {
      const response = await fetch('/api/parse-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText: "Name: Test Candidate. Skills: Node.js. Experience: 1 year.",
          provider: llmProvider,
          apiKey: llmApiKey,
          model: llmModel
        })
      });
      if (response.ok) {
        setTestStatus('success');
        localStorage.setItem('llm_provider', llmProvider);
        localStorage.setItem('llm_api_key', llmApiKey);
        localStorage.setItem('llm_model', llmModel);
        if (searchApiKey.trim()) {
          localStorage.setItem('search_provider', searchProvider);
          localStorage.setItem('search_api_key', searchApiKey);
        }
      } else {
        setTestStatus('error');
      }
    } catch (e) {
      console.error(e);
      setTestStatus('error');
    }
  };

  // CV Parsing via Backend
  const handleParseCv = async () => {
    if (!llmApiKey.trim()) {
      alert("Please provide an LLM API Key in the Settings tab.");
      setActiveTab('settings');
      return;
    }
    if (!cvText.trim()) {
      alert("Please paste or upload your CV text first.");
      return;
    }

    setIsParsingCv(true);
    addLog("Sending CV to backend for structured parsing...");
    localStorage.setItem('raw_cv_text', cvText);

    try {
      const response = await fetch('/api/parse-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText,
          provider: llmProvider,
          apiKey: llmApiKey,
          model: llmModel
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Unknown parsing error');
      }

      const parsedProfile = await response.json() as CandidateProfile;
      saveProfile(parsedProfile);
      addLog("CV successfully parsed into structured profile.");
      setActiveTab('search');
    } catch (error: any) {
      console.error(error);
      addLog(`CV parsing failed: ${error.message}`);
      alert(`Parsing failed: ${error.message}. Please verify your LLM settings.`);
    } finally {
      setIsParsingCv(false);
    }
  };

  // Add Custom Board ID
  const handleAddCustomBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBoardInput.boardId.trim()) return;

    const boardIdClean = customBoardInput.boardId.trim().toLowerCase();
    const newBoard: CompanyOption = {
      name: customBoardInput.boardId.charAt(0).toUpperCase() + customBoardInput.boardId.slice(1),
      boardId: boardIdClean,
      source: customBoardInput.source as 'greenhouse' | 'lever' | 'workable',
      category: 'Custom Board'
    };

    setCustomBoards(prev => [...prev, newBoard]);
    setSelectedCompanies(prev => [...prev, newBoard]);
    setCustomBoardInput(prev => ({ ...prev, boardId: '' }));
    addLog(`Added custom career board: ${newBoard.name} (${newBoard.source})`);
  };

  // Run Discovery & Streaming Job Matcher
  const runPipeline = async () => {
    if (!profile) {
      alert("Please parse a CV profile first.");
      setActiveTab('cv');
      return;
    }

    setLogs([]);
    setEvaluatedJobs([]);
    setScrapedCount(0);
    setIsPipelineRunning(true);
    setActiveTab('results');

    addLog("Connecting to real-time job matching stream...");

    try {
      const parsedTextCompanies = constraints.targetCompaniesText
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0)
        .map(c => ({
          name: c.charAt(0).toUpperCase() + c.slice(1),
          boardId: c.toLowerCase(),
          source: 'detect' as const,
          category: 'Custom Target'
        }));

      const response = await fetch('/api/search-jobs-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          constraints,
          llmConfig: {
            provider: llmProvider,
            apiKey: llmApiKey,
            model: llmModel
          },
          searchConfig: {
            provider: searchProvider,
            apiKey: searchApiKey
          },
          selectedCompanies: [...selectedCompanies, ...parsedTextCompanies],
          includeRemoteOk
        })
      });

      if (!response.body) {
        addLog("Error: Backend returned empty response stream.");
        setIsPipelineRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'log') {
              addLog(data.message);
              if (data.message.includes('Retrieved') || data.message.includes('Found')) {
                // Increment counter roughly based on log lines
                const num = parseInt(data.message.match(/\d+/)?.[0] || '0');
                setScrapedCount(prev => prev + num);
              }
            } else if (data.type === 'job') {
              setEvaluatedJobs(prev => {
                const exists = prev.some(j => j.id === data.job.id);
                if (exists) {
                  return prev.map(j => j.id === data.job.id ? data.job : j).sort((a, b) => b.matchScore - a.matchScore);
                }
                return [...prev, data.job].sort((a, b) => b.matchScore - a.matchScore);
              });
            } else if (data.type === 'complete') {
              addLog(data.message);
            } else if (data.type === 'error') {
              addLog(`Error: ${data.message}`);
            }
          } catch (err) {
            console.error("Failed to parse stream line:", line, err);
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      addLog(`Pipeline execution failed: ${error.message}`);
    } finally {
      setIsPipelineRunning(false);
    }
  };

  const toggleCompany = (company: CompanyOption) => {
    if (selectedCompanies.some(c => c.boardId === company.boardId)) {
      setSelectedCompanies(prev => prev.filter(c => c.boardId !== company.boardId));
    } else {
      setSelectedCompanies(prev => [...prev, company]);
    }
  };

  const handleRemoveCustomBoard = (boardId: string) => {
    setCustomBoards(prev => prev.filter(b => b.boardId !== boardId));
    setSelectedCompanies(prev => prev.filter(c => c.boardId !== boardId));
  };

  const filteredJobs = evaluatedJobs.filter(job => {
    const scoreMatches = job.matchScore >= filterScore;
    const textMatches = 
      job.title.toLowerCase().includes(searchFilter.toLowerCase()) || 
      job.company.toLowerCase().includes(searchFilter.toLowerCase()) ||
      job.oneLineReason.toLowerCase().includes(searchFilter.toLowerCase());
    return scoreMatches && textMatches;
  });

  return (
    <div className="app-container">
      <div className="glow-bg"></div>
      <div className="glow-bg-secondary"></div>

      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <Briefcase className="text-gradient" size={32} style={{ color: 'var(--color-primary)' }} />
          <h1 className="logo-text">
            Job<span className="text-serif text-gradient" style={{ fontWeight: 'normal', fontStyle: 'italic', marginLeft: '0.1rem' }}>Fetch</span>
          </h1>
          <span className="badge badge-primary" style={{ marginLeft: '0.5rem' }}>Real-Time Matching</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Dark Mode toggle */}
          <button 
            className="settings-btn" 
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle theme"
            style={{ borderRadius: '50%', padding: '0.6rem' }}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <nav style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className={`btn ${activeTab === 'cv' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('cv')}
            >
              <FileText size={18} />
              CV Setup
            </button>
            <button 
              className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('search')}
            >
              <Search size={18} />
              Search Pipeline
            </button>
            <button 
              className={`btn ${activeTab === 'results' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('results')}
            >
              <Layers size={18} />
              Matches
              {evaluatedJobs.length > 0 && (
                <span className="badge badge-success" style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}>
                  {evaluatedJobs.length}
                </span>
              )}
            </button>
            <button 
              className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
              Connections
            </button>
          </nav>
        </div>
      </header>

      {/* Missing Keys Banner */}
      {!llmApiKey && (
        <div className="api-key-banner animate-slide-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={24} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem' }}>Connect LLM Account</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Add your Gemini, OpenAI, Anthropic, or Groq API Key to parse your CV and match roles automatically.
              </p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setActiveTab('settings')}>
            Connect Keys
          </button>
        </div>
      )}

      {/* Main Panel */}
      <main className="animate-fade-in" style={{ minHeight: '60vh' }}>
        
        {/* CV Upload Tab */}
        {activeTab === 'cv' && (
          <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Candidate CV <span className="text-serif">Profile</span></h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Upload or paste your resume. We extract skills, location targets, and roles via your connected LLM.
              </p>
            </div>

            <div className="grid-cols-2" style={{ alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* File input */}
                <div 
                  className="glass-panel" 
                  style={{ 
                    border: '2px dashed var(--border-color)', 
                    padding: '1.5rem', 
                    textAlign: 'center', 
                    borderRadius: 'var(--radius-md)', 
                    cursor: 'pointer',
                    background: 'var(--bg-card-hover)',
                    position: 'relative'
                  }}
                >
                  <input 
                    type="file" 
                    accept=".txt,.md,.json" 
                    onChange={handleFileUpload} 
                    style={{ 
                      opacity: 0, 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      cursor: 'pointer' 
                    }} 
                  />
                  <Upload size={32} style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }} />
                  <h4 style={{ margin: '0 0 0.25rem 0' }}>Upload CV file</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Supports TXT, MD, and JSON CV text files.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span>Or Paste Resume Text</span>
                    {cvText && <span style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>Text loaded ({cvText.length} chars)</span>}
                  </label>
                  <textarea 
                    className="form-textarea"
                    placeholder="Paste the plain text content of your CV/resume here..."
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    style={{ minHeight: '220px' }}
                  />
                </div>

                <button 
                  className="btn btn-primary" 
                  onClick={handleParseCv} 
                  disabled={isParsingCv || !cvText.trim()}
                  style={{ width: '100%' }}
                >
                  {isParsingCv ? (
                    <>
                      <RefreshCw className="animate-spin" size={18} />
                      Parsing CV with LLM...
                    </>
                  ) : (
                    <>
                      <FileText size={18} />
                      Parse CV into Profile
                    </>
                  )}
                </button>
              </div>

              {/* Parsed profile panel */}
              <div className="glass-panel" style={{ padding: '1.5rem', background: 'var(--bg-card-hover)', minHeight: '410px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <User size={20} style={{ color: 'var(--color-primary)' }} />
                  Extracted <span className="text-serif">Profile</span>
                </h3>

                {profile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.9rem' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(37, 99, 235, 0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(37, 99, 235, 0.08)' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Exp:</span>
                        <strong style={{ marginLeft: '0.25rem', color: 'var(--text-primary)' }}>{profile.experience.totalYears} Years</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Work Auth:</span>
                        <strong style={{ marginLeft: '0.25rem', color: 'var(--text-primary)' }}>{profile.workAuthorization || 'Not Stated'}</strong>
                      </div>
                    </div>

                    <div>
                      <span className="form-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Implied Roles:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {profile.impliedRoleTargets?.map((role, idx) => (
                          <span key={idx} className="badge badge-secondary">{role}</span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="form-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Core Skills:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.75rem', color: 'var(--color-primary)', display: 'block', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Expert:</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {profile.skills?.expert?.map((s, idx) => <span key={idx} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{s}</span>)}
                          </div>
                        </div>
                        {profile.skills?.proficient?.length > 0 && (
                          <div>
                            <strong style={{ fontSize: '0.75rem', color: 'var(--color-secondary)', display: 'block', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Proficient:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {profile.skills.proficient.map((s, idx) => <span key={idx} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>{s}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="form-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Domain Mapping:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {Object.entries(profile.experience?.domains || {}).map(([dom, yrs]) => (
                          <div key={dom} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '120px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{dom}</div>
                            <div style={{ flexGrow: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
                              <div style={{
                                width: `${Math.min((yrs / (profile.experience.totalYears || 1)) * 100, 100)}%`,
                                height: '100%',
                                background: 'var(--gradient-accent)',
                                borderRadius: '3px'
                              }}></div>
                            </div>
                            <span style={{ fontSize: '0.75rem', width: '35px', textAlign: 'right' }}>{yrs}y</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="form-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Education:</span>
                      {profile.education?.map((edu, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                          <GraduationCap size={16} style={{ color: 'var(--color-primary)' }} />
                          <span>{edu.degree} in {edu.field} ({edu.graduationYear})</span>
                        </div>
                      ))}
                    </div>

                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', color: 'var(--text-muted)' }}>
                    <AlertCircle size={40} style={{ marginBottom: '0.75rem' }} />
                    <p style={{ textAlign: 'center' }}>No CV parsed yet. Paste CV and click "Parse CV" to create structured profile.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search Pipeline configuration */}
        {activeTab === 'search' && (
          <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Search & Fetch <span className="text-serif">Pipeline</span></h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Configure target constraints, boards, and exclusions. Feeds runs automatically.
              </p>
            </div>

            <div className="grid-cols-2" style={{ alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={20} style={{ color: 'var(--color-primary)' }} />
                  Search Constraints
                </h3>

                <div className="grid-cols-2">
                  <div className="form-group">
                    <label className="form-label">Target Locations</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. San Francisco, Remote, London"
                      value={constraints.targetLocations}
                      onChange={(e) => setConstraints(prev => ({ ...prev, targetLocations: e.target.value }))}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Job Type Selection</label>
                    <select 
                      className="form-select"
                      value={constraints.jobType}
                      onChange={(e) => setConstraints(prev => ({ ...prev, jobType: e.target.value }))}
                    >
                      <option value="all">All Roles</option>
                      <option value="fulltime">Full-Time Only</option>
                      <option value="internship">Internships Only</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', padding: '0.25rem 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="checkbox" 
                      style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      checked={constraints.remoteOnly}
                      onChange={(e) => setConstraints(prev => ({ ...prev, remoteOnly: e.target.checked }))}
                    />
                    Remote-Only roles
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="checkbox" 
                      style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      checked={constraints.visaRequired}
                      onChange={(e) => setConstraints(prev => ({ ...prev, visaRequired: e.target.checked }))}
                    />
                    Requires Visa Support
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Companies (comma-separated)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. OpenAI, Stripe, Figma, Vercel"
                    value={constraints.targetCompaniesText}
                    onChange={(e) => setConstraints(prev => ({ ...prev, targetCompaniesText: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Exclusions / Keywords to Skip</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Web3, crypto, gambling, senior"
                    value={constraints.exclusions}
                    onChange={(e) => setConstraints(prev => ({ ...prev, exclusions: e.target.value }))}
                  />
                </div>
              </div>

              {/* Right Column: Predefined companies & Custom boards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={20} style={{ color: 'var(--color-primary)' }} />
                  Target ATS Boards ({selectedCompanies.length + (includeRemoteOk ? 1 : 0)} selected)
                </h3>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', width: '100%' }}>
                    <input 
                      type="checkbox"
                      style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      checked={includeRemoteOk}
                      onChange={(e) => setIncludeRemoteOk(e.target.checked)}
                    />
                    Include RemoteOK Feed (No key needed)
                  </label>
                </div>

                <div>
                  <span className="form-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Select Target Companies:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', padding: '0.5rem', background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    {availableCompanies.map((company) => {
                      const isSelected = selectedCompanies.some(c => c.boardId === company.boardId);
                      return (
                        <button
                          key={company.boardId}
                          type="button"
                          className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8rem',
                            borderRadius: 'var(--radius-sm)',
                            border: isSelected ? 'none' : '1px solid var(--border-color)'
                          }}
                          onClick={() => toggleCompany(company)}
                        >
                          {company.name}
                          <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>({company.source})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add Custom Board */}
                <form onSubmit={handleAddCustomBoard} style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ flexGrow: 1, marginBottom: 0 }}>
                    <label className="form-label">Add Custom Board ID</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. figma, stripe, Pinecone"
                      value={customBoardInput.boardId}
                      onChange={(e) => setCustomBoardInput(prev => ({ ...prev, boardId: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ width: '120px', marginBottom: 0 }}>
                    <label className="form-label">Platform</label>
                    <select 
                      className="form-select"
                      value={customBoardInput.source}
                      onChange={(e) => setCustomBoardInput(prev => ({ ...prev, source: e.target.value }))}
                    >
                      <option value="greenhouse">Greenhouse</option>
                      <option value="lever">Lever</option>
                      <option value="workable">Workable</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-secondary" style={{ height: '42px' }}>
                    <Plus size={18} />
                  </button>
                </form>

                {customBoards.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {customBoards.map((b) => (
                      <span key={b.boardId} className="badge badge-secondary" style={{ paddingRight: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {b.name} ({b.source})
                        <Trash2 size={12} style={{ cursor: 'pointer' }} onClick={() => handleRemoveCustomBoard(b.boardId)} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
              <button 
                className="btn btn-primary" 
                onClick={runPipeline} 
                disabled={isPipelineRunning || (!selectedCompanies.length && !includeRemoteOk)}
                style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}
              >
                {isPipelineRunning ? (
                  <>
                    <RefreshCw className="animate-spin" size={20} />
                    Discovery & Match Engine Running...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Fetch & Match Roles (Real-Time)
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Match Results Board */}
        {activeTab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Stats */}
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.5rem' }}>Discovery <span className="text-serif">Scoreboard</span></h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Live discovery feeds. Matches rank instantly as they score.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '2rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Scraped</span>
                  <h4 style={{ fontSize: '1.8rem', color: 'var(--color-secondary)' }}>{scrapedCount}</h4>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Matches Scored</span>
                  <h4 style={{ fontSize: '1.8rem', color: 'var(--color-success)' }}>{evaluatedJobs.length}</h4>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Hit Rate</span>
                  <h4 style={{ fontSize: '1.8rem', color: 'var(--color-primary)' }}>
                    {scrapedCount > 0 ? `${Math.round((evaluatedJobs.length / scrapedCount) * 100)}%` : '0%'}
                  </h4>
                </div>
              </div>
            </div>

            <div className="grid-cols-3" style={{ alignItems: 'start', gridTemplateColumns: '300px 1fr 1fr', display: 'grid', gap: '2rem' }}>
              
              {/* Left Column: Live Scraper Logs & Controls */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'fit-content' }}>
                <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Pipeline Controls</h4>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Filter Matches</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Search titles/companies..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>
                    <span>Minimum Score</span>
                    <span>{filterScore}%</span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="5"
                    className="form-input" 
                    style={{ padding: 0, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                    value={filterScore}
                    onChange={(e) => setFilterScore(Number(e.target.value))}
                  />
                </div>

                {isPipelineRunning && (
                  <div style={{ padding: '1rem', background: 'rgba(37,99,235,0.06)', border: '1px dashed var(--color-primary)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      <RefreshCw className="animate-spin" size={16} />
                      <span>Discovering & Matching...</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineBreak: 'anywhere' }}>{progressMsg}</p>
                  </div>
                )}

                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>Real-Time Activity Logs</label>
                  <div style={{
                    maxHeight: '240px',
                    overflowY: 'auto',
                    background: 'var(--bg-card-hover)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem',
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column-reverse',
                    gap: '0.25rem'
                  }}>
                    {logs.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)' }}>Idle. Click run to start fetching.</span>
                    ) : (
                      logs.map((log, idx) => <div key={idx}>{log}</div>)
                    )}
                  </div>
                </div>
              </div>

              {/* Sorted Jobs List */}
              <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {filteredJobs.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <AlertCircle size={48} style={{ color: 'var(--text-muted)' }} />
                    <h3>No Matching Jobs Available</h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
                      {evaluatedJobs.length === 0 
                        ? "Run the search pipeline to find and evaluate matching roles."
                        : "Modify filters. Lower the minimum score or search constraints."
                      }
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Best Fits */}
                    {filteredJobs.some(j => j.matchScore >= 80) && (
                      <div>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-success)' }}>
                          🏆 Best Fits (Score 80+)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {filteredJobs.filter(j => j.matchScore >= 80).map(job => (
                            <JobMatchCard key={job.id} job={job} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strong Fits */}
                    {filteredJobs.some(j => j.matchScore >= 70 && j.matchScore < 80) && (
                      <div style={{ marginTop: '1rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>
                          ⚡ Strong Fits (Score 70 - 79)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {filteredJobs.filter(j => j.matchScore >= 70 && j.matchScore < 80).map(job => (
                            <JobMatchCard key={job.id} job={job} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Worth a Look */}
                    {filteredJobs.some(j => j.matchScore >= 50 && j.matchScore < 70) && (
                      <div style={{ marginTop: '1rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-warning)' }}>
                           Worth a Look (Score 50 - 69)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {filteredJobs.filter(j => j.matchScore >= 50 && j.matchScore < 70).map(job => (
                            <JobMatchCard key={job.id} job={job} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>

          </div>
        )}

        {/* Connections Tab */}
        {activeTab === 'settings' && (
          <div className="glass-panel" style={{ padding: '2.5rem', maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Connect Your <span className="text-serif">Accounts</span></h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Optionally hook up API Keys to query LLMs and web search endpoints. API credentials remain local to your browser.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={18} style={{ color: 'var(--color-primary)' }} />
                1. 🔑 LLM API Key (Required for Parser & Matching)
              </h3>
              
              <div className="grid-cols-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">LLM Provider</label>
                  <select 
                    className="form-select"
                    value={llmProvider}
                    onChange={(e) => {
                      setLlmProvider(e.target.value);
                      if (e.target.value === 'gemini') setLlmModel('gemini-1.5-flash');
                      else if (e.target.value === 'openai') setLlmModel('gpt-4o-mini');
                      else if (e.target.value === 'anthropic') setLlmModel('claude-3-5-sonnet-20241022');
                      else if (e.target.value === 'groq') setLlmModel('llama-3.3-70b-versatile');
                    }}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="groq">Groq (Llama3)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Model Selection</label>
                  <select 
                    className="form-select"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                  >
                    {llmProvider === 'gemini' && (
                      <>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fastest)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Extremely Smart)</option>
                        <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
                      </>
                    )}
                    {llmProvider === 'openai' && (
                      <>
                        <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
                        <option value="gpt-4o">GPT-4o (Standard)</option>
                      </>
                    )}
                    {llmProvider === 'anthropic' && (
                      <>
                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                        <option value="claude-3-haiku-20240307">Claude 3 Haiku (Fast)</option>
                      </>
                    )}
                    {llmProvider === 'groq' && (
                      <>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Fast & Large)</option>
                        <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder={`${llmProvider.toUpperCase()} API key...`}
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                  />
                  <button 
                    className="btn btn-primary"
                    onClick={handleTestKey}
                    disabled={testStatus === 'testing'}
                    style={{ minWidth: '120px' }}
                  >
                    {testStatus === 'testing' ? <RefreshCw className="animate-spin" size={16} /> : 'Test & Save'}
                  </button>
                </div>
                {testStatus === 'success' && <span style={{ color: 'var(--color-success)', fontSize: '0.8rem' }}>✓ Configuration active and verified!</span>}
                {testStatus === 'error' && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>✗ Test failed. Check credentials and try again.</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} style={{ color: 'var(--color-primary)' }} />
                2. 🔍 Search API Key (Optional - Powers LinkedIn, Indeed, Naukri Web Discovery)
              </h3>
              
              <div className="grid-cols-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Search Provider</label>
                  <select 
                    className="form-select"
                    value={searchProvider}
                    onChange={(e) => setSearchProvider(e.target.value)}
                  >
                    <option value="serper">Serper (Google Search)</option>
                    <option value="brave">Brave Web Search</option>
                    <option value="tavily">Tavily AI Search</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Search API Key</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Enter search API key..."
                    value={searchApiKey}
                    onChange={(e) => setSearchApiKey(e.target.value)}
                  />
                </div>
              </div>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                💡 <strong>Note:</strong> ATS Feeds (Greenhouse, Lever, Workable) and LinkedIn guest scraping run automatically without requiring a search key.
              </span>
            </div>

          </div>
        )}

      </main>

      <footer style={{ textAlign: 'center', padding: '2rem', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <p>&copy; 2026 JobFetch Matching System</p>
      </footer>
    </div>
  );
}

// Subcomponent: Job Match Card
function JobMatchCard({ job }: { job: EvaluatedJob }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--color-success)';
    if (score >= 70) return 'var(--color-primary)';
    return 'var(--color-warning)';
  };

  return (
    <div className="glass-panel job-card animate-slide-up" style={{
      padding: '1.5rem', 
      background: 'var(--bg-card)', 
      borderLeft: `4px solid ${getScoreColor(job.matchScore)}`,
      transition: 'all 0.2s'
    }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '0.75rem' }}>
        <div>
          <h4 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {job.title}
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{job.company}</strong>
            <span>&bull;</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <MapPin size={14} />
              {job.location}
            </span>
            <span>&bull;</span>
            <span className="badge badge-secondary" style={{ padding: '0.1rem 0.5rem', fontSize: '0.7rem' }}>
              {job.type}
            </span>
          </div>
        </div>

        {/* Match Percentage */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'var(--bg-card-hover)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 0.75rem',
          minWidth: '65px'
        }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Match</span>
          <strong style={{ fontSize: '1.25rem', color: getScoreColor(job.matchScore) }}>{job.matchScore}%</strong>
        </div>
      </div>

      {/* Fit Analysis */}
      <div style={{
        padding: '0.75rem', 
        background: 'rgba(37, 99, 235, 0.02)', 
        borderRadius: 'var(--radius-sm)', 
        border: '1px solid rgba(37, 99, 235, 0.08)',
        fontSize: '0.85rem',
        marginBottom: '0.75rem',
        color: 'var(--text-primary)',
        lineHeight: 1.4
      }}>
        <strong>Fit Analysis:</strong> {job.oneLineReason}
      </div>

      {/* Gaps / Flags */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
        {job.gaps.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'start', gap: '0.4rem' }}>
            <ShieldAlert size={14} style={{ color: 'var(--color-danger)', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--color-danger)' }}>Gaps identified:</strong> {job.gaps.join(', ')}
            </span>
          </div>
        )}
        {job.flags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'start', gap: '0.4rem' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-warning)', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--color-warning)' }}>Flags:</strong> {job.flags.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Links & metadata */}
      <div style={{
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderTop: '1px solid var(--border-color)', 
        paddingTop: '0.75rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)'
      }}>
        <span>Source: <strong>{job.source}</strong> &bull; Evaluated: {job.evaluatedAt || new Date(job.postedAt).toLocaleDateString()}</span>
        <a 
          href={job.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
        >
          <span>Apply Directly</span>
          <ExternalLink size={12} />
        </a>
      </div>

    </div>
  );
}
