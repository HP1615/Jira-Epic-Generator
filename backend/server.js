const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper function to safely get field values
const getFieldValue = (fields, fieldId) => {
  try {
    return fields[fieldId]?.value || fields[fieldId] || '';
  } catch (error) {
    return '';
  }
};

// Helper function to extract text from Atlassian Document Format
const extractTextFromADF = (adfContent) => {
  if (!adfContent || !adfContent.content) return '';
  return adfContent.content.reduce((text, item) => {
    if (item.type === 'paragraph' && item.content) {
      const paragraphText = item.content.reduce((paraText, contentItem) => {
        if (contentItem.type === 'text') {
          return paraText + contentItem.text;
        }
        return paraText;
      }, '');
      return text + paragraphText + '\n';
    }
    return text;
  }, '').trim();
};

// Helper function to create Atlassian Document Format
const createADF = (text) => {
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: text || '' }]
      }
    ]
  };
};

// Helper function to parse epic content into sections
const parseEpicContent = (content) => {
  const sections = {
    summary: '',
    description: '',
    iWant: '',
    soThat: '',
    acceptanceCriteria: ''
  };
  const lines = content.split('\n');
  let currentSection = '';
  for (const line of lines) {
    if (line.startsWith('Epic Summary:')) {
      currentSection = 'summary';
      sections.summary = line.replace('Epic Summary:', '').trim();
    } else if (line.startsWith('Business Context:')) {
      currentSection = 'description';
    } else if (line.toLowerCase().includes('i want:')) {
      currentSection = 'iWant';
    } else if (line.toLowerCase().includes('so that:')) {
      currentSection = 'soThat';
    } else if (line.startsWith('Acceptance Criteria:')) {
      currentSection = 'acceptanceCriteria';
    } else if (line.trim() && currentSection) {
      if (currentSection !== 'summary') {
        sections[currentSection] += line.trim() + '\n';
      }
    }
  }
  Object.keys(sections).forEach(key => {
    if (key !== 'summary') {
      sections[key] = sections[key].trim();
    }
  });
  return sections;
};

// Helper function to create Jira Epic
const createJiraEpic = async (epicContent, ticketIds) => {
  try {
    if (!process.env.JIRA_PROJECT_KEY) {
      throw new Error('JIRA_PROJECT_KEY is not configured');
    }
    // Validate project key exists
    try {
      await axios.get(
        `${process.env.JIRA_BASE_URL}/rest/api/3/project/${process.env.JIRA_PROJECT_KEY}`,
        {
          auth: {
            username: process.env.JIRA_EMAIL,
            password: process.env.JIRA_API_TOKEN
          }
        }
      );
    } catch (error) {
      throw new Error(`Invalid project key: ${process.env.JIRA_PROJECT_KEY}`);
    }
    const parsedContent = parseEpicContent(epicContent);
    const response = await axios.post(
      `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
      {
        fields: {
          project: { key: process.env.JIRA_PROJECT_KEY },
          summary: parsedContent.summary,
          description: createADF(parsedContent.description),
          issuetype: { name: "Epic" },
          [process.env.JIRA_IWANT_FIELD]: createADF(parsedContent.iWant),
          [process.env.JIRA_SOTHAT_FIELD]: createADF(parsedContent.soThat),
          [process.env.JIRA_AC_FIELD]: createADF(parsedContent.acceptanceCriteria)
        }
      },
      {
        auth: {
          username: process.env.JIRA_EMAIL,
          password: process.env.JIRA_API_TOKEN
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('=== JIRA EPIC CREATION DETAILS ===');
    console.log('Epic Key:', response.data.key);
    console.log('Epic URL:', `${process.env.JIRA_BASE_URL}/browse/${response.data.key}`);
    console.log('Linked Tickets:', ticketIds);
    console.log('================================');
    return response.data;
  } catch (error) {
    console.error('Error creating Jira Epic:',
      error.response?.data?.errors ||
      error.response?.data?.errorMessages ||
      error.message
    );
    throw error;
  }
};

// Helper function to search tickets by keyword (fetches ALL tickets, paginated)
const searchTicketsByKeyword = async (keyword) => {
  if (!keyword) return [];
  const allIssues = [];
  let startAt = 0;
  const maxResults = 100; // Jira's max per request
  try {
    while (true) {
      const jql = `issuetype = "Enhancement" AND (summary ~ "${keyword}" OR description ~ "${keyword}")`;
      const response = await axios.get(
        `${process.env.JIRA_BASE_URL}/rest/api/3/search`,
        {
          params: {
            jql,
            fields: [
              "summary",
              "description",
              process.env.JIRA_IWANT_FIELD,
              process.env.JIRA_SOTHAT_FIELD,
              process.env.JIRA_AC_FIELD,
              "issuetype"
            ].join(","),
            maxResults,
            startAt
          },
          auth: {
            username: process.env.JIRA_EMAIL,
            password: process.env.JIRA_API_TOKEN
          },
          headers: { Accept: 'application/json' }
        }
      );
      const issues = response.data.issues || [];
      allIssues.push(...issues);
      if (issues.length < maxResults) break; // No more pages
      startAt += maxResults;
    }
    return allIssues;
  } catch (error) {
    console.error("Error searching tickets by keyword:", error.message);
    return [];
  }
};

// Utility to truncate text fields
const truncate = (str, max = 500) =>
  typeof str === "string" && str.length > max ? str.slice(0, max) + "..." : str;

// --- BATCH SUMMARIZATION UTILITY ---
async function summarizeTicketsInBatches(tickets, promptPrefix, batchSize = 10) {
  const summaries = [];
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    const prompt = `${promptPrefix}\n\n${batch.map(t =>
      `Ticket [${t.id}]:\nSummary: ${t.summary}\nDescription: ${t.description}\nI Want: ${t.iWant}\nSo That: ${t.soThat}\nAcceptance Criteria: ${t.acceptanceCriteria}\n-------------------`
    ).join('\n')}`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a requirements analyst." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 600
    });
    summaries.push(completion.choices[0].message.content);
  }
  // Merge all batch summaries into one
  if (summaries.length === 1) return summaries[0];
  const mergePrompt = `Here are several summaries of Jira tickets:\n\n${summaries.join('\n\n')}\n\nPlease merge, clarify, and remove duplicates, focusing on what is most relevant for a Jira Epic. Output a concise, clear set of requirements.`;
  const mergeCompletion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a requirements analyst." },
      { role: "user", content: mergePrompt }
    ],
    temperature: 0.3,
    max_tokens: 700
  });
  return mergeCompletion.choices[0].message.content;
}

// --- AGENT CONVERSATION: Merge and refine summaries ---
async function agentConversationMerge(ticketSummary, keywordSummary) {
  const prompt = `Agent 1 (Ticket IDs) summarized:\n${ticketSummary}\n\nAgent 2 (Keyword) summarized:\n${keywordSummary}\n\nPlease merge, clarify, and remove duplicates, focusing on what is most relevant for a Jira Epic. Output a concise, clear set of requirements.`;
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a requirements analyst." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 700
  });
  return completion.choices[0].message.content;
}

// --- MAIN ENDPOINT: Generate Epic (Preview Only) ---
app.post('/generate-epic', async (req, res) => {
  console.log("Received request to generate epic with body:", req.body);

  const { ticketIds, customPrompt, keywordInput } = req.body;

  try {
    // Fetch ticket details from JIRA for ticketIds
    const ticketTexts = (
      await Promise.all(
        ticketIds.map(async (id) => {
          try {
            const response = await axios.get(
              `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${id}`,
              {
                auth: {
                  username: process.env.JIRA_EMAIL,
                  password: process.env.JIRA_API_TOKEN,
                },
                headers: { Accept: 'application/json' },
              }
            );
            const fields = response.data.fields;
            if (!fields.issuetype || fields.issuetype.name.toLowerCase() !== "enhancement") return null;
            const iWantField = getFieldValue(fields, process.env.JIRA_IWANT_FIELD);
            const soThatField = getFieldValue(fields, process.env.JIRA_SOTHAT_FIELD);
            const acceptanceCriteria = getFieldValue(fields, process.env.JIRA_AC_FIELD);
            const summary = fields.summary || "";
            return {
              id,
              summary: truncate(summary, 300),
              description: truncate(
                typeof fields.description === 'object'
                  ? extractTextFromADF(fields.description)
                  : fields.description || "",
                500
              ),
              iWant: truncate(
                typeof iWantField === 'object'
                  ? extractTextFromADF(iWantField)
                  : iWantField,
                300
              ),
              soThat: truncate(
                typeof soThatField === 'object'
                  ? extractTextFromADF(soThatField)
                  : soThatField,
                300
              ),
              acceptanceCriteria: truncate(
                typeof acceptanceCriteria === 'object'
                  ? extractTextFromADF(acceptanceCriteria)
                  : acceptanceCriteria,
                300
              )
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    // Fetch tickets by keyword if provided (fetches ALL matching tickets)
    let keywordTickets = [];
    if (keywordInput && keywordInput.trim()) {
      const foundTickets = await searchTicketsByKeyword(keywordInput.trim());
      const ticketIdSet = new Set(ticketIds.map(id => id.toUpperCase()));
      keywordTickets = foundTickets.filter(
        t => !ticketIdSet.has(t.key.toUpperCase())
      );
    }
    const keywordTicketTexts = (
      await Promise.all(
        keywordTickets.map(async (issue) => {
          try {
            const fields = issue.fields;
            if (!fields.issuetype || fields.issuetype.name.toLowerCase() !== "enhancement") return null;
            const iWantField = getFieldValue(fields, process.env.JIRA_IWANT_FIELD);
            const soThatField = getFieldValue(fields, process.env.JIRA_SOTHAT_FIELD);
            const acceptanceCriteria = getFieldValue(fields, process.env.JIRA_AC_FIELD);
            const summary = fields.summary || "";
            return {
              id: issue.key,
              summary: truncate(summary, 300),
              description: truncate(
                typeof fields.description === 'object'
                  ? extractTextFromADF(fields.description)
                  : fields.description || "",
                500
              ),
              iWant: truncate(
                typeof iWantField === 'object'
                  ? extractTextFromADF(iWantField)
                  : iWantField,
                300
              ),
              soThat: truncate(
                typeof soThatField === 'object'
                  ? extractTextFromADF(soThatField)
                  : soThatField,
                300
              ),
              acceptanceCriteria: truncate(
                typeof acceptanceCriteria === 'object'
                  ? extractTextFromADF(acceptanceCriteria)
                  : acceptanceCriteria,
                300
              )
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    // --- AGENT 1: Summarize all ticket IDs in batches ---
    const ticketAgentSummary = await summarizeTicketsInBatches(
      ticketTexts,
      "Summarize the requirements and context from these Jira enhancement tickets:"
    );

    // --- AGENT 2: Summarize all keyword tickets in batches ---
    const keywordAgentSummary = await summarizeTicketsInBatches(
      keywordTicketTexts,
      `Summarize the most relevant requirements and context from these already groomed Jira enhancement tickets for the keyword "${keywordInput}":`
    );

    // --- AGENT CONVERSATION ---
    const refinedRequirements = await agentConversationMerge(ticketAgentSummary, keywordAgentSummary);

    // --- Epic Generation ---
    const epicPrompt = `You are a Business Analyst. Based on the following refined requirements, write a Jira Epic using only the Description, "I want", and "So That" fields.

Refined Requirements:
${refinedRequirements}

Please structure your response in the following format:

Epic Summary: [Write a clear, specific, and outcome-focused summary]

Description:
[Provide a brief overview of the business need and value]

I Want:
[Outline the main features and capabilities to be delivered]
[Describe the key requirements, organized by theme]
[Mention the full requirment in it]

Acceptance Criteria:
[List specific, measurable criteria for success]

So That:
[The requirement benefits or outcomes expected from this Epic]

Additional Instructions: ${customPrompt}

Guidelines:
1. The title should be clear, specific, and outcome-focused
2. Combine and consolidate similar requirements
3. Eliminate redundancies while maintaining complete scope
4. Ensure traceability to original tickets
5. Include clear, measurable acceptance criteria
6. Keep the description business-oriented and implementation-neutral`;

    const epicCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a business analyst skilled at creating comprehensive epics from multiple user stories."
        },
        { role: "user", content: epicPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1200
    });

    const generatedEpic = epicCompletion.choices[0].message.content;
    console.log("Generated Epic:", generatedEpic);

    // Only return the preview and source tickets, do NOT create Jira Epic yet
    res.json({
      epic: generatedEpic,
      sourceTickets: [...ticketTexts, ...keywordTicketTexts]
    });

  } catch (error) {
    console.error("Error generating Epic:", error);
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({
      error: "Failed to generate Epic",
      details: errorMessage
    });
  }
});

// --- CREATE EPIC ENDPOINT ---
app.post('/create-epic', async (req, res) => {
  const { epicContent, ticketIds } = req.body;
  try {
    const jiraEpic = await createJiraEpic(epicContent, ticketIds);
    res.json({
      jiraEpicKey: jiraEpic?.key,
      jiraEpicUrl: jiraEpic ? `${process.env.JIRA_BASE_URL}/browse/${jiraEpic.key}` : null
    });
  } catch (error) {
    console.error("Error creating Jira Epic:", error);
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({
      error: "Failed to create Epic in Jira",
      details: errorMessage
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});