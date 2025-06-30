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
//     //console.log('Searching for a matching Enhancement ticket with Documentation By = Automation and status = Documentation...');
//     const ticketKey = await findFirstMatchingTicket();
//     if (!ticketKey) {
//       console.error('No matching ticket found.');
//       return;
//     }
//     console.log('Found ticket:', ticketKey);
//     // Call the backend endpoint to generate epic
//     const response = await axios.post('http://localhost:5000/generate-epic-from-enhancement', {
//       ticketKey,
//       dryRun: false // set to true for preview only, false to actually create
//     });
//     console.log('Backend response:', response.data);
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

async function findFirstMatchingTicket() {
  // JQL: Enhancement, Documentation By = Automation, status = Documentation
  const jql = `issuetype = "Enhancement" AND status = "Documentation" AND "Documentation By" = "Automation"`;
  const url = `${JIRA_BASE_URL}/rest/api/3/search`;
  const response = await axios.get(url, {
    params: {
      jql,
      fields: "key",
      maxResults: 1
    },
    auth: {
      username: JIRA_EMAIL,
      password: JIRA_API_TOKEN
    },
    headers: { Accept: 'application/json' }
  });
  const issues = response.data.issues;
  return issues.length > 0 ? issues[0].key : null;
}

// async function testEpicGeneration() {
//   try {
//     console.log('Searching for a matching Enhancement ticket with Documentation By = Automation and status = Documentation...');
//     const ticketKey = await findFirstMatchingTicket();
//     if (!ticketKey) {
//       console.error('No matching ticket found.');
//       return;
//     }
//     console.log('Found ticket:', ticketKey);

//     // Call the backend endpoint to generate epic (dryRun true for preview)
//     const response = await axios.post('http://localhost:5000/generate-epic-from-enhancement', {
//       ticketKey,
//       dryRun: true // set to true for preview only, false to actually create
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

async function testEpicGeneration() {
  try {
    console.log('Searching for a matching Enhancement ticket with Documentation By = Automation and status = Documentation...');
    const ticketKey = await findFirstMatchingTicket();
    if (!ticketKey) {
      console.error('No matching ticket found.');
      return;
    }
    console.log('Found ticket:', ticketKey);

    // Simulate a Jira webhook payload
    //console.log('Sending payload to /jira-webhook...');
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
    console.log('\n=== Epic Generation Preview ===');
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


// Run the test
console.log('Starting Epic Generation Test...');
testEpicGeneration();

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
//       dryRun: true // set to true for preview only, false to actually create
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