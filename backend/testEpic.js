// require('dotenv').config();
// const axios = require('axios');

// const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
// const JIRA_EMAIL = process.env.JIRA_EMAIL;
// const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
// const JIRA_DOCBY_FIELD = process.env.JIRA_DOCBY_FIELD || 'customfield_10045';

// async function findFirstMatchingTicket() {
//   // JQL: Enhancement, Documentation By = Automation, status = Documentation
//   const jql = `issuetype = "Enhancement" AND status = "Documentation" AND "Documentation By" = "Automation"`;
//   const url = `${JIRA_BASE_URL}/rest/api/3/search`;
//   const response = await axios.get(url, {
//     params: {
//       jql,
//       fields: "key",
//       maxResults: 1
//     },
//     auth: {
//       username: JIRA_EMAIL,
//       password: JIRA_API_TOKEN
//     },
//     headers: { Accept: 'application/json' }
//   });
//   const issues = response.data.issues;
//   return issues.length > 0 ? issues[0].key : null;
// }

// async function testEpicGeneration() {
//   try {
//     console.log('Searching for a matching Enhancement ticket with Documentation By = Automation and status = Documentation...');
//     const ticketKey = await findFirstMatchingTicket();
//     if (!ticketKey) {
//       console.error('No matching ticket found.');
//       return;
//     }
//     console.log('Found ticket:', ticketKey);

//     // Simulate a Jira webhook payload
//     //console.log('Sending payload to /jira-webhook...');
//     const response = await axios.post('http://localhost:5000/jira-webhook', {
//       issue: {
//         key: ticketKey,
//         fields: {
//           issuetype: { name: "Enhancement" },
//           status: { name: "Documentation" },
//           [JIRA_DOCBY_FIELD]: { value: "Automation" }
//         }
//       },
//       changelog: {
//         items: [
//           { field: "status", fromString: "Open", toString: "Documentation" }
//         ]
//       },
//       dryRun: false // set to true for preview only, false to actually create
//     });

//     const data = response.data;
//     console.log('\n=== Epic Generation Preview ===');
//     if (data.summary) console.log('Summary:', data.summary);
//     if (data.description) console.log('Description:', data.description);
//     if (data.iWant) console.log('I Want:', data.iWant);
//     if (data.soThat) console.log('So That:', data.soThat);
//     if (data.acceptanceCriteria) console.log('Acceptance Criteria:', data.acceptanceCriteria);
//     if (data.keywords) console.log('Extracted Keywords:', data.keywords);
//     if (data.fullEpicContent) {
//       console.log('\nFull Epic Content:\n', data.fullEpicContent);
//     }
//     if (data.jiraEpicKey) {
//       console.log('\nJira Epic Key:', data.jiraEpicKey);
//       if (data.jiraEpicUrl) console.log('Jira Epic URL:', data.jiraEpicUrl);
//     }
//     console.log('==============================\n');
//   } catch (error) {
//     console.error('\nError Details:');
//     if (error.response) {
//       console.error('status:', error.response.status);
//       console.error('Data:', error.response.data);
//     } else if (error.request) {
//       console.error('No response received. Is the server running?');
//     } else {
//       console.error('Error:', error.message);
//     }
//   }
// }


// // Run the test
// console.log('Starting Epic Generation Test...');
// testEpicGeneration();

require('dotenv').config();
const axios = require('axios');

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_DOCBY_FIELD = process.env.JIRA_DOCBY_FIELD || 'customfield_10045';
const JIRA_PRIORITY_FIELD = 'customfield_10126'; // Requested Priority

// Fetch all matching tickets, sorted by Requested Priority
async function fetchAllMatchingTicketsByPriority() {
  const jql = `issuetype = "Enhancement" AND status = "Documentation" AND "Documentation By" = "Automation" ORDER BY "Requested Priority" ASC`;
  const url = `${JIRA_BASE_URL}/rest/api/3/search`;
  let allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  while (true) {
    const response = await axios.get(url, {
      params: {
        jql,
        fields: `key,${JIRA_PRIORITY_FIELD}`,
        maxResults,
        startAt
      },
      auth: {
        username: JIRA_EMAIL,
        password: JIRA_API_TOKEN
      },
      headers: { Accept: 'application/json' }
    });
    const issues = response.data.issues;
    allIssues = allIssues.concat(issues);
    if (issues.length < maxResults) break;
    startAt += maxResults;
  }
  // Sort by Requested Priority (lowest first)
  allIssues.sort((a, b) => {
    const aPriority = Number(a.fields[JIRA_PRIORITY_FIELD]) || 9999;
    const bPriority = Number(b.fields[JIRA_PRIORITY_FIELD]) || 9999;
    return aPriority - bPriority;
  });
  return allIssues;
}

async function testEpicGenerationBatch() {
  try {
    console.log('Fetching all matching Enhancement tickets (Documentation By = Automation, status = Documentation)...');
    const tickets = await fetchAllMatchingTicketsByPriority();
    if (!tickets.length) {
      console.error('No matching tickets found.');
      return;
    }
    console.log(`Found ${tickets.length} tickets. Processing in Requested Priority order...`);
    for (const ticket of tickets) {
      const ticketKey = ticket.key;
      const requestedPriority = ticket.fields[JIRA_PRIORITY_FIELD];
      console.log(`\nProcessing ticket: ${ticketKey} (Requested Priority: ${requestedPriority})`);
      // Simulate a Jira webhook payload
      const response = await axios.post('http://localhost:5000/jira-webhook', {
        issue: {
          key: ticketKey,
          fields: {
            issuetype: { name: "Enhancement" },
            status: { name: "Documentation" },
            [JIRA_DOCBY_FIELD]: { value: "Automation" }
          }
        },
        changelog: {
          items: [
            { field: "status", fromString: "Open", toString: "Documentation" }
          ]
        },
        dryRun: false // set to true for preview only, false to actually create
      });

      const data = response.data;
      console.log('\n=== Epic Generation Result ===');
      if (data.summary) console.log('Summary:', data.summary);
      if (data.description) console.log('Description:', data.description);
      if (data.iWant) console.log('I Want:', data.iWant);
      if (data.soThat) console.log('So That:', data.soThat);
      if (data.acceptanceCriteria) console.log('Acceptance Criteria:', data.acceptanceCriteria);
      if (data.keywords) console.log('Extracted Keywords:', data.keywords);
      if (data.fullEpicContent) {
        console.log('\nFull Epic Content:\n', data.fullEpicContent);
      }
      if (data.jiraEpicKey) {
        console.log('\nJira Epic Key:', data.jiraEpicKey);
        if (data.jiraEpicUrl) console.log('Jira Epic URL:', data.jiraEpicUrl);
      }
      console.log('==============================\n');
      // Optional: add a delay to avoid rate limits
      await new Promise(res => setTimeout(res, 1000));
    }
    console.log('All tickets processed.');
  } catch (error) {
    console.error('\nError Details:');
    if (error.response) {
      console.error('status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Is the server running?');
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the batch test
console.log('Starting Epic Generation Batch Test...');
testEpicGenerationBatch();