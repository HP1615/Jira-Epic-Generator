const axios = require('axios');

async function testEpicGeneration() {
  try {
    console.log('Attempting to generate epic...');
    
    const response = await axios.post('http://localhost:3001/generate-epic', {
      ticketIds: ['RSOFT-66600'],
      customPrompt: 'Focus on technical requirements'
    });

    console.log('\nGenerated Epic:', response.data.epic);
    console.log('\nSource Tickets:', JSON.stringify(response.data.sourceTickets, null, 2));
  } catch (error) {
    console.error('\nError Details:');
    if (error.response) {
      // Server responded with error
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      // Request made but no response
      console.error('No response received. Is the server running?');
    } else {
      // Error in request setup
      console.error('Error:', error.message);
    }
  }
}

// Run the test
console.log('Starting Epic Generation Test...');
testEpicGeneration();