import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Predefined list of popular companies using Greenhouse/Lever for easy selection
const POPULAR_COMPANIES = [
  { name: 'OpenAI', boardId: 'openai', source: 'greenhouse', category: 'AI' },
  { name: 'Anthropic', boardId: 'anthropic', source: 'lever', category: 'AI' },
  { name: 'Stripe', boardId: 'stripe', source: 'greenhouse', category: 'Fintech' },
  { name: 'Vercel', boardId: 'vercel', source: 'greenhouse', category: 'Developer Tools' },
  { name: 'Figma', boardId: 'figma', source: 'greenhouse', category: 'Design' },
  { name: 'Scale AI', boardId: 'scaleai', source: 'greenhouse', category: 'AI' },
  { name: 'Pinecone', boardId: 'pinecone', source: 'greenhouse', category: 'AI/Database' },
  { name: 'LangChain', boardId: 'langchain', source: 'greenhouse', category: 'AI/DevTools' },
  { name: 'Retool', boardId: 'retool', source: 'greenhouse', category: 'DevTools' },
  { name: 'Airbnb', boardId: 'airbnb', source: 'greenhouse', category: 'Travel' },
  { name: 'Dropbox', boardId: 'dropbox', source: 'greenhouse', category: 'SaaS' },
  { name: 'GitHub', boardId: 'github', source: 'greenhouse', category: 'Developer Tools' },
  { name: 'HashiCorp', boardId: 'hashicorp', source: 'greenhouse', category: 'DevTools' },
  { name: 'Sentry', boardId: 'sentry', source: 'greenhouse', category: 'Developer Tools' },
  { name: 'Webflow', boardId: 'webflow', source: 'greenhouse', category: 'Design' },
  { name: 'Clerk', boardId: 'clerk', source: 'lever', category: 'DevTools' },
  { name: 'Supabase', boardId: 'supabase', source: 'greenhouse', category: 'AI/Database' },
  { name: 'Ramp', boardId: 'ramp', source: 'lever', category: 'Fintech' },
  { name: 'Vantage', boardId: 'vantage', source: 'lever', category: 'DevTools' }
];

// ----------------- LLM HELPERS -----------------
async function callLLM({ provider, apiKey, model, systemPrompt, userPrompt, jsonMode = false }) {
  if (!apiKey) {
    throw new Error(`LLM API Key is missing for provider ${provider}`);
  }

  const timeout = 25000;

  if (provider === 'gemini') {
    const modelName = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: `${systemPrompt}\n\nCandidate / Input Text:\n${userPrompt}` }]
      }],
      generationConfig: jsonMode ? { responseMimeType: "application/json" } : {}
    };

    const response = await axios.post(url, payload, { timeout });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  } else if (provider === 'openai') {
    const modelName = model || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    };

    const response = await axios.post(url, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout
    });
    return response.data?.choices?.[0]?.message?.content || '';

  } else if (provider === 'groq') {
    const modelName = model || 'llama-3.3-70b-versatile';
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    };

    const response = await axios.post(url, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout
    });
    return response.data?.choices?.[0]?.message?.content || '';

  } else if (provider === 'anthropic') {
    const modelName = model || 'claude-3-5-sonnet-20241022';
    const url = 'https://api.anthropic.com/v1/messages';
    
    // Anthropic does not support jsonMode parameter directly in this way,
    // so we instruct in the systemPrompt to output JSON.
    const payload = {
      model: modelName,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };

    const response = await axios.post(url, payload, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout
    });
    return response.data?.content?.[0]?.text || '';
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// ----------------- SEARCH API HELPERS -----------------
async function searchWeb(query, provider, apiKey) {
  if (!apiKey) return [];
  const timeout = 10000;

  try {
    if (provider === 'serper') {
      const url = 'https://google.serper.dev/search';
      const response = await axios.post(url, { q: query }, {
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        timeout
      });
      return (response.data.organic || []).map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || ''
      }));
    } else if (provider === 'brave') {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
        timeout
      });
      return (response.data.web?.results || []).map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.description || ''
      }));
    } else if (provider === 'tavily') {
      const url = 'https://api.tavily.com/search';
      const response = await axios.post(url, { api_key: apiKey, query: query }, { timeout });
      return (response.data.results || []).map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.content || ''
      }));
    }
  } catch (err) {
    console.error(`Search API error for provider ${provider}:`, err.message);
  }
  return [];
}

// ----------------- SCRAPER HELPERS -----------------

// Scrape DuckDuckGo HTML results
async function scrapeDuckDuckGo(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    $('.result__body').each((i, el) => {
      const titleEl = $(el).find('.result__title a');
      const title = titleEl.text().trim();
      let rawHref = titleEl.attr('href') || '';
      let snippet = $(el).find('.result__snippet').text().trim();
      
      let finalUrl = rawHref;
      if (rawHref.includes('uddg=')) {
        try {
          const parts = rawHref.split('uddg=');
          if (parts.length > 1) {
            const decoded = decodeURIComponent(parts[1].split('&')[0]);
            finalUrl = decoded;
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      
      if (title && finalUrl) {
        results.push({
          title,
          url: finalUrl,
          snippet
        });
      }
    });
    return results;
  } catch (err) {
    console.error(`DuckDuckGo scraping failed for query "${query}":`, err.message);
    return [];
  }
}

// Scrape LinkedIn Guest Job search
async function scrapeLinkedInJobs(keywords, location = 'United States') {
  try {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&start=0`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': '*/*'
      },
      timeout: 12000
    });

    const $ = cheerio.load(response.data);
    const jobs = [];
    $('li').each((i, el) => {
      const titleEl = $(el).find('.base-search-card__title, .job-search-card__title');
      const companyEl = $(el).find('.base-search-card__subtitle, .job-search-card__subtitle');
      const locationEl = $(el).find('.job-search-card__location, .base-search-card__metadata');
      const linkEl = $(el).find('a.base-card__full-link, a.base-search-card__full-link');
      const timeEl = $(el).find('time');

      const title = titleEl.text().trim();
      const company = companyEl.text().trim();
      const jobLocation = locationEl.text().trim();
      const jobUrl = linkEl.attr('href') || '';
      const postedAt = timeEl.attr('datetime') || new Date().toISOString();

      if (title && company) {
        jobs.push({
          id: `li-${Buffer.from(jobUrl).toString('base64').substring(0, 15)}-${i}`,
          company,
          title,
          location: jobLocation || 'Remote/Unknown',
          type: 'Full-time',
          url: jobUrl.split('?')[0],
          description: `LinkedIn Guest job: ${title} at ${company} in ${jobLocation}.`,
          source: 'LinkedIn',
          postedAt
        });
      }
    });
    return jobs;
  } catch (err) {
    console.error("LinkedIn guest job scraper failed:", err.message);
    return [];
  }
}

// Greenhouse board fetcher
async function fetchGreenhouseJobs(boardId) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`;
    const response = await axios.get(url, { timeout: 10000 });
    if (!response.data || !response.data.jobs) return [];

    return response.data.jobs.map(job => ({
      id: `gh-${boardId}-${job.id}`,
      company: boardId.charAt(0).toUpperCase() + boardId.slice(1),
      title: job.title,
      location: job.location?.name || 'Remote/Unknown',
      type: job.departments?.[0]?.name || 'Engineering', 
      url: job.absolute_url,
      description: cleanHtml(job.content), 
      source: 'Greenhouse',
      postedAt: job.updated_at
    }));
  } catch (error) {
    console.error(`Error fetching Greenhouse for ${boardId}:`, error.message);
    return [];
  }
}

// Lever board fetcher
async function fetchLeverJobs(companyId) {
  try {
    const url = `https://api.lever.co/v0/postings/${companyId}?mode=json`;
    const response = await axios.get(url, { timeout: 10000 });
    if (!Array.isArray(response.data)) return [];

    return response.data.map(job => {
      let descriptionHtml = job.description || '';
      if (job.lists) {
        job.lists.forEach(list => {
          descriptionHtml += `\n${list.text}\n`;
          list.content.forEach(item => {
            descriptionHtml += `* ${item}\n`;
          });
        });
      }
      if (job.additional) {
        descriptionHtml += `\n${job.additional}\n`;
      }

      return {
        id: `lv-${companyId}-${job.id}`,
        company: companyId.charAt(0).toUpperCase() + companyId.slice(1),
        title: job.title,
        location: job.categories?.location || 'Remote/Unknown',
        type: job.categories?.commitment || 'Full-time',
        url: job.hostedUrl,
        description: cleanHtml(descriptionHtml),
        source: 'Lever',
        postedAt: new Date(job.createdAt).toISOString()
      };
    });
  } catch (error) {
    console.error(`Error fetching Lever for ${companyId}:`, error.message);
    return [];
  }
}

// Workable board fetcher
async function fetchWorkableJobs(companyId) {
  try {
    const url = `https://apply.workable.com/api/v3/accounts/${companyId}/jobs`;
    const response = await axios.post(url, { limit: 50 }, { timeout: 10000 });
    if (!response.data || !response.data.jobs) return [];

    return response.data.jobs.map(job => ({
      id: `wa-${companyId}-${job.shortcode}`,
      company: companyId.charAt(0).toUpperCase() + companyId.slice(1),
      title: job.title,
      location: job.location?.country || job.location?.city || 'Remote/Unknown',
      type: job.employment_type || 'Full-time',
      url: `https://apply.workable.com/${companyId}/j/${job.shortcode}/`,
      description: cleanHtml(job.description || ''),
      source: 'Workable',
      postedAt: job.published
    }));
  } catch (error) {
    console.error(`Error fetching Workable for ${companyId}:`, error.message);
    return [];
  }
}

// Universal Scraper for individual career links
async function fetchJobPageContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 10000
    });
    return cleanHtml(response.data);
  } catch (e) {
    console.error(`Universal scraping failed for ${url}:`, e.message);
    return '';
  }
}

// Helper to clean HTML text
function cleanHtml(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, head, header, footer, nav, iframe, svg, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

// ----------------- ENDPOINTS -----------------

// Get Popular list
app.get('/api/companies', (req, res) => {
  res.json(POPULAR_COMPANIES);
});

// CV parsing endpoint using the chosen LLM
app.post('/api/parse-cv', async (req, res) => {
  const { cvText, provider, apiKey, model } = req.body;

  if (!cvText || !cvText.trim()) {
    return res.status(400).json({ error: 'CV text is required' });
  }
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'LLM API key is required to parse CV' });
  }

  try {
    const systemPrompt = `You are an expert recruitment AI. Analyze the candidate's CV and extract structured profile details.
Return ONLY a JSON object that matches the following schema. Ensure all fields are filled:
{
  "skills": {
    "expert": ["List core skills where they have deepest mastery/experience"],
    "proficient": ["Skills used regularly but not main expertise"],
    "familiar": ["Skills mentioned or used in projects briefly"]
  },
  "experience": {
    "totalYears": 3.5,
    "domains": {
      "Frontend": 2,
      "Backend": 1.5,
      "Machine Learning": 0.5
    }
  },
  "education": [
    {
      "degree": "e.g., Bachelor of Science",
      "field": "e.g., Computer Science",
      "graduationYear": 2024,
      "isCurrentlyStudying": false
    }
  ],
  "notableProjects": [
    {
      "title": "Project Title",
      "description": "Short summary highlighting technical implementation"
    }
  ],
  "impliedRoleTargets": ["List targeted job titles e.g. Fullstack Engineer, ML Engineer"],
  "locationPreference": "e.g. Remote, San Francisco, CA",
  "workAuthorization": "e.g. US Citizen, Visa Sponsorship Required, or Not Stated"
}`;

    const text = await callLLM({
      provider,
      apiKey,
      model,
      systemPrompt,
      userPrompt: cvText,
      jsonMode: true
    });

    let resultJson;
    try {
      // Find JSON block if Anthropic or others did not output clean JSON
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        resultJson = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      } else {
        resultJson = JSON.parse(text);
      }
    } catch (e) {
      console.error("JSON parsing error on LLM response:", text);
      throw new Error("LLM failed to output valid JSON. Try again.");
    }

    res.json(resultJson);
  } catch (error) {
    console.error("CV Parsing error:", error.message);
    res.status(500).json({ error: `CV Parsing failed: ${error.message}` });
  }
});

// SSE-like Newline Delimited JSON streaming endpoint
app.post('/api/search-jobs-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendChunk = (data) => {
    res.write(JSON.stringify(data) + '\n');
  };

  const {
    profile,
    constraints,
    llmConfig,
    searchConfig,
    selectedCompanies = [],
    includeRemoteOk = true
  } = req.body;

  if (!profile) {
    sendChunk({ type: 'error', message: 'Profile is required' });
    return res.end();
  }

  sendChunk({ type: 'log', message: 'Starting real-time job fetch pipeline...' });

  try {
    const roles = profile.impliedRoleTargets || ['Software Engineer'];
    const skills = profile.skills?.expert || [];
    const location = constraints.targetLocations || profile.locationPreference || 'Remote';
    const exclusions = (constraints.exclusions || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

    let rawJobs = [];
    const scrapedUrls = new Set();

    // 1. Fetch Greenhouse/Lever/Workable for named target companies
    if (selectedCompanies && selectedCompanies.length > 0) {
      sendChunk({ type: 'log', message: `Fetching direct ATS feeds for ${selectedCompanies.length} companies...` });
      
      const promises = selectedCompanies.map(async (company) => {
        let jobs = [];
        const boardId = company.boardId.toLowerCase();
        try {
          if (company.source === 'greenhouse') {
            jobs = await fetchGreenhouseJobs(boardId);
          } else if (company.source === 'lever') {
            jobs = await fetchLeverJobs(boardId);
          } else if (company.source === 'workable') {
            jobs = await fetchWorkableJobs(boardId);
          } else {
            // Auto detect
            jobs = await fetchGreenhouseJobs(boardId);
            if (jobs.length === 0) jobs = await fetchLeverJobs(boardId);
            if (jobs.length === 0) jobs = await fetchWorkableJobs(boardId);
          }
        } catch (e) {
          console.error(`ATS Fetch error for ${boardId}:`, e.message);
        }

        if (jobs.length > 0) {
          sendChunk({ type: 'log', message: `Retrieved ${jobs.length} roles from ${company.name}.` });
        }
        return jobs;
      });

      const atsResults = await Promise.all(promises);
      atsResults.flat().forEach(job => {
        if (!scrapedUrls.has(job.url)) {
          scrapedUrls.add(job.url);
          rawJobs.push(job);
        }
      });
    }

    // 2. Discover roles using Search API Key or Fallback (LinkedIn Public / DuckDuckGo)
    const hasSearchApiKey = searchConfig && searchConfig.apiKey && searchConfig.apiKey.trim();
    
    // Build search queries based on roles and skills
    const primaryRole = roles[0] || 'Software Engineer';
    const locationQuery = constraints.remoteOnly ? 'Remote' : location;

    if (hasSearchApiKey) {
      sendChunk({ type: 'log', message: `Utilizing Search API (${searchConfig.provider}) to locate boards...` });
      
      const query = `"${primaryRole}" jobs (site:boards.greenhouse.io OR site:lever.co OR site:jobs.workable.com) ${constraints.remoteOnly ? 'remote' : ''}`;
      sendChunk({ type: 'log', message: `Running search query: "${query}"` });
      
      const searchResults = await searchWeb(query, searchConfig.provider, searchConfig.apiKey);
      sendChunk({ type: 'log', message: `Found ${searchResults.length} job board links from Search API.` });

      // Fetch and extract descriptions for found URLs
      for (const resItem of searchResults) {
        if (scrapedUrls.has(resItem.url)) continue;
        scrapedUrls.add(resItem.url);

        // Identify company name from URL
        let companyName = 'Unknown Company';
        let source = 'Search Engine';
        if (resItem.url.includes('greenhouse.io')) {
          const match = resItem.url.match(/boards\.greenhouse\.io\/([^/]+)/);
          if (match) companyName = match[1];
          source = 'Greenhouse';
        } else if (resItem.url.includes('lever.co')) {
          const match = resItem.url.match(/jobs\.lever\.co\/([^/]+)/);
          if (match) companyName = match[1];
          source = 'Lever';
        } else if (resItem.url.includes('workable.com')) {
          const match = resItem.url.match(/apply\.workable\.com\/([^/]+)/);
          if (match) companyName = match[1];
          source = 'Workable';
        }

        // Clean company name
        companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

        rawJobs.push({
          id: `se-${Buffer.from(resItem.url).toString('base64').substring(0, 12)}`,
          company: companyName,
          title: resItem.title.split(' - ')[0].split(' at ')[0].trim(),
          location: locationQuery,
          type: 'Full-time',
          url: resItem.url,
          description: resItem.snippet || '',
          source: source,
          postedAt: new Date().toISOString()
        });
      }
    } else {
      // Fallback: Scrape DuckDuckGo & LinkedIn Public Guest Search
      sendChunk({ type: 'log', message: 'No Search API Key found. Scraping DuckDuckGo (HTML) & LinkedIn Guest API...' });

      // Scrape LinkedIn
      sendChunk({ type: 'log', message: `Querying LinkedIn guest API for: "${primaryRole}" in "${locationQuery}"...` });
      const linkedinJobs = await scrapeLinkedInJobs(primaryRole, locationQuery);
      if (linkedinJobs.length > 0) {
        sendChunk({ type: 'log', message: `Found ${linkedinJobs.length} live jobs on LinkedIn.` });
        linkedinJobs.forEach(job => {
          if (!scrapedUrls.has(job.url)) {
            scrapedUrls.add(job.url);
            rawJobs.push(job);
          }
        });
      }

      // DuckDuckGo board search
      const ddgQuery = `"${primaryRole}" jobs site:boards.greenhouse.io ${constraints.remoteOnly ? 'remote' : locationQuery}`;
      sendChunk({ type: 'log', message: `Scraping DuckDuckGo for greenhouse boards...` });
      const ddgResults = await scrapeDuckDuckGo(ddgQuery);
      sendChunk({ type: 'log', message: `DuckDuckGo returned ${ddgResults.length} boards.` });

      ddgResults.forEach(resItem => {
        if (scrapedUrls.has(resItem.url)) return;
        scrapedUrls.add(resItem.url);

        let companyName = 'Unknown Company';
        const match = resItem.url.match(/boards\.greenhouse\.io\/([^/]+)/);
        if (match) companyName = match[1].charAt(0).toUpperCase() + match[1].slice(1);

        rawJobs.push({
          id: `ddg-${Buffer.from(resItem.url).toString('base64').substring(0, 12)}`,
          company: companyName,
          title: resItem.title.split(' - ')[0].split(' at ')[0].trim(),
          location: locationQuery,
          type: 'Full-time',
          url: resItem.url,
          description: resItem.snippet,
          source: 'Greenhouse (DDG)',
          postedAt: new Date().toISOString()
        });
      });
    }

    // 3. Fetch RemoteOK if enabled
    if (includeRemoteOk) {
      sendChunk({ type: 'log', message: 'Fetching remote roles from RemoteOK...' });
      try {
        const roResponse = await axios.get('https://remoteok.com/api', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });
        if (Array.isArray(roResponse.data)) {
          const roJobs = roResponse.data.slice(1).map(job => ({
            id: `ro-${job.id}`,
            company: job.company,
            title: job.position,
            location: job.location || 'Remote',
            type: 'Remote',
            url: job.url,
            description: cleanHtml(job.description),
            source: 'RemoteOK',
            postedAt: new Date(job.epoch * 1000).toISOString()
          }));

          sendChunk({ type: 'log', message: `Found ${roJobs.length} postings on RemoteOK.` });
          roJobs.forEach(job => {
            if (!scrapedUrls.has(job.url)) {
              scrapedUrls.add(job.url);
              rawJobs.push(job);
            }
          });
        }
      } catch (e) {
        console.error("RemoteOK API failed:", e.message);
      }
    }

    // Apply exclusion filters
    if (exclusions.length > 0) {
      const beforeCount = rawJobs.length;
      rawJobs = rawJobs.filter(job => {
        const title = job.title.toLowerCase();
        const desc = job.description.toLowerCase();
        const company = job.company.toLowerCase();
        return !exclusions.some(exc => title.includes(exc) || desc.includes(exc) || company.includes(exc));
      });
      sendChunk({ type: 'log', message: `Filtered out ${beforeCount - rawJobs.length} jobs using exclusion keywords.` });
    }

    if (rawJobs.length === 0) {
      sendChunk({ type: 'log', message: 'No jobs found matching criteria.' });
      sendChunk({ type: 'complete', message: 'Pipeline completed with 0 matches.' });
      return res.end();
    }

    // 4. Batch Match Scoring via LLM
    sendChunk({ type: 'log', message: `Analyzing & scoring ${rawJobs.length} jobs against CV in batches...` });

    const batchSize = 5;
    const llmApiKey = llmConfig?.apiKey;
    const llmProvider = llmConfig?.provider || 'gemini';
    const llmModel = llmConfig?.model;

    if (!llmApiKey) {
      sendChunk({ type: 'log', message: 'Warning: No LLM key provided. Streaming all jobs with a default score of 70%...' });
      // Stream raw jobs with mock scoring if no LLM key
      for (const job of rawJobs) {
        sendChunk({
          type: 'job',
          job: {
            ...job,
            matchLevel: 'Worth a Look',
            matchScore: 70,
            oneLineReason: 'Automatically imported. Please connect an LLM key in settings to enable precision scoring.',
            gaps: ['LLM Key not connected'],
            flags: []
          }
        });
      }
      sendChunk({ type: 'complete', message: `Pipeline complete! Streamed ${rawJobs.length} roles.` });
      return res.end();
    }

    const cleanProfile = {
      skills: profile.skills,
      experience: profile.experience,
      education: profile.education,
      impliedRoleTargets: profile.impliedRoleTargets,
      locationPreference: profile.locationPreference,
      workAuthorization: profile.workAuthorization
    };

    const systemPrompt = `You are a high-level recruitment matching agent. Compare the Candidate Profile below with the list of Job Postings.
For each job posting, determine if the candidate is a match and score suitability.

CRITICAL RULES:
- Match seniority level appropriately. Do NOT recommend Senior, Lead, or Staff roles if the candidate has low experience (e.g. <3 years).
- Discard roles with low match scores (score < 50) and label them "Not a Match".
- Be strict and honest. Look for core skill overlaps (e.g. React/Node vs Python/Rust).
- Consider candidate constraints: If they require Remote, and job is strictly onsite in a different state, mark as low fit/not a match.

Candidate Profile:
${JSON.stringify(cleanProfile)}

Return ONLY a JSON object with this schema:
{
  "matches": [
    {
      "id": "the_id_passed_in_the_jobs_list",
      "isMatch": true or false,
      "matchLevel": "Best Fit" or "Strong Fit" or "Worth a Look" or "Not a Match",
      "matchScore": 0 to 100,
      "oneLineReason": "Concise sentence explaining why this job matches or doesn't match the CV.",
      "gaps": ["Lacks React Native", "Experience gap of 2 years"],
      "flags": ["Requires onsite relocation", "Visa support unknown"]
    }
  ]
}`;

    for (let i = 0; i < rawJobs.length; i += batchSize) {
      const chunk = rawJobs.slice(i, i + batchSize);
      sendChunk({ type: 'log', message: `Evaluating matches ${i + 1} to ${Math.min(i + batchSize, rawJobs.length)} of ${rawJobs.length}...` });

      // If job description is empty, fetch it dynamically if it's a board URL
      const fetchPromises = chunk.map(async (job) => {
        if (!job.description || job.description.length < 200) {
          const content = await fetchJobPageContent(job.url);
          if (content) {
            job.description = content.substring(0, 3000); // limit chars
          }
        }
        return job;
      });

      await Promise.all(fetchPromises);

      const jobsPayload = chunk.map(j => ({
        id: j.id,
        company: j.company,
        title: j.title,
        location: j.location,
        type: j.type,
        description: j.description ? j.description.substring(0, 1000) : ''
      }));

      try {
        const textResponse = await callLLM({
          provider: llmProvider,
          apiKey: llmApiKey,
          model: llmModel,
          systemPrompt,
          userPrompt: JSON.stringify(jobsPayload),
          jsonMode: true
        });

        let responseJson;
        try {
          const jsonStart = textResponse.indexOf('{');
          const jsonEnd = textResponse.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            responseJson = JSON.parse(textResponse.substring(jsonStart, jsonEnd + 1));
          } else {
            responseJson = JSON.parse(textResponse);
          }
        } catch (e) {
          console.error("JSON parsing error on evaluation chunk:", textResponse);
          continue;
        }

        if (responseJson.matches && Array.isArray(responseJson.matches)) {
          responseJson.matches.forEach(match => {
            const originalJob = chunk.find(j => j.id === match.id);
            if (originalJob && match.isMatch && match.matchLevel !== "Not a Match") {
              sendChunk({
                type: 'job',
                job: {
                  ...originalJob,
                  matchLevel: match.matchLevel,
                  matchScore: match.matchScore,
                  oneLineReason: match.oneLineReason,
                  gaps: match.gaps || [],
                  flags: match.flags || [],
                  evaluatedAt: new Date().toLocaleTimeString()
                }
              });
            }
          });
        }
      } catch (err) {
        console.error(`Batch LLM evaluation error:`, err.message);
        sendChunk({ type: 'log', message: `Warning: Failed to match batch starting at job ${i + 1}.` });
      }
    }

    sendChunk({ type: 'complete', message: 'Job discovery & matching pipeline completed.' });
  } catch (error) {
    console.error("Stream execution error:", error.message);
    sendChunk({ type: 'error', message: `Pipeline crash: ${error.message}` });
  } finally {
    res.end();
  }
});

// Existing universal URL scraper endpoint (fallbacks)
app.post('/api/scrape-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const text = await fetchJobPageContent(url);
    res.json({
      url,
      title: 'Scraped Page',
      text,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to scrape page: ${error.message}` });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`JobFetch Scraper Engine listening on port ${PORT}`);
});
